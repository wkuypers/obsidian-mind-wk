---
description: "Bridge two distant domains of the vault through its link graph: bridges, structural analogies, transfers, ideas born at their crossing. Writes to syntheses/."
argument-hint: "<domain A> <domain B>"
---

# /om-connect

Read `syntheses/README.md` first and follow it: scope, search, reading budget and writing rules. If it is missing, stop and say so. **Never modify a file outside `syntheses/`.** The value is in the unexpected link: if the connection is obvious, dig deeper.

1. **Read the vault's rules**: `AGENTS.md`, and `.claude/rules/local.md` if it exists.
2. **Set the two domains** from `$ARGUMENTS` (topics, folders or note titles). If one is missing, ask for both.
3. **Build each domain's cluster**: the notes that treat it, by title, tags and content (README §2). For each note kept, record its outgoing links (`[[…]]` in the text) and its backlinks (`git grep -l --untracked -F '[[<title>' -- '*.md' ':!syntheses'`). Read the core notes of each cluster within README §3.
4. **Look for the bridge** between the clusters:
   - shared links, tags, people or sources;
   - a path in the graph: if one exists, walk each hop with its `[[note]]`;
   - otherwise the closest overlap: a concept, a metaphor, a common structure.
5. **Produce three to five concrete connections**, each one of:
   - **Structural analogy** — a mechanism of domain A found again in B;
   - **Transfer** — what works in A and could serve B;
   - **Crossing idea** — what exists only at the intersection.
   Each names what the user could do with it and rests on at least one `[[note]]` from each domain. A connection resting only on general knowledge is marked "outside the vault", or dropped. If the domains share nothing in the vault, say so.
6. **File**: `syntheses/Connect - <A> and <B>.md` (README §4), type `connect`, `produced-by: om-connect`. Body: cluster A and cluster B (`[[links]]`), bridges, numbered connections with their type, engine and notes read.
7. **Report**: the most surprising connection in one sentence, the path written.
