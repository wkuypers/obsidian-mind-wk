---
description: "Multi-turn Socratic brainstorm: one question per turn until the idea converges, then a design note with named approaches and one recommendation. Writes to syntheses/."
argument-hint: "[topic]"
---

# /om-brainstorm

Read `syntheses/README.md` first and follow it: scope, search, reading budget and writing rules. If it is missing, stop and say so. **Never modify a file outside `syntheses/`.** Unlike the other analysis commands, this one is an interview: nothing is written before the idea has converged.

## 1. Ground in the vault, silently

Read `AGENTS.md` and `.claude/rules/local.md` if it exists. Take the topic from `$ARGUMENTS` or the conversation; otherwise ask what the brainstorm is about. Search the vault (README §2) for related projects, past decisions (`brain/Key Decisions.md`), failures (`brain/Gotchas*.md`) and open questions. Do not dump them: they feed your questions.

## 2. The interview: one question per turn

Ask **exactly one question per turn**, preferably multiple choice (two to four concrete options, plus "other"). Take it from the least resolved category:

1. **Problem** — what hurts today, and for whom?
2. **Constraints** — time, means, skills, what is not negotiable;
3. **Trade-off** — "if you could keep only X or Y?";
4. **Scope** — what is explicitly out of the first version;
5. **Prior decisions** — "the vault records [[decision]]: does it still hold here?";
6. **Anti-goals** — what would make this a failure even if it "works".

Track silently: problem in one sentence, constraints known, one trade-off decided, scope bounded, link to (or deliberate departure from) the vault's decisions, anti-goals named. Keep going until at least five hold. If the user says "write it now", comply, and carry the missing points as open questions.

## 3. Converge

Present two or three **named** approaches (a real name, not "option A"), each with its principle in one line and a small trade-off table. Mark exactly one as recommended, with the reason in one sentence. The user picks or pushes back; one or two loops are normal.

## 4. Write the note

File: `syntheses/Brainstorm - <topic>.md` (README §4), type `brainstorm`, `produced-by: om-brainstorm`. Sections: problem (the wording agreed, verbatim), constraints and anti-goals, approaches considered (table, the chosen one marked), decisions (each with its reason and `[[links]]` to vault notes), open questions. No interview transcript: conclusions and their reasons.

Touch no other note: no link from a project or a journal. If the result looks like a project or a decision to record, say so; the user will do it with the vault's own commands.
