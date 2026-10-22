/**
 * Pure half of `upstream-check.ts`: read the registry of adapted upstream
 * sources, sort an upstream diff into what needs a look, and print it.
 *
 * WHY A REGISTRY
 *
 * Some files of this fork are adaptations of files in third-party repositories
 * that the fork is not a fork of (obsidian-second-brain, llm-wiki). Git cannot
 * tell what changed there since the adaptation was written, and a license file
 * citing one commit does not say which local file came from which upstream
 * file. `.claude/upstream-sources.json` records both, so a later check compares
 * exactly the upstream files each adaptation came from, and nothing else ends
 * up looking urgent.
 *
 * TWO COMMITS PER SOURCE
 *
 * `pinned` is the commit the adaptations were written from; the license cites
 * it. `reviewed` is the last upstream commit someone checked the adaptations
 * against. The check diffs from `reviewed`, so a change looked at once and
 * judged irrelevant is not reported again. `--record` moves `reviewed`, never
 * `pinned`: bringing the adaptations in line is a decision of its own.
 */

export interface Commit {
	readonly commit: string;
	readonly date: string;
	readonly note?: string;
}

export interface Adaptation {
	readonly local: string;
	readonly upstream: readonly string[];
}

export interface Source {
	readonly name: string;
	readonly repo: string;
	readonly branch: string;
	readonly license: string;
	readonly pinned: Commit;
	readonly reviewed?: Commit;
	readonly adaptations: readonly Adaptation[];
	readonly context: readonly string[];
	readonly watch_new: readonly string[];
}

export interface Registry {
	readonly sources: readonly Source[];
}

const SHA = /^[0-9a-f]{40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(where: string, what: string): never {
	throw new Error(`upstream-sources: ${where}: ${what}`);
}

function str(o: Record<string, unknown>, key: string, where: string): string {
	const v = o[key];
	if (typeof v !== "string" || v === "") fail(where, `"${key}" must be a non-empty string`);
	return v;
}

function strList(o: Record<string, unknown>, key: string, where: string, required: boolean): string[] {
	const v = o[key];
	if (v === undefined && !required) return [];
	if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || x === "")) {
		fail(where, `"${key}" must be a list of non-empty strings`);
	}
	if (required && v.length === 0) fail(where, `"${key}" must not be empty`);
	return v as string[];
}

function obj(v: unknown, where: string): Record<string, unknown> {
	if (typeof v !== "object" || v === null || Array.isArray(v)) fail(where, "must be an object");
	return v as Record<string, unknown>;
}

function commit(v: unknown, where: string): Commit {
	const o = obj(v, where);
	const sha = str(o, "commit", where);
	if (!SHA.test(sha)) fail(where, `"commit" must be a full 40-character sha, got "${sha}"`);
	const date = str(o, "date", where);
	if (!DATE.test(date)) fail(where, `"date" must be YYYY-MM-DD, got "${date}"`);
	const note = o["note"];
	if (note !== undefined && typeof note !== "string") fail(where, `"note" must be a string`);
	return note === undefined ? { commit: sha, date } : { commit: sha, date, note };
}

/** Parse and validate the registry. Throws an Error naming the bad field. */
export function parseRegistry(text: string): Registry {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (e) {
		fail("file", `not valid JSON (${(e as Error).message})`);
	}
	const top = obj(raw, "file");
	if (!Array.isArray(top["sources"])) fail("file", `"sources" must be a list`);
	const names = new Set<string>();
	const sources = (top["sources"] as unknown[]).map((s, i): Source => {
		const o = obj(s, `sources[${i}]`);
		const name = str(o, "name", `sources[${i}]`);
		const where = `source "${name}"`;
		if (names.has(name)) fail(where, "name is used twice");
		names.add(name);
		if (!Array.isArray(o["adaptations"]) || o["adaptations"].length === 0) {
			fail(where, `"adaptations" must be a non-empty list`);
		}
		const adaptations = (o["adaptations"] as unknown[]).map((a, j): Adaptation => {
			const ao = obj(a, `${where} adaptations[${j}]`);
			return {
				local: str(ao, "local", `${where} adaptations[${j}]`),
				upstream: strList(ao, "upstream", `${where} adaptations[${j}]`, true),
			};
		});
		const base = {
			name,
			repo: str(o, "repo", where),
			branch: str(o, "branch", where),
			license: str(o, "license", where),
			pinned: commit(o["pinned"], `${where} pinned`),
			adaptations,
			context: strList(o, "context", where, false),
			watch_new: strList(o, "watch_new", where, false),
		};
		return o["reviewed"] === undefined ? base : { ...base, reviewed: commit(o["reviewed"], `${where} reviewed`) };
	});
	return { sources };
}

/**
 * `*` matches within one path segment, `**` across segments. Everything else
 * is literal. Enough for globs like `commands/*.md`.
 */
export function globToRegex(glob: string): RegExp {
	let re = "";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i] as string;
		if (c === "*" && glob[i + 1] === "*") {
			re += ".*";
			i++;
		} else if (c === "*") {
			re += "[^/]*";
		} else {
			re += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(`^${re}$`);
}

/** One line of `git diff --name-status --no-renames`. */
export interface Change {
	readonly status: string;
	readonly path: string;
}

export function parseNameStatus(out: string): Change[] {
	return out
		.split("\n")
		.filter((l) => l.trim() !== "")
		.map((l) => {
			const tab = l.indexOf("\t");
			return { status: l.slice(0, tab).trim(), path: l.slice(tab + 1) };
		});
}

export interface Sorted {
	/** Upstream files an adaptation comes from, with the local files concerned. */
	readonly adapted: readonly (Change & { readonly locals: readonly string[] })[];
	readonly context: readonly Change[];
	/** Added files matching `watch_new`. */
	readonly added: readonly Change[];
	readonly other: readonly Change[];
}

export function sortChanges(source: Source, changes: readonly Change[]): Sorted {
	const localsOf = new Map<string, string[]>();
	for (const a of source.adaptations) {
		for (const u of a.upstream) localsOf.set(u, [...(localsOf.get(u) ?? []), a.local]);
	}
	const context = new Set(source.context);
	const watch = source.watch_new.map(globToRegex);
	const adapted: (Change & { locals: string[] })[] = [];
	const ctx: Change[] = [];
	const added: Change[] = [];
	const other: Change[] = [];
	for (const c of changes) {
		const locals = localsOf.get(c.path);
		if (locals) adapted.push({ ...c, locals });
		else if (context.has(c.path)) ctx.push(c);
		else if (c.status === "A" && watch.some((r) => r.test(c.path))) added.push(c);
		else other.push(c);
	}
	return { adapted, context: ctx, added, other };
}

export function needsReview(sorted: Sorted): boolean {
	return sorted.adapted.length > 0 || sorted.context.length > 0;
}

const STATUS: Record<string, string> = { A: "added", M: "modified", D: "deleted", T: "type changed" };

function label(status: string): string {
	return STATUS[status] ?? status;
}

export interface Report {
	readonly source: Source;
	readonly baseline: "pinned" | "reviewed";
	readonly baseCommit: string;
	readonly head: string;
	readonly headDate: string;
	readonly latestTag: string | null;
	readonly commits: number;
	readonly sorted: Sorted;
	/** `git log` lines per watched upstream path that changed. */
	readonly history: ReadonlyMap<string, readonly string[]>;
	readonly warnings: readonly string[];
}

export function formatReport(r: Report): string {
	const s = r.source;
	const out: string[] = [];
	out.push(`${s.name}  ${s.repo} (${s.branch})`);
	out.push(`  pinned    ${s.pinned.commit.slice(0, 7)}  ${s.pinned.date}`);
	if (s.reviewed) out.push(`  reviewed  ${s.reviewed.commit.slice(0, 7)}  ${s.reviewed.date}`);
	out.push(`  upstream  ${r.head.slice(0, 7)}  ${r.headDate}${r.latestTag ? `  latest tag ${r.latestTag}` : ""}`);
	for (const w of r.warnings) out.push(`  ! ${w}`);
	if (r.commits === 0) {
		out.push(`  ✓ no upstream commit since ${r.baseline}`);
		return out.join("\n");
	}
	out.push(`  ${r.commits} upstream commit(s) since ${r.baseline} (${r.baseCommit.slice(0, 7)})`);
	const { adapted, context, added, other } = r.sorted;
	if (adapted.length === 0 && context.length === 0) {
		out.push("  ✓ no adapted or context file changed");
	}
	if (adapted.length > 0) {
		out.push(`  ⚠ adapted upstream files changed (${adapted.length}) — compare with the local adaptation:`);
		for (const c of adapted) {
			out.push(`    ${label(c.status)}  ${c.path}  →  ${c.locals.join(", ")}`);
			for (const h of r.history.get(c.path) ?? []) out.push(`        ${h}`);
		}
	}
	if (context.length > 0) {
		out.push(`  • context files changed (${context.length}) — worth a glance:`);
		for (const c of context) {
			out.push(`    ${label(c.status)}  ${c.path}`);
			for (const h of r.history.get(c.path) ?? []) out.push(`        ${h}`);
		}
	}
	if (added.length > 0) {
		out.push(`  + new upstream files (${added.length}) — not adapted, maybe worth it:`);
		for (const c of added) out.push(`    ${c.path}`);
	}
	if (other.length > 0) out.push(`  · ${other.length} other upstream file(s) changed, none adapted here`);
	return out.join("\n");
}

/**
 * Return the registry text with one source's `reviewed` replaced. The file is
 * rewritten as `JSON.stringify(…, null, 2)`, the format it is kept in, so a
 * record shows in git as the `reviewed` block alone.
 */
export function recordReviewed(text: string, name: string, reviewed: Commit): string {
	const raw = JSON.parse(text) as { sources: { name: string; reviewed?: Commit }[] };
	const s = raw.sources.find((x) => x.name === name);
	if (!s) throw new Error(`upstream-sources: no source named "${name}"`);
	s.reviewed = reviewed;
	return `${JSON.stringify(raw, null, 2)}\n`;
}
