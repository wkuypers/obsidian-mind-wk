---
description: "Condense a source into sourced claims, each tied to the exact block it comes from. Writes to syntheses/, never touches the source."
argument-hint: "<note, [[wikilink]], folder or file inside the vault>"
---

# /om-distill

Read `syntheses/README.md` first and follow it: scope, search, reading budget and writing rules. If it is missing, stop and say so. **Never modify a file outside `syntheses/`** — the source least of all.

A distillation is not a summary: every claim keeps a link to the precise place that carries it, so it can be checked.

1. **Read the vault's rules**: `AGENTS.md`, and `.claude/rules/local.md` if it exists. They prevail over this command, except on the rule above.
2. **Resolve the source** from `$ARGUMENTS`; without one, ask. A note or `[[wikilink]]`: read it whole. A folder: read every note in it and treat them as one corpus. A file: read it. The source must be inside the vault (README §1); a URL or an outside path is refused. A long source is read in successive slices, never sampled.
3. **Cut the source into numbered, citable blocks** `B1`, `B2`…: a section, a paragraph, a list. Give each block a self-sufficient anchor: `[[Note#Section heading]]`, or `[[Note]]` plus the paragraph number — always the full `[[Note…]]`, never a bare `§n` that depends on a line above.
4. **Extract the key claims**, one tight sentence each, followed by its provenance: `(B3 — [[Note#Section]])`. Add a confidence: `stated`, `high`, `medium`. Keep the source's own terms; do not smooth them.
5. **Separate inference from evidence.** What the source implies without saying goes in its own section, each line marked as speculation and carrying the full `[[Note…]]` anchor of the blocks that suggest it.
6. **File**: `syntheses/Distillation - <source title>.md` (README §4), type `distillation`, `produced-by: om-distill`, plus `source: "[[<source>]]"` in the front matter of a new file.
7. **Section body**: claims grouped under short thematic subheadings, provenance inline; inferences (only if any); the source blocks list — `B1`, `B2`… each with its full anchor and its first line quoted.
8. **Report**: the source, the number of blocks and claims, the path written, and any claim dropped for lack of a block that carries it (the gap stays visible).

Never invent a block, an anchor or a claim: a `(B3)` set on a block that does not say it is a fault.
