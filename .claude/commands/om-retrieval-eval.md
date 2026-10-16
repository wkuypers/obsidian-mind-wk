---
description: "Measure whether the vault's search (qmd, keyword/BM25 mode) finds the right note for a keyword query that avoids the note's title: recall@1/3/5/10, MRR and concrete failures. Keeps the cases so they can be replayed after a change. Writes to syntheses/."
argument-hint: "[number of cases to create, default 15 | replay]"
---

# /om-retrieval-eval

Read `syntheses/README.md` first and follow it: scope, search and writing rules. If it is missing, stop and say so. **Never modify a file outside `syntheses/`.** You cannot improve a search you have not measured: measure, change one thing, measure again.

1. **Read the vault's rules**: `AGENTS.md`, and `.claude/rules/local.md` if it exists.
2. **Set up the engine** exactly as README §2 (`qs`, one `update`). If neither global qmd nor `npx --yes @tobilu/qmd` answers, stop and say so: there is nothing to measure. Record which one ran.
3. **Fix the cases**:
   - `replay` in `$ARGUMENTS`, or an existing evaluation file and no number asked: reuse exactly the cases of its last section;
   - otherwise create N cases (N given, default 15). Draw N notes at random among the vault's notes (README §1: what git sees, outside `syntheses/` and the never-a-source folders). For each, read it and write **a query of 2–5 distinctive keywords it answers, none of them taken from its title**. Not a sentence: `qmd search` needs every term, so a question measures the phrasing, not the search. The note is the expected answer.
4. **Measure**: for each case, `qs --index "$idx" search "<keywords>" -n 20`. Drop hits under `syntheses/` and git-ignored hits (README §2) before ranking, then record the rank of the expected note among the remaining top 10 (1–10, or absent).
5. **Compute**: recall@1, @3, @5, @10 (share of cases with the note in the top k) and MRR (mean of 1/rank, 0 when absent). Show the computation.
6. **Analyze the failures**: **misses** (expected note absent from the top 10) and **buried** (ranked below 3rd). For each, name the note that came first and why: full text or long source outranking a short note, a git-ignored transit folder, a weakly titled note, keywords too common.
7. **Propose fixes**, ranked by expected effect: exclude folders from the index, retitle or describe notes, add aliases, or one day the semantic mode. Each is a hypothesis, to be checked by replaying the same cases.
8. **File**: `syntheses/Retrieval evaluation.md` (README §4; the name in the vault's language), type `evaluation`, `produced-by: om-retrieval-eval`. Body: engine (command, index), cases (table: keywords, `[[expected note]]`, rank), results, failures, proposed fixes. When the cases are the same as the previous section, compare the figures.
9. **Report**: the figures, the dominant failure pattern, the path written.
