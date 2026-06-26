# Changelog

All notable changes to the CKA practice repository — **webapp, exercise corpus, AND documentation** — are recorded here. New entries land under `## [Unreleased]` until a tagged release.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Categories used:

- **Added** — new features, new exercises, new docs sections
- **Changed** — behavior or wording changes that aren't bug fixes
- **Fixed** — bug fixes
- **Removed** — deleted features, deprecated docs

Each entry follows the format `- **Lead phrase** — one short sentence describing the change. (\`gitSha\`)` — see CLAUDE.md `## Changelog discipline` for the rules. Root-cause notes, code snippets, and migration details live in commit messages; the changelog stays single-line and user-visible.

## [Unreleased]

### Added
- **Real iPhone 17 Pro mobile screenshots** in `assets/screenshots/` replace the placeholder PNGs for `mobile-browse` / `mobile-quiz` / `mobile-docs`; desktop placeholders still pending. (`18dfa45`)

### Changed
- **CHANGELOG rewritten for readability** — every historical entry compressed to a bold-lead one-liner; `## Repository conventions` in CLAUDE.md grows a **Documentation language** rule (everything English except `_CN`-suffixed files); `## Changelog discipline` spells out the new entry format. (this commit)

### Fixed

### Removed

## [v0.2.0] - 2026-06-26

### Added
- **Screenshots section in README** — desktop + mobile (iPhone 17 Pro) shots under `assets/screenshots/`, EN + CN.
- **Quiz `◐ Partial` grade button** — third manual grade matching LLM Check's three-way verdict; doesn't toggle Done.
- **Current-grade highlight in Quiz** — Got it / Partial / Missed button visibly fills to match the question's current status.
- **Floating back-to-top button** in Browse mode — bottom-right, scrollY-threshold + idle-hide.
- **Auto-detect new SPA deploys** — 5-min interval + visibilitychange head-check surfaces the existing update banner without a manual 🔄.
- **Inline "What this means / Suggested fix" panel** in the report modal, live-updated as the issue-type radio changes.
- **New solution-fix kind `over-prescriptive`** — captures "task didn't ask for this, reference picked one anyway" (the sandra cluster example). Adds `kind/over-prescriptive` label + aider prompt + score-based auto-detect. (`75feed3`)
- **Auto-sync `maybeAutoPull()`** — HEAD-checks the gist on boot + visibilitychange-restore so idle tabs catch up to other devices, 5-min throttle. (`0713f4d`)

### Changed
- **Quiz controls regrouped** into three semantic rows (3-col grade / 5-col utility / session) instead of one flat 4-col grid.
- **Issue title format** uses conventional commits and now includes the kind: `[id] solution-fix(over-prescriptive): …`.
- **Additional context label is dynamic** — `(optional)` / `* required` flips with the selected issue type instead of a static parenthetical.
- **SW `controllerchange` no longer silently reloads** — surfaces the existing banner so the user explicitly clicks Refresh.
- **Task-fix labels drop `Task ...` prefix** — modal header already says it.
- **Solution-fix labels drop `Reference ...` prefix** — same rationale.
- **Report radio list JS-generated** from `REPORT_TYPES` / `TASK_REPORT_TYPES` single source of truth.
- **`autoDetectType` strengthened** — score-based pre-classification for over-prescriptive; padded `autoMissedKeywords`.
- **Refresh toast shows version delta** (`v0.1.0+dev.2 → v0.1.0+dev.5`) instead of build timestamps.
- **🐞 flag-scope picker dropped row icons** — 🔧/📝 collided with the fullscreen Tools / Task drawer icons.
- **Footer hidden on mobile** — body rubber-band exposed it under the fixed mode-tabs at random scroll positions.

### Fixed
- **Back-to-top button (multi-iteration fix)** — final form: visible only after scrolling past ~150px in Browse, idle-hides ~2s after stop via scrollTop polling. Earlier attempts misread the scroll container (`#main`, not `window`), set the threshold too high, and didn't handle iOS phantom scroll events.
- **Mode-switch jank** resolved as a side effect of dropping the per-mode-tab rAF chain the original back-to-top install registered.
- **Update-banner mobile layout** — version tokens nowrap (no `v0.1.0` / `+dev` / `17` fragments); banner stacks vertically under 480px. (`404f094`)
- **Task-fix modal hides docs-link fields for non-docs-link types** — `[hidden]` vs `display:flex` CSS specificity tie; wrapped with `:not([hidden])`. (`bf28a10`)
- **Issue queue Write report / Open buttons enabled** — `State.byId` is a `Map`; old code used bracket access (always returned undefined). (`bdd9c1a`)
- **Issue queue scope distinction** — task entries blue, solution entries red, domain label renders (was `[object Object]`). (`dc02a35`)
- **Auto-pull triggers full reload** so already-mounted Browse cards pick up newly-merged verdict / Done / Bookmark. (`cd098e3`)
- **Refresh toast version-delta survives the reload** via sessionStorage handoff. (`66a9a87`)
- **🐞 flag-scope picker exclusive-radio semantics** — clicking `Task` from `Both` now makes task exclusive (was bit-toggle). (`82b8f17`)
- **Service worker cache key includes gitSha** — `cka-shell-v0_1_0_<sha>` invalidates between dev builds; previously stuck on `v0_1_0` forever. (`ea5aa75`)
- **🐞 flag-menu opens beneath its anchor button** — was nailed to viewport top-left; fix measures menu rect after `position:fixed` is applied. (`ea5aa75`)
- **Tools mode includes `kubectl config` subtree + `kubectl options`** — `config` was in the SKIP set, `options` wasn't picked up by `parseChildren`. (`8d38363`)

### Removed

## [v0.1.0] - 2026-06-25

### Added
- **Documentation sync discipline** codified in CLAUDE.md — every code change must touch reference docs in the same commit; triggers enumerated.
- **Release vs dev build distinction** in the SPA version chip — `vX.Y.Z` (clean tag) vs `vX.Y.Z+dev.N` (commits-since-tag, orange).
- **App-Store-style release pipeline** (`scripts/release.mjs` + `release.yml`) — semver-infers bump from `[Unreleased]` block, rewrites CHANGELOG, tags, pushes, files GH Release.
- **Version chip in header** — monospace `vX.Y.Z` pill, click jumps to Help → Changelog.
- **Service worker** brings offline support to the iOS PWA — precache shell, stale-while-revalidate JSON, navigation falls back to cached `index.html`.
- **One-time install-to-home-screen hint** — 8s after first load on non-standalone clients; iOS-specific copy.
- **Sidebar tooltip touch support** — 600ms long-press pops full title on iPhone / iPad.
- **Weekly CNCF curriculum watcher** (`curriculum-watch.yml`) — files a labelled issue when the upstream PDFs drift.
- **Quiz home per-domain proficiency strip** + `🩺 Drill weak spots` quick-start preset.
- **Browse sidebar custom hover tooltip** for clipped section + exercise rows.
- **`## 📅 CKA Exam Changes` chapter** in EXAM_GUIDE (EN + CN) — v1.35 curriculum verbatim + comparison table + tracking notes.
- **📜 Changelog readable in Help mode** — bundled into `exercises.json` at build time, language switcher hidden (EN-only).
- **WEBAPP_GUIDE restructured** — 🤖 LLM grading + ☁ Gist sync + 🐞 Reporting issues promoted to top-level sections; added grader-tolerance subsection.
- **CHANGELOG.md** introduced as the single canonical place for repo changes.
- **Nodes mode parity with Tools** — in-file filter, mobile master-detail with ← Back, role-tab resets list.
- **LLM grader tolerance** for unspecified field values + verify-step omissions. (`cc51712`, `88787f1`)
- **Quick Flag scope picker (🐞)** — Solution / Task / Both / Unflag all, with border-colour scope indicator. (`04ab81b`)
- **Issue queue header popover (🐛)** — flagged exercises + draft reports queue with To-submit / Already-opened groups + bulk-open. (`d8e2ccc`)
- **Tools detail in-file filter** — grep inside the selected Explain field list / kubectl -h text. (`03a591b`)
- **Per-key merge sync engine** — lossless concurrent edits across devices (set union + tombstones + take-newer + schemaVersion 2). (`3d482ed`)
- **Quiz fullscreen quizbar ☁ icon** — opens sync popover without exiting fullscreen. (`319b51b`, `03a591b`, `04ab81b`)

### Changed
- **Reference docs backfilled** to catch up with iterations B / H / C / Release — CLAUDE.md tree + WEBAPP_GUIDE + README all updated.
- **Install-hint banner relocated** from bottom-center to right-bottom + dropped z-index to 90; text region gets `pointer-events: none`.
- **Browse renders incrementally** — cards built once, filter changes flip `cardEl.hidden` (was full DOM rebuild per keystroke, 50-200ms → ~1ms).
- **Quiz landing page** replaces the 9-fieldset configure form by default — Resume / Snapshots / quick-starts + a `▶ Start a new quiz` CTA.
- **☁ Sync popover trimmed** to ⬆ Push + ⬇ Pull only; Push-now and Test removed. (`319b51b`, `c19a99f`)
- **Settings → 🐛 Issues sub-tab retired** — the header 🐛 popover is the single queue entry. (`319b51b`)
- **Sync popover z-index raised** to 1100 so it floats above the fullscreen answer editor. (`03a591b`)
- **Quick Flag icon changed** from 🚩 to 🐞 to stay distinct from the in-quiz 🚩 Flag. (`319b51b`)
- **CLAUDE.md localStorage table refreshed** with new sync keys + fix-draft prefixes. (`cc51712`)

### Fixed
- **Release workflow push to protected `main`** failed with `GH013`; fixed by switching to a fine-grained PAT (`secrets.RELEASE_PAT`) — `github-actions[bot]` doesn't match Role-based bypass entries.
- **Desktop Chrome mode-switch lag** — `renderBrowse()` was rebuilding 271 sidebar buttons every render; now signature-gated via `syncSidebarStateClasses()` (~150ms → ~1ms).
- **`🩺 Drill weak spots` silently no-op'd on desktop Chrome** — replaced hidden-form-input round trip with a direct `startQuizFromConfig(cfg)` entry point.
- **Header popovers (☁ / 🐛 / 🤖) are now mutually exclusive** — removed `stopPropagation` from each toggle so click-outside dismiss handlers can fire.
- **Browse search no longer freezes on common keywords** — 200ms debounce + bounded LRU markdown cache.
- **`build-and-deploy-docs.yml` paths filter** missed EXAM_GUIDE / CHANGELOG — doc-only edits now trigger Pages rebuild.
- **Queue mutations (🐞 / Save draft / 🗑 Remove) trigger auto-push** — `setFixDraft` / `setTaskFixDraft` now call `markSyncDirty()`.
- **Task-side 🐞 Quick Flag persists** — `setTaskFixDraft`'s empty-prune check now respects `payload.flagged`.
- **Task-side draft removal stamps a tombstone** in keymeta — no more resurrection on next pull.
- **Queue draft tombstones honoured in merge** — `mergePayload` respects local tombstone timestamps. (`04ab81b`)
- **iPhone self-conflict loop** — `bootAutoSync` refreshes baseline from gist `updated_at` after a beacon push. (`3d482ed`)
- **Quiz fullscreen ☁ button** no longer opens-and-immediately-closes — direct closure call instead of synthetic click. (`04ab81b`)
- **kubectl -h overflowing the Tools drawer card** on phones. (`da57e8f`)

### Removed
- **Stale "What's new" callout** in WEBAPP_GUIDE — feature announcements live in CHANGELOG / Help → 📜 Changelog now.
- **🚀 Push now** button from ☁ Sync popover. (`319b51b`)
- **Test button** from ☁ Sync popover (still in Settings → Sync). (`c19a99f`)
- **Settings → 🐛 Issues sub-tab.** (`319b51b`)

---

[v0.2.0]: https://github.com/xooooooooox/cka-exercises/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/xooooooooox/cka-exercises/releases/tag/v0.1.0
[da57e8f]: https://github.com/xooooooooox/cka-exercises/commit/da57e8f
[d8e2ccc]: https://github.com/xooooooooox/cka-exercises/commit/d8e2ccc
[cbda07e]: https://github.com/xooooooooox/cka-exercises/commit/cbda07e
[03a591b]: https://github.com/xooooooooox/cka-exercises/commit/03a591b
[c19a99f]: https://github.com/xooooooooox/cka-exercises/commit/c19a99f
[319b51b]: https://github.com/xooooooooox/cka-exercises/commit/319b51b
[cc51712]: https://github.com/xooooooooox/cka-exercises/commit/cc51712
[88787f1]: https://github.com/xooooooooox/cka-exercises/commit/88787f1
[3d482ed]: https://github.com/xooooooooox/cka-exercises/commit/3d482ed
[04ab81b]: https://github.com/xooooooooox/cka-exercises/commit/04ab81b
