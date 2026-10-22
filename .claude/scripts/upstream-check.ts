#!/usr/bin/env node
/**
 * Check the third-party repositories this fork adapts files from.
 *
 * Usage (from the repo root):
 *   node --experimental-strip-types .claude/scripts/upstream-check.ts [options]
 *
 * Options:
 *   --source <name>    check this source only (repeatable)
 *   --since pinned     diff from the commit the adaptations were written from,
 *                      instead of the last reviewed one
 *   --diff             also print the diff of every changed adapted or context file
 *   --record           after the report, set each checked source's `reviewed`
 *                      to the upstream head, dated today
 *   --note <text>      the note stored with --record
 *   --registry <path>  registry file (default: .claude/upstream-sources.json)
 *
 * Reads `.claude/upstream-sources.json` (see its `$comment` and
 * `lib/upstream-check.ts`). Each source is cloned blobless into a temp folder,
 * the upstream diff since the baseline is sorted into adapted files, context
 * files, new files and the rest, and the temp folder is removed. Nothing in
 * this repository changes unless --record is given, and then only the registry.
 *
 * Exit codes: 0 nothing to review, 1 an adapted or context file changed,
 * 2 a usage error or a source that could not be checked.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/atomic-write.ts";
import { isMainModule } from "./lib/main-guard.ts";
import {
	formatReport,
	needsReview,
	parseNameStatus,
	parseRegistry,
	recordReviewed,
	sortChanges,
	type Report,
	type Source,
} from "./lib/upstream-check.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Options {
	registry: string;
	sources: string[];
	since: "pinned" | "reviewed";
	diff: boolean;
	record: boolean;
	note: string | null;
}

const USAGE = `Usage (from the repo root):
  node --experimental-strip-types .claude/scripts/upstream-check.ts [options]

Options:
  --source <name>    check this source only (repeatable)
  --since pinned     diff from the commit the adaptations were written from,
                     instead of the last reviewed one
  --diff             also print the diff of every changed adapted or context file
  --record           after the report, set each checked source's \`reviewed\`
                     to the upstream head, dated today
  --note <text>      the note stored with --record
  --registry <path>  registry file (default: .claude/upstream-sources.json)

Exit codes: 0 nothing to review, 1 an adapted or context file changed,
2 a usage error or a source that could not be checked.`;

function parseArgs(argv: readonly string[]): Options | string {
	const o: Options = {
		registry: join(REPO_ROOT, ".claude", "upstream-sources.json"),
		sources: [],
		since: "reviewed",
		diff: false,
		record: false,
		note: null,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const value = (): string | null => {
			const v = argv[++i];
			return v === undefined || v.startsWith("--") ? null : v;
		};
		if (a === "--diff") o.diff = true;
		else if (a === "--record") o.record = true;
		else if (a === "--source" || a === "--note" || a === "--registry" || a === "--since") {
			const v = value();
			if (v === null) return `${a} needs a value`;
			if (a === "--source") o.sources.push(v);
			else if (a === "--note") o.note = v;
			else if (a === "--registry") o.registry = resolve(v);
			else if (v === "pinned" || v === "reviewed") o.since = v;
			else return `--since takes "pinned" or "reviewed", not "${v}"`;
		} else return `unknown argument "${a}"`;
	}
	if (o.note !== null && !o.record) return "--note only goes with --record";
	return o;
}

function git(cwd: string, args: readonly string[]): string {
	const r = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});
	if (r.status !== 0) {
		throw new Error(`git ${args.join(" ")}: ${(r.stderr || r.error?.message || "failed").trim()}`);
	}
	return r.stdout;
}

function isCommit(dir: string, sha: string): boolean {
	return spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: dir }).status === 0;
}

function isAncestor(dir: string, a: string, b: string): boolean {
	return spawnSync("git", ["merge-base", "--is-ancestor", a, b], { cwd: dir }).status === 0;
}

function latestTag(dir: string, repo: string): string | null {
	try {
		const first = git(dir, ["ls-remote", "--tags", "--refs", "--sort=-v:refname", repo]).split("\n")[0] ?? "";
		const ref = first.split("\t")[1];
		return ref ? ref.replace(/^refs\/tags\//, "") : null;
	} catch {
		return null;
	}
}

/** Problems with this repository's side of the registry, reported, never fatal. */
function localWarnings(s: Source, root: string): string[] {
	const w: string[] = [];
	for (const a of s.adaptations) {
		if (!existsSync(join(root, a.local))) w.push(`local file missing: ${a.local}`);
	}
	const license = join(root, s.license);
	if (!existsSync(license)) w.push(`license file missing: ${s.license}`);
	else if (!readFileSync(license, "utf8").includes(s.pinned.commit)) {
		w.push(`${s.license} does not cite the pinned commit ${s.pinned.commit}`);
	}
	return w;
}

interface Checked {
	readonly report: Report;
	readonly diff: string;
}

function checkSource(s: Source, o: Options, root: string): Checked {
	const tmp = mkdtempSync(join(tmpdir(), "om-upstream-"));
	try {
		const dir = join(tmp, "repo");
		git(tmp, [
			"clone",
			"--quiet",
			"--bare",
			"--filter=blob:none",
			"--single-branch",
			"--no-tags",
			"--branch",
			s.branch,
			s.repo,
			dir,
		]);
		const head = git(dir, ["rev-parse", `refs/heads/${s.branch}`]).trim();
		const headDate = git(dir, ["log", "-1", "--format=%cs", head]).trim();
		const warnings = localWarnings(s, root);
		const baseline = o.since === "reviewed" && s.reviewed ? "reviewed" : "pinned";
		const base = baseline === "reviewed" && s.reviewed ? s.reviewed.commit : s.pinned.commit;
		for (const [what, sha] of [["pinned", s.pinned.commit], ["reviewed", s.reviewed?.commit]] as const) {
			if (sha === undefined) continue;
			if (!isCommit(dir, sha)) {
				throw new Error(`${what} commit ${sha.slice(0, 7)} is not on ${s.branch}: upstream history was rewritten, or the sha is wrong`);
			}
			if (!isAncestor(dir, sha, head)) {
				warnings.push(`${what} commit ${sha.slice(0, 7)} is not an ancestor of ${s.branch}`);
			}
		}
		const commits = Number(git(dir, ["rev-list", "--count", `${base}..${head}`]).trim());
		const changes = commits === 0 ? [] : parseNameStatus(git(dir, ["diff", "--name-status", "--no-renames", base, head]));
		const sorted = sortChanges(s, changes);
		const history = new Map<string, string[]>();
		for (const c of [...sorted.adapted, ...sorted.context]) {
			const log = git(dir, ["log", "--format=%h %cs %s", `${base}..${head}`, "--", c.path]).trim();
			history.set(c.path, log === "" ? [] : log.split("\n"));
		}
		const changed = [...sorted.adapted, ...sorted.context].map((c) => c.path);
		const diff =
			o.diff && changed.length > 0
				? git(dir, ["-c", "core.quotepath=off", "diff", base, head, "--", ...changed])
				: "";
		return {
			report: {
				source: s,
				baseline,
				baseCommit: base,
				head,
				headDate,
				latestTag: latestTag(dir, s.repo),
				commits,
				sorted,
				history,
				warnings,
			},
			diff,
		};
	} finally {
		rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	}
}

function today(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function main(argv: readonly string[]): number {
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(`${USAGE}\n`);
		return 0;
	}
	const o = parseArgs(argv);
	if (typeof o === "string") {
		process.stderr.write(`upstream-check: ${o}\n\n${USAGE}\n`);
		return 2;
	}
	let text: string;
	let registry;
	try {
		text = readFileSync(o.registry, "utf8");
		registry = parseRegistry(text);
	} catch (e) {
		process.stderr.write(`upstream-check: ${(e as Error).message}\n`);
		return 2;
	}
	// Local paths in the registry are relative to the repository that holds it.
	const root = resolve(dirname(o.registry), "..");
	const unknown = o.sources.filter((n) => !registry.sources.some((s) => s.name === n));
	if (unknown.length > 0) {
		process.stderr.write(`upstream-check: no source named ${unknown.map((n) => `"${n}"`).join(", ")}\n`);
		return 2;
	}
	const selected = registry.sources.filter((s) => o.sources.length === 0 || o.sources.includes(s.name));
	let code = 0;
	const checked: Report[] = [];
	for (const s of selected) {
		try {
			const { report, diff } = checkSource(s, o, root);
			checked.push(report);
			process.stdout.write(`${formatReport(report)}\n`);
			if (diff) process.stdout.write(`\n${diff}\n`);
			if (needsReview(report.sorted) && code === 0) code = 1;
		} catch (e) {
			process.stdout.write(`${s.name}  ${s.repo} (${s.branch})\n  ✗ could not check: ${(e as Error).message}\n`);
			code = 2;
		}
		process.stdout.write("\n");
	}
	if (o.record && checked.length > 0) {
		const date = today();
		for (const r of checked) {
			const reviewed = o.note === null ? { commit: r.head, date } : { commit: r.head, date, note: o.note };
			text = recordReviewed(text, r.source.name, reviewed);
			process.stdout.write(`recorded: ${r.source.name} reviewed = ${r.head.slice(0, 7)} (${date})\n`);
		}
		writeFileAtomic(o.registry, text);
	}
	return code;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
