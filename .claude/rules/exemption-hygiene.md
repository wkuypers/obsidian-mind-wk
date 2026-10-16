Shared section: Claude Code and Grok load it at session start; other agents read it when AGENTS.md points here.

## Exemption du seuil d'organisation

**Two ways to be exempt, and the second is the one to reach for.** (a) By **name**: `*Archive*`, `*texte intégral*`, `*OCR intégral*` — bulk is their job. (b) By **declaration**: `hygiene: exempt` in frontmatter, either **on the note** (one manuscript, one source text = one unit) or **on the dossier's `Index.md`**, which covers every note in that folder — what a book split by chapter needs. Declare it rather than renaming files or hardcoding folder lists in the hook (law 6). Reach for the declaration whenever a note is bulk *by nature* — a verbatim source, a manuscript, a generated register — and keep the flag for **analysis** notes, where crossing the threshold really does mean the note holds several nodes. `oversize_ok: true` (or a motive written in its place) is read as the same declaration; `false` does not exempt.
