# Screenshots

These files are referenced by the project's top-level
[`README.md`](../../README.md) and [`README_CN.md`](../../README_CN.md).
The committed PNGs are 1×1 transparent placeholders — replace them
with real captures whenever you next have a clean session of the
deployed SPA. The filenames and paths are load-bearing; don't rename
without also updating both README files.

## Capture spec

- **Format**: PNG, no transparency, no rounded-corner masks
- **Desktop viewport**: 1440×900 recommended (resize browser; full
  window capture, not just the viewport tab content)
- **Mobile viewport**: iPhone 17 Pro (CSS 402×874 → native 804×1748 PNG
  at 2× device pixel ratio) is what the currently-committed mobile
  shots use. Any modern iOS Safari capture works — the `<img width="240">`
  in the README normalises the rendered width regardless of source
  resolution.
- **Theme**: light theme by default. If you want one variant per
  device showing dark, add `-dark` to the filename and a second
  reference in the README.
- **State**: live build, real data; no DevTools panels visible. Avoid
  empty-state pages — populate something (a recent answer, an active
  quiz, an expanded docs leaf) so the screenshot conveys the feature
  it's selling.

## What each file should show

| File                 | Surface to capture                                                                           |
|----------------------|----------------------------------------------------------------------------------------------|
| `desktop-browse.png` | Browse mode, sidebar tree + filter bar + several visible exercise cards                      |
| `desktop-quiz.png`   | Quiz mode mid-session: answer editor + LLM verdict card + three-way grade row (Got / Partial / Missed) |
| `desktop-docs.png`   | Docs mode: kubernetes.io navigation tree on the left, leaf detail + reverse-linked exercises on the right |
| `mobile-browse.png`  | Browse on iPhone, fixed bottom mode-tabs row visible                                         |
| `mobile-quiz.png`    | Quiz on iPhone with the `◐ Partial` grade button highlighted (post-Check state)              |
| `mobile-docs.png`    | Docs tree on iPhone, or the `📊 Outline` drawer open                                          |

