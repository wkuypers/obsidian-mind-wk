/**
 * Tests for om-history: transcript folder selection, prompt filtering,
 * paste isolation, fork dedup, correction detection, active time, and the
 * CLI's exit codes.
 */

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	activeMs,
	buildReport,
	cleanPrompt,
	detectCorrection,
	localDay,
	parseSession,
	readSessions,
	transcriptDirs,
	vaultRootOf,
} from "../lib/om-history.ts";
import { projectSlug } from "../tidy-fix.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "om-history.ts");

const tmp = mkdtempSync(join(tmpdir(), "om-history-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

let n = 0;
const fresh = (name: string) => {
	const d = join(tmp, `${n++}-${name}`);
	mkdirSync(d, { recursive: true });
	return d;
};

/** A typed prompt line. */
const user = (ts: string, content: unknown, extra: Record<string, unknown> = {}) => ({
	type: "user",
	timestamp: ts,
	message: { role: "user", content },
	...extra,
});
const assistant = (ts: string) => ({ type: "assistant", timestamp: ts, message: { content: [] } });

function writeSession(dir: string, id: string, lines: readonly object[]): string {
	const f = join(dir, `${id}.jsonl`);
	writeFileSync(f, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
	return f;
}

const DAY = "2026-10-01T12:00:00.000Z";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");

describe("transcript folders", () => {
	test("slug turns every character outside [A-Za-z0-9-] into -, spaces, ~ and . included", () => {
		assert.equal(
			projectSlug("/Users/w/Library/Mobile Documents/iCloud~md~obsidian/Documents/my-vault"),
			"-Users-w-Library-Mobile-Documents-iCloud-md-obsidian-Documents-my-vault",
		);
		assert.equal(projectSlug("/a/site.com-next"), "-a-site-com-next");
	});

	test("includes the vault's own folder and its worktree folders, excludes a neighbour sharing the prefix", () => {
		const projects = fresh("projects");
		const vault = join(tmp, "My Vault~x");
		const slug = projectSlug(vault);
		for (const name of [slug, `${slug}--claude-worktrees-feature`, `${slug}-old`, `${slug}2`, "-other"]) {
			mkdirSync(join(projects, name));
		}
		const names = transcriptDirs(projects, vault).map((d) => d.slice(projects.length + 1));
		assert.deepEqual(names, [slug, `${slug}--claude-worktrees-feature`]);
	});

	test("a worktree checkout resolves to its vault", () => {
		assert.equal(vaultRootOf("/v/my-vault/.claude/worktrees/abc"), "/v/my-vault");
		assert.equal(vaultRootOf("/v/my-vault"), "/v/my-vault");
	});

	test("no folder at all → empty list", () => {
		assert.deepEqual(transcriptDirs(fresh("empty-projects"), "/nowhere/vault"), []);
	});
});

describe("prompt filtering", () => {
	test("isMeta, toolUseResult, isCompactSummary and sidechain lines are not prompts", () => {
		const dir = fresh("filters");
		const f = writeSession(dir, "s1", [
			user(DAY, "kept"),
			user(DAY, "meta", { isMeta: true }),
			user(DAY, [{ type: "tool_result", content: "x" }], { toolUseResult: {} }),
			user(DAY, "This session is being continued", { isCompactSummary: true }),
			user(DAY, "sub-agent", { isSidechain: true }),
		]);
		assert.deepEqual(parseSession(f).prompts.map((p) => p.text), ["kept"]);
	});

	test("noise prefixes are dropped", () => {
		const dir = fresh("noise");
		const f = writeSession(dir, "s1", [
			user(DAY, "<task-notification><task-id>a</task-id>non, c'est faux</task-notification>"),
			user(DAY, "Base directory for this skill: /x"),
			user(DAY, "This session is being continued from a previous conversation"),
			user(DAY, "[Request interrupted by user]"),
			user(DAY, "<local-command-caveat>Caveat: the messages below</local-command-caveat>"),
			user(DAY, "Caveat: raw"),
			user(DAY, "The app was quit while you were working"),
			user(DAY, "real"),
		]);
		assert.deepEqual(parseSession(f).prompts.map((p) => p.text), ["real"]);
	});

	test("array content keeps text blocks only", () => {
		const dir = fresh("blocks");
		const f = writeSession(dir, "s1", [
			user(DAY, [{ type: "text", text: "a" }, { type: "image", source: {} }, { type: "text", text: "b" }]),
		]);
		assert.deepEqual(parseSession(f).prompts.map((p) => p.text), ["a\nb"]);
	});

	test("markup is stripped; a prompt that is only markup is dropped", () => {
		assert.equal(
			cleanPrompt("<system-reminder>sys</system-reminder>hello <ide_selection>sel</ide_selection>").text,
			"hello",
		);
		assert.equal(
			cleanPrompt("<command-message>x</command-message>\n<command-name>/om-x</command-name><local-command-stdout>o</local-command-stdout>").text,
			"",
		);
		const dir = fresh("markup-only");
		const f = writeSession(dir, "s1", [user(DAY, "<command-name>/om-tidy</command-name>")]);
		assert.equal(parseSession(f).prompts.length, 0);
	});

	test("the custom title is the last one written", () => {
		const dir = fresh("title");
		const f = writeSession(dir, "s1", [
			{ type: "custom-title", customTitle: "first" },
			user(DAY, "x"),
			{ type: "custom-title", customTitle: "second" },
		]);
		assert.equal(parseSession(f).title, "second");
	});

	test("an unparsable line is skipped, not fatal", () => {
		const dir = fresh("broken");
		const f = join(dir, "s1.jsonl");
		writeFileSync(f, `{not json\n${JSON.stringify(user(DAY, "ok"))}\n`);
		assert.deepEqual(parseSession(f).prompts.map((p) => p.text), ["ok"]);
	});
});

describe("pastes", () => {
	const raw = 'voici :\n<pasted_content id="ab12">\nNon, c\'est faux, arrête.\n</pasted_content id="ab12">\nqu\'en penses-tu ?';

	test("removed from the text, kept apart", () => {
		const { text, pastes } = cleanPrompt(raw);
		assert.equal(text, "voici :\n[PASTE]\nqu'en penses-tu ?");
		assert.deepEqual(pastes, ["Non, c'est faux, arrête."]);
	});

	test("an unclosed paste runs to the end", () => {
		assert.deepEqual(cleanPrompt("lis <pasted_content id=\"x\">non, arrête").pastes, ["non, arrête"]);
	});

	test("never detected as a correction, and counted across sessions", () => {
		const dir = fresh("pastes");
		writeSession(dir, "a", [user("2026-10-01T12:00:00.000Z", raw)]);
		writeSession(dir, "b", [user("2026-10-03T12:00:00.000Z", raw)]);
		const r = buildReport(readSessions([dir]), 30, NOW);
		assert.equal(r.corrections.length, 0);
		assert.equal(r.repeatedPastes.length, 1);
		assert.equal(r.repeatedPastes[0]?.sessions, 2);
	});
});

describe("forks", () => {
	test("the same prompt in two sessions the same day counts once", () => {
		const dir = fresh("forks");
		writeSession(dir, "orig", [user("2026-10-01T10:00:00.000Z", "non, c'est faux")]);
		writeSession(dir, "fork", [user("2026-10-01T10:00:00.000Z", "non, c'est faux"), user("2026-10-01T11:00:00.000Z", "autre")]);
		const r = buildReport(readSessions([dir]), 30, NOW);
		assert.equal(r.corrections.length, 1);
		assert.equal(r.window.prompts, 2);
		assert.equal(r.window.sessions, 2);
	});

	test("the same prompt on two different days counts twice", () => {
		const dir = fresh("two-days");
		writeSession(dir, "a", [user("2026-10-01T12:00:00.000Z", "non, c'est faux")]);
		writeSession(dir, "b", [user("2026-10-04T12:00:00.000Z", "non, c'est faux")]);
		assert.equal(buildReport(readSessions([dir]), 30, NOW).corrections.length, 2);
	});
});

describe("correction detection", () => {
	const hits = [
		"Non, ce n'est pas ce que j'ai demandé",
		"c’est faux",
		"je t'ai déjà dit de ne pas faire ça",
		"tu as oublié la date",
		"pourquoi as-tu modifié ce fichier ?",
		"Arrête de réécrire",
		"ne touche pas à ce fichier",
		"sans mon accord",
		"pas de ; dans le texte",
		"encore des points-virgules",
		"trop long",
		"mets X au lieu de Y",
		"That's wrong",
		"not what I asked",
		"why did you push?",
		"stop adding emojis",
	];
	for (const t of hits) test(`detects: ${t}`, () => assert.ok(detectCorrection(t), t));

	const misses = ["oui, pousse", "nonobstant la règle, continue", "commite les deux", "vérifie le github upstream"];
	for (const t of misses) test(`ignores: ${t}`, () => assert.equal(detectCorrection(t), null, t));

	test("repeat flag needs a repetition marker on top of a correction", () => {
		assert.deepEqual(detectCorrection("encore des points-virgules"), { repeat: true });
		assert.deepEqual(detectCorrection("tu as encore oublié, tu as oublié la date"), { repeat: true });
		assert.deepEqual(detectCorrection("you forgot again"), { repeat: true });
		assert.deepEqual(detectCorrection("trop long"), { repeat: false });
		assert.equal(detectCorrection("encore une fois"), null);
	});

	test("repetition words need a whole-word match", () => {
		assert.deepEqual(detectCorrection("trop long, stillness"), { repeat: false });
	});
});

describe("active time", () => {
	test("a 3-hour gap counts as 10 minutes", () => {
		const t0 = Date.parse(DAY);
		assert.equal(activeMs([t0, t0 + 3 * 3_600_000]), 10 * 60_000);
		assert.equal(activeMs([t0, t0 + 60_000, t0 + 3 * 3_600_000]), 11 * 60_000);
		assert.equal(activeMs([t0]), 0);
	});

	test("reported in hours per session, with first prompt and date", () => {
		const dir = fresh("active");
		writeSession(dir, "s", [
			user("2026-10-01T12:00:00.000Z", "premier"),
			assistant("2026-10-01T12:05:00.000Z"),
			user("2026-10-01T15:05:00.000Z", "second"),
		]);
		const [s] = buildReport(readSessions([dir]), 30, NOW).sessions;
		assert.equal(s?.activeHours, 0.25);
		assert.equal(s?.firstPrompt, "premier");
		assert.equal(s?.date, localDay(Date.parse("2026-10-01T12:00:00.000Z")));
	});
});

describe("window", () => {
	test("old sessions are outside the window but set the oldest transcript", () => {
		const dir = fresh("window");
		writeSession(dir, "old", [user("2026-08-01T12:00:00.000Z", "non, c'est faux")]);
		writeSession(dir, "new", [user("2026-10-05T12:00:00.000Z", "ok")]);
		const r = buildReport(readSessions([dir]), 30, NOW);
		assert.equal(r.window.sessions, 1);
		assert.equal(r.window.oldestTranscript, localDay(Date.parse("2026-08-01T12:00:00.000Z")));
		assert.equal(r.corrections.length, 0);
	});

	test("a prompt start seen in three sessions is a repeated ask", () => {
		const dir = fresh("asks");
		for (const [id, d] of [["a", "01"], ["b", "02"], ["c", "03"]] as const) {
			writeSession(dir, id, [user(`2026-10-${d}T12:00:00.000Z`, `Vérifie le GitHub upstream, stp (${id})`)]);
		}
		writeSession(dir, "d", [user("2026-10-04T12:00:00.000Z", "autre chose")]);
		const r = buildReport(readSessions([dir]), 30, NOW);
		assert.deepEqual(r.repeatedAsks.map((a) => [a.start, a.sessions]), [["vérifie le github upstream stp", 3]]);
	});
});

describe("CLI", () => {
	const run = (configDir: string, args: string[]) =>
		spawnSync(process.execPath, ["--experimental-strip-types", SCRIPT, ...args], {
			encoding: "utf-8",
			env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
		});

	test("missing folder → exit 2 with a message, nothing on stdout", () => {
		const cfg = fresh("cfg-missing");
		mkdirSync(join(cfg, "projects"));
		const r = run(cfg, ["--vault", join(tmp, "no-such-vault")]);
		assert.equal(r.status, 2);
		assert.match(r.stderr, /No transcript folder/);
		assert.equal(r.stdout, "");
	});

	test("empty folder → exit 0 and a zero window", () => {
		const cfg = fresh("cfg-empty");
		const vault = join(tmp, "empty-vault");
		mkdirSync(join(cfg, "projects", projectSlug(vault)), { recursive: true });
		const r = run(cfg, ["--vault", vault]);
		assert.equal(r.status, 0, r.stderr);
		const report = JSON.parse(r.stdout);
		assert.equal(report.window.sessions, 0);
		assert.equal(report.window.prompts, 0);
		assert.equal(report.window.oldestTranscript, null);
	});

	test("bad arguments → exit 1", () => {
		const cfg = fresh("cfg-usage");
		assert.equal(run(cfg, ["--days", "0"]).status, 1);
		assert.equal(run(cfg, ["--days"]).status, 1);
		assert.equal(run(cfg, ["--bogus"]).status, 1);
	});
});
