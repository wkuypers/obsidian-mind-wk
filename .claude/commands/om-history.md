---
description: "Read this vault's past conversations, find the corrections the user had to give, check whether a brain/ rule should already have prevented each, and report findings then proposals. Writes nothing."
---

# /om-history

```
/om-history [--days N]
```

The cross-session half of self-correction. `/om-wrap-up` reviews one session; `/om-weekly` works from the vault's traces (git, notes), not from the conversations. This command reads the conversations themselves — every Claude Code transcript of **this vault only** — and asks one question of each correction found there: should a rule have prevented it, and if one exists, why did it not?

It returns a report and proposals, then stops. Nothing is written until the user approves a proposal.

## Hard rails

- **Read-only.** Neither the script nor this command writes a file before the user validates a proposal.
- **This vault's transcripts only.** Never another vault's folder, never `~/.claude/history.jsonl` (kept by the terminal CLI only, so blind to desktop-app sessions).
- **Never write to `AGENTS.md`, `.claude/rules/` or to a template file** (owner rule 2). Proposals target `brain/` or a local command. A rule that would hold in every vault is flagged as a candidate for the template, not written here.
- **The user's taste stays theirs** — tone, style, content. Fix the apparatus, not their judgement.
- **Quotes stay in the conversation.** Do not copy them into a note without explicit agreement.

## 1. Run the script

```bash
node --experimental-strip-types .claude/scripts/om-history.ts $ARGUMENTS
```

30 days by default; `$ARGUMENTS` may pass `--days N`. Exit 2 means no transcript folder exists for this vault: report the message and stop — never read it as "nothing to fix".

Announce the **real** window before anything else: `window.oldestTranscript` and `window.sessions`. Claude Code purges transcripts after `cleanupPeriodDays` (about 30 days by default), so the window may be shorter than asked. Say also that the app's session list can show fewer sessions than the disk holds: deleting a session in the app removes its entry, not its `.jsonl`.

## 2. Read every correction

`corrections[]` is a list of **hypotheses** — the patterns over-match on purpose. Read each quote:

- Discard explicitly what is not a correction: content being dictated, a one-off disagreement on substance, a question. Say what was discarded and why, in one line each.
- Group the rest **by meaning, not by word**. One finding = one defect, with its dated quotes and the number of sessions it touched.
- `repeat: true` marks a correction that also carries a repetition marker (*encore*, *déjà*, *again*…) — an error that came back after being corrected. These weigh most.

## 3. Look for the rule

For each finding, search `brain/` for a rule that covers it:

- Grep the distinctive words.
- QMD **lexical search only**: `qmd --index <name> search "…"` (BM25), or `npx --yes @tobilu/qmd --index <name> search "…"` where qmd is not installed globally. Index name: `qmd_index` in `vault-manifest.json`, else the vault folder name slugified. **Never `vsearch`, `query` or `embed`.**

Read the note found and its date: does the rule predate the correction or follow it?

## 4. Verdict per finding

| verdict | meaning |
|---|---|
| **NO RULE** | nothing in `brain/` covers it |
| **RULE THAT DOES NOT WORK** | the rule exists and sessions miss it — shorten it, move it where it is read, or automate it |
| **WRONG RULE** | the rule itself causes the problem |
| **RESOLVED** | the rule was set after the last occurrence |

## 5. Repeated asks, repeated pastes, time

- **`repeatedAsks[]`** — open the closest command **before** claiming it covers the ask. A repeated ask with no command behind it is a command proposal.
- **`repeatedPastes[]`** — text the user keeps pasting is a fact the vault should already hold.
- **`sessions[]`** — name the longest sessions by `activeHours` (gaps capped at 10 minutes) and what they were about (`title`, `firstPrompt`).

## 6. Rank

By sessions touched × repetitions. **Never cap the list** — the user decides what matters.

## 7. Report, propose, stop

Findings first, then proposals. Each proposal names the exact `brain/` note (or command) and the exact text to put there. Nothing is written.

After the user approves, apply **one proposal at a time**, backing up the file first.

## Related

- `/om-wrap-up` — one session's review.
- `/om-weekly` — the vault's traces over a week.
- `/om-correct` — sweeps a corrected *fact* through the notes; this command looks for corrected *behaviour*.
