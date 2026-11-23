/**
 * Deterministic checks for /om-dossier-theo.
 *
 * Two rules of a research dossier are too important to rest on an agent's
 * word, so they are checked here from the files themselves:
 *
 * 1. The citation register is closed: every footnote of a draft is a key of
 *    the register, with a status that allows citing it.
 * 2. A revision is kept only if no reviewer's score dropped on any axis —
 *    or if a blind comparison of the two versions, run in both orders, shows
 *    the drop was noise: the previous version wins on no axis in either order.
 *
 * The comparison in both orders adapts PaperOrchestra's side-by-side raters
 * (https://github.com/google-research/paper-orchestra), Apache License 2.0,
 * Copyright 2026 Google LLC. Full license: .claude/licenses/paper-orchestra.md
 */

export type Citability = "citable" | "citable-tbc" | "not-citable";

/** Status tokens, accent-insensitive; a vault may write them in its language. */
const STATUS: ReadonlyMap<string, Citability> = new Map([
	["verified-vault", "citable"],
	["verifiee-coffre", "citable"],
	["verified-external", "citable"],
	["verifiee-externe", "citable"],
	["exists-only", "citable-tbc"],
	["existence-seule", "citable-tbc"],
	["unverified", "not-citable"],
	["a-verifier", "not-citable"],
	["tbc", "not-citable"],
	["rejected", "not-citable"],
	["rejetee", "not-citable"],
]);

const KEY = "[a-z0-9][a-z0-9-]*";
const TBC = /\(TBC\)/;

function fold(s: string): string {
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Drop fenced code blocks: a format example is not an entry or a citation. */
function withoutFences(text: string): string[] {
	const out: string[] = [];
	let fenced = false;
	for (const line of text.split(/\r?\n/)) {
		if (/^\s*(```|~~~)/.test(line)) {
			fenced = !fenced;
			continue;
		}
		if (!fenced) out.push(line);
	}
	return out;
}

export interface RegisterEntry {
	readonly key: string;
	readonly status: string;
	readonly citability: Citability | "unknown";
}

/** Entries are `### <key>` headings followed by a `- status:` (or `- statut:`) line. */
export function parseRegister(text: string): Map<string, RegisterEntry> {
	const entries = new Map<string, RegisterEntry>();
	let current: string | undefined;
	const heading = new RegExp(`^###\\s+\`?(${KEY})\`?\\s*$`);
	for (const line of withoutFences(text)) {
		const h = heading.exec(line);
		if (h?.[1]) {
			current = h[1];
			entries.set(current, { key: current, status: "", citability: "unknown" });
			continue;
		}
		if (/^#{1,3}\s/.test(line)) {
			current = undefined;
			continue;
		}
		if (!current || entries.get(current)?.status) continue;
		const s = /^\s*[-*]\s+\**(?:status|statut)\**\s*:\**\s*(.+)$/i.exec(line);
		if (!s?.[1]) continue;
		const status = s[1].trim();
		const token = fold(status).split(/[\s,;(]/)[0]?.replace(/[`*]/g, "") ?? "";
		entries.set(current, { key: current, status, citability: STATUS.get(token) ?? "unknown" });
	}
	return entries;
}

export interface DraftFootnotes {
	/** Labels referenced in the body, e.g. `[^lg29]`. */
	readonly refs: ReadonlySet<string>;
	/** Label → text of its definition line, e.g. `[^lg29]: …`. */
	readonly defs: ReadonlyMap<string, string>;
}

export function parseFootnotes(text: string): DraftFootnotes {
	const refs = new Set<string>();
	const defs = new Map<string, string>();
	for (const line of withoutFences(text)) {
		const d = /^\[\^([^\]\s]+)\]:\s*(.*)$/.exec(line);
		if (d?.[1] !== undefined) {
			defs.set(d[1], d[2] ?? "");
			continue;
		}
		for (const m of line.matchAll(/\[\^([^\]\s]+)\]/g)) {
			if (m[1] !== undefined) refs.add(m[1]);
		}
	}
	return { refs, defs };
}

/** Problems found in one draft against the register; empty means the draft passes. */
export function checkCitations(register: ReadonlyMap<string, RegisterEntry>, draft: string): string[] {
	const problems: string[] = [];
	const { refs, defs } = parseFootnotes(draft);
	for (const label of new Set([...refs, ...defs.keys()])) {
		const entry = register.get(label);
		if (!entry) {
			problems.push(`[^${label}] is not a key of the register`);
			continue;
		}
		if (entry.citability === "unknown") {
			problems.push(`[^${label}] has an unreadable status in the register: "${entry.status}"`);
		} else if (entry.citability === "not-citable") {
			problems.push(`[^${label}] may not be cited: status "${entry.status}"`);
		}
		const def = defs.get(label);
		if (refs.has(label) && def === undefined) {
			problems.push(`[^${label}] is cited but its footnote is not defined`);
		} else if (entry.citability === "citable-tbc" && def !== undefined && !TBC.test(def)) {
			problems.push(`[^${label}] is "${entry.status}": its footnote must show (TBC)`);
		}
	}
	return problems;
}

/** Scores are `- <axis>: <n>` lines under a `## Scores` heading. */
export function parseScores(text: string): Map<string, number> {
	const scores = new Map<string, number>();
	let inside = false;
	for (const line of withoutFences(text)) {
		if (/^#{1,6}\s/.test(line)) {
			inside = /^##\s+Scores\s*$/i.test(line);
			continue;
		}
		if (!inside) continue;
		const m = /^\s*[-*]\s+\**([a-z][a-z0-9-]*)\**\s*:\**\s*([0-9]+(?:\.[0-9]+)?)\b/i.exec(line);
		if (m?.[1] && m[2]) scores.set(m[1].toLowerCase(), Number(m[2]));
	}
	return scores;
}

export type ScoreVerdict = "keep" | "revert" | "invalid";

export interface ScoreComparison {
	readonly verdict: ScoreVerdict;
	readonly lines: readonly string[];
}

/**
 * Stricter than PaperOrchestra's rule, which lets one axis drop when another
 * rises as much: here any drop on any axis reverts the revision, unless a
 * blind comparison overturns it (see comparePairwise). An axis missing from
 * either review is a failed review, never a pass.
 */
export function compareScores(prev: ReadonlyMap<string, number>, curr: ReadonlyMap<string, number>): ScoreComparison {
	const lines: string[] = [];
	if (prev.size === 0 || curr.size === 0) {
		return { verdict: "invalid", lines: [`no "## Scores" section found in the ${prev.size === 0 ? "previous" : "current"} review`] };
	}
	let verdict: ScoreVerdict = "keep";
	for (const axis of new Set([...prev.keys(), ...curr.keys()])) {
		const a = prev.get(axis);
		const b = curr.get(axis);
		if (a === undefined || b === undefined) {
			lines.push(`${axis}: missing from the ${a === undefined ? "previous" : "current"} review`);
			verdict = "invalid";
			continue;
		}
		const mark = b < a ? "DROPPED" : b > a ? "up" : "same";
		lines.push(`${axis}: ${a} -> ${b} (${mark})`);
		if (b < a && verdict === "keep") verdict = "revert";
	}
	return { verdict, lines };
}

/**
 * Headings whose section a blind copy drops: the drafter's revision log says
 * which version is the newer one. Both spellings, since drafts are written in
 * the vault's language.
 */
const REVEALING = /^(#{1,6})\s+(?:revision log|journal des r[ée]visions)\b/i;

/**
 * A draft as a comparer may see it: no frontmatter (its dates tell the order)
 * and no revision log. Everything else is kept as written.
 */
export function blindCopy(text: string): string {
	let body = text.replace(/^\uFEFF/, "");
	const fm = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(body);
	if (fm) body = body.slice(fm[0].length);
	const out: string[] = [];
	let skipLevel = 0;
	let fenced = false;
	for (const line of body.split(/\r?\n/)) {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
		const h = fenced ? null : /^(#{1,6})\s/.exec(line);
		if (h?.[1]) {
			const level = h[1].length;
			if (skipLevel > 0 && level <= skipLevel) skipLevel = 0;
			const r = REVEALING.exec(line);
			if (skipLevel === 0 && r?.[1]) skipLevel = r[1].length;
		}
		if (skipLevel === 0) out.push(line);
	}
	return `${out.join("\n").trim()}\n`;
}

export type Preference = "version-1" | "version-2" | "tie";

/** Comparison lines are `- <axis>: version-1 | version-2 | tie` under a `## Comparison` heading. */
export function parseComparison(text: string): Map<string, Preference | "unknown"> {
	const prefs = new Map<string, Preference | "unknown">();
	let inside = false;
	for (const line of withoutFences(text)) {
		if (/^#{1,6}\s/.test(line)) {
			inside = /^##\s+(?:Comparison|Comparaison)\s*$/i.test(line);
			continue;
		}
		if (!inside) continue;
		const m = /^\s*[-*]\s+\**([a-z][a-z0-9-]*)\**\s*:\**\s*(.+)$/i.exec(line);
		if (!m?.[1] || !m[2]) continue;
		const v = fold(m[2]).replace(/[`*]/g, "").trim();
		const pref: Preference | "unknown" = /^version[- ]?1\b/.test(v)
			? "version-1"
			: /^version[- ]?2\b/.test(v)
				? "version-2"
				: /^(?:tie|egalite)\b/.test(v)
					? "tie"
					: "unknown";
		prefs.set(m[1].toLowerCase(), pref);
	}
	return prefs;
}

type Side = "previous" | "current" | "tie";

/** Order 1 shows the previous version as Version 1; order 2 shows the current one first. */
function side(pref: Preference, order: 1 | 2): Side {
	if (pref === "tie") return "tie";
	const first: Side = order === 1 ? "previous" : "current";
	const second: Side = order === 1 ? "current" : "previous";
	return pref === "version-1" ? first : second;
}

/**
 * Arbitrates a score drop with two blind comparisons of the same pair, one in
 * each order. The revision is kept only if the previous version wins on no
 * axis in either order. A verdict that flips with the order was decided by
 * position, not content, so it does not rescue the revision.
 */
export function comparePairwise(
	order1: ReadonlyMap<string, Preference | "unknown">,
	order2: ReadonlyMap<string, Preference | "unknown">,
): ScoreComparison {
	if (order1.size === 0 || order2.size === 0) {
		return { verdict: "invalid", lines: [`no "## Comparison" section found in the order-${order1.size === 0 ? 1 : 2} comparison`] };
	}
	const lines: string[] = [];
	let verdict: ScoreVerdict = "keep";
	for (const axis of new Set([...order1.keys(), ...order2.keys()])) {
		const a = order1.get(axis);
		const b = order2.get(axis);
		if (a === undefined || b === undefined) {
			lines.push(`${axis}: missing from the order-${a === undefined ? 1 : 2} comparison`);
			verdict = "invalid";
			continue;
		}
		if (a === "unknown" || b === "unknown") {
			lines.push(`${axis}: unreadable preference in the order-${a === "unknown" ? 1 : 2} comparison`);
			verdict = "invalid";
			continue;
		}
		const s1 = side(a, 1);
		const s2 = side(b, 2);
		const sides = new Set([s1, s2]);
		const mark = sides.has("previous")
			? sides.has("current")
				? "FLIPS WITH THE ORDER"
				: "PREVIOUS PREFERRED"
			: sides.has("current")
				? "current preferred"
				: "tie";
		lines.push(`${axis}: order 1 ${s1}, order 2 ${s2} (${mark})`);
		if (sides.has("previous") && verdict === "keep") verdict = "revert";
	}
	return { verdict, lines };
}
