# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CKA (Certified Kubernetes Administrator) exam preparation, based on [CKA Curriculum v1.35](https://github.com/cncf/curriculum). Originally sourced from [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises), then reorganized by exam curriculum structure and substantially enriched with: kubernetes.io documentation breadcrumbs on every exercise, past-exam questions, the killer.sh Simulator A & B questions (PDF source in `assets/killer-sh/`), the KillerCoda CKA mock exams (PDF source in `assets/killercoda/`, one per domain), and a static SPA in `docs/` that surfaces all of this with browse / quiz / docs-tree modes.

Currently 271 exercises across 5 domains. The repo has a small Node-based build pipeline that compiles the markdown into `docs/exercises.json` (consumed by the SPA at runtime), but **no runtime dependencies** — Marked.js loads from CDN.

## Repository Layout

```
.
├── CLAUDE.md
├── README.md / README_CN.md            # engineering README (corpus + build + CI)
├── EXAM_GUIDE.md / EXAM_GUIDE_CN.md    # study index for CKA exam takers
├── package.json                        # npm run build / serve / preserve / lint / link-check
├── assets/
│   ├── killer-sh/                      # killer.sh Simulator A/B PDFs
│   └── killercoda/                     # KillerCoda CKA mock exam PDFs (per-domain)
├── exercises/                          # 5 markdown files, one per curriculum domain
│   ├── cluster-architecture.md         # 25% — 114 exercises
│   ├── scheduling.md                   # 15% —  49 exercises
│   ├── networking.md                   # 20% —  32 exercises
│   ├── storage.md                      # 10% —  28 exercises
│   └── troubleshooting.md              # 30% —  48 exercises
├── docs/                               # GitHub Pages source (the SPA)
│   ├── index.html
│   ├── app.js                          # ~1500 LOC, no framework
│   ├── sync.js                         # Gist sync engine (PAT + merge-state machinery)
│   ├── llm.js                          # LLM-as-judge grading (Anthropic / OpenAI / DeepSeek / Ollama)
│   ├── sw.js                           # service worker source (templated; sw.gen.js is the built artifact)
│   ├── style.css                       # light/dark theme + print, ~1100 LOC
│   ├── manifest.webmanifest            # PWA manifest (installable app icon)
│   ├── icons/                          # PWA icons (180/192/512 PNG + maskable + SVG)
│   ├── exercises.json                  # gitignored — generated artifact
│   ├── version.json                    # gitignored — { generatedAt, version, channel, commitsAhead, gitSha }
│   ├── tools-versions.json             # gitignored — Tools manifest (default + per-minor entries)
│   ├── tools-*.json                    # gitignored — per-version Tools bundle
│   ├── nodes-*.json                    # gitignored — per-version Nodes snapshot
│   └── sw.gen.js                       # gitignored — service worker with build version baked in
├── tools/
│   └── nodes/snapshot/                 # source files + versions.json for Nodes mode build
├── scripts/
│   ├── build-exercises.mjs             # MD → exercises.json + version.json (used by CI)
│   ├── build-sw.mjs                    # stamps version into docs/sw.js → docs/sw.gen.js
│   ├── build-tools-bundle.mjs          # orchestrator: per-minor Tools + Nodes bundles
│   ├── build-kubectl-tools.mjs         # low-level: OpenAPI walk + Tools JSON per minor
│   ├── build-kubectl-help.mjs          # low-level: kubectl -h text extraction per minor
│   ├── build-nodes-snapshot.mjs        # Nodes mode: filesystem snapshot per minor
│   ├── lint-exercises.mjs              # exercise-format linter (used by CI)
│   ├── check-links.mjs                 # kubernetes.io URL ping (used by weekly CI)
│   ├── check-curriculum.mjs            # CNCF curriculum PDF drift watcher (used by weekly CI)
│   ├── release.mjs                     # semver bump + CHANGELOG rewrite + tag + GH Release
│   ├── verify-quiz-order.mjs           # ad-hoc verification (quiz ordering invariants)
│   ├── verify-llm-settings.mjs         # ad-hoc verification (LLM settings schema)
│   ├── verify-grader-parse.mjs         # ad-hoc verification (grader parse)
│   ├── apply-enriched-tasks.mjs        # one-shot: killer.sh task-body enrichment
│   ├── apply-killersh-polish.mjs       # one-shot: docs hints + title rewrites
│   ├── apply-killercoda-import.mjs     # one-shot: import KillerCoda PDFs → exercises/*.md
│   ├── k8s-docs-map.json               # kubernetes.io breadcrumb → URL lookup
│   └── answer-fix/                     # aider helpers shared by answer-fix-pr.yml + task-fix-pr.yml
│       ├── extract-context.mjs         # issue body → env + prompt
│       └── h3-range.mjs                # extract / splice a single exercise H3
└── .github/
    ├── answer-fix/prompt.md            # aider prompt for solution-fix issues
    ├── task-fix/prompt.md              # aider prompt for task / docs-fix issues
    └── workflows/
        ├── build-and-deploy-docs.yml   # CI: lint + build + deploy to Pages (push to main)
        ├── lint.yml                    # PR-check: lint exercises markdown
        ├── link-check.yml              # weekly: ping every kubernetes.io URL
        ├── curriculum-watch.yml        # weekly: CNCF curriculum PDF drift watcher
        ├── release.yml                 # manual dispatch: bump version + tag + GH Release
        ├── answer-fix-pr.yml           # manual: answer-fix issue → draft PR (aider)
        ├── task-fix-pr.yml             # manual: task-fix issue → draft PR (aider)
        └── seed-labels.yml             # idempotent label bootstrap (auto on file edit + manual)
```

`build-exercises.mjs`, `build-sw.mjs`, `lint-exercises.mjs`, and `check-links.mjs` run in CI on every push. The three `apply-*.mjs` scripts are idempotent one-shots kept for provenance. `answer-fix-pr.yml` and `task-fix-pr.yml` are manual-dispatch — a maintainer triggers each from the Actions tab against a specific labelled issue. `release.yml` is also manual-dispatch (Actions UI → Release → Run workflow); it owns `package.json.version` + `CHANGELOG.md` → `[vX.Y.Z]` rename + git tag + GH Release. `curriculum-watch.yml` runs weekly (cron) and opens a labelled issue when the upstream CNCF curriculum PDFs drift. `seed-labels.yml` runs once on first deploy and again whenever its own file is edited; it pre-creates the 15 issue labels both fix workflows + the curriculum watcher expect so the SPA's pre-filled `?labels=…` and the auto-opened curriculum issue both resolve at creation time.

The split between `README.md` (engineering) and `EXAM_GUIDE.md` (study index) is intentional: anyone hitting the repo from a code/contribute angle reads README; anyone landing here to study for the CKA exam reads EXAM_GUIDE. Don't move exam-prep content (dotfiles, sync script, practice-lab links, curriculum table) back into README.

## Exercise File Format

Each H3 block in `exercises/*.md` is one exercise. The structure has evolved into a fairly rich, regular shape:

```markdown
### [<TAG>] <Display title>

> 🔗 [<Primary breadcrumb>](<URL>)
> [<Secondary breadcrumb>](<URL>)        # 0+ additional kubernetes.io hints

> 🖥 Solve on: `ssh <hostname>`          # killer.sh only — extracted as `solveOn` field

**Task:**

<Verbatim task prose; supports markdown lists>

> ℹ️ <Info note from PDF>                # rendered as blue info-callout in SPA

**Lab context:**                         # optional — included for killer.sh entries

- <Bullet describing initial state>
- ```yaml
  <Initial file contents the question references>
  ```

<details><summary>show</summary>
<p>

```bash
<Solution commands>
```

</p>
</details>
```

### Tag prefixes

The H3 title's bracketed prefix classifies the entry. Parsed by `classifyTag()` in `scripts/build-exercises.mjs`:

| Prefix in title                       | Internal tag       | Source                               |
|---------------------------------------|--------------------|--------------------------------------|
| (no prefix)                           | `general`          | reorganized from chadmcrowell + new |
| `[CKA Past Exam - <N> pts]`           | `cka-past-exam`    | past-exam collections (19 entries)   |
| `[Killer.sh A-Q<N>]`                  | `killersh-a`       | killer.sh Simulator A PDF (17 entries) |
| `[Killer.sh B-Q<N>]`                  | `killersh-b`       | killer.sh Simulator B PDF (17 entries) |
| `[KillerCoda-Q<N>]`                   | `killercoda`       | KillerCoda CKA mock exam PDFs (one per domain, in `assets/killercoda/`; 66 entries total — source PDFs have gaps in their numbering) |

### Section structure (H2)

- `## 考试大纲考点` — exam-topic checklist for the domain (skipped by parser)
- `## <N>. <Section title>` — numbered curriculum sub-section with `## 1.` … `## N.`
- `## Killer.sh Mock Exam Questions` — special section housing killer.sh entries (`sectionNumber = 99`, `kind = 'killersh'`)
- `## KillerCoda Mock Exam Questions` — same shape for KillerCoda entries (`sectionNumber = 98`, `kind = 'killercoda'`)

## Build Pipeline

### `scripts/build-exercises.mjs`

Pure Node (no deps; built-ins only). For each markdown file:

1. Splits on H2 headings; identifies numbered sections vs. the killer.sh trailing section vs. intro (skipped).
2. Within each section, splits on H3 to get exercises.
3. `parseExercise()` extracts:
   - `docsLinks: [{ text, url }]` — all `[label](url)` matches inside the `> 🔗 …` blockquote and any following `> …` lines (multi-link support).
   - `solveOn` — extracted from `> 🖥 Solve on: \`ssh xxx\`` if present (killer.sh).
   - `task` — markdown between the docs block and first `<details>`. Strips the `> 🖥` line.
   - `solution` — concatenated content of all `<details>` blocks (with `<p>` wrappers stripped). Multiple `<details>` are joined with `---` and named summaries become `**bold**` headings.
   - `tag`, `points`, `displayTitle`, `fullTitle` — derived from the H3 prefix. `points` regex supports both `- N pts` (current) and `- N分` (legacy).
4. After parsing, a post-pass assigns `numberInDomain` (1..N) to each exercise in source order.

Output: `docs/exercises.json`. Gitignored. Regenerated on every `npm run build`, `npm run serve` (via `preserve` hook), and CI deploy.

### `scripts/build-tools-bundle.mjs` (orchestrator) + per-version scripts

The Tools-tab payload is per-kubernetes-minor — one `docs/tools-<minor>.json` per version, plus a tiny `docs/tools-versions.json` manifest. `scripts/build-tools-bundle.mjs` orchestrates the whole pipeline:

1. **Picks minors to build.** Probes `https://dl.k8s.io/release/stable.txt` to learn the latest k8s patch, derives `latest + previous + CKA target (1.35)`, dedupes. Skip the probe with `--minors=1.35,1.34` for local dev / single-version builds.
2. **Downloads each pinned kubectl** to `tools/.bin/kubectl-<minor>` from `dl.k8s.io/release/<patch>/bin/<os>/<arch>/kubectl` (cached across CI runs via `actions/cache@v4`).
3. **Per minor**, invokes the two low-level scripts:
   - `build-kubectl-help.mjs --kubectl=<path> --minor=<X.Y>` — walks `<verb> -h` output via the captured binary, emits `tools/kubectl-help-<minor>.json` (~220KB, ~78 commands).
   - `build-kubectl-tools.mjs --minor=<X.Y>` — fetches OpenAPI from `kubernetes/kubernetes@release-<minor>`, walks the curated `INCLUDED_KINDS` list (32 CKA-relevant resources) plus transitively reachable sub-schemas, merges in the kubectl-help, writes `docs/tools-<minor>.json` (~580KB, budget 800KB). `STOP_AT_REF` blocks `JSONSchemaProps` recursion to keep size in check.
4. **Writes** `docs/tools-versions.json` with `{ default: "1.35", versions: [...] }` — the SPA reads this on first Tools-tab visit to populate the version dropdown and pick the active bundle.

Run locally: `npm run build:tools-bundle` (auto-detects minors) or `npm run build:tools-bundle -- --minors=1.35` (single version). CI runs the orchestrator directly — no `azure/setup-kubectl` step, because the orchestrator handles its own binaries.

Low-level scripts both accept `--minor=X.Y` to emit version-suffixed paths; without `--minor` they use legacy single-version paths (`tools/kubectl-help.json`, `docs/tools.json`) for backwards compatibility, though nothing in the current pipeline uses that mode.

### `scripts/build-nodes-snapshot.mjs`

Produces the read-only filesystem snapshot for the 🖥 Nodes mode tab (kubeadm CP + worker). Reads source files committed under `tools/nodes/snapshot/files/{controlplane,worker}/<actual-fs-path>`, applies `{{KUBE_VERSION_FULL}}` / `{{PAUSE_VERSION}}` / etc. placeholder substitution from `tools/nodes/snapshot/versions.json`, and writes `docs/nodes-<minor>.json` (~30KB, gitignored). Called by `build-tools-bundle.mjs` per minor; manifest entries gain a `nodesFile` field so the SPA can locate each version's payload.

To refresh content (e.g. after a kubeadm template change): edit source files directly, rerun `npm run build:tools-bundle -- --minors=1.35`. See `tools/nodes/snapshot/README.md` for provenance + redaction policy.

### Tag identifier rename

Tags were renamed from Chinese (`CKA 真题`, `4分`) to English (`CKA Past Exam`, `4 pts`) for consistency. The `extractPoints()` regex still matches both forms for safety — but new entries should use the English form.

## SPA (`docs/`)

Three top-level modes (tabs in the header):

- **📚 Browse** — sidebar tree (domain → section → exercise), filter bar (domain, tag, search, bookmarks, undone, reveal-solutions toggle), exercise cards with task/solution markdown rendered via Marked.js, per-card Done/Bookmark, code-block Copy buttons.
- **🎯 Quiz** — pre-quiz form (source filters + count + time limit + solution-visibility policy), active session with sticky countdown timer + prev/next/flag/skip/grade controls, end-of-session summary.
- **📖 Docs** — two-pane: left = multi-level collapsible tree mirroring kubernetes.io navigation, built from breadcrumbs at runtime; right = selected page detail with breadcrumb, link-out, and the list of exercises referencing it.

### CodeMirror via JSPM importmap (DO NOT revert)

The answer-editor's CodeMirror dependencies (state / view / language / commands / lang-yaml / legacy-modes/mode/shell / codemirror / lezer-*) resolve via a `<script type="importmap">` block in `docs/index.html`, served by JSPM (`https://ga.jspm.io/...`). `docs/app.js`'s `loadCodeMirror()` then does bare-specifier dynamic imports (`import('@codemirror/view')` etc.). Every `@codemirror/*` and `@lezer/*` specifier — including the transitive ones loaded inside `basicSetup` — resolves to **exactly one URL**. That's what makes `StreamLanguage.define(shell)`'s tag-identity work correctly and bash syntax highlighting actually appear.

**DO NOT** swap back to esm.sh's `?deps=` cascade — three earlier attempts in this codebase silently produced two `@lezer/highlight` instances, which failed `instanceof` tag checks. The cautionary trail lives in commits `e085d9f` → `ca19cc9` → `5cd5433` → `a5738a7`.

Bash highlighting in the answer editor uses `@codemirror/legacy-modes/mode/shell` + `StreamLanguage.define` from the same importmap. The corpus is bash-heavy (kubectl + openssl + heredocs), so shell mode is the right default — YAML inside heredocs renders as plain text (acceptable trade-off; nested parsing is out of scope).

State management is in module-scope `State` object; no framework. Persistence via `localStorage`:

| Key              | Purpose                                            |
|------------------|----------------------------------------------------|
| `cka:done`       | `{ exerciseId: true }` — Done checkboxes           |
| `cka:bookmark`   | `{ exerciseId: true }` — ⭐ bookmarks              |
| `cka:theme`      | `"light" | "dark"`                                  |
| `cka:lastQuiz`   | last quiz settings (count, time, source filters)   |
| `cka:docs:lastUrl` | last-selected leaf in Docs tab (auto-restore)    |
| `cka:llm:settings` | LLM grading config — v2 per-provider shape (providers + active + autoDoneThreshold) |
| `cka:llm:privacyAck` | `true` after the first-use privacy dialog dismissal |
| `cka:install:dismissed` | `true` after the user dismisses the install-to-home-screen hint banner (suppresses it on future visits) |
| `cka:answer:<id>` | per-exercise saved answer + last verdict (with provider/model/usage pinned at grade-time) |
| `cka:gist:token` | GitHub PAT (never exported, never round-tripped through gist) |
| `cka:gist:id`    | Gist ID used by Push / Pull |
| `cka:sync:meta`  | Per-device sync metadata — last push/pull/test timestamps, lastError, `lastSyncedGistUpdatedAt` (the conflict-detection baseline the per-key merge engine compares remote `updated_at` against) |
| `cka:sync:prepull-backup` | Snapshot taken before any Pull / Import; restorable via the Settings button (integral overwrite via `restoreFromBackup`, distinct from the per-key `mergePayload` path) |
| `cka:sync:autoDisabled` | `true` if the user opted out of auto-push |
| `cka:sync:dirtyAt` | ISO timestamp of last sync-worthy edit; cleared after a successful auto-push. 1 h TTL on boot/visibility-change so stale flags from long-dead sessions don't push surprise edits |
| `cka:sync:keymeta` | Per-key + per-id timestamps powering the merge engine — included in gist payload so devices can resolve "set union for done/bookmark", "take-newer for answers", and tombstone semantics across concurrent edits |
| `cka:sync:beaconedAt` | ISO stamp written after a successful `beforeunload` `beaconPush()`; consumed once on next `bootAutoSync` to refresh `lastSyncedGistUpdatedAt` from the actual current gist `updated_at` (closes the iPhone "self-conflict" loop where the device's own beacon push looked like a remote change next session) |
| `cka:sync:deviceId` | Random UUID minted once per browser profile on first auto-sync; copied into `payload.meta.lastPushDeviceId` for cross-device logging. Excluded from payload otherwise (per-device) |
| `cka:fix-draft:<id>` | Per-exercise answer-fix queued draft — quick flag (`{flagged:true}`) and/or fully-written report payload (`type`, `additional`, etc.). Surfaces in the header 🐛 queue popover; submitted state tracked via optional `submittedAt` |
| `cka:task-fix-draft:<id>` | Same shape as `cka:fix-draft:` but for task-side reports (docs-link / task-body issues). Listed independently in the queue popover |

## Content Conventions

- **Solution code**: kubectl-driven, exam-focused. Use the `k` alias shorthand. Include short comments at decision points.
- **Bilingual content**: English titles + solutions. The CN README and a few in-exercise comments may be Chinese (legacy from corpus origin), but new content should default to English. The webapp itself is English.
- **Documentation links**: use the full kubernetes.io navigation breadcrumb as the label (e.g. `Tasks > Administer a Cluster > Operating etcd clusters for Kubernetes`). For killer.sh entries, additional breadcrumbs follow under the primary 🔗 link.
- **Solutions** are wrapped in `<details><summary>show</summary><p>…</p></details>`. Multiple `<details>` blocks per exercise (rare) are allowed.
- **External links** (helm.sh, gateway-api.sigs.k8s.io, containerd docs) live under the synthetic `External` bucket in the Docs tree.

## Changelog discipline

Every change to this repository — **webapp code (`docs/`), exercise content (`exercises/`), documentation (`README*.md`, `WEBAPP_GUIDE*.md`, `EXAM_GUIDE*.md`, `CHANGELOG.md`, `CLAUDE.md`, this file), and tooling (`scripts/`, `.github/`)** — MUST add an entry under `## [Unreleased]` in `CHANGELOG.md` in the same commit that makes the change.

Categories:

- **Added** — new features, new exercises, new docs sections
- **Changed** — behavior or wording changes that aren't bug fixes
- **Fixed** — bug fixes
- **Removed** — deleted features, deprecated docs

Each entry references the commit hash in parens (`[abc1234]`) so the changelog stays traceable to git history. Reasoning, root-cause analysis, and migration notes belong in the commit message body; the changelog entry stays single-line and user-visible.

When the user asks for a code / doc / exercise change WITHOUT mentioning the changelog, add the entry yourself — same commit. Do NOT wait to be reminded.

Exception: pure cosmetic noise (typo in this file's own commit message, fixing a CHANGELOG entry typo within its own commit) doesn't need a changelog entry.

## Documentation sync discipline

Every change to the codebase MUST also update any documentation that describes the changed behaviour, file structure, or user-facing flow — **in the same commit**. CHANGELOG.md is a per-change log; this rule is about keeping the *reference* docs from going stale.

Triggers (any of these → corresponding doc gets touched in the same commit):

- **Code file added / deleted / renamed** → CLAUDE.md `## Repository Layout` tree.
- **New CI workflow, or workflow scope change** → CLAUDE.md `## Repository Layout` workflows tree AND `## CI / Deployment` section.
- **SPA user-visible feature** (new button, mode, tab, setting, shortcut, banner, popover) → WEBAPP_GUIDE.md + WEBAPP_GUIDE_CN.md.
- **New localStorage key** → CLAUDE.md localStorage table.
- **Build pipeline change** (new build script, package.json scripts, output artifact format) → CLAUDE.md `## Build Pipeline`.
- **Release / version mechanism change** → CLAUDE.md `## Release workflow`.
- **README / WEBAPP_GUIDE / EXAM_GUIDE structural change** (new section, removed section) → CLAUDE.md `## Repository Layout`.

Exception (no doc sync needed):

- Pure refactors / typo fixes / comment edits that change zero observable behaviour and zero files in the layout.
- Test additions whose scope is entirely internal.

When the user asks for a code / exercise change WITHOUT mentioning docs, add the sync yourself — same commit as the code. Don't wait to be reminded; missing the sync makes the next contributor work from stale knowledge.

## Release workflow

The SPA carries an App-Store-style `vX.Y.Z` version label, surfaced in the header chip + the Refresh banner's version delta. The version lives in `package.json.version`; build time (`scripts/build-exercises.mjs`) stamps it into `docs/exercises.json` + `docs/version.json` + the service-worker cache key (`scripts/build-sw.mjs`).

**Cutting a release** (single maintainer, no CI gate beyond a manual trigger):

1. Merge whatever commits the new release should include. Each commit must add a single line under `## [Unreleased]` per the changelog discipline above.
2. Go to the **Actions** tab → **Release** → **Run workflow**. Pick `bump=auto` (recommended) or override with `major` / `minor` / `patch`. `dry_run=true` previews the result without writing files / pushing.
3. The workflow runs `node scripts/release.mjs --bump=…` which:
   - Reads `package.json.version` to know the current version.
   - Parses `CHANGELOG.md`'s `[Unreleased]` block.
   - **Infers the bump kind** from the section composition:
     - v0.x.y phase (current): `### Removed` or any `BREAKING` marker → minor; `### Added` / `### Changed` → minor; only `### Fixed` → patch.
     - v1.x.y+ phase: `### Removed` / BREAKING → major; `### Added` / `### Changed` → minor; only `### Fixed` → patch.
   - Rewrites `CHANGELOG.md`: renames `## [Unreleased]` → `## [vX.Y.Z] - YYYY-MM-DD`, prepends a fresh empty `## [Unreleased]`, appends a compare-link reference at the bottom.
   - Writes the new version into `package.json`.
   - `git commit -m "release: vX.Y.Z"`, annotated `git tag vX.Y.Z` with the release notes as the tag body.
   - Pushes commit + tag to `origin/main`.
   - `gh release create vX.Y.Z --notes-file <release-notes>` files a GitHub Release.
4. The push triggers `build-and-deploy-docs.yml`. The new `vX.Y.Z` lands in `version.json` + the SW cache key.
5. The next visit to the SPA shows the new version chip; clients with a SW already installed get a one-shot reload via `controllerchange`.

**Local dry-run**: `npm run release:dry` (or `node scripts/release.mjs --bump=auto --dry-run`) prints the inferred version + release notes preview without touching files. Useful for sanity-checking the bump kind before clicking the Run workflow button.

**Don't manually edit `package.json.version`** — `scripts/release.mjs` owns that field. If you need a version override (e.g. force a major bump for a single fix that's actually a UX regression), pass `--bump=major` instead.

### Release vs Deploy — they're not the same

- **Deploy** = `build-and-deploy-docs.yml` builds `docs/` and ships it to Pages. Triggered by **every** push to `main` that matches the workflow's `paths` filter (exercise / SPA / doc edits).
- **Release** = `release.yml` (manual dispatch) bumps version + tags + writes a GH Release. Releases also produce a deploy (because the workflow's commit + push lands on main), but only releases are user-facing "vX.Y.Z" snapshots.

To make the difference visible to users, the SPA's header version chip distinguishes the two:

- **Release build** — chip shows `vX.Y.Z` in the default colour. Detected when HEAD is exactly on a `vX.Y.Z` tag AND `package.json.version` matches.
- **Dev build** — chip shows `vX.Y.Z+dev.N` (N = commits since the last release tag) in a subtle orange. Any deploy whose HEAD doesn't sit on a matching release tag.

Both states are written into `docs/version.json` (`channel: "release" | "dev"`, `commitsAhead`, `gitSha`) by `scripts/build-exercises.mjs` via `git describe --tags --abbrev=0` + `git rev-list --count`. **CI MUST checkout with `fetch-depth: 0`** for those git commands to resolve — `build-and-deploy-docs.yml` and `release.yml` both set this.

Practical implication for maintainers: as long as you keep merging changelog-eligible commits into main, deploys go out continuously labelled `vX.Y.Z+dev.N`. When you decide a batch is shippable (semantic milestone, end of a sprint, "I want users on a clean v0.2.0"), run the Release workflow. The next deploy then drops the `+dev.N` suffix and presents the clean release version.

### One-time setup: Repository Rule bypass

The release workflow pushes a `release: vX.Y.Z` commit and tag directly to `main`. If `main` is protected by a Repository Rule (Settings → Rules → Rulesets) that blocks direct pushes, the default `GITHUB_TOKEN` won't have bypass permission and the workflow will fail with `GH013: Cannot update this protected ref`.

Fix it once, in the GitHub UI:

1. **Settings → Rules → Rulesets** — open the ruleset that covers `main`.
2. Find the **Bypass list** section → **Add bypass**.
3. Add **Repository admin** as a bypass actor (and / or **github-actions[bot]** if your UI lets you pick the bot as an explicit Integration entry).
4. Set the mode to **Always** (not "For pull requests only" — release pushes aren't PRs).
5. Save.

After this, the next `Release` workflow run will push successfully. No PAT needed, no workflow YAML change required. Humans still need a PR for ordinary direct pushes — the rule still applies to anyone outside the bypass list.

*Why this is safe enough:* the bypass only kicks in when the workflow runs as `github-actions[bot]` (i.e. the Release action you yourself dispatched from the Actions UI). External actors can't trigger it, and the release script itself only ever writes a single `release: vX.Y.Z` commit + tag — it doesn't have a code-modification capability.

If the bypass is missing, `scripts/release.mjs` detects the failure mode (it greps stderr for `GH013` / `protected ref` / `rule violations`) and prints a one-line hint pointing back to this section.

## Common Tasks

### Adding a new exercise

1. Choose the right markdown file by curriculum domain.
2. Choose the right H2 section (numbered curriculum sub-section, NOT the killer.sh section).
3. **Append the new H3 block at the END of that section** (see ID-stability rule below).
4. Include at least one `> 🔗 [breadcrumb](url)` line.
5. Run `npm run build` to regenerate `docs/exercises.json`.
6. Run `npm run serve` to preview locally.

### ⚠️ ID-stability rule — append-only

Exercise IDs are sequence-based (`ca-1-001`, `sc-99-005`, …) and are computed by `scripts/build-exercises.mjs` from the H3's position within its section. These IDs are the **keys for every user's `localStorage` progress** (Done state, bookmarks, saved answers, last verdict).

**The rule:** when adding a new exercise, **always append it at the END** of its section. Never insert in the middle. Never delete in the middle.

- ✅ Append at end of section → existing IDs unchanged → existing users' progress survives
- ❌ Insert in middle of section → every subsequent ID shifts by +1 → existing users see their Done-marks land on the wrong exercises
- ❌ Delete in middle of section → every subsequent ID shifts by −1 → same silent breakage

If a deletion is genuinely unavoidable, call it out in the commit message so users know to re-mark the affected entries. There is no automatic migration.

Killer.sh exercises go at the end of `## Killer.sh Mock Exam Questions`. CKA Past Exam entries go at the end of their domain section. New "general" exercises append to whichever numbered section they fit.

KillerCoda exercises live in `## KillerCoda Mock Exam Questions` and are typically **bulk-imported** via `scripts/apply-killercoda-import.mjs` from the PDFs in `assets/killercoda/` — not hand-added. If you need to add a single KillerCoda question by hand, follow the same H3 format with the `[KillerCoda-Q<N>]` tag prefix.

### Adding a killer.sh question

1. Use the H3 format `### [Killer.sh A-Q<N>] <topic>: <short verb-phrase>` (mirror existing).
2. Place under `## Killer.sh Mock Exam Questions` at the end of the relevant domain file.
3. Include `> 🖥 Solve on: \`ssh <hostname>\`` immediately after the docs block.
4. Format task body with proper Markdown lists, `> ℹ️` info notes, and an optional `**Lab context:**` block.

### Renaming or restructuring sections

The build script keys off `## <N>. <Title>` and `## Killer.sh Mock Exam Questions` exactly. Don't change those headings without updating the parser.

### Updating the docs lookup table

`scripts/k8s-docs-map.json` maps short page titles to `{ breadcrumb, url }`. Add an entry there and re-run `scripts/apply-killersh-polish.mjs` (or just edit markdown directly).

## When Adding or Editing Solutions

- Always include the kubernetes.io docs link.
- Place exercises under the correct curriculum sub-topic.
- Prefer `kubectl` over editing YAML manifests directly when the command exists.
- Include the imperative + declarative form when both are common (`kubectl create deploy …` and a YAML manifest).
- Keep code blocks compact; long YAML belongs in the solution, not in the task body.

## CI / Deployment

`.github/workflows/build-and-deploy-docs.yml`:
- Triggers on push to `main` if any of `exercises/**`, `docs/**`, `scripts/build-exercises.mjs`, or the workflow itself changes.
- Runs `node scripts/build-exercises.mjs` to regenerate `docs/exercises.json` on the runner.
- Uploads `docs/` as the Pages artifact and deploys.
- `docs/exercises.json` is **not** committed back to the repo (gitignored); each deploy builds fresh.

Pages source must be set to "GitHub Actions" in the repo settings.

## Things to be aware of

- `docs/exercises.json` is **gitignored** (it's a build artifact). Don't commit it.
- The killer.sh PDFs in `assets/killer-sh/` are user-provided after CKA registration; the KillerCoda PDFs in `assets/killercoda/` are similarly sourced. Both ship with the repo for now but might be removed if licensing concerns arise.
- Killercoda's `sachin/CKA` course is referenced from the README but its content requires login and isn't reproducible here.

## Out of scope

- Hosting kubernetes.io article content (we only link out).
- Verifying that documentation links return 200 (no broken-link checker yet — would be a good addition).
- Spaced-repetition / Anki export (suggested in TODOs but not implemented).
- Mobile-native app (the SPA is mobile-responsive but not a native shell).
