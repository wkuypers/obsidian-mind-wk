---
description: "Build a research dossier in theology of ministries from the vault's notes: plan, verified source file, closed citation register, drafting and a three-reviewer critique loop. Stops for validation between stages. Writes one folder under work/active/."
argument-hint: "<research question> | resume <dossier folder>"
---

# /om-dossier-theo

A dossier assistant, not an author. It gathers, verifies, structures and criticises; the thesis stays the user's. The architecture transposes PaperOrchestra (arXiv:2604.05018): raw materials kept apart from drafting, a plan before any prose, a closed citation register, and revisions kept only when no reviewer's score drops.

**Read first, and let them win over this file**: `AGENTS.md`, then `.claude/rules/local.md` if it exists. A vault may fix there the dossier's note names, its library rules, and principles every plan must honour.

## The eight rules (every agent carries them)

1. **Never invent a reference.** A quotation, a Denzinger-Hünermann number, a canon, a page or a critical edition that was not verified is marked `(TBC)` and never presented as sure.
2. **The vault first.** Search the notes before the web. Every source added from outside is flagged `source: external`.
3. **Keep the source apart from its interpretation**: what the text says on one side, what is drawn from it on the other, visibly marked (a `> [!note] Interpretation` callout).
4. **Attach every claim to a tradition**: Catholic, Orthodox, Lutheran, Reformed, Anglican, or ecumenical (dialogue document). "Ordination", "apostolic succession", "priesthood", "episkopé" are never used without their confessional frame.
5. **Tell consensus from debate from contested thesis.**
6. **Name the dominant academic tradition** of a debate (German, French, English-speaking, Italian…) and give the others when relevant.
7. **Short quotations** with their exact reference. Paraphrase elsewhere.
8. **Git**: commit only when the user asks, never push or merge, never delete or rewrite an existing note without asking.

## The dossier

One folder per question: `work/active/<Subject>/`, where `<Subject>` is a short title without `( ) , & + ?`. Existing notes are never moved; the dossier links to them. Every note carries the subject in its name, because wikilinks resolve by filename:

| Note | Written by | Holds |
|---|---|---|
| `<Subject> — question` | this command | the question as given, as reformulated, its scope and what it leaves out |
| `<Subject> — plan` | `plan-theo` | the argued plan |
| `<Subject> — primary sources` | `sources-primaires` | what the texts say: the author's corpus when there is one, then four layers |
| `<Subject> — secondary literature` | `litterature-secondaire` | the state of the question, by tradition and school |
| `<Subject> — verified citations` | `verificateur-citations` only | the closed register |
| `<Subject> — draft_<section>` | `redacteur-theo` | one note per section |
| `<Subject> — review_round <n>_<reviewer>` | each reviewer | critique and scores |
| `<Subject> — journal` | this command | every step, decision, stop and resume point |

Name the suffixes in the language of the vault's notes. Use the vault's work-note template for frontmatter (`date`, `description`, `tags` at least) and link every note to the `question` note and to `work/Index.md`'s entry.

## The register

One entry per reference, under a heading that is its key (`### lg29`, lowercase letters, digits and hyphens). Each entry gives: status, tradition, source layer, the full reference, the vault note it links to, and what was actually read and when.

| Status | Meaning | May be cited |
|---|---|---|
| `verified-vault` | full reference and at least one located statement (page, paragraph, canon) read in a vault note made from the text itself | yes |
| `verified-external` | read in an external full text, flagged `source: external` | yes |
| `exists-only` | a catalogue or library record was found; the passage was not read | yes, with `(TBC)` visible in the footnote |
| `unverified` | a lead given from memory, nothing found yet | no |
| `rejected` | wrong or untraceable, with the reason | no |

A passage read in OCR text adds `to collate`: it locates the passage, it does not establish its wording. **No other agent may cite what is not in the register.** In a draft, each citation is a footnote whose label is the register key (`[^lg29]`).

## Steps

Log every step in the journal as it ends: date, agent, file written, what it reported, what you checked yourself.

1. **Open the dossier.** Resolve the question from `$ARGUMENTS`; without one, ask. Create the folder, the `question` note and the journal. With `resume <folder>`, read the journal and continue from its last completed step.
2. **Plan**: run `plan-theo`. ⏸ **Stop: show the plan, wait for the user.**
3. **Sources**: run `sources-primaires` and `litterature-secondaire` in parallel, each with the validated plan.
4. **Register**: run `verificateur-citations` on both files and on the plan's leads.
5. **Collation**: the agents reach only the vault and the open web. Take the register's "To verify" list and settle what you can with what only this session has — a reference manager, a document database, a mounted library, a Bible server — reading only, never writing in them. Report each result to `verificateur-citations`, which alone updates the register. What still cannot be settled stays `(TBC)`. ⏸ **Stop: show the register's counts by status, the `(TBC)` entries and the sources that could not be reached. Wait.**
6. **Draft**: run `redacteur-theo` section by section. After each section, run the check below; a failed check goes back to the drafter, never forward. ⏸ **Stop before any review: show the draft. Wait.**
7. **Review loop**, three rounds at most:
   - run the three reviewers in parallel on the current draft, each in its own context, with the draft, the register and the primary sources — never the drafter's reasoning;
   - give the drafter the three critiques; it revises and logs what it changed;
   - run the reviewers again and compare scores with the check below;
   - **a revision is kept only if no axis drops, for any reviewer.** Otherwise restore the previous version at once and stop the loop;
   - stop too when the reviewers list no weakness left.
8. ⏸ **Final stop**: report what holds, what stays `(TBC)`, what the reviewers still contest, what could not be reached.

**Cost.** A gathering agent uses on the order of two hundred thousand tokens; a first run to the register used about nine hundred thousand. The review loop runs three reviewers and a drafter up to three times per section: say so, and say which sections you mean to draft, before step 6.

Never trust an agent's report on its own: open the file it says it wrote. If a report comes back empty or cut short, message the same agent again and ask for the report in prose, without quoting raw frontmatter.

## The check

```bash
node --experimental-strip-types .claude/scripts/dossier-check.ts citations "<register>" "<draft>" ["<draft>"…]
node --experimental-strip-types .claude/scripts/dossier-check.ts scores "<review round n-1>" "<review round n>"
```

`citations` exits 0 only if every footnote of every draft is a citable register key, and every `exists-only` citation shows `(TBC)`. `scores` exits 0 only if no axis dropped; it exits 2 when an axis is missing from either file, which is a failed review, not a pass.

## What this command never does

- Write in a reference manager or library application. It reads them.
- State a limitation away. Gaps, unreachable sources and `(TBC)` are said in the text; a reviewer penalises a hidden limit, never an admitted one.
- Set a citation quota. A reference that is not needed stays in the register, uncited.
- Draw a conclusion on an open question. Current debates are reported dated and sourced, and left open.
- Draw a figure. A Mermaid diagram (a chronology, a map of dialogues) is allowed when the plan asks for one.
