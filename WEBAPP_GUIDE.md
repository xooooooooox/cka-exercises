# Practice Web App — Usage Guide

[中文版](WEBAPP_GUIDE_CN.md) · [Engineering README](README.md) · [Study Index](EXAM_GUIDE.md)

A 5-minute tour of the static SPA at <https://xooooooooox.github.io/cka-exercises/>: the three modes, every Quiz button, how progress is persisted, how cross-device sync works, and what the privacy / security model actually guarantees.

> **TL;DR.** Pick a mode at the top. Browse to study, Quiz to drill under time pressure, Docs to learn the kubernetes.io tree. Everything you do is saved in your browser's `localStorage` — nothing leaves your machine unless you click **Test / Check** (sends to your chosen LLM provider) or **Push / Pull** (sends to your private GitHub Gist).

> **What's new.**
> - **Streaming grader.** Click ✓ Check and watch the response stream in live with a Cancel button + elapsed-time + char-count display, ending with a 🪙 token-usage line on the verdict.
> - **🤖 LLM quick-switch.** Header popover next to ☁ Sync — one click to switch between configured providers without opening Settings.
> - **GLM provider added.** Zhipu BigModel joins Anthropic / OpenAI / DeepSeek / Qwen / Doubao / Ollama (7 total).
> - **📑 api-resources in Tools.** New third Tools sub-tab — a `kubectl api-resources` lookup table with filter syntax (`namespaced:false`, `verb:patch`, `group:apps`).
> - **Fullscreen quiz controls.** Maximise the answer editor in quiz mode and you now keep Prev / Next / Got / Missed / Skip / Flag / Reveal / 📋 Questions in a sticky strip at the bottom — no exit-fullscreen-to-navigate dance.
> - **💡 Solution drawer.** Even in fullscreen, click 💡 (or Reveal) to see the reference solution in an overlay drawer.
> - **Auto-sync (now with per-key merge).** Configure a Gist and edits auto-push 30 s after you stop changing things. Concurrent edits across devices are merged losslessly — Done / Bookmark unions, answers take-newer by savedAt, tombstones propagate un-marks. No more conflict modals.
> - **Bash syntax highlighting** in the answer editor (was YAML — bash is closer to what you'll type during the exam).

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

The default mode. All ~271 exercises in a scrollable list.

- **Search / filter** by free text, domain, tags (`CKA Past Exam` / `Killer.sh A / B` / `KillerCoda` / `General`), bookmarks, or "not yet done".
- Each card has its own **show / hide solution** toggle — expand individual cards without spoiling the rest.
- Mark **✓ Done** and **⭐ Bookmark** per card. The sidebar shows a per-domain progress bar.
- Type into the **✏️ Your answer** box and click **✓ Check** to ask the LLM grader for feedback (requires Settings → LLM grading). The editor is a real CodeMirror instance (lazy-loaded on first focus) with **bash syntax highlighting** (kubectl / openssl / heredoc keywords coloured correctly; YAML inside `<<EOF` renders as plain text — that's intentional), Tab indent, and a **⛶** button that expands it to fullscreen. In fullscreen the answer-box label row reveals three drawer triggers — **🛠 Tools** (kubectl explain / kubectl -h), **📝 Task** (the task body), **💡 Solution** (the reference solution) — so you can look up syntax or peek at the answer without exiting fullscreen. On mobile the editor uses a 16 px font so iOS Safari doesn't auto-zoom when you tap it.

### 🎯 Quiz

Random-draw practice under exam-like conditions.

**Setup screen** — pick:

- Source filters (domain, tags, only bookmarks, only not-yet-done)
- Question count (5 / 10 / 17 full mock / custom up to 500)
- Time limit (none / 30 / 60 / 120 min)
- **Order:** 🎲 Random (default — uniform shuffle), ↑ Sequential (by question number, source order), 🏷 By source tag, 📑 By section. *By tag* and *By section* both pick a uniform **random sample of N** first, then **sort the sample** so the questions appear grouped by tag (general → past exam → killer.sh A → B → killercoda) or by section (§1 → §2 → …). That way each tag/section is represented proportionally — you don't get all N questions from the first group.
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

**Fullscreen editor + sticky quizbar.** Click **⛶** in the answer box to maximise the editor — useful when the expected answer is a long YAML manifest. While maximised, a sticky strip at the bottom of the overlay surfaces the full quiz nav (**📋 Questions / ← Prev / 🚩 Flag / 👁 Reveal / ✓ Got it / ✗ Missed / ↷ Skip / Next →**) so you don't have to exit fullscreen to navigate or grade. Clicking 👁 Reveal also pops the **💡 Solution** drawer above the editor at the same time so the reference solution is reachable without exiting. Prev/Next preserve the fullscreen state, so you can sprint through a session without leaving the maximised view.

**Resume & snapshots.** Every action in an active quiz auto-saves to `localStorage`. If you accidentally close the tab or reload, you'll see a ⏸ banner at the top of the Quiz setup screen offering **▶ Resume** or **✕ Discard**. The 🎯 Quiz tab also shows a small ● dot whenever a saved session exists. Need to keep multiple quizzes side-by-side? Click **💾 Save snapshot** during a session — name it, and it lives under the **💾 Snapshots** list on the setup screen until you Resume or delete it.

**Summary screen** — shows total / got / missed / skipped / flagged, with a per-question list. Click **▶ New quiz** to restart.

> Quiz grading is **self-graded** — your honesty drives the stats. The LLM grader (see Settings) is independent and works in Browse mode on the per-card **✓ Check** button.

### 📖 Docs

Mirror of the kubernetes.io documentation tree, reverse-indexed against the exercise corpus.

- Browse the docs hierarchy on the left.
- Click any docs page → see the kubernetes.io content rendered inline, plus a list of exercises that drill it.
- Useful for **the other direction**: "I want to drill ConfigMaps — where are the questions?"

### 🔧 Tools

Three reference tools that mirror what you reach for in the real exam terminal — bundled into the SPA so they work offline once loaded.

- **📘 Explain** — a `kubectl explain` schema browser. Pick a kind on the left (Pod, Deployment, Service, …) and the right pane shows `KIND / VERSION / DESCRIPTION / FIELDS` exactly like the CLI. Click any field that references a sub-schema to drill in (`Pod → spec → containers → resources → limits`). Use the breadcrumb to walk back up. Search box on the left filters by kind name or by any field name reachable from a kind ("affinity" finds Pod, Deployment, …).
- **📋 kubectl -h** — the **verbatim** `kubectl <verb> -h` output for every kubectl subcommand (~80 of them, including `kubectl create deployment`, `kubectl set image`, `kubectl rollout undo`, …). Identical to what you'd see in the exam shell, rendered monospace. A **📋 Copy** button on top copies `kubectl <cmd>` to your clipboard.
- **Mobile (≤600 px) + in-drawer**: 📘 Explain and 📋 kubectl -h use a master-detail flow — you see the full-width list first, tap an entry, the detail fills the panel with a `← Back` button at the top. Tap Back to return to the list (focus jumps back to the search input). Desktop side-by-side is unchanged.
- **📑 api-resources** — a lookup table mirroring `kubectl api-resources -o wide` for the 40 CKA-relevant kinds. Columns: **NAME** (plural) / **SHORTNAMES** / **APIVERSION** / **NAMESPACED** / **KIND** / **VERBS**. The filter box accepts plain text on any column (`hpa`, `rbac`, `ingress`) and three prefix tokens: `namespaced:true|false` (cluster-scoped vs namespaced), `verb:<name>` (e.g. `verb:patch`), `group:<name>` (e.g. `group:apps` to narrow to Deployment / DaemonSet / ReplicaSet / StatefulSet). Click any row to jump straight into 📘 Explain for that kind's full schema — so api-resources is the index and Explain is the detail, mirroring how `kubectl api-resources` and `kubectl explain` relate in the CLI. On phones (≤600 px) the table collapses to stacked cards so the long VERBS CSV doesn't force horizontal scrolling.

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
| 🤖 LLM | Quick provider switch — popover lists every provider you've configured (with API key) and shows the active one ✓-marked. One click flips the active provider without opening Settings. The "Using X (Y)" hint on every answer-box refreshes in place. |
| 🔄 Refresh | Force-reload the latest deployment from the server — useful on iOS PWA standalone, where the app otherwise caches aggressively until you force-quit. A small "✨ New content available" banner also auto-appears at the bottom whenever a newer deploy is detected (compared against a tiny `version.json` fetched fresh on each launch). |
| 🌓 Theme toggle | Light / dark mode (persisted) |
| ⌨️ Help | Keyboard shortcut cheatsheet |
| ⚙️ Settings | LLM provider config, Backup, Gist sync |

---

## 4. ⚙️ Settings Panel

The dialog is split into three subtabs: **🤖 LLM**, **💾 Backup**, **☁ Sync**. Only one is visible at a time so the dialog stays compact — no big scrollbar. The last-opened tab is remembered via `cka:settings:lastTab` so the dialog re-opens where you left off.

### 🤖 LLM (optional grading)

Lets the **✓ Check** button on each Browse card send your answer to an LLM and get back a verdict (Correct / Partial / Not yet), a 0–100 score, what you got right, and what you missed.

1. **Provider** — pick one: Anthropic / OpenAI / DeepSeek / Qwen / Doubao / **GLM** (Zhipu BigModel) / Ollama (local). Seven providers.
2. **API key** — your provider key (Ollama doesn't need one).
3. **Test** — verifies the key, repopulates the **Model** dropdown with that provider's real model list.
4. **Model** — pick from the live list, or paste a custom model id.
5. **Auto-mark Done at score ≥ N** — when the grader returns a score ≥ this threshold, the exercise is auto-marked Done.
6. **Save** persists. **🧽 Clear this provider** wipes just the current radio's slot; **🗑 Clear all** drops every provider's saved config. Your progress is never affected.

**Per-provider memory.** Each provider's API key, model, baseUrl, and last-tested model list are stored **separately**. Clicking another provider radio swaps the **form view** to that provider's saved config — so switching from DeepSeek to OpenAI doesn't overwrite your DeepSeek key. The provider header shows "N of 7 configured" at a glance; configured providers get a green ✓ badge, and the currently active one gets a blue ★.

**How to make a provider active for grading:** click the provider's radio button (the form view swaps to that provider's saved API key + model), then click **💾 Save & set as active** — writes the form into the currently-selected provider's slot AND makes that provider active. The status line confirms which provider just became active. Once two or more providers are configured, the header **🤖 LLM** popover gives you one-click switching without re-opening Settings.

**Streaming Check + Cancel.** Clicking **✓ Check** kicks off a streaming grade — the button itself transforms into **✗ Cancel** with a live `(Xs · N chars)` counter, and a dashed-bordered preview card appears in the answer box showing the raw response tail as it streams in. When the stream finishes, the header briefly reads **🧠 Parsing verdict…** before the parsed Got-right / Missed verdict replaces the preview. Click Cancel any time to abort — you get a `✗ Cancelled after Xs · N chars received` line, no half-graded state. Works on every provider including Ollama.

**🪙 Token usage.** Once a grade lands, the verdict card includes a one-line breakdown: `🪙 anthropic · claude-opus-4-7 · in 1,247 + out 567 = 1,814 tokens`. The provider/model pair is pinned at grade-time so the line stays accurate later, even if you switch active providers via the 🤖 popover. Ollama (local) shows `🪙 Local model — no token accounting` instead.

What gets sent on Check: `{ exercise question, reference solution, your answer }`. Sent to your chosen provider's endpoint over HTTPS. **Ollama runs on `localhost`** so nothing leaves your machine.

**🐛 Suspect the reference solution is wrong?** When the grader returns < 100, a **🐛 Reference solution looks wrong?** link appears below the verdict. Click it → an issue-type picker opens with the closest category **auto-selected** (e.g. "Reference bundles verification commands" when the verdict mentions `auth can-i`, `kubectl get`, `kubectl describe` etc.). The six categories are: verification-bundled, wrong-resource, outdated-flag, missing-step, typo, and other. Add an **Additional context** note (required for "Other") when the case doesn't fit a category. The manual entry point **🐛 Suggest a fix** lives in the revealed solution area too. Drafts persist in localStorage (`cka:fix-draft:<id>`) and ride along in Export / Gist Push. Each issue is auto-labelled `answer-fix` plus a `kind/<category>` label so the maintainer can triage by type.

**Picking the right `answer-fix` category** (the auto-PR workflow's `kind/*` mapping drives a different aider prompt per kind — picking accurately gets you a useful draft PR; `other` is treated as no-op by default):

| Pick this | When | Concrete example |
|---|---|---|
| `verification-bundled` | The reference solution bundles a `kubectl get` / `kubectl describe` / `kubectl logs` / `auth can-i` line that's just verification, not the actual fix the task asked for. | The reference for "Create a CSR for Sandra and approve it" ends with `kubectl get csr sandra -o jsonpath='{.status.certificate}' \| base64 -d > sandra.crt` — post-step extraction, not the create-and-approve action. |
| `wrong-resource` | The reference uses a different resource name / namespace / kind / label than the task wording specifies. | Task says "create role-binding in `cka-20834`", reference uses `default` namespace. |
| `outdated-flag` | The reference uses a deprecated kubectl flag or syntax that doesn't exist in the current k8s version. | Reference uses `--generator=run-pod/v1` (removed). |
| `missing-step` | The reference solution is incomplete — at least one required step the task asks for is missing. | Task says "approve the CSR **and extract the certificate**"; reference only approves. |
| `typo` | A typo or formatting issue in the reference solution itself. | `kubectl creat deployment` (missing `e`). |
| `other` | Genuinely none of the above. **Aider treats `other` as no-op unless your Additional context spells out a clear action verb** (add / remove / replace / reorder / fix). Prefer a specific kind whenever possible — splitting into two issues is fine. | "The reference includes optional `csr.spec.groups: -developers` that the task didn't ask for" — best filed as a separate `wrong-resource` issue with explicit "remove the `groups:` field" wording, not as `other`. |

**🐛 Spot something off in the task body or docs links?** Every exercise card also has a **🐛 Suggest a fix for this task or docs** button right below the task body (or directly below the docs-link row when the H3 title IS the task — chadmcrowell-sourced general entries with no `**Task:**` block). Click it → the same report modal opens in **task mode**: the seven issue types are *missing-docs-link*, *incorrect-docs-link*, *outdated-breadcrumb*, *unclear-task*, *factual-error*, *typo* and *other*. For the three URL-targeted types (*missing* / *incorrect* / *outdated-breadcrumb*), a **Suggested kubernetes.io URL** input appears; for *incorrect-docs-link* and *outdated-breadcrumb* a dropdown of the exercise's existing docs links lets you point at exactly which one is wrong. The modal also shows the current task body + a bullet list of currently-linked docs as context so you can confirm what the maintainer will see. Drafts persist under `cka:task-fix-draft:<id>` and ride along in Export / Gist Push. Each issue is auto-labelled `task-fix` plus a `kind/<category>` label so the maintainer can triage independently from solution-fix issues.

**Picking the right `task-fix` category** (same triage-driven prompt-routing as the answer-fix table above):

| Pick this | When | Concrete example |
|---|---|---|
| `missing-docs-link` | The task references a concept / command whose canonical kubernetes.io page **isn't** linked in the `> 🔗` block. | ca-1-002 cites only the CSR doc; the Authentication concept page also belongs there. |
| `incorrect-docs-link` | An existing `> 🔗` link's URL points to the wrong kubernetes.io page (URL doesn't match the breadcrumb / doesn't match the task). | Breadcrumb says "Reference > API Access Control > RBAC" but the URL is `/docs/concepts/overview/`. |
| `outdated-breadcrumb` | The link's URL is fine but the breadcrumb text drifted from kubernetes.io's current navigation. | Breadcrumb says "Concepts > Containers > …" but the page now lives under "Concepts > Workloads > Pods". |
| `unclear-task` | The task wording is ambiguous — two readers could write different "correct" answers. | "Create a pod with a label" without specifying which label name / value. |
| `factual-error` | The task asserts something that's wrong about Kubernetes behaviour. | Task claims "kubelet listens on port 10255 by default" — that's the deprecated read-only port; the default is 10250. |
| `typo` | Typo / formatting issue in the task body or in a breadcrumb. | `kubernates` instead of `kubernetes`. |
| `other` | Same caveat as the answer-fix side — aider defaults to no-op unless Additional context is precise. Prefer a specific kind when one fits. | — |

**Submission flow.** The **🚀 Open GitHub issue** button pre-fills only the **title** and **labels** in the URL — short and reliable across iOS Safari, the GitHub iOS app, and the unauthenticated sign-in redirect. The full **body** is auto-copied to your clipboard the moment you tap, so paste it (Cmd+V / long-press → Paste) into the issue description on GitHub. The modal also exposes **📋 Copy title** (in the Issue title row) and **📋 Copy body** (in the action row) so you can grab each field explicitly — useful when iOS Universal Links route your tap into the GitHub app and land you somewhere other than the new-issue form. Long-pressing the button → **Open in Safari** is the per-tap workaround that keeps the navigation in the browser.

**Queue for later — three entry points.** Don't want to interrupt your study flow to file every issue immediately? Three ways into the queue:

- **🚩 Flag** (next to ⭐ Bookmark on every card) — one-click "this exercise needs a closer look later" with no form at all. Just marks the entry in the queue.
- **🐛 Suggest a fix** + **💾 Save draft** — fill out the modal partially, save as draft (form persists; finish later).
- **🐛 Suggest a fix** + **🚀 Open GitHub issue** — files immediately AND keeps a record in the queue under "Already opened".

**Header 🐛 N icon** opens the queue popover from any tab. Items split into two groups:

- **To submit** — flagged exercises + drafts you haven't opened on GitHub yet. Each row: **📝 Write report** / **✏ Edit** (open the modal), **🚀 Open** (file on GitHub; stamps `submittedAt`), **🗑 Remove**.
- **Already opened** (collapsed by default) — drafts you've already clicked 🚀 Open on. Each row: **↻ Re-open** (clears the submitted stamp, opens the GitHub form again — for the case you didn't actually create the issue last time), **🗑 Remove**.

**🚀 Open all unsubmitted** at the bottom batch-opens every To-submit row in separate tabs (staggered 150 ms apart so the popup blocker plays along), marking each as submitted as it goes.

Settings → 🐛 Issues shows the same list in a wider view (useful for big clean-up sessions). Queued items sync via Gist so the queue is the same across all your devices.

**Auto-PR workflows (maintainer-side, one-time setup).** Both reported `answer-fix` and `task-fix` issues can be triaged via dedicated GitHub Actions workflows — **Answer-fix → draft PR** (`.github/workflows/answer-fix-pr.yml`) for reference-solution mismatches, and **Task-fix → draft PR** (`.github/workflows/task-fix-pr.yml`) for task / docs problems. Each uses [aider](https://aider.chat) + a model of your choice (Anthropic / OpenAI / DeepSeek / Qwen / Doubao / Ollama / Copilot via GitHub Models) to edit a single H3 block of the offending exercise and open a draft PR that closes the issue. Before either can post PRs you need to flip **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** once. Without that the workflow runs to completion and pushes the fix branch, but the final `gh pr create` call is rejected by GitHub — the bot posts a 🚨 comment on the issue with a one-click `pull/new/<branch>` recovery link. The default provider is `copilot` (zero-secret, uses the workflow's `GITHUB_TOKEN` via the `models: read` permission); to use the others, add the corresponding `*_API_KEY` secret. A small `.github/workflows/seed-labels.yml` workflow pre-creates all 14 issue labels both pipelines expect — it auto-fires on the first push (and again whenever a maintainer edits the seed file itself) so the SPA's pre-filled `?labels=…` resolves at issue-creation time even for the first-ever issue of a new kind. The aider prompt templates live at `.github/answer-fix/prompt.md` and `.github/task-fix/prompt.md`; both share the helper scripts under `scripts/answer-fix/` for issue-body parsing + H3 extract / splice.

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

**Auto-push (default ON).** Once both PAT and Gist ID are configured, the SPA debounces a push **30 seconds after your last sync-worthy edit** (toggling Done, adding a bookmark, saving an answer, getting a verdict, or any quiz state change). Five Done toggles within 10 s = one push, 30 s after the last toggle. You stop having to remember to Push before switching devices. UI preferences (theme, filters, tools sub-tab) do NOT trigger auto-sync. Opt out via the **Auto-push 30 s after changes** checkbox in Settings → Sync.

**Per-key merge — no more conflict modals.** Push and Pull now go through a per-key merge engine instead of integral overwrite. When the SPA detects the gist was updated since this device's baseline (another device, or this device's own previous beacon push), it **automatically** pulls the remote, merges it with local pending edits, then pushes the merged result. Rules:

- `cka:done` / `cka:bookmark`: per-id union with tombstones (un-marking an exercise on device A propagates to B via a `{v:false, t:ISO}` entry in the `cka:sync:keymeta` side-table).
- `cka:answer:*`: take whichever side's `savedAt` is later.
- `cka:quiz:active` / `cka:quiz:snapshots`: take-newer by `cka:sync:keymeta.t`.
- LLM settings: this-device's `apiKey` is always preserved across merges.

Local edits this device hasn't pushed yet never get clobbered by a Pull. Manual ⬇ Pull and ⬆ Push hit the same engine — both are lossless.

**Pre-pull backup + Restore.** Before any Pull (or Backup-file Import) runs, the SPA snapshots your current state to `cka:sync:prepull-backup` so the import is reversible. The Restore button uses an integral overwrite (it has to put back exactly what Pull replaced); the regular Pull / Auto-merge paths use the merge engine.

**Tab-close safety net.** If you close the browser within the 30 s debounce window, a best-effort `keepalive:true` PATCH fires on `beforeunload` so your last burst of edits doesn't get lost. The next session refreshes the baseline from the actual gist `updated_at` so this device never argues with its own past beacon pushes.

**Background-tab safety net.** Browsers throttle `setTimeout` aggressively in background tabs (Chrome ≈ 1/minute, Safari even less). To keep auto-sync reliable, a `visibilitychange` handler fires immediately when the tab returns to the foreground if a pending edit is already past its 30 s window. Net: you'll never lose a sync just because you switched to a different tab during the debounce.

**How to confirm auto-sync is working.** Open the ☁ popover any time — the top line shows the current auto-sync state explicitly:

| Top-line text | Meaning |
|---|---|
| `🔄 Auto-push: on · idle` | Configured + ready, no pending edit |
| `🔄 Auto-push: on · next push in ~22s` | Timer armed (live countdown, ticks each second) |
| `🔄 Auto-pushing… (3.2s)` | Currently uploading |
| `🔄 Auto-push: off — enable in Settings → Sync` | You unchecked the toggle |
| `⚙️ Auto-push: needs a Gist ID — run a manual ⬆ Push first` | PAT set but no Gist ID yet; one manual Push fixes it |
| `⚙️ Auto-push: needs a GitHub PAT` | No PAT configured |
| `⚠ Auto-push failed (X min ago): <message>` | Last auto-push errored; see Settings → Sync for full state |

The `⬆ Last push` line also gets an `(auto)` tag when the most recent push was from auto-sync (vs a manual click). The ☁ status dot pulses accent while the timer is armed, blue while pushing, green for ~30s after success, red for an unread error.

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
| `cka:tools:lastSubtab` | `"explain"`, `"kubectl"`, or `"api-resources"` — restored on revisit |
| `cka:tools:lastKind` | Last kind opened in Tools › Explain (e.g. `io.k8s.api.core.v1.Pod`) |
| `cka:tools:lastPath` | Current drill path in Explain (e.g. `["spec","containers","resources"]`) |
| `cka:tools:lastCmd` | Last command opened in Tools › kubectl -h (e.g. `"create deployment"`) |
| `cka:tools:version` | Selected kubernetes minor in the Tools / Nodes tabs (e.g. `"1.35"`); default `1.35` when unset |
| `cka:settings:lastTab` | Last-opened Settings sub-tab — `"grading"` / `"backup"` / `"sync"` (default `grading`) |
| `cka:nodes:lastRole` | Active Nodes role — `"controlplane"` or `"worker"` |
| `cka:nodes:lastPath` | Last file opened in Nodes (e.g. `"/etc/kubernetes/manifests/kube-apiserver.yaml"`) |
| `cka:docs:lastUrl` | Last opened docs page |
| `cka:llm:settings` | Provider, API key, model, auto-done threshold |
| `cka:llm:privacyAck` | Whether you dismissed the first-use privacy notice |
| `cka:gist:token` | GitHub PAT (never exported, never synced) |
| `cka:gist:id` | Gist ID used by Push / Pull |
| `cka:sync:meta` | Per-device sync metadata — last push/pull/test timestamps, last error, last-synced gist `updated_at` (never round-trips through the gist) |
| `cka:sync:prepull-backup` | Snapshot taken just before any Pull / Import so **↩ Restore pre-pull backup** can revert it |
| `cka:sync:autoDisabled` | `true` if you unchecked the **Auto-push 30 s after changes** toggle in Settings → Sync |
| `cka:sync:dirtyAt` | ISO timestamp of the last sync-worthy edit — cleared after a successful auto-push |

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
Easiest path: set up Gist sync on both browsers (PAT + same Gist ID). Auto-push 30 s after your last edit means the old browser stays current without you remembering to push; on the new browser you just click **⬇ Pull** once. If you accidentally pull the wrong way, the **↩ Restore pre-pull backup** button in Settings → Sync reverts it. Alternative: **Export** → copy the JSON file across → **Import** in the new browser.

**Q. The LLM Test button hangs forever.**
The grader has a 15s timeout — if it really hangs, the provider likely blocks browser-direct calls (Doubao is the usual suspect). Switch to a CORS-friendly provider (Anthropic / OpenAI / DeepSeek / Ollama).

**Q. Can I sync the API key too?**
No — by design. The Export and Gist Push payloads strip the API key. Add it on each device individually.

**Q. Where do I file a bug / suggest an exercise?**
<https://github.com/xooooooooox/cka-exercises/issues>.
