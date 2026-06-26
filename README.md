# cka-exercises

[Chinese version](README_CN.md)

A curated CKA (Certified Kubernetes Administrator) practice corpus, collected from the upstream [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises) repository, the killer.sh Simulator A/B PDFs, the KillerCoda CKA mock-exam PDFs (one per domain), and historical CKA exam questions sourced from study communities. Cleaned, normalized, tagged by source, and exposed in two forms:

- **Markdown files** under [`exercises/`](exercises/) — one file per CKA curriculum domain, ~271 H3 entries total.
- **Static SPA** in [`docs/`](docs/) — searchable browse / quiz / docs-tree practice. Built and deployed via GitHub Actions.

> 👉 **Preparing for the CKA exam?** Start at [`EXAM_GUIDE.md`](EXAM_GUIDE.md) — it's the study index (curriculum, tag scheme, pre-exam dotfiles, sync script, references, other practice resources).

## 🎯 Practice Web App

**Live site:** <https://xooooooooox.github.io/cka-exercises/> · **Usage guide:** [`WEBAPP_GUIDE.md`](WEBAPP_GUIDE.md)

A static SPA in [`docs/`](docs/) gives you searchable browse / quiz / docs-tree practice across all ~271 exercises. Filter by domain, tag (`CKA Past Exam` / `Killer.sh A / B` / `KillerCoda` / general), bookmarks, or undone state. Quiz mode pulls random questions with optional time limits (30 / 60 / 120 min), self-graded scoring, and end-of-session summary. Docs mode mirrors the kubernetes.io navigation hierarchy and reverse-links each page to the exercises that drill it.

GitHub Pages serves `docs/` automatically on push to `main` via [`.github/workflows/build-and-deploy-docs.yml`](.github/workflows/build-and-deploy-docs.yml) (enable in repo Settings → Pages → Source = GitHub Actions).

Progress (✓ Done, ⭐ Bookmark, theme, last-selected docs page) persists in `localStorage`. Markdown is rendered via Marked.js loaded from CDN — no build step at runtime.

## 📸 Screenshots

### Desktop

![Browse mode — sidebar tree on the left, filter bar at the top, exercise cards in the centre.](assets/screenshots/desktop-browse.png)

![Quiz mode — active session with answer editor and an LLM-graded verdict card (Got it / ◐ Partial / ✗ Missed three-way grading).](assets/screenshots/desktop-quiz.png)

![Docs mode — kubernetes.io navigation tree on the left, selected page details + reverse-linked exercises on the right.](assets/screenshots/desktop-docs.png)

### Mobile

<p align="center">
  <img src="assets/screenshots/mobile-browse.png" width="240" alt="Browse on iPhone — fixed bottom tab bar (Browse / Quiz / Docs / Help / Tools / Nodes), compact filter toolbar.">
  <img src="assets/screenshots/mobile-quiz.png" width="240" alt="Quiz on iPhone — three-way grade row (Got it / Partial / Missed) with the current state highlighted, then a utility row (Prev / Flag / Reveal / Skip / Next).">
  <img src="assets/screenshots/mobile-docs.png" width="240" alt="Docs tree on iPhone with collapsible categories.">
</p>

## Project Structure

```
.
├── README.md / README_CN.md           # this file — engineering README
├── EXAM_GUIDE.md / EXAM_GUIDE_CN.md   # study index for CKA exam takers
├── WEBAPP_GUIDE.md / WEBAPP_GUIDE_CN.md # webapp usage guide
├── CHANGELOG.md                       # all repo changes; also readable in Help mode
├── CLAUDE.md                          # Claude Code guidance for this repo
├── package.json                       # npm run build / lint / serve / link-check / release
├── assets/
│   ├── killer-sh/                     # killer.sh Simulator A/B PDFs
│   ├── killercoda/                    # KillerCoda CKA mock-exam PDFs (per domain)
│   └── screenshots/                   # README screenshots (desktop + mobile)
├── docs/                              # Practice SPA (GitHub Pages source)
│   ├── index.html / app.js / style.css
│   ├── llm.js / sync.js               # LLM grader + Gist sync engine
│   ├── sw.js                          # service worker source (sw.gen.js is the built artifact)
│   ├── manifest.webmanifest + icons/  # PWA install + app icon
│   └── *.json / sw.gen.js             # gitignored — generated artifacts (exercises / version / tools / nodes)
├── exercises/                         # Source markdown — one file per CKA domain
│   ├── cluster-architecture.md        # 25% — 114 exercises
│   ├── scheduling.md                  # 15% —  49 exercises
│   ├── networking.md                  # 20% —  32 exercises
│   ├── storage.md                     # 10% —  28 exercises
│   └── troubleshooting.md             # 30% —  48 exercises
├── tools/
│   └── nodes/snapshot/                # Nodes-mode filesystem snapshot sources + versions.json
├── scripts/                           # build / lint / release / verify / one-shot enrichment scripts
└── .github/
    ├── answer-fix/prompt.md / task-fix/prompt.md  # aider prompts for fix-PR workflows
    └── workflows/                     # build-and-deploy / lint / link-check / curriculum-watch / release / fix-PR / seed-labels
```

`CLAUDE.md` carries the comprehensive per-file inventory for contributors. `apply-*.mjs` scripts under `scripts/` are idempotent one-shots kept as provenance. Only `build-exercises.mjs`, `build-sw.mjs`, `lint-exercises.mjs`, and `check-links.mjs` run in CI.

## Running Locally

Requires **Node 20+** and Python 3 (for the static file server).

```shell
npm run serve        # auto-builds docs/exercises.json then serves docs/ on :8080
# open http://localhost:8080

npm run build        # just regenerate docs/exercises.json + docs/sw.gen.js
npm run lint         # validate exercises/*.md format
npm run link-check   # ping every kubernetes.io URL (slow — ~106 URLs)
npm run release:dry  # preview the next semver bump from CHANGELOG [Unreleased] (no writes)
```

`docs/exercises.json` is a build artifact regenerated from `exercises/*.md` on every `npm run build` / `npm run serve` and on each Pages deploy. It is gitignored, so it never appears in PRs.

Releases follow [semver](https://semver.org/) (`vX.Y.Z`) and are cut from the Actions UI → **Release** → **Run workflow** (manual dispatch, defaults to auto-inferring the bump from the `[Unreleased]` block in [CHANGELOG.md](CHANGELOG.md)). The release pipeline rewrites the changelog to rename `[Unreleased]` → `[vX.Y.Z] - YYYY-MM-DD`, tags the commit, creates a [GitHub Release](https://github.com/xooooooooox/cka-exercises/releases), and a fresh deploy follows. See `## Release workflow` in [CLAUDE.md](CLAUDE.md) for the full rules.

## CI

Eight GitHub Actions workflows:

- **`build-and-deploy-docs.yml`** — on push to `main`: lint, build `exercises.json` + `sw.gen.js` + per-version Tools / Nodes bundles, deploy `docs/` to Pages.
- **`lint.yml`** — on push to any non-main branch and on PRs: lint + verify the build still works.
- **`link-check.yml`** — weekly Monday cron + manual: pings every kubernetes.io URL referenced by an exercise.
- **`curriculum-watch.yml`** — weekly Monday cron + manual: detects when the upstream CNCF curriculum PDFs drift from baseline; files a labelled issue.
- **`release.yml`** — manual dispatch: bumps `package.json.version`, rewrites `CHANGELOG.md` `[Unreleased]` → `[vX.Y.Z]`, tags, and files a GitHub Release.
- **`answer-fix-pr.yml`** — manual dispatch: takes a `answer-fix`-labelled issue → runs aider against the offending exercise's H3 block → opens a draft PR that closes the issue.
- **`task-fix-pr.yml`** — manual dispatch: same shape as `answer-fix-pr.yml` but for `task-fix`-labelled issues (missing docs links, unclear task wording, etc.).
- **`seed-labels.yml`** — idempotent label bootstrap. Triggers on `workflow_dispatch` and on push to `main` paths-filtered to its own file — so it fires once on first deploy + automatically whenever a new label is added to the seed list, but NOT on routine pushes.

## Contributing

See `CLAUDE.md` for the exercise-file format spec, tag conventions, common-task recipes, and the **append-only ID-stability rule** (don't insert/delete H3 entries in the middle of a section — it silently shifts every subsequent ID and breaks existing users' progress). PRs that touch `exercises/*.md` should be lint-clean (`npm run lint`) before merging.
