# Changelog

All notable changes to the CKA practice repository — **webapp, exercise corpus, AND documentation** — are recorded here. New entries land under `## [Unreleased]` until a tagged release.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Categories used:

- **Added** — new features, new exercises, new docs sections
- **Changed** — behavior or wording changes that aren't bug fixes
- **Fixed** — bug fixes
- **Removed** — deleted features, deprecated docs

Each entry follows the format `- **Lead phrase** — one short sentence describing the change. (\`gitSha\`)` — see CLAUDE.md `## Changelog discipline` for the rules. Root-cause notes, code snippets, and migration details live in commit messages; the changelog stays single-line and user-visible.

## [Unreleased]

### Fixed
- **Help mode → Webapp Guide screenshots no longer overflow the content column** — `.help-body img` gained `max-width: 100%; height: auto; display: block; margin: 14px auto` plus a subtle border + radius + soft shadow so the 2× retina PNGs (3840×1870) scale to fit and read as screenshots instead of flat blocks. Applies to every markdown image inside Help mode, not just WEBAPP_GUIDE. (this commit)
- **Resume button now lands the user directly on the active session** instead of below a still-visible Quiz home — `resumeActiveQuiz` and `resumeSnapshot` were toggling setup/active/summary but missed hiding `#quiz-home`, so the answer card rendered below the resume panel and forced a manual scroll. (this commit)

### Changed
- **Desktop quiz controls now match the mobile structure** — `.quiz-grades` keeps `repeat(3, 1fr)` full-stretch on every viewport (the fd9d3f1 desktop cap to ~180px was reverted), `.quiz-controls` becomes `repeat(5, 1fr)` everywhere (was a desktop flex / mobile grid split), and `.quiz-end-row` is 2-col grid on desktop with the existing single-column stack on `≤768px` phones. (this commit)
- **README screenshots: mobile section removed** — `### Mobile` (3 inline iPhone images) dropped from both `README.md` and `README_CN.md` because the iPhone long-screenshot aspect ratio rendered awkwardly next to the 16:10 desktop captures. The `mobile-*.png` files stay in `assets/screenshots/` for archival use; the `### Desktop` heading also goes away (only one category remained, so the heading was redundant). (this commit)

### Added
- **WEBAPP_GUIDE §2 now opens each mode subsection with a desktop screenshot** — Browse / Quiz / Docs / Tools each gain an inline `![…](assets/screenshots/desktop-*.png)` at the top, and a section preamble points readers at [`assets/screenshots/`](assets/screenshots/) for the full set including iPhone captures. `scripts/build-exercises.mjs` now mirrors `assets/screenshots/desktop-*.png` into `docs/assets/screenshots/` so the SPA Help mode resolves the same relative paths (Pages serves `docs/` only). EN + CN mirrored. (this commit)
- **Updated mobile Quiz screenshots** — `mobile-quiz.png` refreshed and a new `mobile-quiz-home.png` added (Saved-quiz-session card + per-domain progress + quick-start buttons). Both converted from the user's iPhone long-screenshot PDFs via `sips -s format png`; spec table in `assets/screenshots/README.md` lists the new file. (this commit)
- **Real desktop screenshots** in `assets/screenshots/` — `desktop-browse.png` / `desktop-quiz.png` / `desktop-docs.png` replace the 1×1 placeholders, plus a new `desktop-tools.png` showing the kubectl explain schema browser. README + README_CN each get the Tools-mode entry alongside the existing three. (this commit)

### Removed
- **☁ Sync indicator dropped from the fullscreen answer-box quizbar** — clicking it opened the header sync popover, but the popover anchors via `position: absolute` to its `.sync-menu-wrap` parent in the header, which is visually behind the fullscreen overlay. Result: "click does nothing" from the user's POV. Auto-sync runs unchanged; the header ☁ chip is one tap away after exiting fullscreen. (this commit)

## [v0.4.0] - 2026-06-29

### Fixed
- **Modal close `✕` button now visible at rest, not just on hover** — the previous version used transparent background + transparent border with hover-only fill, which on mobile (no hover) read as a tiny floating glyph. Default state now carries `var(--bg-elev)` background + `var(--border)` outline + larger glyph so it reads as a button immediately. (this commit)
- **Modal close `✕` button stays reachable when the user has scrolled** — every overlay's `<header>` is now `position: sticky` at the top of the scrolling card, so the close button no longer scrolls away with the title. Previously a long Settings / Report / Quiz-nav modal required scrolling back to the top to find the close button. (this commit)
- **Modal close `✕` button is a proper 36×36 tap target** with a hover / focus state — was a tiny text-only glyph with no border, easy to mis-tap on phone widths. Applies to every modal sharing the `.overlay-close` class. (this commit)
- **Active LLM provider row showed `★ Active ★ active`** — the previous JS still wrote `★ active` into `.provider-badge.textContent` while the new CSS pill added `★ Active` via `::before`, so both rendered side by side. JS now leaves the badge empty and CSS owns all of the visual. (this commit)

### Changed
- **Fullscreen answer-box quizbar grouped into grade + utility sub-rows** matching the regular Quiz controls — grade buttons (Got it / Partial / Missed) now sit as a 3-column grid above a flex-wrap row of Questions / Prev / Flag / Reveal / Skip / Next / ☁ Sync, instead of one wrappy flex line that scattered grade buttons in the middle. `.grade-partial` gets its amber styling here too; `.is-current` highlight now reflects to fullscreen proxies via `syncQuizGradeButtons`. (this commit)
- **Quiz setup form's Count / Time limit / Order / Solutions groups rebuilt as segmented chips** — each radio is now a styled pill (visible label, hidden `<input>`, `:has(:checked)`-driven blue fill) instead of inconsistent inline labels, and the Order long labels are shortened (`🎲 Random / ↑ Sequential / 🏷 By tag / 📑 By section`) with the full description living in `title=` tooltips. JS read paths unchanged — same radio names/values, same `:checked` selectors. (this commit)
- **▶ Start quiz with an in-progress session now offers `💾 Snapshot & start new`** as a primary action — was a native `confirm()` that only offered Cancel / OK (= discard), forcing the "I want to keep the current session AND open a new one" path to a 5-step detour through Resume → Save snapshot. The new 3-button modal exposes Snapshot / Discard / Cancel directly; the Snapshot path promotes `localStorage[KEY.quizActive]` straight into the snapshots list (auto-named `In-progress — <date>`) without round-tripping through `State.quiz`. (this commit)
- **Settings → LLM provider list interaction unified** — Save is now strictly persist-only (was secretly setting active too), switching the active provider lives on a per-row `⚡ Use` button + a context-aware `⚡ Save & use` action; visual hierarchy redone so Active (gold left bar + ★ Active pill), Configured (small green dot top-right), and Selected-for-editing (subtle outline) are three independent signals that no longer overlap. (this commit)
- **`scripts/release.mjs` no longer seeds an empty 4-heading `[Unreleased]` template** after a release — the fresh block is just the `## [Unreleased]` line. Matches the new "omit empty sub-sections" rule from CLAUDE.md `## Changelog discipline`; the first commit of each kind adds its `### Added / Changed / Fixed / Removed` heading along with its entry. (this commit)

## [v0.3.0] - 2026-06-26

### Added
- **Real iPhone 17 Pro mobile screenshots** in `assets/screenshots/` replace the placeholder PNGs for `mobile-browse` / `mobile-quiz` / `mobile-docs`; desktop placeholders still pending. (`18dfa45`)

### Changed
- **CHANGELOG rewritten for readability** — every historical entry compressed to a bold-lead one-liner; `## Repository conventions` in CLAUDE.md grows a **Documentation language** rule (everything English except `_CN`-suffixed files); `## Changelog discipline` spells out the new entry format. (`2c0bdbd`)
- **README Project Structure refreshed** to include `WEBAPP_GUIDE*`, `CHANGELOG.md`, `assets/screenshots/`, the `tools/` directory, and the full set of `docs/` / `scripts/` / workflow files; points readers at CLAUDE.md for the comprehensive inventory. (this commit)
- **CLAUDE.md adds `Prose concision` rule** under `## Repository conventions` — calibrate doc density to the specific reader's context. (`569bc4c`)
- **CLAUDE.md `## Repository conventions` restructured** into "External standards we follow" (Conventional Commits / SemVer / Keep a Changelog / Google dev docs style / Diátaxis) + repo-specific rules (code-comment WHY-not-WHAT, emoji UI registry); `## Changelog discipline` slimmed by dropping content duplicated from Keep a Changelog. (this commit)
- **Emoji UI registry extended** in CLAUDE.md to cover all mode-tab icons (📚 🎯 📖 ❓ 🔧 🖥) and ⭐ Bookmark; 🔧 explicitly documented as Tools-mode + Tools-drawer sharing the same semantic. Closes the gap surfaced by the docs audit. (`7048267`)
- **Information ownership rebalanced** — Project Structure tree moved out of CLAUDE.md into README's `## Project Structure` (its natural user-facing home); Emoji UI registry moved out of CLAUDE.md into `WEBAPP_GUIDE.md §8 Emoji glossary`; CLAUDE.md keeps short pointers to both. Doc-sync drift between authoritative + duplicated copies eliminated. (this commit)
- **WEBAPP_GUIDE structural cleanup** — §2 renamed "The Three Modes" → "The Modes" (it had 5, missing ❓ Help — added that subsection); §4 Settings Panel split into `### 🤖 LLM / ### 💾 Backup / ### ☁ Sync`; §8 Emoji glossary moved to the end (now §13) so reference data sits past the operational sections; §1-3 and §8-12 gained ## emojis (🚀 Quick Start / 🗂 The Modes / 🎛 Header Controls / 🚢 Release / 💾 Persistence / 🔒 Security / ⌨ Keyboard / 💬 FAQ / 🎨 Emoji glossary) for visual indexing consistency. EN + CN mirrored. (this commit)
- **EXAM_GUIDE §4 LLM grading subsection removed** — duplicated WEBAPP_GUIDE §5; replaced with a one-line pointer to keep EXAM_GUIDE focused on exam-prep content. EN + CN mirrored. (this commit)
- **CLAUDE.md `Things to be aware of` + `Out of scope`** merged under a single `## Notes` heading with two `###` subsections; `## When Adding or Editing Solutions` demoted into `## Common Tasks` as the `### Solution editing checklist` subsection; `## Release workflow` first inline paragraph promoted to `### Cutting a release` for visual parity with its existing `###` siblings (`### Release vs Deploy`, `### One-time setup: PAT`). Added a sentence to Release workflow clarifying the SemVer `+dev.N` build-metadata semantic. (this commit)
- **WEBAPP_GUIDE §10 (now §9) Persistence Model** orphaned `### What happens on a GitHub Pages update` flattened to inline `**…**` paragraph emphasis (its parent section had no other `###` siblings, so an isolated subsection broke the visual rhythm). EN + CN mirrored. (this commit)
- **Help-mode TOC sidebar rebuilt as proper nested `<ul>`** — each h2's child h3 entries now live inside a child `<ul>`, and the parent/child distinction renders via a single continuous left guide line spanning all h3 siblings (was per-h3 disconnected stubs). (this commit)
- **CLAUDE.md `## Changelog discipline` tightened** — explicit rules added: one heading per category per release (don't append a second `### Changed`), and omit empty category sub-sections (don't leave a placeholder `### Removed` if there's nothing to remove). (this commit)

### Fixed
- **Refresh button now reliably updates the iOS PWA standalone-mode shell** — user reported the same chip version showed up but rendered with the previous deploy's bytes (broken stripEmoji + missing `&`) inside the PWA, while Safari browser was clean. Root cause: iOS PWA standalone mode does not honour `self.skipWaiting()` from inside the SW install handler — a freshly-installed SW stays in the `waiting` state and the old SW keeps serving its cached shell. Page-side fix: `manualRefresh` now explicitly `postMessage({type:'SKIP_WAITING'})` to any waiting SW + awaits `controllerchange` (capped at 2s) before reloading. SW gains a corresponding `'message'` listener that calls `self.skipWaiting()` on demand. (this commit)
- **Shell asset cache reliability after a fresh deploy** — `style.css` / `app.js` / `sync.js` / `llm.js` would occasionally stay pinned to the previous deploy's bytes after the version chip already flipped, because the service worker's precache fetched from the same path the CDN was still serving cached. Precache now appends `?v=<build>` to each shell URL so the CDN edge is forced to revalidate, while the cache key stays on the bare path so the runtime cache-first lookup still hits. (this commit)
- **Help-mode TOC h2/h3 hierarchy is now visually clear** — h3 entries indent 26px under their h2 (was 14px, which made them visually flush with the h2 emoji), get a `1px` left guide line, and render in muted color. h2 entries gain a `font-weight: 600` so the parent/child distinction is unambiguous at a glance. (this commit)
- **CHANGELOG entries cleaned** to comply with `## Changelog discipline` — fixed double-parens around one commit hash, compressed the two entries that exceeded ~180 chars (over-prescriptive kind, back-to-top fix) to one-sentence form. (this commit)

### Removed
- **Placeholder explainer note** stripped from README + README_CN (`> Images at assets/screenshots/ are 1×1 placeholders…`) and the `## Replacing a placeholder` boilerplate section from `assets/screenshots/README.md` — both fell into the kind of obvious-step padding the new Prose concision rule now forbids. (this commit)

## [v0.2.0] - 2026-06-26

### Added
- **Screenshots section in README** — desktop + mobile (iPhone 17 Pro) shots under `assets/screenshots/`, EN + CN.
- **Quiz `◐ Partial` grade button** — third manual grade matching LLM Check's three-way verdict; doesn't toggle Done.
- **Current-grade highlight in Quiz** — Got it / Partial / Missed button visibly fills to match the question's current status.
- **Floating back-to-top button** in Browse mode — bottom-right, scrollY-threshold + idle-hide.
- **Auto-detect new SPA deploys** — 5-min interval + visibilitychange head-check surfaces the existing update banner without a manual 🔄.
- **Inline "What this means / Suggested fix" panel** in the report modal, live-updated as the issue-type radio changes.
- **New solution-fix kind `over-prescriptive`** — flags "task didn't ask for this, reference picked one anyway" (sandra cluster example); seeds label + aider prompt + auto-detect. (`75feed3`)
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
- **Back-to-top button** — appears in Browse after ~150px scroll, idle-hides ~2s after stop via scrollTop polling.
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

[v0.4.0]: https://github.com/xooooooooox/cka-exercises/compare/v0.3.0...v0.4.0
[v0.3.0]: https://github.com/xooooooooox/cka-exercises/compare/v0.2.0...v0.3.0
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
