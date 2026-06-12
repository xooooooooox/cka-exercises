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

### 📲 Install as an app

The webapp is a basic PWA — you can install it as a real app icon on iPhone and Mac.

- **iPhone (Safari):** open the URL → tap Share → **Add to Home Screen** → name → Add. Tap the new icon to launch into a full-screen window (no Safari chrome).
- **Mac (Safari 17+ on macOS Sonoma+):** open the URL → menu **File → Add to Dock** → Add. The app appears in your Dock and Launchpad, opens in its own window.

The installed app is **online-only** (it still fetches `index.html` + `exercises.json` on each launch) but otherwise behaves identically: progress, bookmarks, saved answers, LLM grading, and ☁ Gist sync all work the same. Each install is its own browser profile, so progress on Mac and iPhone is **separate** unless you Push / Pull via Gist.

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
- **Order:** 🎲 Random (default — uniform shuffle), ↑ Sequential (by question number, source order), 🏷 By source tag, 📑 By section. *By tag* and *By section* both pick a uniform **random sample of N** first, then **sort the sample** so the questions appear grouped by tag (general → past exam → killer.sh A → B) or by section (§1 → §2 → …). That way each tag/section is represented proportionally — you don't get all N questions from the first group.
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
| **💾 Save snapshot** | Stash this whole quiz under a name so you can resume it later. The active slot becomes empty so you can start a new quiz; the snapshot appears on the setup screen. |
| **⏹ End session** | Stop the quiz immediately. You'll see the summary for whatever you completed so far. |

**Resume & snapshots.** Every action in an active quiz auto-saves to `localStorage`. If you accidentally close the tab or reload, you'll see a ⏸ banner at the top of the Quiz setup screen offering **▶ Resume** or **✕ Discard**. The 🎯 Quiz tab also shows a small ● dot whenever a saved session exists. Need to keep multiple quizzes side-by-side? Click **💾 Save snapshot** during a session — name it, and it lives under the **💾 Snapshots** list on the setup screen until you Resume or delete it.

**Summary screen** — shows total / got / missed / skipped / flagged, with a per-question list. Click **▶ New quiz** to restart.

> Quiz grading is **self-graded** — your honesty drives the stats. The LLM grader (see Settings) is independent and works in Browse mode on the per-card **✓ Check** button.

### 📖 Docs

Mirror of the kubernetes.io documentation tree, reverse-indexed against the exercise corpus.

- Browse the docs hierarchy on the left.
- Click any docs page → see the kubernetes.io content rendered inline, plus a list of exercises that drill it.
- Useful for **the other direction**: "I want to drill ConfigMaps — where are the questions?"

### 🔧 Tools

Two reference tools that mirror what you reach for in the real exam terminal — bundled into the SPA so they work offline once loaded.

- **📘 Explain** — a `kubectl explain` schema browser. Pick a kind on the left (Pod, Deployment, Service, …) and the right pane shows `KIND / VERSION / DESCRIPTION / FIELDS` exactly like the CLI. Click any field that references a sub-schema to drill in (`Pod → spec → containers → resources → limits`). Use the breadcrumb to walk back up. Search box on the left filters by kind name or by any field name reachable from a kind ("affinity" finds Pod, Deployment, …).
- **📋 kubectl -h** — the **verbatim** `kubectl <verb> -h` output for every kubectl subcommand (~80 of them, including `kubectl create deployment`, `kubectl set image`, `kubectl rollout undo`, …). Identical to what you'd see in the exam shell, rendered monospace. A **📋 Copy** button on top copies `kubectl <cmd>` to your clipboard.

**Version dropdown.** The Tools subtab strip has a `Version` `<select>` for choosing the Kubernetes minor — defaults to **v1.35** (the current CKA exam target). The bundle ships **the two latest stable minors + always v1.35**, so today that's v1.35 + v1.34; once k8s v1.36 ships, the list rolls forward to v1.36 + v1.35. Your selection is sticky across reloads via `cka:tools:version`. Each version's bundle is fetched lazily on first selection.

The content for each version is pre-built at deploy time from the pinned Kubernetes release and kubectl binary. Each bundle is ~580KB raw / ~110KB gzipped, lazy-loaded only when you first open the Tools tab and again when you switch versions — no impact on initial page load.

### 🖥 Nodes

The exam runs on a kubeadm-installed cluster. The 🖥 Nodes tab ships a curated read-only snapshot of the filesystem from a canonical CP + worker so you can practice "where is this file?" / "what's in the static pod manifest?" / "what flag does kubelet read?" without an actual cluster.

- **Subtabs:** **👑 Control plane** (~15 files: `/etc/kubernetes/manifests/*`, `admin.conf` / `super-admin.conf` / `*.conf`, `pki` listing, kubelet config + service unit, containerd, CNI) and **🛠 Worker** (~7 files: kubelet config, worker `kubelet.conf`, only `ca.crt` in `pki/`, containerd, CNI).
- **Tree on the left**, file content on the right with a **📋 Copy** button. Search filter narrows by path (e.g. `kube-apiserver`, `kubelet`, `containerd`).
- **Version dropdown** shares state with the Tools tab via `cka:tools:version` — switching version in either tab updates the other. Image tags in static pod manifests (`registry.k8s.io/kube-apiserver:v1.35.5`) are templated per minor.
- **Redaction:** no real private keys, tokens, or base64 secret payloads are bundled — sensitive bytes are replaced with the `LS0tLS1CRUdJTiBSRURBQ1RFRC1...` sentinel so the format is unambiguous but nothing leaks.
- **Read-only.** This is not a simulator — you can't edit, can't `kubectl apply`, can't drain a node. It's a reference for "what does the canonical file look like" only.

Bundle size is ~30KB per version, lazy-loaded only when you first open the Nodes tab.

---

## 3. Header Controls

| Control | Purpose |
|---|---|
| Mode tabs (📚 / 🎯 / 📖 / ❓ / 🔧 / 🖥) | Switch between Browse, Quiz, Docs, Help, Tools, Nodes. **On mobile (≤768px) the tabs move to a fixed bar at the bottom of the screen** (iOS-PWA style) so the top header stays uncluttered. |
| Search box | Free-text filter (Browse mode) |
| ⏱ Timer | Live countdown during a timed quiz |
| ☁ Sync | Quick Gist Push / Pull / Test popover (uses the same PAT + Gist ID configured in Settings) |
| 🔄 Refresh | Force-reload the latest deployment from the server — useful on iOS PWA standalone, where the app otherwise caches aggressively until you force-quit. A small "✨ New content available" banner also auto-appears at the bottom whenever a newer deploy is detected (compared against a tiny `version.json` fetched fresh on each launch). |
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
6. **Save** persists. **🧽 Clear this provider** wipes just the current radio's slot; **🗑 Clear all** drops every provider's saved config. Your progress is never affected.

**Per-provider memory.** Each provider's API key, model, baseUrl, and last-tested model list are stored **separately**. Clicking another provider radio swaps the **form view** to that provider's saved config — so switching from DeepSeek to OpenAI doesn't overwrite your DeepSeek key. The provider header shows "N of 6 configured" at a glance; configured providers get a green ✓ badge, and the currently active one gets a blue ★.

**Two ways to make a provider active for grading:**
1. **💾 Save & set as active** — writes the form into the currently-selected provider's slot AND makes that provider active. The status line confirms which provider just became active.
2. **Use** — a small pill that appears on any configured-but-not-active provider card. One click activates that provider without going through Save. Use this when you've already got two providers configured and just want to swap which one grades.

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
| `cka:quiz:active` | Auto-saved in-progress quiz (one slot) — auto-cleared on finish |
| `cka:quiz:snapshots` | Named snapshots list (each is an independent saved quiz session) |
| `cka:quiz:lastOrder` | Last-used quiz Order — `"random"` / `"sequential"` / `"tag"` / `"section"` (default `random`) |
| `cka:tools:lastSubtab` | `"explain"` or `"kubectl"` — restored on revisit |
| `cka:tools:lastKind` | Last kind opened in Tools › Explain (e.g. `io.k8s.api.core.v1.Pod`) |
| `cka:tools:lastPath` | Current drill path in Explain (e.g. `["spec","containers","resources"]`) |
| `cka:tools:lastCmd` | Last command opened in Tools › kubectl -h (e.g. `"create deployment"`) |
| `cka:tools:version` | Selected kubernetes minor in the Tools / Nodes tabs (e.g. `"1.35"`); default `1.35` when unset |
| `cka:nodes:lastRole` | Active Nodes role — `"controlplane"` or `"worker"` |
| `cka:nodes:lastPath` | Last file opened in Nodes (e.g. `"/etc/kubernetes/manifests/kube-apiserver.yaml"`) |
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
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd> <kbd>6</kbd> | Switch to Browse / Quiz / Docs / Help / Tools / Nodes |
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
