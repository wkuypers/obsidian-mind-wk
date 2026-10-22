/**
 * Tests for upstream-check: the registry's grammar, how an upstream diff is
 * sorted, `--record`, the real registry's agreement with the files it names,
 * and one end-to-end run against a throwaway local "upstream" (no network).
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	globToRegex,
	parseNameStatus,
	parseRegistry,
	recordReviewed,
	sortChanges,
	type Source,
} from "../lib/upstream-check.ts";
import { rmTemp } from "./_helpers.ts";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(SCRIPTS, "..", "..");
const REGISTRY = join(ROOT, ".claude", "upstream-sources.json");
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function registryText(over: Record<string, unknown> = {}): string {
	return JSON.stringify({
		sources: [
			{
				name: "up",
				repo: "https://example.invalid/up.git",
				branch: "main",
				license: ".claude/licenses/up.md",
				pinned: { commit: SHA_A, date: "2026-10-01" },
				adaptations: [{ local: ".claude/commands/om-x.md", upstream: ["commands/x.md"] }],
				context: ["SKILL.md"],
				watch_new: ["commands/*.md"],
				...over,
			},
		],
	});
}

describe("parseRegistry", () => {
	test("accepts a well-formed source, reviewed optional", () => {
		const r = parseRegistry(registryText());
		assert.equal(r.sources.length, 1);
		assert.equal(r.sources[0]?.reviewed, undefined);
		const r2 = parseRegistry(registryText({ reviewed: { commit: SHA_B, date: "2026-10-02", note: "ok" } }));
		assert.equal(r2.sources[0]?.reviewed?.note, "ok");
	});

	test("rejects an abbreviated sha: a short one can turn ambiguous later", () => {
		assert.throws(() => parseRegistry(registryText({ pinned: { commit: "d058120", date: "2026-10-01" } })), /40-character/);
	});

	test("rejects a malformed date, an empty adaptation list and a duplicate name", () => {
		assert.throws(() => parseRegistry(registryText({ pinned: { commit: SHA_A, date: "15/10/2026" } })), /YYYY-MM-DD/);
		assert.throws(() => parseRegistry(registryText({ adaptations: [] })), /adaptations/);
		const one = JSON.parse(registryText()).sources[0];
		assert.throws(() => parseRegistry(JSON.stringify({ sources: [one, one] })), /twice/);
	});

	test("names the field when an adaptation has no upstream file", () => {
		assert.throws(
			() => parseRegistry(registryText({ adaptations: [{ local: "a.md", upstream: [] }] })),
			/source "up" adaptations\[0\].*upstream/,
		);
	});
});

describe("globToRegex", () => {
	test("* stays in one segment, ** crosses them, dots are literal", () => {
		assert.ok(globToRegex("commands/*.md").test("commands/crew.md"));
		assert.ok(!globToRegex("commands/*.md").test("commands/sub/crew.md"));
		assert.ok(!globToRegex("commands/*.md").test("commands/crewxmd"));
		assert.ok(globToRegex("docs/**").test("docs/a/b.html"));
	});
});

describe("sortChanges", () => {
	const source = parseRegistry(
		registryText({
			adaptations: [
				{ local: "a.md", upstream: ["commands/x.md", "references/shared.md"] },
				{ local: "b.md", upstream: ["references/shared.md"] },
			],
		}),
	).sources[0] as Source;

	test("adapted, context, new watched files and the rest go to their own lists", () => {
		const changes = parseNameStatus(
			["M\tcommands/x.md", "M\treferences/shared.md", "M\tSKILL.md", "A\tcommands/new.md", "A\tdocs/new.md", "M\tREADME.md"].join("\n"),
		);
		const s = sortChanges(source, changes);
		assert.deepEqual(s.adapted.map((c) => [c.path, c.locals]), [
			["commands/x.md", ["a.md"]],
			["references/shared.md", ["a.md", "b.md"]],
		]);
		assert.deepEqual(s.context.map((c) => c.path), ["SKILL.md"]);
		assert.deepEqual(s.added.map((c) => c.path), ["commands/new.md"]);
		assert.deepEqual(s.other.map((c) => c.path), ["docs/new.md", "README.md"]);
	});

	test("a deleted adapted file is still an adapted change, not noise", () => {
		const s = sortChanges(source, parseNameStatus("D\tcommands/x.md"));
		assert.equal(s.adapted[0]?.status, "D");
	});

	test("a modified file under a watch_new glob is not reported as new", () => {
		const s = sortChanges(source, parseNameStatus("M\tcommands/other.md"));
		assert.equal(s.added.length, 0);
		assert.equal(s.other.length, 1);
	});
});

describe("recordReviewed", () => {
	test("replaces only that source's reviewed and keeps the 2-space format", () => {
		const text = `${JSON.stringify(JSON.parse(registryText({ reviewed: { commit: SHA_A, date: "2026-10-01", note: "old" } })), null, 2)}\n`;
		const out = recordReviewed(text, "up", { commit: SHA_B, date: "2026-10-22" });
		const s = parseRegistry(out).sources[0];
		assert.equal(s?.reviewed?.commit, SHA_B);
		assert.equal(s?.reviewed?.note, undefined, "the old note described the old commit");
		assert.equal(s?.pinned.commit, SHA_A, "pinned never moves with --record");
		assert.equal(out, `${JSON.stringify(JSON.parse(out), null, 2)}\n`);
	});

	test("throws on an unknown source", () => {
		assert.throws(() => recordReviewed(registryText(), "nope", { commit: SHA_B, date: "2026-10-22" }), /nope/);
	});
});

describe("the real registry", () => {
	const text = readFileSync(REGISTRY, "utf8");
	const registry = parseRegistry(text);

	test("is kept in the format --record writes, so a record diffs as one block", () => {
		assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
	});

	test("every local file and license exists, and each license cites its pinned commit", () => {
		for (const s of registry.sources) {
			for (const a of s.adaptations) assert.ok(existsSync(join(ROOT, a.local)), `${s.name}: missing ${a.local}`);
			const license = join(ROOT, s.license);
			assert.ok(existsSync(license), `${s.name}: missing ${s.license}`);
			assert.ok(readFileSync(license, "utf8").includes(s.pinned.commit), `${s.license} must cite ${s.pinned.commit}`);
		}
	});

	test("every om-* command a license names is registered under that source", () => {
		for (const s of registry.sources) {
			const named = new Set([...readFileSync(join(ROOT, s.license), "utf8").matchAll(/`(om-[a-z-]+)`/g)].map((m) => m[1]));
			const locals = new Set(s.adaptations.map((a) => a.local));
			for (const n of named) {
				if (n === undefined || n.endsWith("-")) continue; // `om-wiki-*` style prefixes
				const path = `.claude/commands/${n}.md`;
				if (!existsSync(join(ROOT, path))) continue; // a renamed command is the license's to fix
				assert.ok(locals.has(path), `${s.license} names ${n}, but ${s.name} does not register ${path}`);
			}
		}
	});

	test("every command whose header says it adapts a repo is registered under that repo", () => {
		const dir = join(ROOT, ".claude", "commands");
		for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
			const m = /<!-- Adapts [^>]*?\((https:\/\/github\.com\/[^)\s]+)\)/.exec(readFileSync(join(dir, f), "utf8"));
			if (!m?.[1]) continue;
			const url = m[1].replace(/\.git$/, "");
			const s = registry.sources.find((x) => x.repo.replace(/\.git$/, "") === url);
			assert.ok(s, `${f} adapts ${url}, which the registry does not list`);
			assert.ok(
				s.adaptations.some((a) => a.local === `.claude/commands/${f}`),
				`${f} adapts ${url}, but ${s.name} does not register it`,
			);
		}
	});
});

describe("upstream-check end to end (local upstream, no network)", () => {
	let tmp = "";
	let upstream = "";
	let repo = "";
	const env = {
		...process.env,
		GIT_AUTHOR_NAME: "t",
		GIT_AUTHOR_EMAIL: "t@example.invalid",
		GIT_COMMITTER_NAME: "t",
		GIT_COMMITTER_EMAIL: "t@example.invalid",
	};
	const git = (cwd: string, ...args: string[]): string => {
		const r = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], { cwd, env, encoding: "utf8" });
		assert.equal(r.status, 0, r.stderr);
		return r.stdout.trim();
	};
	const commitFile = (path: string, body: string, msg: string): string => {
		mkdirSync(dirname(join(upstream, path)), { recursive: true });
		writeFileSync(join(upstream, path), body);
		git(upstream, "add", path);
		git(upstream, "commit", "-q", "-m", msg);
		return git(upstream, "rev-parse", "HEAD");
	};
	const registryPath = () => join(repo, ".claude", "upstream-sources.json");
	const run = (...args: string[]) => {
		const r = spawnSync(
			process.execPath,
			["--disable-warning=ExperimentalWarning", "--experimental-strip-types", join(SCRIPTS, "upstream-check.ts"), "--registry", registryPath(), ...args],
			{ encoding: "utf8", timeout: 60_000 },
		);
		return { code: r.status, out: r.stdout, err: r.stderr };
	};

	before(() => {
		tmp = mkdtempSync(join(tmpdir(), "om-upstream-test-"));
		upstream = join(tmp, "upstream");
		repo = join(tmp, "fork");
		mkdirSync(upstream);
		git(upstream, "init", "-q", "-b", "main");
		commitFile("SKILL.md", "skill\n", "skill");
		const pinned = commitFile("commands/x.md", "x v1\n", "x");
		git(upstream, "tag", "v1.0.0");
		mkdirSync(join(repo, ".claude", "commands"), { recursive: true });
		mkdirSync(join(repo, ".claude", "licenses"));
		writeFileSync(join(repo, ".claude", "commands", "om-x.md"), "adapted x\n");
		writeFileSync(join(repo, ".claude", "licenses", "up.md"), `adapted from commit ${pinned}\n`);
		const text = registryText({ repo: upstream, pinned: { commit: pinned, date: "2026-10-01" } });
		writeFileSync(registryPath(), `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
	});

	after(() => rmTemp(tmp));

	test("an untouched upstream reports nothing and exits 0", () => {
		const r = run();
		assert.equal(r.code, 0, r.out + r.err);
		assert.match(r.out, /no upstream commit since pinned/);
		assert.match(r.out, /latest tag v1\.0\.0/);
	});

	test("unrelated and new upstream files are listed but exit 0", () => {
		commitFile("README.md", "readme\n", "readme");
		commitFile("commands/crew.md", "crew\n", "crew");
		const r = run();
		assert.equal(r.code, 0, r.out + r.err);
		assert.match(r.out, /no adapted or context file changed/);
		assert.match(r.out, /new upstream files \(1\)[\s\S]*commands\/crew\.md/);
		assert.match(r.out, /1 other upstream file/);
	});

	test("a changed adapted file names the local adaptation, its commit, and exits 1", () => {
		commitFile("commands/x.md", "x v2\n", "rework x");
		const r = run("--diff");
		assert.equal(r.code, 1, r.out + r.err);
		assert.match(r.out, /modified {2}commands\/x\.md {2}→ {2}\.claude\/commands\/om-x\.md/);
		assert.match(r.out, /rework x/);
		assert.match(r.out, /\+x v2/);
	});

	test("--record moves reviewed to the head, leaves pinned, and the next run is clean", () => {
		const head = git(upstream, "rev-parse", "HEAD");
		const before = parseRegistry(readFileSync(registryPath(), "utf8")).sources[0];
		const r = run("--record", "--note", "looked at x v2");
		assert.equal(r.code, 1, "the record run still reports what it saw");
		const s = parseRegistry(readFileSync(registryPath(), "utf8")).sources[0];
		assert.equal(s?.reviewed?.commit, head);
		assert.equal(s?.reviewed?.note, "looked at x v2");
		assert.equal(s?.pinned.commit, before?.pinned.commit);
		assert.equal(run().code, 0);
		const sincePinned = run("--since", "pinned");
		assert.equal(sincePinned.code, 1, "the adaptation itself was never brought in line");
	});

	test("a missing local file and a license that does not cite pinned are warned about", () => {
		writeFileSync(join(repo, ".claude", "licenses", "up.md"), "no commit here\n");
		const r = run();
		assert.match(r.out, /does not cite the pinned commit/);
	});

	test("an unreachable upstream is a failure of that source, exit 2", () => {
		const text = registryText({ repo: join(tmp, "nowhere") });
		writeFileSync(registryPath(), text);
		const r = run();
		assert.equal(r.code, 2);
		assert.match(r.out, /✗ could not check/);
	});
});
