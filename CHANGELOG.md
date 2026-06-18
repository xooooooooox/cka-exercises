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
- ☁ Sync popover trimmed to ⬆ Push + ⬇ Pull. Removed redundant 🚀 Push now (functionally identical to Push) ([319b51b]) and Test (now Settings → Sync only — setup-time check, not per-session) ([c19a99f]).
- Settings → 🐛 Issues sub-tab retired; the header 🐛 popover is the single queue entry. ([319b51b])
- Sync popover z-index raised to 1100 so it floats above the fullscreen answer editor (z-index 1000). ([03a591b])
- Quick Flag icon changed from 🚩 to 🐞 to stay visually distinct from the in-quiz 🚩 Flag (mark-question-for-review during a quiz session). ([319b51b])
- CLAUDE.md localStorage table refreshed with new sync keys (`cka:sync:keymeta`, `cka:sync:beaconedAt`, `cka:sync:deviceId`) and fix-draft prefixes; descriptions of existing keys updated for accuracy. ([cc51712])

### Fixed
- Removed queue drafts no longer resurrect after a sync. `mergePayload`'s "other singletons" branch now respects local tombstone timestamps instead of greedily adopting remote whenever local lacked a value. ([04ab81b])
- iPhone "self-conflict" loop where the device's own `beaconPush` triggered a phantom remote-newer-than-baseline detection on next session. `bootAutoSync` now refreshes baseline from gist `updated_at` after a beacon push. ([3d482ed])
- Quiz fullscreen ☁ button click was opening and immediately closing the popover (click bubbled to the document-level dismiss handler). Now opens the popover directly via the closure exposed by `installSyncMenu`, bypassing the unreliable synthetic-click indirection. ([04ab81b])
- kubectl -h help text overflowing the right edge of the Tools drawer card on phones. ([da57e8f])

### Removed
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
