#!/usr/bin/env node
/**
 * CLI for the two deterministic checks of /om-dossier-theo.
 *
 * Usage:
 *   node --experimental-strip-types dossier-check.ts citations <register.md> <draft.md> [<draft.md>…]
 *   node --experimental-strip-types dossier-check.ts scores <previous-review.md> <current-review.md>
 *
 * Exit codes:
 *   citations — 0 every footnote is a citable register key; 1 at least one is
 *               not; 2 usage error, missing file, or a register with no entry.
 *   scores    — 0 no axis dropped (keep the revision); 1 an axis dropped
 *               (restore the previous version); 2 usage error, missing file,
 *               or an axis missing from either review.
 *
 * An empty register or a review without scores never passes: a check that
 * looked at nothing must not report success.
 */

import { existsSync, readFileSync } from "node:fs";
import { checkCitations, compareScores, parseRegister, parseScores } from "./lib/dossier-check.ts";

function fail(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(2);
}

function read(path: string): string {
	if (!existsSync(path)) fail(`File not found: ${path}`);
	return readFileSync(path, "utf-8");
}

const [, , mode, ...files] = process.argv;

if (mode === "citations") {
	const [registerPath, ...drafts] = files;
	if (!registerPath || drafts.length === 0) fail("Usage: dossier-check.ts citations <register.md> <draft.md> [<draft.md>…]");
	const register = parseRegister(read(registerPath));
	if (register.size === 0) fail(`No "### <key>" entry found in the register: ${registerPath}`);
	let bad = 0;
	for (const draft of drafts) {
		const problems = checkCitations(register, read(draft));
		bad += problems.length;
		process.stdout.write(`${problems.length === 0 ? "ok  " : "FAIL"} ${draft}\n`);
		for (const p of problems) process.stdout.write(`     ${p}\n`);
	}
	process.stdout.write(`${register.size} register entries, ${drafts.length} draft(s), ${bad} problem(s)\n`);
	process.exit(bad === 0 ? 0 : 1);
} else if (mode === "scores") {
	const [prevPath, currPath] = files;
	if (!prevPath || !currPath || files.length !== 2) fail("Usage: dossier-check.ts scores <previous-review.md> <current-review.md>");
	const { verdict, lines } = compareScores(parseScores(read(prevPath)), parseScores(read(currPath)));
	for (const line of lines) process.stdout.write(`${line}\n`);
	process.stdout.write(`${verdict.toUpperCase()}\n`);
	process.exit(verdict === "keep" ? 0 : verdict === "revert" ? 1 : 2);
} else {
	fail("Usage: dossier-check.ts citations|scores <files…>");
}
