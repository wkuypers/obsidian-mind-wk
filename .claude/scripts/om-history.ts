#!/usr/bin/env node
/**
 * om-history — the data half of `/om-history`. Reads this vault's Claude Code
 * transcripts and prints one JSON report on stdout. Writes no file.
 *
 * Usage:
 *   node --experimental-strip-types .claude/scripts/om-history.ts [--days 30] [--vault <path>]
 *
 *   --days   window in days, counted back from now (default 30)
 *   --vault  vault root (default: the vault holding this script; a worktree
 *            checkout resolves to its vault)
 *
 * Transcripts are read from `$CLAUDE_CONFIG_DIR/projects` (default
 * `~/.claude/projects`), in the vault's own folder and its
 * `--claude-worktrees-*` siblings only. See `lib/om-history.ts`.
 *
 * Exit codes: 0 on success, even with nothing found; 1 on a usage error;
 * 2 when no transcript folder exists for this vault. A missing folder is
 * never printed as an empty report — that would read as "nothing to fix".
 */

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./lib/main-guard.ts";
import { buildReport, projectsRootDefault, readSessions, transcriptDirs, vaultRootOf } from "./lib/om-history.ts";
import { projectSlug } from "./tidy-fix.ts";

function usage(msg: string): never {
	process.stderr.write(`${msg}\nUsage: om-history.ts [--days N] [--vault <path>]\n`);
	process.exit(1);
}

function main(): void {
	let days = 30;
	let vault = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
	const args = process.argv.slice(2);
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		const v = args[i + 1];
		if (a === "--days") {
			if (v === undefined || !/^[1-9]\d*$/.test(v)) usage(`--days needs a positive whole number, got: ${v ?? "nothing"}`);
			days = Number(v);
			i++;
		} else if (a === "--vault") {
			if (!v) usage("--vault needs a path");
			vault = resolve(v);
			i++;
		} else {
			usage(`Unknown argument: ${a}`);
		}
	}

	const projects = projectsRootDefault(process.env, homedir());
	const dirs = transcriptDirs(projects, vault);
	if (dirs.length === 0) {
		process.stderr.write(
			`No transcript folder for this vault: expected ${join(projects, projectSlug(vaultRootOf(vault)))}\n` +
				"Either no Claude Code session ever ran here, or --vault / CLAUDE_CONFIG_DIR point elsewhere.\n",
		);
		process.exit(2);
	}
	const report = buildReport(readSessions(dirs), days, Date.now(), dirs);
	process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (isMainModule(import.meta.url)) main();
