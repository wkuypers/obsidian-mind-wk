---
description: "Several independent readings of one question or decision, each grounded in the vault, then a synthesis that shows the disagreements instead of hiding them. Writes to syntheses/."
argument-hint: "<question or decision>"
---

# /om-panel

Read `syntheses/README.md` first and follow it: scope, search, reading budget and writing rules. If it is missing, stop and say so. **Never modify a file outside `syntheses/`.**

Where `/om-challenge` attacks from one position, the panel lets several readings speak separately before comparing them.

1. **Read the vault's rules**: `AGENTS.md`, and `.claude/rules/local.md` if it exists.
2. **Resolve the question** from `$ARGUMENTS`; without one, ask.
3. **Gather what the vault says** (README §2) and read the notes kept (README §3). This shared evidence is the same for every reading.
4. **Compose the panel**: four readings, unless the user names others.
   - **The skeptic** — what breaks?
   - **The recipient** — who is served, who is harmed?
   - **The operator** — is it feasible and sustainable?
   - **The long view** — what does this look like in a year?
5. **Keep the readings independent.** If the Agent tool is available, give each reading to its own read-only subagent, with the same question, the same note paths and these rules, and no sight of the other readings. Otherwise write them one after the other, and say in the note that they were written in a single session. Each reading gives its position, the strongest reason behind it, and what would change its mind.
6. **Grounding**: every fact invoked carries its `[[link]]`. A judgment nothing in the vault supports is marked as judgment. Never attribute an opinion to a real person who did not express it in a note.
7. **Synthesis** (main session): where the panel agrees, where it splits, and a recommended decision with its main risk. Do not hide the disagreement: it is the most useful result.
8. **File**: `syntheses/Panel - <question in a few words>.md` (README §4), type `panel`, `produced-by: om-panel`. Body: question, engine and notes read, how independence was obtained, one subsection per reading, synthesis.
9. **Report**: the recommendation, the main disagreement, the path written.
