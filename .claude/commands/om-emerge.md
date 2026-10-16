---
description: "Surface what recent notes say without naming it: recurring themes, implicit conclusions, emerging directions. Every pattern is proven by notes. Writes to syntheses/."
argument-hint: "[period, default 30 days]"
---

# /om-emerge

Read `syntheses/README.md` first and follow it: scope, search, reading budget and writing rules. If it is missing, stop and say so. **Never modify a file outside `syntheses/`.** The goal is to show what the user has not named yet, not to repeat what they know.

1. **Read the vault's rules**: `AGENTS.md`, `.claude/rules/local.md` if it exists, and `brain/North Star.md`: what it already names as a priority does not count as emerging.
2. **Set the period** from `$ARGUMENTS` ("2 weeks", "this month"…); default: the last 30 days.
3. **List the period's notes**, from git history, normalized and deduplicated, existing files only:
   ```bash
   git -c core.quotepath=false log --since="<period>" --name-only --diff-filter=AM --format= -- '*.md' \
     | python3 -c 'import sys,unicodedata,os; print("\n".join(sorted({unicodedata.normalize("NFC",l.strip()) for l in sys.stdin if l.strip() and os.path.exists(l.strip())})))' \
     | grep -vE '^(syntheses|\.claude|\.obsidian|\.shardmind|\.scripts|templates|bases|thinking/session-logs)/|^(AGENTS|README[^/]*|CHANGELOG|ARCHITECTURE|CONTRIBUTING|CLAUDE|GEMINI)\.md$'
   ```
   Add untracked notes of the period (`git ls-files --others --exclude-standard -- '*.md'`, same filter) and notes whose front-matter `date:` falls in it (`git grep -l --untracked -E '^date: *<YYYY-MM>'`, same filter).
4. **Read the period's notes** within README §3 — bulk notes cited, not read; above the budget, split between read-only subagents or read the core whole. Decisions, lessons, active work, meetings and any journal count as much as the rest.
5. **Find the patterns**:
   - **Recurring themes** — a subject present in at least three notes without being named as a priority;
   - **Implicit conclusions** — what the notes imply together without ever stating it;
   - **What lifts, what weighs** — what the notes' own wording ties to momentum or fatigue, quoted, never assumed;
   - **Emerging directions** — where the vault leans, without a commitment made.
   For each: the evidence (`[[links]]`, short quotes), the interpretation, a possible action. A pattern resting on one note is not a pattern.
6. **File**: `syntheses/Emerging patterns.md` (README §4; the name in the vault's language), type `emergence`, `produced-by: om-emerge`. Body: period, notes read (whole / by description), the four headings. Flag patterns already raised in an earlier section and those that faded.
7. **Report**: the three strongest patterns, one sentence each, the number of notes read, the path written.
