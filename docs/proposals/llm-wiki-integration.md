---
date: 2026-10-18
description: "Proposition d'exploration : intégrer les idées de nvk/llm-wiki (sources brutes, compilation, thèse, confiance, lint) dans le fork, scénarios et recommandation"
tags: [proposal, llm-wiki]
---

# Intégrer les idées de llm-wiki dans le fork obsidian-mind

> [!summary] Statut
> Proposition d'exploration, branche `explore/llm-wiki`, 2026-10-18. Aucun fichier existant n'a été modifié et aucun code n'a été écrit. Sources lues : ce fork (tag `wk-10.0.0.9`, base amont `v10.0.0`) et `nvk/llm-wiki` au commit `95a042c` (v0.25.1, MIT).

## 1. Résumé

1. Le fork contient déjà la moitié « requêtes réinjectées » de llm-wiki : onze commandes d'analyse écrivent dans `syntheses/`, et `/om-distill` porte déjà une confiance et une provenance par affirmation. La « mémoire de session » est elle aussi couverte. Ce que llm-wiki apporte vraiment de neuf tient en cinq points : des sources brutes immuables, des pages de concept compilées et tenues à jour, un mode thèse structuré, une confiance et une fraîcheur au niveau de la page, et un lint.
2. Recommandation : un seul nouveau dossier racine `wiki/`, contenant `inbox/`, `raw/`, `concepts/` et `theses/`. Chaque page compilée y naît `statut: brouillon-llm` et n'en sort que par la main de l'utilisateur. Les règles vivent dans `wiki/README.md`, sur le modèle exact de `syntheses/README.md`. C'est un hybride des scénarios A et B (voir §3).
3. Quatre commandes, sous un préfixe à trancher (`omw-` ou `om-wiki-`, voir §6) : ingérer, compiler, thèse, lint. Aucun hook, aucun script Python, aucune capture de session.
4. Il faut modifier trois points de code détenus par le gabarit pour que `raw/` soit réellement protégé et ne casse pas la CI : la liste « historique » de `/om-correct`, le cliquet des liens cassés, et la largeur de prose.
5. Le meilleur argument contre : on crée un second dossier de sorties LLM à côté de `syntheses/`, avec des règles opposées (des pages vivantes, là où `syntheses/` n'ajoute que des sections datées). C'est ce coût qu'il faut accepter ou refuser.

## 2. Cartographie croisée

Légende du verdict : **reprendre** (presque tel quel), **adapter** (l'idée oui, le mécanisme non), **écarter**.

| Fonction llm-wiki | Équivalent dans obsidian-mind (fork) | Relation | Verdict et justification |
|---|---|---|---|
| **Sources brutes immuables** (`raw/<type>/AAAA-MM-JJ-slug.md`, frontmatter `title, source, type, ingested, tags, summary`) | Aucun. `work/meetings/` reçoit des exports bruts, mais `/om-intake` les **supprime** après traitement. | Complément | **Adapter.** C'est le cœur de l'idée. L'immuabilité doit être plus stricte que chez llm-wiki : son `refresh` écrase le fichier brut, et ses `compile` étape 0 et `lint --fix` (C11, C13) déplacent les fichiers et réécrivent leur frontmatter. Ici, `raw/` reste en écriture unique : une nouvelle révision crée un nouveau fichier. Côté code, `raw` doit entrer dans `HISTORICAL_DIRS` (`.claude/scripts/lib/correction-sweep.ts:84`), sinon `/om-correct` peut le réécrire comme une simple « reformulation ». |
| **Compilation source → page de concept** (synthétisée, `sources:` en frontmatter, section `## Sources` qui dit ce que chaque source a apporté, « Voir aussi » bidirectionnel) | `syntheses/` (onze commandes). Mais une synthèse n'est jamais réécrite : on y ajoute une section datée (`syntheses/README.md` §4). `reference/` est vide (`.gitkeep`). | Complément, avec un conflit de modèle | **Adapter.** C'est la seule fonction qui exige des pages *vivantes*. Je garde le format de la section `## Sources` et l'idée de compilation incrémentale. J'écarte la création automatique massive de pages : chaque exécution reste bornée, par exemple à 5 pages, à cause du coût des hooks (voir §3, « hooks »). |
| **Mode thèse** (décomposition en affirmation centrale, variables, prédiction testable et critère de réfutation ; agents « pour », « contre » et « mécanisme » ; preuves classées par force ; verdict `Supported…Contradicted` ; un second tour sur le côté le plus faible) | `/om-challenge` (contradiction contre le coffre), `/om-panel`, `/om-research` (web, données « à vérifier ») | Complément | **Reprendre la structure, adapter l'exécution.** La force de llm-wiki est la décomposition *confirmée par l'utilisateur avant la recherche* et la règle « chercher le côté le plus faible ». Je l'applique d'office, pas seulement en mode `--min-time`. Je ramène les 5 à 8 sous-agents web à 3 (pour, contre, mécanisme), plus la lecture du coffre. Les verdicts sont traduits en français. |
| **Indice de confiance** (`confidence: high/medium/low` par page ; barème de crédibilité 0–6 calculé *hors* de l'auto-évaluation des agents ; `volatility` et `verified` pour la fraîcheur) | `om` MCP `remember` : `confidence: verified/inferred/unverified` (`lib/memory-write.ts`), affichée par `bases/Memories.base`. `/om-distill` : confiance par affirmation (`stated/high/medium`). Loi d'écriture 3 de `AGENTS.md` : marqueurs en ligne `(TBC)`, `(unverified)`, `(inferred)`. | Doublon partiel (trois vocabulaires existent déjà) | **Adapter.** Confiance au niveau de la page (`confiance: élevée/moyenne/faible`), avec les critères de llm-wiki. Les affirmations douteuses à l'intérieur d'une page gardent les marqueurs en ligne existants. Je reprends `vérifié: AAAA-MM-JJ`. J'écarte le score de fraîcheur à décroissance exponentielle : trop de mécanique pour ce qu'il apporte. Le vocabulaire est à trancher (§6, question 3). |
| **Provenance des affirmations** (au niveau de l'article : `sources:` plus « ce que la source a apporté » ; aucune citation par affirmation) | `/om-distill` fait mieux : `(B3 — [[Note#Section]])` par affirmation | Complément | **Adapter** : `sources:` en frontmatter et section `## Sources` comme llm-wiki, plus un renvoi `[[raw/…]]` en fin de paragraphe quand une affirmation est précise (le modèle `/om-distill`). |
| **Lint structurel** (C1 à C19, `--fix` mécanique) | `/om-vault-audit` (liste de dossiers figée), scan d'hygiène (`lib/active-hygiene.ts`), cliquet des liens cassés en CI | Doublon partiel | **Adapter, minimalement** : le lint ne couvre que `wiki/` (frontmatter requis, `sources:` résolubles, pages orphelines, `raw/` non compilé). Il n'agit qu'en rapport : aucun `mv`, aucune réécriture de `raw/`. |
| **Lint profond** (`--deep` : vérification par WebSearch des affirmations clés, rapport seulement ; `audit` cherche une requête « pour » et une « contre » par affirmation) | `/om-research` (web, proposition seulement) ; agent `review-fact-checker` (dédié aux évaluations) | Complément | **Reprendre l'idée « une requête pour, une contre »**, en option `--profond` du lint, plafonnée à environ 10 affirmations par passage. Le résultat est un rapport ; la confiance ne baisse que si l'utilisateur l'accepte. |
| **Réponses réinjectées comme notes** (`/wiki:output`, sorties `output/…` ; `query` est strictement en lecture seule) | `syntheses/` et ses onze commandes : c'est exactement cette fonction | **Doublon** | **Écarter** le dossier `output/`. Les réponses vont dans `syntheses/` via les commandes existantes. Seul ajout : `wiki/` devient une source que ces commandes peuvent lire (aucun changement n'est nécessaire : `wiki/` est versionné par git, donc dans le corpus de `syntheses/README.md` §1). |
| **Inbox / dépôt de sources** (`inbox/` par sujet ; `ingest --inbox` route les `.url`, `.md`, `.pdf`… puis les déplace dans `.processed/`) | `work/meetings/` + `/om-intake` (pour les réunions) ; `defuddle` (skill de capture web) | Complément | **Adapter** : `wiki/inbox/` est vidé par la commande d'ingestion, qui **déplace** (`git mv`) chaque fichier vers `raw/`, sans jamais supprimer. Je n'utilise pas de `.processed/`, car le déplacement suffit. |
| **Mémoire de session** (`HUB/.sessions/`, capture activée par défaut, hooks Codex, CLI Python `llm-wiki-session`, réhydratation) | Hook SessionStart (contexte injecté, budget 9 100 octets), `brain/`, `om` MCP (`remember`, `recall`), sauvegarde des transcripts par PreCompact (`thinking/session-logs/`), `/om-wrap-up`, `/om-history` | **Doublon** | **Écarter.** (1) Tout ce qu'elle fait existe déjà. (2) Elle exige un script Python de 1 754 lignes et des hooks sur chaque appel d'outil, alors que ce coffre a déjà vécu un empilement de workers en arrière-plan (`lib/qmd-refresh.ts`). (3) La capture serait activée par défaut, à l'opposé du principe « pas d'automatisme sans décision ». |
| **`/wiki:ll`** (leçons de la conversation) | `brain/Gotchas`, `brain/Patterns`, `/om-wrap-up` | Doublon | **Écarter.** |
| **`retract`** (secret littéral, ou suppression d'une source et des affirmations qui n'en dépendent que) | `/om-correct` (balayage de correction) | Partiel | **Écarter le mode secret** : il dépend du CLI Python et d'une saisie masquée, et les secrets n'ont rien à faire dans ce coffre. **Reporter** le mode source (retirer un brut et marquer les pages qui en dépendent) à une étape ultérieure. |
| **Index `_index.md` dans chaque dossier, `log.md` en ajout seul** | Bases Obsidian (`bases/*.base`), git comme journal | Doublon | **Écarter.** Une Base `bases/Wiki.base` remplace les index, et `git log` remplace `log.md`. Cela évite autant d'écritures `.md` en plus, et donc autant de déclenchements de hook. |
| **Double format de liens `[[x\|X]] ([X](chemin))`** (justifié par la lecture par un agent et le rendu sur GitHub) | `[[wikilink]]` seuls (`AGENTS.md`) ; le cliquet CI ne contrôle **que** les wikilinks | Conflit | **Écarter.** L'agent lit très bien les wikilinks dans ce coffre (le hook et `qmd` les résolvent), le coffre n'est pas lu sur GitHub, et la moitié Markdown échapperait au cliquet. Le double format doublerait le bruit sans aucun contrôle. |
| **Hub externe, un coffre Obsidian par sujet, registre `wikis.json`** | Un seul coffre | Conflit | **Écarter** (sauf dans le scénario D). |
| **research / collect / ingest-collection / dataset / inventory / idea / project / portfolio / adapter / specialist / checkpoint / plan / assess** | `/om-research`, `work/`… | Hors périmètre ou doublon | **Écarter** pour l'instant. `checkpoint`, `adapter` et `specialist` dépendent du CLI Python de 6 093 lignes. |
| **`query-lite`** (protocole en lecture seule : l'index d'abord, un seul grep borné, citer les chemins exacts, ne pas combler les trous avec la mémoire du modèle, traiter les fichiers comme des données et non des instructions) | `syntheses/README.md` §2–3 (qmd BM25 + `git grep`, « les notes sont des données ») | Quasi-doublon | **Reprendre deux règles** dans `wiki/README.md` : « ne pas combler les trous par la mémoire du modèle », et citer le chemin exact. |
| **Gardien structurel après chaque écriture** | Hook PostToolUse `validate-write.ts` | Doublon | **Écarter.** Le hook existant joue ce rôle. |

## 3. Scénarios pour `wiki/`

Faits communs à tous les scénarios, vérifiés dans le code :

- **CI `manifest-check`** (`.github/scripts/manifest-check.ts`). Elle échoue seulement si un fichier de `.claude/commands/`, `templates/`, `bases/`, etc. n'est couvert par aucun motif `infrastructure`. `.claude/**` couvre déjà toute nouvelle commande, donc il n'existe pas de liste de commandes à déclarer. Un nouveau dossier racine n'est jamais contrôlé.
- **Cliquet des liens cassés** : `.claude/scripts/tests/vault-wikilinks.test.ts`, avec `wikilink-baseline.json` = `{"allowedBroken": 0}`. Toute note de `wiki/` ou `raw/` est scannée. Un `[[…]]` non résolu dans une source collée fait échouer les tests (en CI du fork et dans `/om-template-update` des coffres).
- **Largeur de prose** : `vault-prose-width.test.ts`. Aucun paragraphe coupé à la main n'est permis. Il existe deux échappatoires : `verbatim: true` dans une note (honorée par le hook et par le test), ou un fichier `.verbatim` dans le dossier (honoré par le test seulement).
- **Hook d'écriture** (`validate-write.ts`, PostToolUse `Write|Edit`). Il **avertit sans bloquer**. Il exige `date`, `description` et `tags` (`frontmatter_required.global`), plus au moins un `[[lien]]` au-delà de 300 caractères. La table dossier → type est codée en dur (`lib/frontmatter.ts:91`), donc déclarer un type `wiki` dans le manifeste n'a aucun effet sans toucher au code.
- **Coût par écriture** : chaque écriture `.md` lance un processus Node. Il appelle `triggerDebouncedRefresh`, qui exécute `npm root -g` (jusqu'à 3 s) quand `qmd` est absent, et lance un worker détaché `qmd update`/`embed` quand `qmd` est installé globalement. Le hook Stop parcourt tout le coffre à chaque réponse. Une compilation qui écrit 30 pages déclenche donc 30 hooks.
- **Mise à niveau** : `/om-vault-upgrade` en mode import classe tout ce qui n'est ni `infrastructure` ni `user_content_roots` dans « Everything else → SKIP » (`om-vault-upgrade.md:128`). Un `wiki/` non déclaré serait donc **perdu** à l'import. Une mise à jour par `git merge` (le chemin réel du fork) ne touche que les lignes modifiées par le gabarit.
- **`AGENTS.md`** fait 21 564 octets pour un plafond testé de 22 000 (`lib/instruction-files.ts:29`). Il ne reste qu'environ 430 octets, soit une ligne de pointeur au maximum.
- **Exposition MCP** : le serveur `om` sert par défaut les racines de `user_content_roots` (`lib/mcp-exposure.ts:208`). Ajouter `wiki/` l'expose aux autres dépôts ; `mcp_never_expose` permet d'en retirer des chemins.

### Scénario A : `wiki/` couche compilée, `raw/` à côté, promotion manuelle

```
raw/                      # racine, écriture unique
  articles/ papers/ notes/ data/
  .verbatim
wiki/                     # couche compilée, réécrite par le LLM
  concepts/ theses/
  README.md               # règles (infrastructure)
```

- **Frontmatter** : les pages de `wiki/` sont libres de réécriture, avec `statut: brouillon-llm` tant qu'elles ne sont pas relues. La promotion consiste à déplacer la page vers `reference/` (`git mv`) puis à retirer `statut`.
- **Hooks** : risque de cascade moyen. La compilation réécrit plusieurs pages.
- **Manifeste et CI** : deux entrées `user_content_roots`, `wiki/README.md` dans `infrastructure`, et deux dossiers à exclure ou marquer pour le cliquet et la prose.
- **Mises à niveau** : survit si les deux racines sont déclarées.
- **Graphe** : `raw/` devient un nuage de feuilles, à filtrer avec `-path:raw`.
- **Coût en jetons** : moyen.
- **Avantages** : c'est la lecture la plus fidèle de Karpathy, et la frontière machine/humain est spatiale, donc visible.
- **Risques** : deux nouvelles racines, alors que `AGENTS.md:236` demande d'éviter d'en créer. Après promotion, on perd la trace de ce qui a été compilé.
- **Effort** : moyen.

### Scénario B : `wiki/` comme sas, rien n'en sort sans relecture

```
wiki/
  inbox/                  # dépôt manuel
  raw/  (.verbatim)       # écriture unique
  concepts/ theses/       # tout naît « brouillon-llm »
  README.md
```

- **Frontmatter** : `statut: brouillon-llm | relu | rejeté`. Le LLM n'écrit **que** dans `wiki/`. Le passage vers `work/`, `brain/` ou `reference/` est un geste humain. Le LLM peut le *proposer* sous forme de liste, jamais l'exécuter.
- **Hooks** : même risque qu'en A.
- **Manifeste et CI** : une seule racine, `wiki/`.
- **Mises à niveau** : survit si déclaré.
- **Graphe** : un sous-graphe isolé, filtrable par `path:wiki`.
- **Coût en jetons** : moyen.
- **Avantages** : frontière maximale, une seule racine, conforme à la contrainte « statut brouillon-llm jusqu'à relecture ».
- **Risques** : un sas qui ne se vide jamais. Le LLM réécrit des pages déjà `relu`, ce qui contredit la relecture.
- **Effort** : moyen.

### Scénario C : pas de dossier, fonctions greffées par métadonnées

- **Arborescence** : rien de nouveau, sinon un dossier `reference/sources/` pour les bruts (déjà racine utilisateur). Les thèses vont dans `syntheses/Thèse - <sujet>.md`, avec `confiance:` et `statut:` ajoutés aux notes existantes.
- **Hooks** : aucun risque nouveau.
- **Manifeste et CI** : presque rien.
- **Mises à niveau** : survit d'office.
- **Graphe** : inchangé.
- **Coût en jetons** : le plus faible.
- **Avantages** : effort minimal, aucun conflit avec `AGENTS.md:236`.
- **Risques** : pas de compilation vivante, puisque `syntheses/` est en ajout seul. La frontière machine/humain ne repose plus que sur un champ, que les notes humaines n'ont pas. On perd l'essentiel de l'idée de Karpathy.
- **Effort** : faible.

### Scénario D : hub llm-wiki externe, relié au coffre

- **Arborescence** : le plugin llm-wiki installé tel quel, avec son hub hors du coffre (`~/wiki` ou iCloud), un sous-coffre Obsidian par sujet. Côté obsidian-mind, rien de nouveau.
- **Lien avec le coffre** : le serveur `om` sert le coffre *vers* d'autres dépôts. Il ne lit pas un hub externe. Le pont réel serait (a) une session Claude ouverte dans le hub qui interroge le coffre via `om` (`search`, `recall`), et (b) une commande de promotion qui copie une page relue du hub vers `reference/` du coffre. Un index `qmd` séparé du hub est possible.
- **Hooks** : aucun impact sur le coffre. Les hooks Codex de llm-wiki concernent le hub uniquement, et le plugin Claude n'en installe aucun.
- **Manifeste et CI** : aucun impact.
- **Mises à niveau** : les deux évoluent séparément, avec la mise à jour amont « gratuite » côté llm-wiki.
- **Graphe** : deux graphes disjoints.
- **Coût en jetons** : élevé. Le `SKILL.md` de llm-wiki pèse environ 27 Ko, et un lint complet charge environ 17 000 mots.
- **Avantages** : aucune adaptation, aucun risque pour le fork. Contrainte de licence : aucune, puisque rien n'est copié.
- **Risques** : on ne contrôle ni le frontmatter (pas de `statut`/`confiance` à vos conventions), ni le format des liens (double format), ni la langue. Le `refresh` y écrase des bruts. Deux outils, deux vocabulaires.
- **Effort** : très faible au départ, coûteux à la longue.

### Scénario E : prolonger `syntheses/` au lieu de créer `wiki/`

- **Arborescence** : `syntheses/` reçoit un sous-dossier `syntheses/concepts/` exempté de la règle « ajout seul », plus `reference/sources/` pour les bruts.
- **Avantages** : réutilise le README et le corpus des onze commandes.
- **Risques** : on casse la promesse « appended, never rewritten » de `syntheses/README.md` pour une partie du dossier, ce qui est source de confusion pour l'agent comme pour vous.
- **Effort** : faible à moyen.
- Je l'ai jugé inférieur à B pour cette raison.

### Scénario F : plugin llm-wiki en mode local `.wiki/`

- llm-wiki sait écrire dans `.wiki/` à la racine d'un projet (`--local`).
- **Graphe** : Obsidian n'affiche pas les dossiers commençant par un point, donc la couche serait invisible dans le graphe et dans la recherche. Le cliquet CI l'ignorerait aussi.
- **Fonctionnement** : la mécanique de llm-wiki resterait intacte.
- **Écarté** : un wiki invisible dans Obsidian n'a pas d'intérêt ici.

## 4. Recommandation

**Le scénario B, augmenté de la promotion explicite de A et de la sobriété de C.**

- Une seule racine, `wiki/`, avec `inbox/`, `raw/` (écriture unique, marqueur `.verbatim`), `concepts/` et `theses/`.
- Les règles vont dans `wiki/README.md` (déclaré en `infrastructure`), lu par chaque commande comme `syntheses/README.md`. C'est la seule façon de ne pas dépasser le plafond de `AGENTS.md` : une ligne de pointeur suffit.
- Toute page écrite par le LLM porte `statut: brouillon-llm` et `confiance:`.
- **Le LLM ne réécrit jamais une page dont le `statut` n'est plus `brouillon-llm`.** Pour une page relue, il ajoute une section `> [!question] Proposition de mise à jour (AAAA-MM-JJ)` que vous intégrez ou rejetez. Cela tranche la tension B (« relecture ») contre compilation vivante.
- La promotion vers `reference/`, `brain/` ou `work/` est faite par vous. La commande peut la proposer, jamais l'exécuter.
- Les réponses aux requêtes restent dans `syntheses/`. Pas de `output/`, pas d'index, pas de journal, pas de mémoire de session.
- Quatre commandes : ingérer, compiler, thèse, lint (dont `--profond`).

**Pourquoi.**

- La frontière machine/humain est à la fois spatiale (dossier) et déclarée (`statut`).
- Une seule nouvelle racine.
- Aucune dépendance à du Python, aucun hook ajouté.
- Les bruts sont protégés par le code, et pas seulement par l'instruction.
- Les fonctions déjà présentes dans le fork ne sont pas dupliquées.

**Le meilleur argument contre.** Elle crée un **second dossier de sorties LLM**, à côté de `syntheses/`, avec une règle opposée : des pages vivantes dans `wiki/`, contre un ajout seul dans `syntheses/`. Pour décider où écrire, il faudra une règle claire : « un concept qui doit rester à jour » va dans `wiki/`, « un examen daté » dans `syntheses/`. Le plus probable est que les deux se recouvrent.

Elle oblige aussi à modifier trois fichiers de code et de tests détenus par le gabarit (§5, étape 2). Chaque fusion d'un tag amont pourra donc entrer en conflit sur ces lignes.

Enfin, la règle « on ne réécrit pas une page relue » retire à la compilation une bonne partie de ce qui fait son intérêt chez Karpathy. Le scénario C, beaucoup plus pauvre, n'a aucun de ces coûts. Si l'usage réel se limite à des thèses ponctuelles, C suffit.

## 5. Plan d'implémentation (scénario recommandé)

Chaque étape fait un commit sur `explore/llm-wiki`, se défait par `git revert`, et se termine par `npm test` dans `.claude/scripts` (la CI échoue si le test laisse un fichier derrière lui).

0. **Licence et crédit**
   - Ajouter `.claude/licenses/llm-wiki.md` (texte MIT, « Copyright (c) 2026 nvk »), sur le modèle de `obsidian-second-brain.md`.
   - Ajouter une ligne dans la section « What This Fork Adds » du `README.md`, qui crédite aussi l'idée de Karpathy.
   - Aucune reprise de texte sans cette mention dans le fichier repris (en commentaire HTML en tête de commande).
1. **Dossier et règles**
   - `wiki/README.md` : rôle, sous-dossiers, frontmatter, règles d'écriture, règle de relecture, « ne pas combler par la mémoire du modèle ».
   - `wiki/raw/.verbatim` ; `.gitkeep` dans les sous-dossiers vides.
   - `vault-manifest.json` : `infrastructure` += `wiki/README.md` ; `user_content_roots` += `wiki/`.
   - Dans `AGENTS.md`, une ligne de tableau des dossiers (mesurer : il reste environ 430 octets).
   - Aucun exemple de note : dépôt public.
2. **Protection par le code** (détenu par le gabarit, donc des conflits de fusion possibles) :
   - (a) `lib/correction-sweep.ts:84`, ajouter `raw` à `HISTORICAL_DIRS`, et synchroniser `om-correct.md` et `agents/correction-sweep.md` (le test `correction-sweep-docs-sync` l'exige) ;
   - (b) `tests/vault-wikilinks.test.ts`, ajouter `wiki/raw` à `SOURCE_SKIP_EXTRA`, pour que les liens d'une source collée ne comptent pas ;
   - (c) dans `validate-write.ts`, ignorer les fichiers de `wiki/raw/` lors des avertissements de largeur et de liens, comme pour `thinking/`.
   - Un test par changement.
3. **Commande d'ingestion**
   - `inbox/` ou URL vers `wiki/raw/AAAA-MM-JJ-slug.md` (création seule, `git mv` depuis l'inbox, `defuddle` pour le web).
   - Frontmatter brut : `title, type: source, source, created, date, description, tags, verbatim: true`.
   - Refus si le fichier cible existe : une nouvelle révision prend un nouveau nom.
4. **Commande de compilation**
   - Lit les bruts non cités par une page.
   - Propose la liste des pages à créer ou mettre à jour et attend votre accord.
   - Écrit au plus 5 pages par exécution, pour borner les hooks.
   - Section `## Sources` avec ce que chaque source a apporté.
   - Ne touche pas aux pages relues (proposition en encadré à la place).
5. **Commande de thèse**
   - Décomposition confirmée par vous : affirmation, variables, prédiction, réfutation.
   - Trois sous-agents (pour, contre, mécanisme), plus la lecture du coffre et de `wiki/`.
   - Barème de crédibilité indépendant, puis un tour obligatoire sur le côté le plus faible.
   - `wiki/theses/<slug>.md`, avec un verdict parmi : Étayée, Partiellement étayée, Preuves insuffisantes, Contredite, Mitigée.
6. **Commande de lint**
   - Rapport seul : frontmatter requis, `sources:` résolubles, pages orphelines, bruts non compilés, pages `brouillon-llm` anciennes.
   - Option `--profond` : une requête web pour et une contre, sur au plus 10 affirmations. La confiance ne baisse que si vous l'acceptez.
7. **Base Obsidian** : `bases/Wiki.base` (pages par `statut`, `confiance`, `vérifié`). Les couleurs du graphe vivent dans `.obsidian/`, que l'agent ne modifie pas : c'est à vous de les régler.
8. **Essai dans un coffre** (hors de ce dépôt, dans sa propre session) : trois sources, une compilation, une thèse, un lint. Mesurer le temps des hooks et les jetons consommés avant toute généralisation.

## 6. Questions ouvertes à trancher

1. **Préfixe** : `omw-` (votre suggestion), ou `om-wiki-` ?
   - Le fork n'a aucun préfixe propre : ses onze commandes sont en `om-`.
   - Sur `main` amont (non publié), un test génère des wrappers Gemini pour chaque `om-*.md`. Un `omw-*` n'en aurait pas, alors qu'un `om-wiki-*` en aurait.
2. **Champs en français ou en anglais** : `statut`/`confiance`/`vérifié`, comme vous le demandez, ou `status`/`confidence` ?
   - La loi « statut unique » de `AGENTS.md`, les Bases et la liste des statuts historiques de `/om-correct` lisent `status`. Un champ `statut` en serait un second, invisible pour eux.
3. **Vocabulaire de confiance** : `élevée/moyenne/faible` (llm-wiki traduit), ou `vérifié/inféré/non-vérifié` (déjà utilisé par le serveur `om` et `bases/Memories.base`) ?
4. **Frontmatter** : vos conventions (`title, type, source, created, tags, aliases`) et celles du coffre (`date, description, tags`, exigées par le hook) se recouvrent en partie. Faut-il porter les deux (`created` et `date` en double), ou apprendre au hook à accepter `created` (encore une modification de code du gabarit) ?
5. **Langue des fichiers de commande** : les onze commandes du fork sont rédigées en anglais, et seules leurs sorties sont en français (`syntheses/README.md` §4). Votre consigne « interface en français » vise-t-elle aussi le texte des commandes ?
6. **`raw/` exposé par MCP ?** Avec `wiki/` dans `user_content_roots`, le serveur `om` sert aussi les bruts aux autres dépôts. Faut-il les retirer avec `mcp_never_expose` ?
7. **Promotion** : une page relue reste-t-elle dans `wiki/` avec `statut: relu`, ou la déplacez-vous toujours hors de `wiki/` ?
8. **Seuil de passage à C** : si vous n'utilisez au départ que la thèse, préférez-vous commencer par C (une commande thèse écrivant dans `syntheses/`) et n'ouvrir `wiki/` qu'ensuite ?

## 7. Ce que je n'ai pas pu vérifier

- **Les tests n'ont pas été lancés** sur cette branche. Les impacts CI décrits viennent de la lecture du code.
- **llm-wiki n'a pas été exécuté** (ni CLI, ni hooks, ni tests). Son comportement est déduit de ses fichiers. Les grosses références (adapters, inventory, datasets, specialists) n'ont été lues que par titres et passages ciblés.
- **Le coût réel des hooks par écriture** (`npm root -g`, worker `qmd`) n'a pas été mesuré sur une machine ; l'étape 8 le mesure.
- **La correspondance de `mcp_never_expose`** (par nom de fichier ou par préfixe de dossier) n'a pas été vérifiée.
- **Le comportement d'une mise à jour ShardMind** (par opposition à `git merge`) n'a pas été exercé.
- **Les chiffres de jetons** sont des estimations, à partir des tailles en octets et en mots. llm-wiki déclare ses budgets en octets, pas en jetons.
- **La licence du gist de Karpathy** et celle des projets cités par llm-wiki ne sont pas vérifiées. Rien n'en est repris.

## Voir aussi

- [[AGENTS]] : conventions du coffre que toute proposition doit respecter.
