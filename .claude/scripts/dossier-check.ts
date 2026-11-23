#!/usr/bin/env node
/**
 * CLI for the deterministic checks of /om-dossier-theo.
 *
 * Usage:
 *   node --experimental-strip-types dossier-check.ts citations <register.md> <draft.md> [<draft.md>…]
 *   node --experimental-strip-types dossier-check.ts scores <previous-review.md> <current-review.md>
 *   node --experimental-strip-types dossier-check.ts blind <previous-draft.md> <current-draft.md> <out-dir>
 *   node --experimental-strip-types dossier-check.ts pairwise <comparison-order-1.md> <comparison-order-2.md>
 *
 * Exit codes:
 *   citations — 0 every footnote is a citable register key; 1 at least one is
 *               not; 2 usage error, missing file, or a register with no entry.
 *   scores    — 0 no axis dropped (keep the revision); 1 an axis dropped
 *               (restore the previous version); 2 usage error, missing file,
 *               or an axis missing from either review.
 *   blind     — writes <out-dir>/order-1/{Version 1,Version 2}.md (previous
 *               first) and <out-dir>/order-2/ (current first), each copy
 *               without frontmatter or revision log. 0 written; 2 usage
 *               error, missing file, or two versions that read the same.
 *   pairwise  — reads the comparisons of order-1 and order-2. 0 the previous
 *               version wins on no axis in either order (keep the revision);
 *               1 it wins somewhere, or the verdict flips with the order
 *               (restore the previous version); 2 usage error, missing file,
 *               or an axis missing or unreadable in either comparison.
 *
 * An empty register or a review without scores never passes: a check that
 * looked at nothing must not report success.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blindCopy, checkCitations, comparePairwise, compareScores, parseComparison, parseRegister, parseScores } from "./lib/dossier-check.ts";

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
} else if (mode === "blind") {
	const [prevPath, currPath, outDir] = files;
	if (!prevPath || !currPath || !outDir || files.length !== 3) fail("Usage: dossier-check.ts blind <previous-draft.md> <current-draft.md> <out-dir>");
	const previous = blindCopy(read(prevPath));
	const current = blindCopy(read(currPath));
	if (previous === current) fail("The two versions read the same once blinded: nothing to compare.");
	const orders: ReadonlyArray<readonly [string, string, string]> = [
		["order-1", previous, current],
		["order-2", current, previous],
	];
	for (const [order, first, second] of orders) {
		const dir = join(outDir, order);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "Version 1.md"), first);
		writeFileSync(join(dir, "Version 2.md"), second);
		process.stdout.write(`${dir}\n`);
	}
	process.stdout.write("order-1 shows the previous version as Version 1; order-2 shows the current one first.\n");
	process.exit(0);
} else if (mode === "pairwise") {
	const [order1Path, order2Path] = files;
	if (!order1Path || !order2Path || files.length !== 2) fail("Usage: dossier-check.ts pairwise <comparison-order-1.md> <comparison-order-2.md>");
	const { verdict, lines } = comparePairwise(parseComparison(read(order1Path)), parseComparison(read(order2Path)));
	for (const line of lines) process.stdout.write(`${line}\n`);
	process.stdout.write(`${verdict.toUpperCase()}\n`);
	process.exit(verdict === "keep" ? 0 : verdict === "revert" ? 1 : 2);
} else {
	fail("Usage: dossier-check.ts citations|scores|blind|pairwise <files…>");
}
