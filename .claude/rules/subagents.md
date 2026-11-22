# Subagents (Claude Code)

Claude-only: Claude Code loads this file beside `AGENTS.md` and the shared files in this folder, which hold every convention the other agents share.

| Folder | Purpose | Key Files |
|--------|---------|-----------|
| `.claude/agents/` | Subagents | See subagents table below |

## Subagents

Specialized agents in `.claude/agents/` for heavy operations. They run in isolated context windows.

| Agent | Purpose | Invoked by |
|-------|---------|------------|
| `brag-spotter` | Finds uncaptured wins and competency gaps | `/om-wrap-up`, `/om-weekly` |
| `context-loader` | Loads all vault context about a person, project, or concept | Direct |
| `correction-sweep` | Finds every note restating a corrected fact; classifies each as authoritative, restatement, or historical. Never edits | `/om-correct` |
| `cross-linker` | Finds missing wikilinks, orphans, broken backlinks | `/om-vault-audit` |
| `people-profiler` | Bulk creates/updates person notes from Slack profiles | `/om-incident-capture` |
| `review-prep` | Aggregates all performance evidence for a review period | `/om-review-brief` |
| `slack-archaeologist` | Full Slack reconstruction -- every message, thread, profile | `/om-incident-capture` |
| `vault-librarian` | Deep vault maintenance -- orphans, broken links, stale notes | `/om-vault-audit` |
| `review-fact-checker` | Verifies every claim in a review draft against vault sources | `/om-self-review`, `/om-review-peer` |
| `vault-migrator` | Classifies, transforms, and migrates content from a source vault | `/om-vault-upgrade` |
| `plan-theo` | Drafts the argued plan of a theology-of-ministries dossier: provisional theses, material, traditions per section | `/om-dossier-theo` |
| `sources-primaires` | Builds the dossier's primary-source file: the author's corpus, then Scripture and early Church, liturgy, magisterium and law, ecumenical dialogues | `/om-dossier-theo` |
| `litterature-secondaire` | Gathers the dossier's secondary literature, vault first, then key-less databases; reports which ones answered | `/om-dossier-theo` |
| `verificateur-citations` | Keeps the dossier's closed citation register; the only agent that writes it | `/om-dossier-theo` |
| `redacteur-theo` | Drafts or revises one dossier section, citing only the register | `/om-dossier-theo` |
| `relecteur-canoniste` | Reviews a draft section as a canon lawyer; returns critique and scores | `/om-dossier-theo` |
| `relecteur-oecumeniste` | Reviews a draft section as an ecumenist; returns critique and scores | `/om-dossier-theo` |
| `relecteur-historien` | Reviews a draft section as a historian; returns critique and scores | `/om-dossier-theo` |

