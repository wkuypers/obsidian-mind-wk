---
description: "List the vault's contradictions: opposing claims, reversed decisions never carried over, outdated person or project notes. Classifies each and proposes, corrects nothing. Writes to syntheses/."
argument-hint: "[topic or entity, optional]"
---

# /om-contradictions

Read `syntheses/README.md` first and follow it: scope, search, reading budget and writing rules. If it is missing, stop and say so. **Never modify a file outside `syntheses/`.** This command corrects nothing: it makes visible the disagreements the vault does not know it holds. Correction is the user's, for instance with `/om-correct`.

1. **Read the vault's rules**: `AGENTS.md`, and `.claude/rules/local.md` if it exists.
2. **Bound the review**:
   - with a topic or entity in `$ARGUMENTS`: every note about it, found as in README §2;
   - without an argument: the vault's reference notes only — `brain/`, `org/`, `work/active/`, `Home.md` and decision notes. Say in the note that the review was limited to them.
3. **Read every note in scope** within README §3, and record:
   - **claims** that oppose each other from one note to another;
   - **decisions** reversed or replaced while another note still carries the old version;
   - **profiles** (people, projects, organizations) whose role, status or description contradicts a more recent note.
4. **Assess each case** without deciding for the user:
   - **which is newer** — front-matter date, then `git log -1 --format=%cs -- "<file>"`;
   - **which is authoritative** — the reference or decision note over a meeting record or draft, and any authority rule set by `AGENTS.md` or `.claude/rules/`;
   - **contradiction or evolution** — a dated change of mind is not a contradiction; a note left in the old state is.
5. **Classify** each case: **to update** (one version clearly wins: which one, and which note to fix), **to decide** (truly ambiguous: both positions and their evidence), **evolution** (nothing to fix, at most a link).
6. **Every case cites both `[[notes]]`**, with a short quote and the date of each. If the scope holds none, say so.
7. **File**: with an argument, `syntheses/Contradictions - <topic>.md`, described as "Contradictions found in the vault on <topic>"; without one, `syntheses/Contradictions - reference notes.md`, described as "Contradictions found in the vault's reference notes (brain/, org/, work/active/, Home.md)" — both in the vault's language (README §4), type `contradictions`, `produced-by: om-contradictions`. Body: scope, engine and notes read, then to update, to decide, evolutions. Flag cases from an earlier section that have been resolved since.
8. **Report**: the number of cases per class, the two most urgent, the path written.
