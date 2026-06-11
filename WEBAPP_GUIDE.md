# Practice Web App — Usage Guide

[中文版](WEBAPP_GUIDE_CN.md) · [Engineering README](README.md) · [Study Index](EXAM_GUIDE.md)

A 5-minute tour of the static SPA at <https://xooooooooox.github.io/cka-exercises/>: the three modes, every Quiz button, how progress is persisted, how cross-device sync works, and what the privacy / security model actually guarantees.

> **TL;DR.** Pick a mode at the top. Browse to study, Quiz to drill under time pressure, Docs to learn the kubernetes.io tree. Everything you do is saved in your browser's `localStorage` — nothing leaves your machine unless you click **Test / Check** (sends to your chosen LLM provider) or **Push / Pull** (sends to your private GitHub Gist).

---

## 1. Quick Start

1. Open <https://xooooooooox.github.io/cka-exercises/>.
2. Pick a mode in the header: **📚 Browse**, **🎯 Quiz**, or **📖 Docs**.
3. (Optional) Click **⚙️** in the header to set up LLM grading and / or Gist sync.
4. Work through exercises. Progress saves automatically.
5. (Optional) **Export** a JSON backup, or **Push** to a private GitHub Gist for cross-device sync.

Press <kbd>?</kbd> at any time for the keyboard shortcut cheatsheet.

---

## 2. The Three Modes

### 📚 Browse

The default mode. All ~205 exercises in a scrollable list.

- **Search / filter** by free text, domain, tags (`CKA Past Exam` / `Killer.sh A / B` / `General`), bookmarks, or "not yet done".
- Each card has its own **show / hide solution** toggle — expand individual cards without spoiling the rest.
- Mark **✓ Done** and **⭐ Bookmark** per card. The sidebar shows a per-domain progress bar.
- Type into the **✏️ Your answer** box and click **✓ Check** to ask the LLM grader for feedback (requires Settings → LLM grading).

### 🎯 Quiz

Random-draw practice under exam-like conditions.

**Setup screen** — pick:

- Source filters (domain, tags, only bookmarks, only not-yet-done)
- Question count (5 / 10 / 17 full mock / custom up to 500)
- Time limit (none / 30 / 60 / 120 min)
- Solutions visibility (hidden until you click **Reveal**, or always visible)

Click **▶ Start quiz** to begin. The header shows a live timer (if a limit is set).

**Active-session controls** — every button explained:

| Button | What it does |
|---|---|
| **← Prev** | Jump to the previous question. Doesn't change your grading. |
| **🚩 Flag** | Mark this question to revisit. Flagged items are highlighted in the end-of-session summary. |
| **👁 Reveal solution** | Show the reference solution for this question. After Reveal, the **Got it / Missed** buttons become available so you can self-grade. |
| **✓ Got it** | Self-grade: you knew the answer. Also marks the exercise **Done** in your global progress (carried into Browse mode). |
| **✗ Missed** | Self-grade: you didn't get it. Does **not** mark Done — and clears any existing Done flag on this exercise so you'll see it again. |
| **↷ Skip** | Move on without grading. Skipped items appear in the summary as ungraded. |
| **Next →** | Jump to the next question. Doesn't change your grading. |
| **⏹ End session** | Stop the quiz immediately. You'll see the summary for whatever you completed so far. |

**Summary screen** — shows total / got / missed / skipped / flagged, with a per-question list. Click **▶ New quiz** to restart.

> Quiz grading is **self-graded** — your honesty drives the stats. The LLM grader (see Settings) is independent and works in Browse mode on the per-card **✓ Check** button.

### 📖 Docs

Mirror of the kubernetes.io documentation tree, reverse-indexed against the exercise corpus.

- Browse the docs hierarchy on the left.
- Click any docs page → see the kubernetes.io content rendered inline, plus a list of exercises that drill it.
- Useful for **the other direction**: "I want to drill ConfigMaps — where are the questions?"

---

## 3. Header Controls

| Control | Purpose |
|---|---|
| Mode tabs (📚 / 🎯 / 📖 / 📘) | Switch between Browse, Quiz, Docs, Help |
| Search box | Free-text filter (Browse mode) |
| ⏱ Timer | Live countdown during a timed quiz |
| ☁ Sync | Quick Gist Push / Pull / Test popover (uses the same PAT + Gist ID configured in Settings) |
| 🌓 Theme toggle | Light / dark mode (persisted) |
| ⌨️ Help | Keyboard shortcut cheatsheet |
| ⚙️ Settings | LLM grading config, Backup, Gist sync |

---

## 4. ⚙️ Settings Panel

### LLM Grading (optional)

Lets the **✓ Check** button on each Browse card send your answer to an LLM and get back a verdict (Correct / Partial / Not yet), a 0–100 score, what you got right, and what you missed.

1. **Provider** — pick one: Anthropic / OpenAI / DeepSeek / Qwen / Doubao / Ollama (local).
2. **API key** — your provider key (Ollama doesn't need one).
3. **Test** — verifies the key, repopulates the **Model** dropdown with that provider's real model list.
4. **Model** — pick from the live list, or paste a custom model id.
5. **Auto-mark Done at score ≥ N** — when the grader returns a score ≥ this threshold, the exercise is auto-marked Done.
6. **Save** persists. **Clear all** resets LLM settings only (your progress is untouched).

What gets sent on Check: `{ exercise question, reference solution, your answer }`. Sent to your chosen provider's endpoint over HTTPS. **Ollama runs on `localhost`** so nothing leaves your machine.

### Backup & restore

- **⬇ Export progress** — downloads `cka-progress-<timestamp>.json`. Contains: done state, bookmarks, saved answers, theme, last-quiz settings, docs-last-url. **Your LLM API key is scrubbed.**
- **⬆ Import progress…** — pick a previously exported file. After a count-confirm dialog, replaces local state with the file's content (the local API key is preserved if the import doesn't carry one).

### GitHub Gist sync (cross-device)

Same payload as Export/Import, but pushed to / pulled from a private GitHub Gist via the Gist API.

1. Create a Personal Access Token at <https://github.com/settings/tokens?type=beta> with **`gist` scope only** (fine-grained or classic, both work).
2. Paste it into **GitHub PAT** (stored in `localStorage`, never synced).
3. Optionally paste an existing **Gist ID**, or leave blank to create one on first Push.
4. **Test** — pings `/user` to verify the token. Shows `✓ Authenticated as @<your-login>`.
5. **⬆ Push to Gist** — uploads the current state. On first push, the new gist ID auto-fills the ID box.
6. **⬇ Pull from Gist** — downloads from the gist, confirms a counts dialog, then replaces local state.

> Push and Pull are **manual** — no auto-sync. Last-write-wins (no merge). API keys are not synced.

After your PAT is configured here, you can also Push / Pull / Test from the **☁ Sync** icon in the header without re-opening Settings.

---

## 5. Persistence Model

All state is in your browser's `localStorage` under the `cka:` prefix. **Nothing is sent to any server unless you explicitly trigger Check / Test / Push / Pull.** Clearing site data wipes everything (Settings → Clear all does the same for LLM settings only).

Keys you'll see in DevTools:

| Key | What's in it |
|---|---|
| `cka:done` | `{ exerciseId: true, … }` |
| `cka:bookmark` | `{ exerciseId: true, … }` |
| `cka:answer:<exerciseId>` | Saved answer + last LLM verdict per exercise |
| `cka:theme` | `"light"` / `"dark"` |
| `cka:lastQuiz` | Last quiz setup choices (count, time, filters) |
| `cka:docs:lastUrl` | Last opened docs page |
| `cka:llm:settings` | Provider, API key, model, auto-done threshold |
| `cka:llm:privacyAck` | Whether you dismissed the first-use privacy notice |
| `cka:gist:token` | GitHub PAT (never exported, never synced) |
| `cka:gist:id` | Gist ID used by Push / Pull |

Exercise IDs (e.g. `ca-1-005`) are sequence-based per section. Contributors follow an **append-only** rule documented in `CLAUDE.md` so adding new exercises doesn't shift IDs and break existing users' progress.

### What happens on a GitHub Pages update

`docs/exercises.json` may regenerate — but as long as contributors only append, every existing exercise keeps its ID and your Done/Bookmark/Answer state survives.

---

## 6. Security & Privacy

This SPA has **no backend**. Treat it like any other BYO-key web tool.

| Concern | Answer |
|---|---|
| Are users isolated from each other? | Yes — `localStorage` is per-origin **and per-browser-profile**. User A's progress is never visible to User B unless they share the same OS account + browser profile. |
| Where is my API key stored? | In `localStorage`. Plaintext (the browser handles the at-rest encryption, not us). |
| Who can read my API key? | Anyone with code-execution access to your browser profile — same trust boundary as any browser-stored credential. The SPA itself never logs or transmits it except as the `Authorization` header on Check / Test. |
| Does the site track me? | No analytics, no telemetry, no cookies. The only network calls happen when you click Check (→ your LLM provider), Test (→ your LLM provider or GitHub), or Push / Pull (→ GitHub Gist API). |
| Can someone with my screen see my API key? | The key field is `type="password"` — masked by default. But it's stored client-side, so anyone with access to your DevTools / Application tab can read it. |
| Is the Gist private? | The SPA creates **secret** gists (`public: false`). Secret gists aren't listed publicly, but they're not access-controlled — anyone with the URL can read. Don't put sensitive secrets in the synced payload. (API keys aren't synced for exactly this reason.) |
| What goes over the wire? | HTTPS to: your chosen LLM provider (on Check / Test), `api.github.com` (on Push / Pull / Test). Nothing else. |

**If you share a browser profile with someone you don't trust**, use Settings → Clear all when stepping away, or open the site in a private window.

---

## 7. Keyboard Shortcuts

| Key | Action |
|---|---|
| <kbd>j</kbd> / <kbd>↓</kbd> | Next exercise (Browse) / next question (Quiz) |
| <kbd>k</kbd> / <kbd>↑</kbd> | Previous |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> | Switch to Browse / Quiz / Docs / Help |
| <kbd>/</kbd> | Focus the search box |
| <kbd>Space</kbd> | Show / hide solution (focused Browse card) |
| <kbd>d</kbd> | Toggle Done (focused Browse card) |
| <kbd>b</kbd> | Toggle Bookmark (focused Browse card) |
| <kbd>?</kbd> | Toggle the help panel |
| <kbd>Esc</kbd> | Close help / blur search |

Shortcuts are ignored while typing in input fields.

---

## 8. FAQ

**Q. Will my progress survive a deploy?**
Yes. `localStorage` is independent of the site's static assets. As long as contributors follow the append-only ID rule (they do — it's documented in `CLAUDE.md`), every existing exercise keeps its ID.

**Q. I switched browsers / devices — how do I get my progress back?**
Two options: (a) **Export** → copy the JSON file across → **Import** in the new browser. (b) Set up Gist sync on both — **Push** from the old one, paste the gist ID into the new one, **Pull**.

**Q. The LLM Test button hangs forever.**
The grader has a 15s timeout — if it really hangs, the provider likely blocks browser-direct calls (Doubao is the usual suspect). Switch to a CORS-friendly provider (Anthropic / OpenAI / DeepSeek / Ollama).

**Q. Can I sync the API key too?**
No — by design. The Export and Gist Push payloads strip the API key. Add it on each device individually.

**Q. Where do I file a bug / suggest an exercise?**
<https://github.com/xooooooooox/cka-exercises/issues>.
