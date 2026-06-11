# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CKA (Certified Kubernetes Administrator) exam preparation, based on [CKA Curriculum v1.35](https://github.com/cncf/curriculum). Originally sourced from [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises), then reorganized by exam curriculum structure and substantially enriched with: kubernetes.io documentation breadcrumbs on every exercise, past-exam questions, the killer.sh Simulator A & B questions (PDF source in `assets/`), and a static SPA in `docs/` that surfaces all of this with browse / quiz / docs-tree modes.

Currently 205 exercises across 5 domains. The repo has a small Node-based build pipeline that compiles the markdown into `docs/exercises.json` (consumed by the SPA at runtime), but **no runtime dependencies** — Marked.js loads from CDN.

## Repository Layout

```
.
├── CLAUDE.md
├── README.md / README_CN.md            # engineering README (corpus + build + CI)
├── EXAM_GUIDE.md / EXAM_GUIDE_CN.md    # study index for CKA exam takers
├── package.json                        # npm run build / serve / preserve / lint / link-check
├── assets/                             # killer.sh Simulator A/B PDFs
├── exercises/                          # 5 markdown files, one per curriculum domain
│   ├── cluster-architecture.md         # 25% — 100 exercises
│   ├── scheduling.md                   # 15% —  39 exercises
│   ├── networking.md                   # 20% —  24 exercises
│   ├── storage.md                      # 10% —  18 exercises
│   └── troubleshooting.md              # 30% —  24 exercises
├── docs/                               # GitHub Pages source (the SPA)
│   ├── index.html
│   ├── app.js                          # ~1400 LOC, no framework
│   ├── llm.js                          # LLM-as-judge grading (Anthropic / OpenAI / DeepSeek / Ollama)
│   ├── style.css                       # light/dark theme + print, ~1000 LOC
│   └── exercises.json                  # gitignored — generated artifact
├── scripts/
│   ├── build-exercises.mjs             # MD → JSON build (used by CI)
│   ├── lint-exercises.mjs              # exercise-format linter (used by CI)
│   ├── check-links.mjs                 # kubernetes.io URL ping (used by weekly CI)
│   ├── apply-enriched-tasks.mjs        # one-shot: killer.sh task-body enrichment
│   ├── apply-killersh-polish.mjs       # one-shot: docs hints + title rewrites
│   └── k8s-docs-map.json               # kubernetes.io breadcrumb → URL lookup
└── .github/workflows/
    ├── build-and-deploy-docs.yml       # CI: lint + build + deploy to Pages
    ├── lint.yml                        # PR-check: lint exercises markdown
    └── link-check.yml                  # weekly: ping every kubernetes.io URL
```

`build-exercises.mjs`, `lint-exercises.mjs`, and `check-links.mjs` run in CI. The two `apply-*.mjs` scripts are idempotent one-shots kept for provenance.

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

### Section structure (H2)

- `## 考试大纲考点` — exam-topic checklist for the domain (skipped by parser)
- `## <N>. <Section title>` — numbered curriculum sub-section with `## 1.` … `## N.`
- `## Killer.sh Mock Exam Questions` — special last section housing killer.sh entries (`sectionNumber = 99`)

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

### Tag identifier rename

Tags were renamed from Chinese (`CKA 真题`, `4分`) to English (`CKA Past Exam`, `4 pts`) for consistency. The `extractPoints()` regex still matches both forms for safety — but new entries should use the English form.

## SPA (`docs/`)

Three top-level modes (tabs in the header):

- **📚 Browse** — sidebar tree (domain → section → exercise), filter bar (domain, tag, search, bookmarks, undone, reveal-solutions toggle), exercise cards with task/solution markdown rendered via Marked.js, per-card Done/Bookmark, code-block Copy buttons.
- **🎯 Quiz** — pre-quiz form (source filters + count + time limit + solution-visibility policy), active session with sticky countdown timer + prev/next/flag/skip/grade controls, end-of-session summary.
- **📖 Docs** — two-pane: left = multi-level collapsible tree mirroring kubernetes.io navigation, built from breadcrumbs at runtime; right = selected page detail with breadcrumb, link-out, and the list of exercises referencing it.

State management is in module-scope `State` object; no framework. Persistence via `localStorage`:

| Key              | Purpose                                            |
|------------------|----------------------------------------------------|
| `cka:done`       | `{ exerciseId: true }` — Done checkboxes           |
| `cka:bookmark`   | `{ exerciseId: true }` — ⭐ bookmarks              |
| `cka:theme`      | `"light" | "dark"`                                  |
| `cka:lastQuiz`   | last quiz settings (count, time, source filters)   |
| `cka:docs:lastUrl` | last-selected leaf in Docs tab (auto-restore)    |
| `cka:llm:settings` | LLM grading config (provider, apiKey, model, baseUrl, autoDoneThreshold) |
| `cka:llm:privacyAck` | `true` after the first-use privacy dialog dismissal |
| `cka:answer:<id>` | per-exercise saved answer + last verdict          |

## Content Conventions

- **Solution code**: kubectl-driven, exam-focused. Use the `k` alias shorthand. Include short comments at decision points.
- **Bilingual content**: English titles + solutions. The CN README and a few in-exercise comments may be Chinese (legacy from corpus origin), but new content should default to English. The webapp itself is English.
- **Documentation links**: use the full kubernetes.io navigation breadcrumb as the label (e.g. `Tasks > Administer a Cluster > Operating etcd clusters for Kubernetes`). For killer.sh entries, additional breadcrumbs follow under the primary 🔗 link.
- **Solutions** are wrapped in `<details><summary>show</summary><p>…</p></details>`. Multiple `<details>` blocks per exercise (rare) are allowed.
- **External links** (helm.sh, gateway-api.sigs.k8s.io, containerd docs) live under the synthetic `External` bucket in the Docs tree.

## Common Tasks

### Adding a new exercise

1. Choose the right markdown file by curriculum domain.
2. Choose the right H2 section (numbered curriculum sub-section, NOT the killer.sh section).
3. Add a new H3 block following the format above. Include at least one `> 🔗 [breadcrumb](url)` line.
4. Run `npm run build` to regenerate `docs/exercises.json`.
5. Run `npm run serve` to preview locally.

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
- The killer.sh PDFs in `assets/` are user-provided after CKA registration — they ship with the repo for now but might be removed if licensing concerns arise.
- Killercoda's `sachin/CKA` course is referenced from the README but its content requires login and isn't reproducible here.

## Out of scope

- Hosting kubernetes.io article content (we only link out).
- Verifying that documentation links return 200 (no broken-link checker yet — would be a good addition).
- Spaced-repetition / Anki export (suggested in TODOs but not implemented).
- Mobile-native app (the SPA is mobile-responsive but not a native shell).
