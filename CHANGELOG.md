# Changelog

All notable changes to the CKA practice repository — **webapp, exercise corpus, AND documentation** — are recorded here. New entries land under `## [Unreleased]` until a tagged release.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Categories used:

- **Added** — new features, new exercises, new docs sections
- **Changed** — behavior or wording changes that aren't bug fixes
- **Fixed** — bug fixes
- **Removed** — deleted features, deprecated docs

Each entry references the commit hash in parens for traceability to git history. Root-cause notes / migration details live in commit messages; the changelog stays single-line and user-visible.

## [Unreleased]

### Added
- Browse sidebar gains a custom hover tooltip for section + exercise rows whose label is too long to fit the 280 px column. Replaces the native browser `title=` tooltip with a styled, fixed-positioned, multi-line, max 400 px wide bubble that appears instantly (no 1.5 s native delay) and follows the theme. Auto-flips to the left when the right edge would clip; auto-clamps vertically; hides on scroll / Esc / mouseleave. `aria-label` preserves screen-reader semantics. (this commit)
- EXAM_GUIDE (EN + CN) gains a `## 📅 CKA Exam Changes` chapter covering the current v1.35 curriculum (verbatim per-domain bullets from the official CNCF PDF), the 2025-02-17 v1.32 refresh that introduced today's shape, a side-by-side old-vs-new comparison table, and how to track future changes. Highlights a verifiable finding: v1.32 / v1.33 / v1.34 / v1.35 PDFs are byte-identical (MD5 `d28372581378e1ff3aa49670a9c7781f`) — the CNCF only bumps the version-label to track Kubernetes minors. References [chadmcrowell/CKA-Exercises#cka-changes-2024](https://github.com/chadmcrowell/CKA-Exercises/blob/main/cka-changes-2024/README.md) as inspiration. (this commit)
- 📜 Changelog readable inside Help mode — pick the new `📜 Changelog` pill alongside `📖 Webapp Guide` / `🎯 Study Index`. Bundled into `docs/exercises.json` at build time via the same pipeline as the existing guides. Language switcher hidden for changelog (English-only). Cross-doc `[Changelog](CHANGELOG.md)` links from WEBAPP_GUIDE are intercepted to switch state in-app instead of navigating to a 404 on Pages. (this commit)
- WEBAPP_GUIDE restructured: 🤖 Auto-grading (LLM) and ☁ Cross-device sync (Gist) promoted from sub-sections under `## Settings Panel` to their own top-level sections; long sections gain H3 sub-headings so they're scannable. EN + CN mirror each other. Adds a new `Grader tolerance — what the LLM will NOT mark you down for` subsection and a `🐞 Reporting issues + queue` top-level section. (this commit)
- CHANGELOG.md (this file) — single canonical place for all repo changes; CLAUDE.md mandates entries for every change going forward.
- Nodes mode parity with Tools: in-file filter input at the top of the file detail; mobile master-detail with ← Back button; role-tab switch resets list view. (this commit)
- LLM grader tolerance for unspecified field values + verify-step omissions: the grader treats the task body as canonical and the reference as illustrative — picking a different `metadata.name` / namespace / `kubectl get` omission no longer drops the verdict. ([cc51712], [88787f1])
- Quick Flag scope picker (🐞): click pops a menu — 🔧 Solution / 📝 Task / 🔧📝 Both / 🗑 Unflag all. Button border colour reflects current scope (red / blue / gradient). Available in the answer-box label row in fullscreen mode too. ([04ab81b])
- Issue queue with header 🐛 popover: flagged exercises + draft reports queue together with To-submit / Already-opened groups. `🚀 Open all unsubmitted` batch-opens GitHub issue forms. `submittedAt` tracks which drafts have been filed. ([d8e2ccc])
- Tools detail in-file filter — grep inside the selected 📘 Explain field list or 📋 kubectl -h help text without navigating away. ([03a591b])
- Per-key merge sync engine — concurrent edits across devices now merge losslessly (done/bookmark set union with tombstones, take-newer for answers, schemaVersion 2 payload). ([3d482ed])
- Quiz fullscreen quizbar ☁ icon — opens the sync popover without exiting fullscreen. ([319b51b], later wired correctly by [03a591b] and [04ab81b])

### Changed
- Quiz mode entry shows a landing page (Resume / Snapshots / two quick-start presets + a `▶ Start a new quiz` CTA) instead of dumping the full 9-fieldset configure form. The form is one click away via `▶ Start a new quiz`; quick-start `🎲 10 random` and `🎯 17-question mock` skip the form entirely with sensible defaults. (this commit)
- ☁ Sync popover trimmed to ⬆ Push + ⬇ Pull. Removed redundant 🚀 Push now (functionally identical to Push) ([319b51b]) and Test (now Settings → Sync only — setup-time check, not per-session) ([c19a99f]).
- Settings → 🐛 Issues sub-tab retired; the header 🐛 popover is the single queue entry. ([319b51b])
- Sync popover z-index raised to 1100 so it floats above the fullscreen answer editor (z-index 1000). ([03a591b])
- Quick Flag icon changed from 🚩 to 🐞 to stay visually distinct from the in-quiz 🚩 Flag (mark-question-for-review during a quiz session). ([319b51b])
- CLAUDE.md localStorage table refreshed with new sync keys (`cka:sync:keymeta`, `cka:sync:beaconedAt`, `cka:sync:deviceId`) and fix-draft prefixes; descriptions of existing keys updated for accuracy. ([cc51712])

### Fixed
- Browse search bar input no longer freezes the page on common keywords. Root cause: every keystroke (including Backspace) ran the full renderBrowse pipeline — sidebar tree rebuild + main panel clear + `marked.parse()` per visible card with no caching — synchronously. Queries matching 100+ exercises took 500 ms–2 s of main-thread blocking, which is why the delete key didn't respond. Two fixes layered: (a) 200 ms trailing debounce on the search input so renderBrowse only runs after typing pauses; (b) per-source markdown cache (bounded LRU at 1000 entries) so the same task/solution markdown isn't re-parsed across keystrokes. Cache also benefits Quiz / Docs / Help / Tools / Settings render paths that hit `renderMarkdown` with static content. (this commit)
- `build-and-deploy-docs.yml` workflow's `paths` filter was missing `EXAM_GUIDE.md` / `EXAM_GUIDE_CN.md` / `CHANGELOG.md` — those three markdown files are bundled into `docs/exercises.json` at build time (Help mode reads them), but edits to them didn't trigger a Pages rebuild. Now added; doc-only edits to any of the bundled markdown files trigger a deploy. (this commit)
- Issue Queue mutations (🐞 Quick Flag, 💾 Save draft, 🗑 Remove) now trigger the 30 s auto-push debounce. Previously `setFixDraft` / `setTaskFixDraft` wrote to localStorage + stamped the keymeta side-table but didn't call `markSyncDirty()`, so flags only reached the gist when the user happened to also toggle Done / Bookmark / Answer / quiz state — solo flags never auto-synced. (this commit)
- Task-side 🐞 Quick Flag was silently no-op'ing. `setTaskFixDraft`'s empty-prune check didn't include `payload.flagged`, so `{flagged:true}` stubs got `removeItem`'d immediately after being written. Solution-side flags worked fine; task-side never persisted. (this commit)
- Task-side draft deletion (🗑 Remove on a `task-fix` queue item) didn't stamp a tombstone in keymeta. The merge engine then treated the missing local key as "never seen" and re-adopted the remote copy on next pull — same resurrection class as the earlier solution-side fix in 04ab81b. (this commit)
- Removed queue drafts no longer resurrect after a sync. `mergePayload`'s "other singletons" branch now respects local tombstone timestamps instead of greedily adopting remote whenever local lacked a value. ([04ab81b])
- iPhone "self-conflict" loop where the device's own `beaconPush` triggered a phantom remote-newer-than-baseline detection on next session. `bootAutoSync` now refreshes baseline from gist `updated_at` after a beacon push. ([3d482ed])
- Quiz fullscreen ☁ button click was opening and immediately closing the popover (click bubbled to the document-level dismiss handler). Now opens the popover directly via the closure exposed by `installSyncMenu`, bypassing the unreliable synthetic-click indirection. ([04ab81b])
- kubectl -h help text overflowing the right edge of the Tools drawer card on phones. ([da57e8f])

### Removed
- Stale "What's new" callout block at the top of WEBAPP_GUIDE.md and WEBAPP_GUIDE_CN.md. Feature announcements belong in CHANGELOG.md (readable in Help mode → 📜 Changelog), not duplicated in the usage guide. Replaced with a one-line pointer to Help → 📜 Changelog. (this commit)
- 🚀 Push now button from ☁ Sync popover. ([319b51b])
- Test button from ☁ Sync popover (still available in Settings → Sync). ([c19a99f])
- Settings → 🐛 Issues sub-tab. ([319b51b])

---

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
