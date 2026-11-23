/**
 * Unit tests for the /om-dossier-theo checks: the closed citation register,
 * the "no axis drops" rule of the review loop, and the blind comparison that
 * arbitrates a drop.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	blindCopy,
	checkCitations,
	comparePairwise,
	compareScores,
	parseComparison,
	parseFootnotes,
	parseRegister,
	parseScores,
} from "../lib/dossier-check.ts";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");

const REGISTER = [
	"# Register",
	"",
	"```",
	"### example-key",
	"- status: verified-vault",
	"```",
	"",
	"### lg29",
	"- status: verified-vault, to collate",
	"- tradition: Catholic",
	"",
	"### sdo-1967",
	"- **statut** : vérifiée-externe",
	"",
	"### borras-1998",
	"- status: exists-only",
	"",
	"### lead-1",
	"- statut: à-vérifier",
	"",
	"### wrong-1",
	"- status: rejected — no such volume",
	"",
	"### odd-1",
	"- status: probably fine",
	"",
	"## To verify",
	"- status: verified-vault",
].join("\n");

describe("parseRegister", () => {
	const reg = parseRegister(REGISTER);

	test("reads keys and classifies statuses in either language", () => {
		assert.equal(reg.get("lg29")?.citability, "citable");
		assert.equal(reg.get("sdo-1967")?.citability, "citable");
		assert.equal(reg.get("borras-1998")?.citability, "citable-tbc");
		assert.equal(reg.get("lead-1")?.citability, "not-citable");
		assert.equal(reg.get("wrong-1")?.citability, "not-citable");
	});

	test("an unrecognised status is unknown, never citable", () => {
		assert.equal(reg.get("odd-1")?.citability, "unknown");
	});

	test("ignores entries inside a code fence and status lines outside an entry", () => {
		assert.equal(reg.has("example-key"), false);
		assert.equal(reg.size, 6);
	});
});

describe("checkCitations", () => {
	const reg = parseRegister(REGISTER);

	test("a draft citing only citable keys passes", () => {
		const draft = "Text[^lg29] and more[^sdo-1967].\n\n[^lg29]: LG 29.\n[^sdo-1967]: Paul VI, 1967.";
		assert.deepEqual(checkCitations(reg, draft), []);
	});

	test("a key absent from the register fails", () => {
		const problems = checkCitations(reg, "Text[^ghost].\n\n[^ghost]: Somebody, somewhere.");
		assert.equal(problems.length, 1);
		assert.match(problems[0] ?? "", /not a key of the register/);
	});

	test("unverified, rejected and unreadable statuses may not be cited", () => {
		const draft = "A[^lead-1] B[^wrong-1] C[^odd-1]\n\n[^lead-1]: x\n[^wrong-1]: y\n[^odd-1]: z";
		assert.equal(checkCitations(reg, draft).length, 3);
	});

	test("an exists-only citation must show (TBC) in its footnote", () => {
		assert.equal(checkCitations(reg, "A[^borras-1998]\n\n[^borras-1998]: Borras, 1998.").length, 1);
		assert.deepEqual(checkCitations(reg, "A[^borras-1998]\n\n[^borras-1998]: Borras, 1998 (TBC)."), []);
	});

	test("a cited footnote with no definition fails", () => {
		const problems = checkCitations(reg, "A[^lg29]");
		assert.match(problems[0] ?? "", /not defined/);
	});

	test("footnotes inside a code fence are not citations", () => {
		assert.equal(parseFootnotes("```\n[^ghost]\n```\nplain").refs.size, 0);
	});
});

describe("parseScores and compareScores", () => {
	const review = (a: number, b: number): string =>
		["## Weaknesses", "- chronology: 1", "", "## Scores", `- chronology: ${a}`, "Justified.", `- **source-fidelity**: ${b}`, "", "## After", "- chronology: 1"].join("\n");

	test("reads only the Scores section", () => {
		const s = parseScores(review(3, 2));
		assert.equal(s.get("chronology"), 3);
		assert.equal(s.get("source-fidelity"), 2);
		assert.equal(s.size, 2);
	});

	test("keeps a revision when nothing drops", () => {
		assert.equal(compareScores(parseScores(review(3, 2)), parseScores(review(3, 3))).verdict, "keep");
		assert.equal(compareScores(parseScores(review(3, 2)), parseScores(review(3, 2))).verdict, "keep");
	});

	test("reverts when one axis drops, even if another rises more", () => {
		assert.equal(compareScores(parseScores(review(3, 1)), parseScores(review(2, 4))).verdict, "revert");
	});

	test("a missing axis or a review without scores is invalid, not a pass", () => {
		assert.equal(compareScores(parseScores(review(3, 2)), parseScores("## Scores\n- chronology: 4")).verdict, "invalid");
		assert.equal(compareScores(parseScores(review(3, 2)), parseScores("no scores here")).verdict, "invalid");
	});
});

const DRAFT_V1 = [
	"---",
	"date: 2026-11-24",
	"tags: [dossier]",
	"---",
	"> [!summary]",
	"> What the section establishes.",
	"",
	"## Origins",
	"Text[^lg29].",
	"",
	"### Limits",
	"Not reached.",
	"",
	"[^lg29]: LG 29.",
].join("\n");

const DRAFT_V2 = [
	DRAFT_V1.replace("Text[^lg29].", "Better text[^lg29]."),
	"",
	"## Revision log — round 1",
	"- Weakness 1: rewrote the second paragraph.",
	"### Declined",
	"- Weakness 3: no source.",
	"",
	"## Journal des révisions — tour 2",
	"- Faiblesse 2 : précisé.",
	"",
	"## After the log",
	"Kept.",
].join("\n");

describe("blindCopy", () => {
	test("drops the frontmatter and every revision log, in either language, with their subsections", () => {
		const blind = blindCopy(DRAFT_V2);
		assert.doesNotMatch(blind, /date:|Revision log|Journal des révisions|Weakness|Declined|Faiblesse/);
		assert.match(blind, /^> \[!summary\]/);
		assert.match(blind, /Better text\[\^lg29\]/);
		assert.match(blind, /### Limits\nNot reached\./);
		assert.match(blind, /## After the log\nKept\./);
	});

	test("a heading inside a code fence does not open or close a log", () => {
		const text = "## Revision log — round 1\n```\n## Not a heading\n```\nstill log\n## Next\nkept";
		assert.equal(blindCopy(text), "## Next\nkept\n");
	});

	test("two versions that differ only by their metadata read the same", () => {
		assert.equal(blindCopy(DRAFT_V1), blindCopy(`${DRAFT_V1.replace("2026-11-24", "2026-11-25")}\n\n## Revision log — round 1\n- nothing`));
	});
});

describe("parseComparison and comparePairwise", () => {
	const cmp = (...prefs: string[]): string =>
		[
			"## Version 1",
			"- chronology: version-2",
			"",
			"## Comparison",
			...prefs.map((p, i) => `- ${["chronology", "source-fidelity"][i]}: ${p}\nThe passage that decides it.`),
			"",
			"## After",
			"- chronology: version-1",
		].join("\n");

	test("reads only the Comparison section, tolerating emphasis and French", () => {
		const c = parseComparison(cmp("**version-1**", "égalité"));
		assert.equal(c.get("chronology"), "version-1");
		assert.equal(c.get("source-fidelity"), "tie");
		assert.equal(c.size, 2);
		assert.equal(parseComparison("## Comparison\n- chronology: better").get("chronology"), "unknown");
	});

	test("keeps the revision when the current version wins or ties in both orders", () => {
		// order 1: Version 2 is the current version; order 2: Version 1 is.
		assert.equal(comparePairwise(parseComparison(cmp("version-2", "tie")), parseComparison(cmp("version-1", "tie"))).verdict, "keep");
		assert.equal(comparePairwise(parseComparison(cmp("tie", "tie")), parseComparison(cmp("tie", "tie"))).verdict, "keep");
	});

	test("reverts when the previous version wins in one order, even once", () => {
		assert.equal(comparePairwise(parseComparison(cmp("version-1", "tie")), parseComparison(cmp("tie", "tie"))).verdict, "revert");
		assert.equal(comparePairwise(parseComparison(cmp("tie", "tie")), parseComparison(cmp("tie", "version-2"))).verdict, "revert");
	});

	test("a judge who always prefers the same position is a flip, which does not rescue the revision", () => {
		const r = comparePairwise(parseComparison(cmp("version-1", "version-1")), parseComparison(cmp("version-1", "version-1")));
		assert.equal(r.verdict, "revert");
		assert.match(r.lines.join("\n"), /FLIPS WITH THE ORDER/);
	});

	test("a missing axis, an unreadable preference or a missing section is invalid, not a pass", () => {
		assert.equal(comparePairwise(parseComparison(cmp("tie", "tie")), parseComparison("## Comparison\n- chronology: tie")).verdict, "invalid");
		assert.equal(comparePairwise(parseComparison(cmp("tie", "maybe")), parseComparison(cmp("tie", "tie"))).verdict, "invalid");
		assert.equal(comparePairwise(parseComparison(cmp("tie", "tie")), parseComparison("no comparison here")).verdict, "invalid");
	});
});

describe("dossier-check CLI", () => {
	const run = (...args: string[]) =>
		spawnSync(process.execPath, ["--experimental-strip-types", join(SCRIPTS, "dossier-check.ts"), ...args], { encoding: "utf-8" });

	test("exit codes follow the verdicts", () => {
		const dir = mkdtempSync(join(tmpdir(), "dossier-check-"));
		try {
			const reg = join(dir, "register.md");
			const good = join(dir, "good.md");
			const bad = join(dir, "bad.md");
			const empty = join(dir, "empty.md");
			writeFileSync(reg, REGISTER);
			writeFileSync(good, "A[^lg29]\n\n[^lg29]: LG 29.");
			writeFileSync(bad, "A[^ghost]\n\n[^ghost]: nobody.");
			writeFileSync(empty, "# nothing");
			assert.equal(run("citations", reg, good).status, 0);
			assert.equal(run("citations", reg, good, bad).status, 1);
			assert.equal(run("citations", empty, good).status, 2);
			assert.equal(run("citations", reg).status, 2);
			assert.equal(run("citations", reg, join(dir, "absent.md")).status, 2);

			const r1 = join(dir, "r1.md");
			const r2 = join(dir, "r2.md");
			writeFileSync(r1, "## Scores\n- chronology: 3\n- source-fidelity: 3");
			writeFileSync(r2, "## Scores\n- chronology: 4\n- source-fidelity: 2");
			assert.equal(run("scores", r1, r1).status, 0);
			assert.equal(run("scores", r1, r2).status, 1);
			assert.equal(run("scores", r1, empty).status, 2);
			assert.equal(run("nonsense").status, 2);

			const v1 = join(dir, "v1.md");
			const v2 = join(dir, "v2.md");
			const out = join(dir, "blind");
			writeFileSync(v1, DRAFT_V1);
			writeFileSync(v2, DRAFT_V2);
			assert.equal(run("blind", v1, v2, out).status, 0);
			assert.equal(readFileSync(join(out, "order-1", "Version 1.md"), "utf-8"), blindCopy(DRAFT_V1));
			assert.equal(readFileSync(join(out, "order-1", "Version 2.md"), "utf-8"), blindCopy(DRAFT_V2));
			assert.equal(readFileSync(join(out, "order-2", "Version 1.md"), "utf-8"), blindCopy(DRAFT_V2));
			assert.equal(readFileSync(join(out, "order-2", "Version 2.md"), "utf-8"), blindCopy(DRAFT_V1));
			assert.equal(run("blind", v1, v1, join(dir, "same")).status, 2);
			assert.equal(run("blind", v1, v2).status, 2);

			const c1 = join(dir, "c1.md");
			const c2 = join(dir, "c2.md");
			const c3 = join(dir, "c3.md");
			writeFileSync(c1, "## Comparison\n- chronology: version-2\n- source-fidelity: tie");
			writeFileSync(c2, "## Comparison\n- chronology: version-1\n- source-fidelity: tie");
			writeFileSync(c3, "## Comparison\n- chronology: version-1\n- source-fidelity: version-1");
			assert.equal(run("pairwise", c1, c2).status, 0);
			assert.equal(run("pairwise", c3, c2).status, 1);
			assert.equal(run("pairwise", c1, empty).status, 2);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
