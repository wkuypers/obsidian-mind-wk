---
description: "Propose three to five next directions drawn from the vault: ideas left hanging, open project questions, notes nothing links to. Explicit ranking, smallest next step for each. Writes to syntheses/."
argument-hint: "[domain, optional]"
---

# /om-discover

Read `syntheses/README.md` first and follow it: scope, search, reading budget and writing rules. If it is missing, stop and say so. **Never modify a file outside `syntheses/`.** This command finds and ranks; it starts no project.

1. **Read the vault's rules**: `AGENTS.md`, `.claude/rules/local.md` if it exists, and `brain/North Star.md`.
2. **Bound the search**: the whole vault, or the domain given in `$ARGUMENTS`.
3. **Gather candidates**, listing exhaustively, no sampling:
   - **Ideas left hanging** — idea notes, `thinking/` drafts, notes whose `status` stayed `idea`, `draft` or `exploring`;
   - **Open questions** — open-question sections, `TBD`, `TODO`, decisions left pending in `work/active/` and `brain/`:
     ```bash
     git grep -l -i --untracked -E 'TBD|TODO|open questions?|questions?( de travail)? ouvertes?|question ouverte|à trancher|à instruire|status: *(idea|draft|exploring)' -- '*.md' ':!syntheses' ':!.claude' ':!.obsidian' ':!.shardmind' ':!templates' ':!bases'
     ```
     Add the vault's own wording if it uses another (read a few active notes to learn it).
   - **Orphan notes** — reference or research notes no project cites (backlinks: `git grep -l --untracked -F '[[<title>' -- '*.md' ':!syntheses'`). Skip this family when the vault declares that such notes are indexed otherwise (by tag, by Base): check `brain/` and `.claude/rules/local.md` first.
   Read each candidate kept, within README §3.
4. **Rank them** by a rule stated in the note, so the ranking can be checked: **recency** (`git log -1 --format=%cs -- "<file>"`), **pull** (how many notes cite or depend on it), **momentum** (what in the vault already prepares it), **fit with `brain/North Star.md`** — or a deliberate departure.
5. **For the top three to five**: the direction, why now, the `[[source notes]]`, and the smallest step that would move it. Suggest `/om-research` when outside literature would help, `/om-challenge` when it deserves testing.
6. **Never invent a candidate** to fill the list: fewer than three real ones means fewer than three.
7. **File**: `syntheses/Directions.md` (README §4; the name in the vault's language), type `directions`, `produced-by: om-discover`. Body: ranking rule, numbered directions, candidates set aside (one line each, with the reason). Flag directions already proposed and those that moved since.
8. **Report**: the directions, one line each, the path written.
