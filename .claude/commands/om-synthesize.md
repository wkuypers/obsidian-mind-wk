---
description: "Cross-reference everything the vault knows about a topic: agreements, contradictions, dated claims, gaps. Contradictions are listed and attributed, never resolved. Writes to syntheses/."
argument-hint: "<topic>"
---

# /om-synthesize

Read `syntheses/README.md` first and follow it: scope, search, reading budget and writing rules. If it is missing, stop and say so. **Never modify a file outside `syntheses/`.**

1. **Read the vault's rules**: `AGENTS.md`, and `.claude/rules/local.md` if it exists.
2. **Resolve the topic** from `$ARGUMENTS`; without one, ask. List its names: synonyms, spellings, proper names, terms in other languages.
3. **Search exhaustively** with both arms of README §2, a keyword query per name.
4. **Read** every note found, within README §3. Earlier syntheses are not sources.
5. **If a section already exists** for this topic and nothing changed since — the same notes found, none modified since that section's date (`git log --since=<date> -- <paths>` empty) — append a short section: notes read, "nothing has changed", a link to the previous section. Stop there.
6. **Cross-reference** and file each element under:
   - **Agreements** — what several notes corroborate, with a `[[link]]` to each;
   - **Contradictions** — what `[[Note A]]` says, what `[[Note B]]` says, and the exact point of disagreement. **Do not resolve it**: neither say which is right nor propose a reconciliation;
   - **Dated claims** — facts tied to a date that may no longer hold, with the note and its date;
   - **Gaps** — questions the topic raises that the vault leaves open, each tied to the `[[note]]` that raises it.
7. **File**: `syntheses/Synthesis - <topic>.md` (README §4), type `synthesis`, `produced-by: om-synthesize`.
8. **Section body**: search engine and queries, notes read (whole / by description), the four headings of step 6, then earlier syntheses if any. Say what changed since the previous section.
9. **Report**: notes read, contradictions found, the path written.
