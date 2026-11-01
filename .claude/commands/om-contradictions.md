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

   Record each case as two sides, one per note: the note's vault-relative path, the line number, and a **quote** — one line copied character for character from that note, at least 12 characters long. A case without both quotes is not a case. Subagents (README §3) get this format and return their cases in it.
4. **Prove each case before assessing it.** Check each side's quote against its note (exit 0 prints the lines that hold it; anything else, an error included, is a failure):

   ```bash
   python3 -c 'if 1:
       import re, sys, unicodedata
       norm = lambda s: re.sub(r"[ \t]+", " ", unicodedata.normalize("NFC", s)).strip()
       q = norm(sys.stdin.read())
       if "\n" in q or len(q) < 12: sys.exit("unproven: the quote must be one line of at least 12 characters")
       lines = open(sys.argv[1], encoding="utf-8-sig").read().splitlines()
       hits = [n for n, l in enumerate(lines, 1) if q in norm(l)]
       if not hits: sys.exit("unproven: quote not found in the note")
       print(*hits)
   ' "<note path>" <<'EOF'
   <quote copied from that note>
   EOF
   ```

   - Only the line itself is compared: Unicode is normalized and runs of spaces or tabs count as one; one changed word fails.
   - Cite the line the check printed: the case's own line if it is listed, otherwise the first.
   - **If either side fails, drop the case**: it goes in no class, and only its count reaches the note (step 8). A contradiction nobody can quote may be a misreading, and passed on to `/om-correct` it would put a new error into a correct note.
5. **Assess each proven case** without deciding for the user:
   - **which is newer** — front-matter date, then `git log -1 --format=%cs -- "<file>"`;
   - **which is authoritative** — the reference or decision note over a meeting record or draft, and any authority rule set by `AGENTS.md` or `.claude/rules/`;
   - **contradiction or evolution** — a dated change of mind is not a contradiction; a note left in the old state is.
6. **Classify** each case: **to update** (one version clearly wins: which one, and which note to fix), **to decide** (truly ambiguous: both positions and their evidence), **evolution** (nothing to fix, at most a link).
7. **Every case cites both `[[notes]]`**, each with its proven quote, its line and its date. If the scope holds none, say so.
8. **File**: with an argument, `syntheses/Contradictions - <topic>.md`, described as "Contradictions found in the vault on <topic>"; without one, `syntheses/Contradictions - reference notes.md`, described as "Contradictions found in the vault's reference notes (brain/, org/, work/active/, Home.md)" — both in the vault's language (README §4), type `contradictions`, `produced-by: om-contradictions`. Body: scope, engine and notes read, the number of cases dropped as unproven, then to update, to decide, evolutions. Flag cases from an earlier section that have been resolved since.
9. **Report**: the number of cases per class, the cases dropped as unproven (each side's path and why its check failed), the two most urgent, the path written.
