/**
 * om-history — read this vault's past Claude Code conversations and surface
 * the corrections the user had to give, the asks they keep repeating and the
 * text they keep pasting. Pure extraction and detection; `/om-history` reads
 * the result and does the judging.
 *
 * Source: `<projects>/<slug>/*.jsonl`, one transcript per session, where
 * `<slug>` is the vault's absolute path through `projectSlug`. Worktree
 * sessions live beside it in `<slug>--claude-worktrees-<name>`. Nothing else
 * is read: not `~/.claude/history.jsonl` (kept by the terminal CLI only, so
 * blind to desktop-app sessions), and never another project's folder — a
 * neighbour named `<slug>-old` is a different project.
 *
 * Every detected correction is a hypothesis. The patterns over-match on
 * purpose; the agent reads each quote and discards dictation, one-off
 * disagreement and questions.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { projectSlug } from "../tidy-fix.ts";

export interface Prompt {
	sessionId: string;
	/** Epoch ms. */
	time: number;
	/** Local calendar day, YYYY-MM-DD. */
	date: string;
	/** Typed text, markup stripped, each paste replaced by `[PASTE]`. */
	text: string;
	/** Pasted bodies, kept apart: someone else's text, never a correction. */
	pastes: string[];
}

export interface Session {
	sessionId: string;
	/** Epoch ms of every timestamped line, ascending. */
	times: number[];
	prompts: Prompt[];
	title: string | null;
}

export interface Correction {
	date: string;
	sessionId: string;
	text: string;
	repeat: boolean;
}

export interface RepeatedAsk {
	start: string;
	sessions: number;
	example: string;
}

export interface RepeatedPaste {
	fingerprint: string;
	sessions: number;
	dates: string[];
	preview: string;
}

export interface SessionSummary {
	sessionId: string;
	date: string;
	activeHours: number;
	firstPrompt: string;
	title: string | null;
}

export interface HistoryReport {
	window: {
		days: number;
		oldestTranscript: string | null;
		sessions: number;
		prompts: number;
		dirs: string[];
	};
	corrections: Correction[];
	repeatedAsks: RepeatedAsk[];
	repeatedPastes: RepeatedPaste[];
	sessions: SessionSummary[];
}

const WORKTREE_INFIX = "--claude-worktrees-";
const ACTIVE_GAP_CAP_MS = 10 * 60 * 1000;
const PASTE_FINGERPRINT_CHARS = 2000;

/** Prompts that are not the user typing: sub-agent endings, skill bodies, resumes, interruptions. */
export const NOISE_PREFIXES = [
	"<task-notification>",
	"Base directory for this skill",
	"This session is being continued",
	"[Request interrupted",
	"Caveat:",
	"The app was quit while you were working",
] as const;

/** Where Claude Code keeps per-project transcripts. */
export function projectsRootDefault(env: NodeJS.ProcessEnv, home: string): string {
	return join(env["CLAUDE_CONFIG_DIR"] || join(home, ".claude"), "projects");
}

/** Local calendar day of an epoch-ms instant, YYYY-MM-DD. */
export function localDay(ms: number): string {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A worktree checkout sits at `<vault>/.claude/worktrees/<name>`; the vault
 * it belongs to is the part before. Any other path is its own root.
 */
export function vaultRootOf(path: string): string {
	const m = /^(.*)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+[\\/]?$/.exec(path);
	return m?.[1] ?? path;
}

/**
 * The transcript folders of this vault: its own slug, and every
 * `<slug>--claude-worktrees-*`. The path is slugged as given and as resolved
 * (macOS's /var is /private/var), as `tidy-fix.ts` does for auto-memory.
 * Only folders that exist are returned.
 */
export function transcriptDirs(projectsRoot: string, vaultPath: string): string[] {
	const root = vaultRootOf(vaultPath);
	let real = root;
	try {
		real = realpathSync(root);
	} catch {
		/* keep the path as given */
	}
	const slugs = new Set([root, real].map(projectSlug));
	let entries: string[];
	try {
		entries = readdirSync(projectsRoot);
	} catch {
		return [];
	}
	return entries
		.filter((name) => [...slugs].some((s) => name === s || name.startsWith(s + WORKTREE_INFIX)))
		.map((name) => join(projectsRoot, name))
		.filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false)
		.sort();
}

const PASTE_RE = /<pasted_content\b[^>]*>([\s\S]*?)(?:<\/pasted_content\b[^>]*>|$)/g;
const STRIP_RES = [
	/<system-reminder>[\s\S]*?<\/system-reminder>/g,
	/<(command-[a-z-]+)>[\s\S]*?<\/\1>/g,
	/<(local-command-[a-z-]+)>[\s\S]*?<\/\1>/g,
	/<(ide_[a-z_]+)>[\s\S]*?<\/\1>/g,
];

/**
 * Split raw prompt text into what the user typed and what they pasted.
 * An unclosed paste runs to the end: when in doubt, the text is not theirs.
 */
export function cleanPrompt(raw: string): { text: string; pastes: string[] } {
	const pastes: string[] = [];
	let text = raw.replace(PASTE_RE, (_m, body: string) => {
		pastes.push(body.trim());
		return "[PASTE]";
	});
	for (const re of STRIP_RES) text = text.replace(re, "");
	return { text: text.trim(), pastes };
}

export function isNoise(text: string): boolean {
	const t = text.trimStart();
	return NOISE_PREFIXES.some((p) => t.startsWith(p));
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((b): b is { type: "text"; text: string } =>
			typeof b === "object" && b !== null && b.type === "text" && typeof b.text === "string")
		.map((b) => b.text)
		.join("\n");
}

/** A transcript line the user typed, or null. */
export function promptOf(line: Record<string, unknown>, sessionId: string): Prompt | null {
	if (line["type"] !== "user") return null;
	if (line["isMeta"] || line["isCompactSummary"] || line["isSidechain"]) return null;
	if ("toolUseResult" in line) return null;
	const time = Date.parse(String(line["timestamp"] ?? ""));
	if (!Number.isFinite(time)) return null;
	const msg = line["message"] as { content?: unknown } | undefined;
	const raw = messageText(msg?.content);
	if (isNoise(raw)) return null;
	const { text, pastes } = cleanPrompt(raw);
	if (isNoise(text)) return null;
	if (text === "" && pastes.length === 0) return null;
	return { sessionId, time, date: localDay(time), text, pastes };
}

/** Parse one transcript. Unreadable lines are skipped, not fatal. */
export function parseSession(file: string): Session {
	const sessionId = basename(file, ".jsonl");
	const times: number[] = [];
	const prompts: Prompt[] = [];
	let title: string | null = null;
	for (const l of readFileSync(file, "utf-8").split("\n")) {
		if (!l.trim()) continue;
		let line: Record<string, unknown>;
		try {
			line = JSON.parse(l) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (line === null || typeof line !== "object") continue;
		const t = Date.parse(String(line["timestamp"] ?? ""));
		if (Number.isFinite(t)) times.push(t);
		if (line["type"] === "custom-title" && typeof line["customTitle"] === "string") {
			title = line["customTitle"];
		}
		const p = promptOf(line, sessionId);
		if (p) prompts.push(p);
	}
	times.sort((a, b) => a - b);
	return { sessionId, times, prompts, title };
}

/** Sum of gaps between consecutive timestamps, each capped at 10 minutes. */
export function activeMs(times: readonly number[]): number {
	let total = 0;
	for (let i = 1; i < times.length; i++) {
		total += Math.min((times[i] as number) - (times[i - 1] as number), ACTIVE_GAP_CAP_MS);
	}
	return total;
}

// Left boundary on every pattern; accented letters count as letters (`\b` does not).
const L = "(?<![\\p{L}\\p{N}_])";
const R = "(?![\\p{L}\\p{N}_])";
const rx = (parts: readonly string[], flags = "iu") =>
	new RegExp(parts.map((p) => (p.startsWith("^") ? p : L + p)).join("|"), flags);

export const CORRECTION_FR = rx(
	[
		"^non" + R,
		"ce n'est pas (ce que|ça|correct|juste)",
		"c'est faux",
		"je (t')?(ai|avais) (déjà )?(dit|demandé|précisé|expliqué)",
		"tu (n'as pas|as oublié|te trompes|inventes|devines)",
		"pourquoi (as-tu|tu as)",
		"arrête",
		"il ne faut (pas|jamais|plus)",
		"je ne veux (pas|plus)",
		"ne (fais|touche|change|modifie|devine|invente|réécris) (pas|rien|plus)",
		"sans (mon accord|me demander)",
		"je n'ai (jamais|pas) demandé",
		"pas de (:|;|tiret)",
		"points?[- ]virgules?",
		"antith[eè]se",
		"trop (long|affirmatif)",
		"au lieu de",
		"c'est une erreur",
		"on (a|avait) déjà",
	],
	"imu",
);

export const CORRECTION_EN = rx([
	"that'?s wrong",
	"not what i (asked|meant)",
	"i (already )?(said|told you)",
	"why did you",
	"you forgot",
	"stop (doing|using|adding)",
	"how many times",
]);

export const REPETITION = rx(
	[
		"encore",
		"toujours",
		"déjà",
		"à nouveau",
		"de nouveau",
		"une fois de plus",
		"combien de fois",
		"on avait dit",
		"again",
		"still",
		"already",
	].map((w) => w + R),
);

/** Typographic apostrophes become ASCII so one pattern matches both. */
const normalizeQuotes = (s: string) => s.replace(/[’‘ʼ]/g, "'");

/** `{repeat}` when the text reads like a correction, null otherwise. */
export function detectCorrection(text: string): { repeat: boolean } | null {
	const t = normalizeQuotes(text);
	if (!CORRECTION_FR.test(t) && !CORRECTION_EN.test(t)) return null;
	return { repeat: REPETITION.test(t) };
}

/** First five words, lowercased, punctuation and pastes dropped. */
export function askStart(text: string): string {
	return normalizeQuotes(text)
		.replace(/\[PASTE\]/g, " ")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}'\s]/gu, " ")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 5)
		.join(" ");
}

export function pasteFingerprint(body: string): string {
	return createHash("sha256").update(body.slice(0, PASTE_FINGERPRINT_CHARS)).digest("hex").slice(0, 12);
}

/**
 * A replayed or edited prompt copies the history into a second transcript:
 * the same text shows up in two sessions the same day. Keep the first.
 */
export function dedupeForks(prompts: readonly Prompt[]): Prompt[] {
	const seen = new Set<string>();
	const kept: Prompt[] = [];
	for (const p of [...prompts].sort((a, b) => a.time - b.time)) {
		const key = `${p.date}\0${p.text}\0${p.pastes.join("\0")}`;
		if (seen.has(key)) continue;
		seen.add(key);
		kept.push(p);
	}
	return kept;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

export function buildReport(
	all: readonly Session[],
	days: number,
	now: number,
	dirs: readonly string[] = [],
): HistoryReport {
	const since = now - days * 86_400_000;
	const oldest = all.reduce<number | null>(
		(min, s) => (s.times.length && (min === null || (s.times[0] as number) < min) ? (s.times[0] as number) : min),
		null,
	);
	const inWindow = all.filter((s) => s.times.some((t) => t >= since));
	const prompts = dedupeForks(inWindow.flatMap((s) => s.prompts.filter((p) => p.time >= since)));

	const corrections: Correction[] = [];
	for (const p of prompts) {
		const hit = detectCorrection(p.text);
		if (hit) corrections.push({ date: p.date, sessionId: p.sessionId, text: p.text, repeat: hit.repeat });
	}

	const asks = new Map<string, { sessions: Set<string>; example: string }>();
	for (const p of prompts) {
		const start = askStart(p.text);
		if (!start) continue;
		const a = asks.get(start) ?? { sessions: new Set<string>(), example: truncate(p.text, 200) };
		a.sessions.add(p.sessionId);
		asks.set(start, a);
	}
	const repeatedAsks = [...asks]
		.filter(([, a]) => a.sessions.size >= 3)
		.map(([start, a]) => ({ start, sessions: a.sessions.size, example: a.example }))
		.sort((x, y) => y.sessions - x.sessions || x.start.localeCompare(y.start));

	const pastes = new Map<string, { sessions: Set<string>; dates: Set<string>; preview: string }>();
	for (const p of prompts) {
		for (const body of p.pastes) {
			if (!body) continue;
			const fp = pasteFingerprint(body);
			const e = pastes.get(fp) ?? { sessions: new Set<string>(), dates: new Set<string>(), preview: truncate(body, 200) };
			e.sessions.add(p.sessionId);
			e.dates.add(p.date);
			pastes.set(fp, e);
		}
	}
	const repeatedPastes = [...pastes]
		.filter(([, e]) => e.sessions.size >= 2)
		.map(([fingerprint, e]) => ({
			fingerprint,
			sessions: e.sessions.size,
			dates: [...e.dates].sort(),
			preview: e.preview,
		}))
		.sort((x, y) => y.sessions - x.sessions);

	const sessions: SessionSummary[] = inWindow
		.map((s) => ({
			sessionId: s.sessionId,
			date: s.times.length ? localDay(s.times[0] as number) : "",
			activeHours: Math.round((activeMs(s.times) / 3_600_000) * 100) / 100,
			firstPrompt: truncate(s.prompts[0]?.text ?? "", 200),
			title: s.title,
		}))
		.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));

	return {
		window: {
			days,
			oldestTranscript: oldest === null ? null : localDay(oldest),
			sessions: inWindow.length,
			prompts: prompts.length,
			dirs: dirs.map((d) => basename(d)),
		},
		corrections: corrections.sort((a, b) => a.date.localeCompare(b.date)),
		repeatedAsks,
		repeatedPastes,
		sessions,
	};
}

/** Read every top-level transcript in the given folders (sub-agent folders are not conversations). */
export function readSessions(dirs: readonly string[]): Session[] {
	return dirs.flatMap((dir) =>
		readdirSync(dir)
			.filter((f) => f.endsWith(".jsonl"))
			.map((f) => join(dir, f))
			.filter((f) => existsSync(f))
			.map(parseSession),
	);
}
