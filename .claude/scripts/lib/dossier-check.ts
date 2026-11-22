/**
 * Deterministic checks for /om-dossier-theo.
 *
 * Two rules of a research dossier are too important to rest on an agent's
 * word, so they are checked here from the files themselves:
 *
 * 1. The citation register is closed: every footnote of a draft is a key of
 *    the register, with a status that allows citing it.
 * 2. A revision is kept only if no reviewer's score dropped on any axis.
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
 * rises as much: here any drop on any axis reverts the revision. An axis
 * missing from either review is a failed review, never a pass.
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
