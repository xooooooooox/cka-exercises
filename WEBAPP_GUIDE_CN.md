# 在线练习页面 — 使用指南

[English version](WEBAPP_GUIDE.md) · [工程 README](README_CN.md) · [备考索引](EXAM_GUIDE_CN.md) · [Changelog](CHANGELOG.md)

把 <https://xooooooooox.github.io/cka-exercises/> 完整讲清楚：三种模式、Quiz 每个按钮的作用、答题数据怎么持久化、跨设备同步怎么用、LLM 批改器的行为、报告问题的工作流。

> **一句话总结。** 顶部切换模式，Browse 学习、Quiz 限时刷题、Docs 学官方文档树。所有操作都存在浏览器 `localStorage` 里 — 不会有任何数据出本机，除非你点 **Test / Check**（发给你选的 LLM provider）或 **Push / Pull**（发到你自己的 private GitHub Gist）。

> 想看最近改了什么？打开 **❓ Help → 📜 Changelog**（按 commit 记录）。本指南只描述 webapp 当前状态，不记录历史。

---

## 1. 🚀 快速开始

1. 打开 <https://xooooooooox.github.io/cka-exercises/>
2. 顶部选模式：**📚 Browse**、**🎯 Quiz** 或 **📖 Docs**
3.（可选）点 **⚙️** 配置 LLM 自动批改 / Gist 同步
4. 开始练题。状态自动保存
5.（可选）**Export** 导出 JSON 备份，或 **Push** 到 private GitHub Gist 实现跨设备同步

任意时候按 <kbd>?</kbd> 看快捷键。

### 📲 安装到桌面

这个 webapp 是基础 PWA，可以像原生 app 一样安装到 iPhone 和 Mac。

- **iPhone（Safari）**：打开网址 → 点 Share → **添加到主屏幕** → 命名 → 添加。点击新图标即可进入全屏（无 Safari 工具栏）。
- **Mac（Safari 17+ / macOS Sonoma+）**：打开网址 → 菜单栏 **文件 → 添加到 Dock** → 添加。app 出现在 Dock 和启动台中，独立窗口打开。

安装后通过内置 **service worker**（首次访问非 localhost 时自动注册）支持冷启动离线：SPA shell 在 install 阶段预缓存，JSON 内容走 stale-while-revalidate，导航请求在断网时回退到缓存的 `index.html`。这关闭了"iPhone 主屏图标 → 白屏"在网络抖动时的体验缺口。进度、收藏、答案、LLM 批改、☁ Gist 同步都和浏览器版一模一样。每个安装实例是独立的 profile，所以 **Mac 和 iPhone 上的进度互相独立**，除非通过 Gist Push / Pull 同步。

**一次性 "添加到主屏" 提示横幅**。首次访问的移动端用户（尚未进入 PWA standalone 模式）会在页面加载 8 秒后看到右下角小提示："📱 Install: Safari Share → Add to Home Screen"。点 ✕ 永久关闭；安装 PWA 后通过 `display-mode: standalone` 检测自动不再出现。

---

## 2. 🗂 各种模式

> 📸 下面每个模式开头都附了一张电脑端截图。完整截图集（含 iPhone 长图）请到 [`assets/screenshots/`](assets/screenshots/) 浏览 —— 各文件对应的画面详见目录下 [spec table](assets/screenshots/README.md)。

### 📚 Browse

![Browse 模式 —— 左侧目录树、顶部筛选条、中部题目卡片。](assets/screenshots/desktop-browse.png)

默认模式。约 271 道题一个滚动列表。

- **搜索 / 过滤**：自由文本 + domain + 标签（`CKA Past Exam` / `Killer.sh A / B` / `KillerCoda` / `General`）+ 收藏 + "未完成"
- 每张卡片可独立 **展开 / 折叠解答** — 不会剧透其它题
- 每题可标 **✓ Done**、**⭐ Bookmark**、**🐞 Flag for follow-up**；侧边栏按 domain 显示进度条
- 在 **✏️ Your answer** 编辑器输入答案，点 **✓ Check** 由 LLM 批改（详见 §5）。编辑器是 CodeMirror（首次聚焦时按需懒加载），**bash 语法高亮**（kubectl / openssl / heredoc 关键词正确着色；`<<EOF` 里的 YAML 显示为纯文本），Tab 缩进，右上角 **⛶** 按钮可一键全屏。全屏后答题框标签行会显示四个抽屉按钮 —— **🛠 Tools**、**📝 Task**、**💡 Solution**、**🐞**（打开 flag scope 选择器）—— 无需退出全屏就能查语法、偷看解答、标记问题。移动端字号为 16px，避免 iOS Safari 聚焦时自动放大。

### 🎯 Quiz

![Quiz 模式 —— 答题中的会话，含答题编辑器与 LLM 评分卡（Got it / ◐ Partial / ✗ Missed 三档自评）。](assets/screenshots/desktop-quiz.png)

模拟考场环境的随机抽题练习。

**入口先看 Landing 页**。打开 🎯 Quiz 不会再一进去就甩给你一张配置表 —— 落地页会先展示：

- ⏸ **Resume** 任何暂停的会话。
- 💾 **Snapshots** 之前保存的快照列表。
- **域熟练度横条** —— 五行展示每个 domain 的 `done / total · pct` + 进度条。 done % 最低的 1-2 个域（且未到 100 %）会带 `💡 weak` chip + 橙色提示，一眼看清薄弱在哪。
- 三条入口：**▶ Start a new quiz**（进完整配置表）或**三个一键预设**：**🎲 10 random**、**🎯 17-question mock**、**🩺 Drill weak spots**（自动选上面提示的弱域，限定未完成题，10 题随机）。若全部 100 % 完成，Drill weak spots 会弹提示并中止而不是发空轮。

![Quiz 配置页 —— 开始会话前选择 Source（domain / 标签 / 收藏 / 未完成）、题量、时间、顺序、答案可见性。](assets/screenshots/desktop-quiz-setup.png)

**配置页面** —— 点 **▶ Start a new quiz** 后，选择：

- 来源过滤（domain、标签、只看收藏、只看未完成）
- 题量（5 / 10 / 17 整套模考 / 自定义最多 500）
- 时限（无 / 30 / 60 / 120 分钟）
- **顺序：** 🎲 Random（默认）、↑ Sequential（按题号）、🏷 By tag、📑 By section。后两种是"先均匀抽 N 道，再按 tag / section 排序"，保证每个 tag/section 都按比例出现。
- 解答可见性（默认隐藏，点 **Reveal** 才显示 / 一直显示）

点 **▶ Start quiz** 开始。如果设置了时限，header 会显示倒计时。

**答题页 — 每个按钮的作用：**

| 按钮 | 作用 |
|---|---|
| **← Prev** | 跳到上一题。不会改变批改结果。 |
| **🚩 Flag** | 标记**本轮 quiz 中**待回顾的题，会在结算页高亮。（这是 quiz-flag，跟 🐞 issue-flag 不同 —— 后者见 §7。） |
| **👁 Reveal solution** | 显示参考解答。Reveal 后，**Got it / Missed** 才可点击用于自评。 |
| **✓ Got it** | 自评：答对了。同时把这题标记为全局 **Done**。 |
| **✗ Missed** | 自评：没答对。**不会**标 Done — 而且会清除已有的 Done 标记。 |
| **↷ Skip** | 跳过不评分。 |
| **Next →** | 跳到下一题。不会改变批改结果。 |
| **💾 Save snapshot** | 把整场 quiz 命名存起来，方便以后继续。 |
| **⏹ End session** | 立刻结束，显示已完成部分的总结。 |

**全屏编辑器 + 固定 quiz 控件栏。** 点 **⛶** 最大化编辑器。底栏固定显示完整的 quiz 导航（**📋 Questions / ← Prev / 🚩 Flag / 👁 Reveal / ✓ Got it / ✗ Missed / ↷ Skip / Next →**）外加最右侧的 **☁**（不退出全屏就能看 sync 状态）。点 👁 Reveal 同时弹 **💡 Solution** 抽屉。Prev/Next 翻题保留全屏状态，可以一直在最大化视图里冲完整场。

**Resume 和 snapshot。** 每次答题动作都自动保存。意外关 tab / 刷新 → setup 页顶部出现 ⏸ 横幅，提示 **▶ Resume** 或 **✕ Discard**。需要并行多场 quiz → 用 **💾 Save snapshot**。

**结算页** — 显示：总数 / 答对 / 答错 / 跳过 / Flag 数 + 每题列表。**▶ New quiz** 重开。

> Quiz 的对错评判完全是**自评**。LLM 批改器（§5）是独立功能，在 Browse 模式的每张卡片的 **✓ Check** 按钮上才用到。

### 📖 Docs

![Docs 模式 —— 左侧 kubernetes.io 导航树，右侧叶子页详情 + 反向链接到对应练习。](assets/screenshots/desktop-docs.png)

镜像 kubernetes.io 的文档导航树，并对题库做了反向索引。

- 左侧浏览 docs 层级
- 点任一文档页 → 右侧内联渲染 kubernetes.io 的内容 + 列出关联题目
- 用于反向打开思路："想刷 ConfigMap 相关的题 — 题目分布在哪？"

### 🔧 Tools

![Tools 模式 —— 左侧 kubectl explain schema 浏览器，右侧选中资源的字段与说明；上方有 📋 kubectl -h 与 📑 api-resources 子标签。](assets/screenshots/desktop-tools.png)

三个工具，对标考试时在终端里最常用的三个动作，离线打包进 SPA。

- **📘 Explain** — `kubectl explain` schema 浏览器。左侧选 kind，右侧像 CLI 一样显示 `KIND / VERSION / DESCRIPTION / FIELDS`。点带 sub-schema 的字段下钻（`Pod → spec → containers → resources → limits`），breadcrumb 回上一层。搜索框按 kind 名或字段名搜索。**详情内过滤**：进入 kind 后顶部还有过滤框，在 `Pod.spec` 里输 `tolerat` 直接收敛到 `tolerations`。
- **📋 kubectl -h** — **逐字**收录 ~80 个 kubectl 子命令的 `-h` 输出，monospace 渲染。**📋 Copy** 复制 `kubectl <cmd>`。**详情内过滤**：详情面板按行隐藏不匹配内容 —— 输 `--image`、`hostNetwork` 直达目标行。
- **📑 api-resources** — `kubectl api-resources -o wide` 风格的查表，40 个 CKA 相关 kind。过滤框接受纯文本 + 三种前缀：`namespaced:true|false`、`verb:<动词>`、`group:<组>`。点任意一行跳进 📘 Explain。手机上折叠成卡片。

**手机（≤600 px）+ 抽屉内**：📘 Explain 和 📋 kubectl -h 采用 master-detail 流 —— 全宽列表 → 点一项后详情占满面板 + 顶部 `← Back` 按钮。桌面并排布局不变。

**版本下拉。** Tools 子标签栏的 `Version` 下拉切换 kubernetes minor，默认 **v1.35**。打包**最新两个稳定 minor + 始终 v1.35**。选择持久化在 `cka:tools:version`。每个版本的 bundle ~580KB / ~110KB gzipped，懒加载。

### 🖥 Nodes

CKA 考试跑在 kubeadm 装出来的集群上。🖥 Nodes 内置一个 CP + worker 节点的**只读文件系统快照**，回答"这个文件在哪里？"/"static pod manifest 长什么样？"/"kubelet 读什么配置？"

- **子标签：** **👑 Control plane**（~15 个文件）和 **🛠 Worker**（~7 个文件）
- **左侧文件树，右侧文件内容** + **📋 Copy** 按钮。树搜索框按路径过滤（如 `kube-apiserver`）；详情面板也有 **in-file filter** —— 在已打开的文件里 grep `--etcd-servers`、`audit-log` 等。
- **手机（≤600 px）**：master-detail 流 —— 先看 tree，点文件展开详情 + 顶部 `← Back`。
- **版本下拉**与 Tools 共享 `cka:tools:version`。Static pod manifest 里的镜像 tag 按 minor 模板化。
- **脱敏：** 不内置任何真实私钥 / token / secret，敏感字节替换为 `LS0tLS1CRUdJTiBSRURBQ1RFRC1...` sentinel。
- **只读。** 不能编辑、不能 `kubectl apply`、不能 drain。只用来查"标准文件长啥样"。

每个版本 bundle ~30 KB，懒加载。

### ❓ Help

打包好的参考文档，SPA 内可读，无需联网。

- **📖 Webapp 指南** —— 本文档。
- **🎯 备考索引** —— EXAM_GUIDE.md（CKA 考点、考前 dotfiles、练习实验室、参考链接）。
- **📜 Changelog** —— CHANGELOG.md 内嵌渲染。

内容上方的语言切换器在有 CN 翻译的文档间切 EN ⇄ 中文。Changelog 只有英文版本。

---

## 3. 🎛 顶栏控件

| 控件 | 作用 |
|---|---|
| 模式标签（📚 / 🎯 / 📖 / ❓ / 🔧 / 🖥） | 切换 Browse / Quiz / Docs / Help / Tools / Nodes。**手机（≤768px）下标签移到屏幕底部固定栏**（iOS PWA 风格）。 |
| 搜索框 | 自由文本过滤（Browse 模式） |
| ⏱ 计时器 | 限时 quiz 的倒计时 |
| ☁ Sync | 快捷 Gist Push / Pull 弹层（PAT + Gist ID 在 Settings 中配；Test 仅在 Settings → Sync 中） |
| 🐛 N | Issue 队列弹层 —— flag 的题 + draft 报告（详见 §7）。badge `N` 显示队列长度。 |
| 🤖 LLM | provider 快速切换 —— 弹层列出每个已配置（有 API key）的 provider，✓ 标记当前活跃。一键切换不必打开 Settings。 |
| 🔄 刷新 | 强制重新拉取服务端最新部署（iOS PWA 缓存较激进时尤其有用）。检测到新部署时底部还会自动弹出"✨ New version available `vX.Y.Z` → `vX.Y.Z'`"横幅 —— 版本号 delta 让你一眼看清是跨过了 release 边界（如 `v0.1.0 → v0.2.0`），还是只是 dev 推送（如 `v0.1.0+dev.2 → v0.1.0+dev.5`）。 |
| `vX.Y.Z` chip | header 右侧常驻的构建标识。tagged release 部署显示 `vX.Y.Z`（默认色）；dev build（HEAD 不在 release tag 上的任何部署）显示 `vX.Y.Z+dev.N`（橙色），N = 距上次 release tag 之后的 commit 数。hover 看完整构建时间 + git SHA；点击 → 跳到 Help → Changelog。 |
| 🌓 主题 | 浅色 / 深色（持久化） |
| ⌨️ Help | 快捷键速查 |
| ⚙️ Settings | LLM 配置 / Backup / Gist sync（§4） |

---

## 4. ⚙️ Settings 面板

Settings 对话框分三个子标签 —— 一次只显示一个保持紧凑。最后打开的标签通过 `cka:settings:lastTab` 记住。

### 🤖 LLM

选 provider，填 API key，Test 验证，选 model，设自动 Done 阈值。具体批改行为见 §5。

### 💾 Backup

把本地进度导出 / 导入为 JSON 文件。导出时 API key 会被擦除。

### ☁ Sync

填 GitHub PAT + (可选) Gist ID。开 / 关 30s 自动 Push。回滚 pre-pull backup。具体同步逻辑见 §6。

Header 上有 ☁ 和 🤖 两个常用入口的快捷弹层 —— Settings 用于首次配置，日常用 header 弹层就够了。

---

## 5. 🤖 自动批改（LLM）

Browse 卡片上的 **✓ Check** 按钮把答案发给 LLM 拿到 verdict（Correct / Partial / Not yet）、0–100 分、做对了什么、漏了什么。Browse 和 Quiz 都能用。

### 启用 + Provider 配置

1. **⚙️ Settings → 🤖 LLM** —— 选一个 provider：Anthropic / OpenAI / DeepSeek / Qwen / Doubao / **GLM**（智谱 BigModel）/ Ollama（本地）。共 7 个。
2. **API key** —— 你的 provider key（Ollama 不需要）。
3. **Test** —— 校验 key，同时用该 provider 的真实模型列表填充 **Model** 下拉。
4. **Model** —— 列表选或自定义 model id。
5. **Auto-mark Done at score ≥ N** —— 批改分数 ≥ 阈值时自动标记 Done。
6. **💾 Save & set as active** 保存。**🧽 Clear this provider** 只清当前 provider 的槽位；**🗑 Clear all** 清掉全部 provider 配置。进度不受影响。

**每个 provider 独立记忆。** 每个 provider 的 API key、model、baseUrl、最近 Test 的 model 列表都**分开**存。点不同 provider 单选按钮只是切换**表单视图** —— 不会覆盖。标题旁显示 "N of 7 configured"。已配置的 provider 显示绿色 ✓，当前活跃的还会有蓝色 ★。配置 ≥ 2 个 provider 后，header **🤖** 弹层就能一键切换。

### 批改器怎么工作

Check 按钮 POST `{ 题面, 参考解答, 你的答案 }` 给活跃 provider，附一个"strict but fair CKA practice grader" 的 system prompt。批改返回结构化 JSON：

```json
{ "correct": true|false, "score": 0-100,
  "verdict": "correct" | "partial" | "incorrect",
  "summary": "一句话评语",
  "passed": [≤3 个 bullet], "missed": [≤3 个 bullet] }
```

verdict 和 bullet 渲染为答案下方的彩色卡片（绿 / 黄 / 红边框）。按题持久化在 `cka:answer:<id>`，下次打开仍能看到。

### 批改容忍 —— LLM 不会因此扣分

批改器把**题面**当作唯一真相来源，**不**把 reference solution 当模板。

- **题面没指定的字段值你自选。** 如果题面没明确指定 `metadata.name`、namespace、label 值、replica 数、container 名、image tag 等，你自选即可 —— 只要内部自洽（selector 真匹配 label、service port 真对应 container port 等）。把 Pod 命名为 `my-pod` 而不是 reference 的 `web-app` 不会扣分。
- **没写 verify 步骤不算缺漏。** 许多 reference solution 在主操作后追加 `kubectl get` / `describe` / `logs` / `--raw='/healthz'` 等命令演示集群状态变化。除非题面明确要求 "Verify that …" / "Check that …" / "Show …"，否则缺这些后续命令不扣分。
- **路径自由。** Imperative kubectl、declarative YAML、helm、kustomize 只要能产生正确状态都算对。

会扣分的：缺少题面要求的变更动作、结构错误（kind 错、缺必填字段）、值与题面冲突（题面 pin 了 namespace 你写错）。

### 流式 verdict + 🪙 token 使用量

点 **✓ Check** 会启动流式批改 —— 按钮变成 **✗ Cancel** + 实时 `(Xs · N chars)` 计数；答题框里出现一张虚线边框的预览卡显示流入的原始响应。流结束后 header 短暂显示 **🧠 Parsing verdict…**，然后解析后的 Got-right / Missed 卡片替换预览。随时可点 Cancel 中止 → `✗ Cancelled after Xs · N chars received`。所有 provider 包括 Ollama 都支持流式。

批改落定后 verdict 卡片底部多一行 token 使用统计：`🪙 anthropic · claude-opus-4-7 · in 1,247 + out 567 = 1,814 tokens`。provider/model 在批改时 pin 住，之后即使切换活跃 provider 也不影响这条信息。Ollama 显示 `🪙 Local model — no token accounting`。

### 隐私 & 发送什么数据

每次 Check：`{ 题面、参考解答、你的答案 }` 通过 HTTPS 发给所选 provider 的 endpoint。**Ollama 跑在 `localhost`** —— 用 Ollama 时数据完全不出本机。云 provider 的话同样的数据离开本机，但 SPA 不会追加任何使用统计 / 标识 / 遥测；provider 知道的只有你的 IP + prompt 内容。API key 仅存 `localStorage`，不会导出、不会同步。

---

## 6. ☁ 跨设备同步（Gist）

把进度推到一个私有 GitHub Gist，并在其它浏览器 / 设备拉下来。

### Backup & restore（本地文件）

- **⬇ Export progress** —— 下载 `cka-progress-<timestamp>.json`。包含：done、bookmark、保存的答案、theme、最近 quiz 配置、docs lastUrl。**LLM API key 会被擦除。**
- **⬆ Import progress…** —— 选一个之前导出的文件。计数确认后**合并**到本地状态（如果文件没带 API key，本地的会保留）。

### 首次配置（PAT + Gist ID）

1. 到 <https://github.com/settings/tokens?type=beta> 创建一个 Personal Access Token，**只勾 `gist` scope**（fine-grained 或 classic 都可以）。
2. 粘到 **Settings → ☁ Sync → GitHub PAT**（存在 `localStorage`，不会通过 gist 同步出去）。
3. 可选粘一个已有 **Gist ID**，留空则首次 Push 时自动创建。
4. **Test** —— ping `/user` 验证 token，显示 `✓ Authenticated as @<你的 GitHub 用户名>`。
5. **⬆ Push to Gist** —— 上传当前状态。首次 Push 后，新建的 gist ID 会自动填进输入框。

### 手动 ⬆ Push / ⬇ Pull

PAT + Gist ID 配置好后，header 上 **☁ Sync** 图标会弹一个 popover 含 **⬆ Push** 和 **⬇ Pull**。（Test 只在 Settings → Sync 里 —— 它是首次配置时的验证工具，不是日常动作。）

- **⬆ Push to Gist** 上传当前状态。
- **⬇ Pull from Gist** 计数确认后**合并**（不会整覆盖 —— 本地未推送的编辑会保留）。

### 自动同步（30 s debounce）

PAT 和 Gist ID 都配好后，SPA 在你**最后一次 sync-worthy 编辑**之后 **debounce 30 秒**自动 Push（标 Done、加书签、保存答案、产生 verdict、quiz 任何状态变化都算）。10 秒内连点 5 次 Done = 30 秒后只 Push 一次。不必再记得切设备前要手动推。UI 偏好（theme、filters、tools subtab）**不**触发自动同步。关闭：Settings → Sync 取消勾选 **Auto-push 30 s after changes**。

### Per-key 合并 —— 不再有冲突弹窗

Push 和 Pull 都通过 per-key 合并引擎，而不是整覆盖。SPA 检测到 gist 比本地 baseline 新（另一台设备改的、或本设备自己上次 beacon push 留下的）时，**自动**拉取远端 → 合并本地未推送的改动 → 推合并结果。规则：

- `cka:done` / `cka:bookmark`：按 id 取并集 + tombstone（A 设备取消 Done 通过 `cka:sync:keymeta` 侧表里的 `{v:false, t:ISO}` 在 B 设备生效）。
- `cka:answer:*`：按 `savedAt` 取新。
- `cka:quiz:active` / `cka:quiz:snapshots`：按 `cka:sync:keymeta.t` 取新。
- LLM 设置：本设备的 `apiKey` 始终保留，不会被合并覆盖。

本设备未推送的本地编辑永远不会被 Pull 吃掉。手动 ⬇ Pull、⬆ Push 走同一套引擎 —— 都是无损的。

**Pre-pull backup + 一键回滚。** 每次 Pull（或 Backup 文件 Import）前，SPA 会把当前状态快照到 `cka:sync:prepull-backup`，保证 import 可逆。Settings → Sync 里的回滚按钮走整覆盖；普通 Pull / auto-merge 路径走合并引擎。

### Idle-tab 主动 pull

Auto-**push** 只在本设备有编辑时才触发。如果本设备 tab 一直闲置但其他设备做了更改，没有手动点 ⬇ Pull 或本地再产生新编辑的话，这个闲置 tab 看不到远端的新内容。为了堵这个口，SPA 在 **(a)** 启动时和 **(b)** 每次 `visibilitychange → visible`（你从其他 tab 切回来）会做一次 gist `updated_at` head-check。如果远端比本地 baseline 新，自动 pull + merge，**500 ms 后软刷新页面** 让已挂载的卡片 / 侧边栏 / verdict slot 显示合并后的内容 —— 刷新后弹一条 `✨ Synced changes from another device` 提示。节流：单 tab 每 5 分钟最多一次（通过 sessionStorage `cka:sync:lastPollAt`），防止 visibility flick 反复触发刷爆 GitHub API。如果本地已经有 push 待发，跳过 head-check —— `doGistPush` 的 pre-flight pull-merge 会接管。

### Tab-close + 后台标签安全网

- **关页面**：在 30 秒 debounce 窗口内关浏览器 → `beforeunload` 时触发一次 `keepalive:true` PATCH，不让最后一波编辑丢失。下次打开会从 gist 当前 `updated_at` 重新校准本地 baseline，避免本设备跟自己过去的 beacon push 打架。
- **后台标签**：浏览器在后台压制 `setTimeout`（Chrome ≈ 1 次/分钟，Safari 更甚），30 秒 debounce 可能睡很久。`visibilitychange` 监听让标签回到前台时立刻 fire（如果待 push 已过 30 秒窗口）。同一个 handler 也负责触发上面那条 idle-tab 主动 pull。换标签页不会丢同步、也不会被卡在过时状态。

### 如何确认 auto-sync 在工作

随时打开 ☁ 弹层 — 顶部一行明确显示当前 auto-sync 状态：

| 顶部行 | 含义 |
|---|---|
| `🔄 Auto-push: on · idle` | 已配置 + 就绪，无待 push 编辑 |
| `🔄 Auto-push: on · next push in ~22s (last edit 8s ago)` | 定时器在等，倒计时每秒刷新 |
| `🔄 Auto-pushing… (3.2s)` | 正在上传 |
| `✓ Auto-pushed just now (caught last edit)` | 刚刚推送完成；30 秒内显示这个，让你知道刚刚发生了什么 |
| `🔄 Auto-push: off — enable in Settings → Sync` | Settings 关闭了自动 push |
| `⚙️ Auto-push: needs a Gist ID — run a manual ⬆ Push first` | 有 PAT 但还没 Gist ID；手动 Push 一次即可 |
| `⚙️ Auto-push: needs a GitHub PAT` | 没配 PAT |
| `⚠ Auto-push failed (X min ago): <message>` | 上次自动 push 失败；详情看 Settings → Sync |

`⬆ Last push` 行如果是 auto-sync 触发，带 `(auto)` 标签（手动 push 没有）。☁ 状态点在等待时缓慢闪动 accent 色，推送中变蓝，成功后绿色 ~30 秒，有未读错误时红色。

---

## 7. 🐞 问题报告（队列 + GitHub）

发现题目 / 解答 / 文档有问题时，SPA 提供"一键标记"和"结构化报告"两种入口，并有一个队列让你之后批量去 GitHub 开 issue。

### 三种进入队列的方式

- **🐞 Mark for follow-up**（每张卡片 ⭐ Bookmark 旁边）—— 点击弹一个 **scope 选择器**：🔧 Solution issue / 📝 Task issue / 🔧📝 Both。选完按钮按 scope 显示对应配色（红边框 = Solution，蓝边框 = Task，红蓝渐变 = Both）。完全不弹表单。点同一项 = toggle off；"🗑 Unflag all" 全清。全屏模式下答题框标签行也有同款 🐞 按钮（跟 ⛶ / 🔧 / 📝 / 💡 同排）。
- **🐛 Suggest a fix** + **💾 Save draft** —— 部分填写弹窗，存为草稿。
- **🐛 Suggest a fix** + **🚀 Open GitHub issue** —— 立即提交，同时在队列里留一条 "Already opened" 记录。

> 🐞 瓢虫不是 🚩，是为了跟 Quiz 模式里"标记本题待复习"的 🚩 Flag 区分（两者含义完全不同）。

### Header 🐛 弹层（队列本身）

Header **🐛 N** 任意 tab 都能点开队列 popover。条目分两组：

- **To submit** —— flag 的题 + 你还没去 GitHub 开 issue 的草稿。每行：**📝 Write report** / **✏ Edit**（打开弹窗）、**🚀 Open**（跳 GitHub，自动写 `submittedAt`）、**🗑 Remove**。
- **Already opened**（默认折叠）—— 已点过 🚀 Open 的草稿。每行：**↻ Re-open**（清 submittedAt，重新开 GitHub 表单 —— 上次 GitHub 那边其实没真正提交时用）、**🗑 Remove**。

底部 **🚀 Open all unsubmitted** 批量打开所有 To-submit 项（间隔 150ms，自动标 submitted）。

Both flagged 的题在 popover 里渲染成**两条独立条目**（一条 answer-fix、一条 task-fix），各自可以 Edit / Open / Remove。

所有队列项通过 Gist 跨设备同步。

### Fix-report 弹窗（细写时用）

从卡片上 **🐛 Suggest a fix** 触发。弹窗根据点的入口分 **solution 模式** 或 **task 模式**。

**Solution 模式分类**（`answer-fix` label）：

| 选这个 | 什么时候 | 具体例子 |
|---|---|---|
| `verification-bundled` | reference 末尾混了 `kubectl get` / `kubectl describe` / `kubectl logs` 这类验证 / 提取命令，不是题面要求的核心操作。 | "为 Sandra 创建并 approve CSR" 的 reference 末尾还跟着一段 base64 解码提取 cert 的命令 —— 那是 post-step 而不是题面要求的动作。 |
| `wrong-resource` | reference 使用的 resource name / namespace / kind / label 跟题面措辞不一致。 | 题面说"在 `cka-20834` namespace 里 create role-binding"，reference 用了 `default`。 |
| `outdated-flag` | reference 用了已弃用的 kubectl flag 或当前 k8s 版本里不存在的语法。 | reference 用 `--generator=run-pod/v1`（已移除）。 |
| `missing-step` | reference 不完整 —— 题面要求的某一步没做。 | 题面说"approve CSR **并提取 certificate**"；reference 只做 approve。 |
| `typo` | reference 本身有拼写 / 格式错误。 | `kubectl creat deployment`（少了 e）。 |
| `other` | 真的不属于以上任何一类。**Aider 把 `other` 当作 no-op，除非 Additional context 写清楚动作动词**（add / remove / replace / reorder / fix）。能用具体分类就别用 `other`。 | —— |

**Task 模式分类**（`task-fix` label）：

| 选这个 | 什么时候 | 具体例子 |
|---|---|---|
| `missing-docs-link` | 题面提到了某个概念，但其权威的 kubernetes.io 页面**没出现**在 `> 🔗` 块里。 | ca-1-002 只引用了 CSR 文档；Authentication 概念页其实也应该在。 |
| `incorrect-docs-link` | 既有 `> 🔗` 链接的 URL 指向了错误的 kubernetes.io 页面。 | breadcrumb 写 "Reference > API Access Control > RBAC"，URL 却是 `/docs/concepts/overview/`。 |
| `outdated-breadcrumb` | URL 没错，但 breadcrumb 文本与 kubernetes.io 当前导航不一致。 | breadcrumb 写 "Concepts > Containers > …"，但该页现在归在 "Concepts > Workloads > Pods" 下。 |
| `unclear-task` | 题面措辞有歧义，两个人可能写出不同"正确答案"。 | "Create a pod with a label" 但没写哪个 label 名 / 值。 |
| `factual-error` | 题面对 Kubernetes 行为的描述本身就是错的。 | 题面说 "kubelet 默认监听 10255 端口" —— 那是已废弃的 read-only 端口；默认是 10250。 |
| `typo` | 题面或 breadcrumb 里有拼写 / 格式错误。 | `kubernates` 写成了 `kubernetes`。 |
| `other` | 同 solution 一侧的注意点 —— 不到万不得已别选 `other`，否则 aider 会按 no-op 处理。 | —— |

对三种 URL 目标的 task-fix 分类（*missing* / *incorrect* / *outdated-breadcrumb*），弹窗会显示 **Suggested kubernetes.io URL** 输入框；*incorrect-docs-link* 和 *outdated-breadcrumb* 还会有现有文档链接下拉指明是哪条出错。

### 提交流程

**🚀 Open GitHub issue** 按钮的 URL 只预填 **title** 和 **labels**（保持 URL 短小，避免 iOS Safari 跳转 500、避免 GitHub iOS app 吞 URL）。完整的 **body 在点按瞬间自动复制到剪贴板** — 到 GitHub 的 issue 描述框里粘贴即可。弹窗里另有 **📋 Copy title** 和 **📋 Copy body**，分别复制每个字段 —— 长按按钮 → **Open in Safari** 是 iOS Universal Links 异常时的可靠 fallback。

### Auto-PR 工作流（维护者一次性设置）

仓库里有两个独立工作流 —— **Answer-fix → draft PR** (`.github/workflows/answer-fix-pr.yml`) 和 **Task-fix → draft PR** (`.github/workflows/task-fix-pr.yml`)，通过 [aider](https://aider.chat) + 你选的 LLM 改 H3 块、开 draft PR。**第一次跑之前** 需要先打开 **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"**。默认 provider 是 `copilot`（零密钥，复用 `GITHUB_TOKEN` + `models: read`）；要用其它 provider 在仓库 Secrets 里加对应的 `*_API_KEY`。`.github/workflows/seed-labels.yml` 预先创建好两条流水线 + curriculum watcher 需要的 15 个 issue 标签。

---

## 8. 🚢 版本发布节奏 + dev build

webapp 显式打了版本号标签，两种状态：

- **Release build** —— chip 显示 `vX.Y.Z`（默认色）。这是维护者通过 **Actions → Release → Run workflow** 触发的发布切片（`release.yml`）。每次 release 会 bump `package.json.version`、把 changelog 的 `[Unreleased]` 重命名为 `[vX.Y.Z] - YYYY-MM-DD`、打 tag、并发布对应的 GitHub Release（release notes 来自刚刚命名好的 changelog 块）。
- **Dev build** —— chip 显示 `vX.Y.Z+dev.N`（橙色），N = 距上次 release tag 之后的 commit 数。每次 push 到 `main` 命中文件过滤都触发部署；HEAD 不在 release tag 上的部署即为 dev build。dev build 也立刻拿到最新内容，唯一区别是 labelling。

怎么判断自己在哪种：
- 看 header chip 颜色。
- hover chip → tooltip 显示 `Release v0.1.0 · built …` 或 `Dev build · 3 commits ahead of v0.1.0 · …`。
- ✨ Refresh 横幅会显示版本号 delta（如 `v0.1.0+dev.2 → v0.1.0+dev.5` 或 `v0.1.0+dev.5 → v0.2.0`）。

版本号推断规则（基于 CHANGELOG `[Unreleased]` 块构成）：
- `### Removed` 或任何含 `BREAKING` 标记 → major（v0.x 阶段为 minor）。
- `### Added` 或 `### Changed` → minor。
- 只有 `### Fixed` → patch。

维护者可通过 workflow 的 `bump=major|minor|patch` 显式覆盖；`bump=auto`（默认）按上面规则自动推断。

---

## 9. 💾 持久化机制

所有状态都在浏览器的 `localStorage`，前缀 `cka:`。**任何数据都不会被发送到任何服务器，除非你主动点击 Check / Test / Push / Pull。** 清除站点数据 = 全部丢失（Settings → Clear all 只会清除 LLM 设置）。

DevTools 中你会看到的 keys：

| Key | 内容 |
|---|---|
| `cka:done` | `{ exerciseId: true, … }` |
| `cka:bookmark` | `{ exerciseId: true, … }` |
| `cka:answer:<exerciseId>` | 每题保存的答案 + 最近一次 LLM verdict |
| `cka:theme` | `"light"` / `"dark"` |
| `cka:quiz:active` | 自动保存的进行中的 quiz |
| `cka:quiz:snapshots` | 命名 snapshot 列表 |
| `cka:quiz:lastOrder` | 最近用的 quiz Order |
| `cka:tools:lastSubtab` | `"explain"` / `"kubectl"` / `"api-resources"` |
| `cka:tools:lastKind` | Tools › Explain 上次打开的 kind |
| `cka:tools:lastPath` | Explain 当前下钻路径 |
| `cka:tools:lastCmd` | Tools › kubectl -h 上次的命令 |
| `cka:tools:version` | Tools / Nodes 选中的 kubernetes minor |
| `cka:settings:lastTab` | Settings 上次打开的子标签 |
| `cka:nodes:lastRole` | `"controlplane"` 或 `"worker"` |
| `cka:nodes:lastPath` | Nodes 上次打开的文件路径 |
| `cka:docs:lastUrl` | Docs 上次打开的文档页 |
| `cka:llm:settings` | Provider, API key, model, auto-Done 阈值（v2 per-provider 结构） |
| `cka:llm:privacyAck` | 是否已 dismiss 首次使用隐私提示 |
| `cka:fix-draft:<exerciseId>` | 每题的 answer-fix 队列草稿 —— quick flag 或写好的报告 |
| `cka:task-fix-draft:<exerciseId>` | 相同结构，task 一侧 |
| `cka:gist:token` | GitHub PAT（绝不导出，不同步） |
| `cka:gist:id` | Push / Pull 用的 Gist ID |
| `cka:sync:meta` | per-device 同步元数据 —— last push/pull/test 时间、last error、`lastSyncedGistUpdatedAt`（merge engine 的 baseline） |
| `cka:sync:keymeta` | per-key + per-id 时间戳，merge engine 用，**会**进 gist payload |
| `cka:sync:prepull-backup` | Pull / Import 前的快照，**↩ Restore pre-pull backup** 用 |
| `cka:sync:autoDisabled` | `true` 如果你 opt-out 了自动 push |
| `cka:sync:dirtyAt` | 最后一次 sync-worthy 编辑的 ISO 时间戳 —— 成功 auto-push 后清空 |

题目 ID（如 `ca-1-005`）按 section 顺序生成。维护者遵循 **append-only** 规则（见 `CLAUDE.md`）—— 添加新题不会让现有 ID 偏移，不会破坏已有用户的进度。

**GitHub Pages 更新时**：`docs/exercises.json` 可能会重新生成 —— 只要维护者只 append，每道现有题保留 ID，你的 Done / Bookmark / Answer 都不会丢。

---

## 10. 🔒 安全与隐私

这个 SPA **没有后端**。当成任何"自带 key 的 web 工具"对待。

| 问题 | 答 |
|---|---|
| 不同用户的数据彼此隔离吗？ | 是 — `localStorage` 按 origin **加 浏览器 profile** 隔离。用户 A 的数据用户 B 看不到，除非他们在同一台机器上共享同一个 OS 账户 + 同一个浏览器 profile。 |
| 我的 API key 存在哪？ | 在 `localStorage` 里，明文（at-rest 加密交给浏览器做，不归我们管）。 |
| 谁能读到我的 API key？ | 任何能在你浏览器 profile 里执行代码的人 — 这跟其它"浏览器保存的凭证"是同一个信任边界。SPA 本身除了 Check / Test 时把它放到 `Authorization` header，绝不会记日志或上传到任何其它地方。 |
| 站点会追踪我吗？ | 无 analytics、无遥测、无 cookies。唯一的网络请求是你主动点 Check（→ 你的 LLM provider）、Test（→ LLM provider 或 GitHub）、Push / Pull（→ GitHub Gist API）时发出的。 |
| 有人看到我屏幕能读到 key 吗？ | key 输入框是 `type="password"`，默认遮罩；但本地存储着，任何能打开你 DevTools / Application tab 的人都能读。 |
| Gist 是私有的吗？ | SPA 创建的是 **secret** gist（`public: false`）。Secret gist 不会出现在公开列表里，但**没有访问控制** — 任何拿到 URL 的人都能读。不要把敏感秘密放进同步 payload（API key 因为这个原因没有同步）。 |
| 网络上发送了什么？ | HTTPS 发给：你选的 LLM provider（Check / Test 时）、`api.github.com`（Push / Pull / Test 时）。再无其它。 |

**如果你和不信任的人共用浏览器 profile**，离开时点 Settings → Clear all，或在隐私窗口里打开站点。

---

## 11. ⌨ 键盘快捷键

| 键 | 作用 |
|---|---|
| <kbd>j</kbd> / <kbd>↓</kbd> | 下一题（Browse / Quiz 都适用） |
| <kbd>k</kbd> / <kbd>↑</kbd> | 上一题 |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd> <kbd>6</kbd> | 切到 Browse / Quiz / Docs / Help / Tools / Nodes |
| <kbd>/</kbd> | 焦点跳到搜索框 |
| <kbd>Space</kbd> | 展开 / 折叠解答（聚焦的 Browse 卡片） |
| <kbd>d</kbd> | 切换 Done（聚焦的 Browse 卡片） |
| <kbd>b</kbd> | 切换 Bookmark（聚焦的 Browse 卡片） |
| <kbd>?</kbd> | 显示 / 隐藏帮助 |
| <kbd>Esc</kbd> | 关闭帮助 / 取消搜索框聚焦 |

输入框聚焦时快捷键不生效。

---

## 12. 💬 常见问题

**Q. 部署更新后我的进度会丢吗？**
不会。`localStorage` 独立于站点静态资源。只要维护者遵循 append-only ID 规则（在 `CLAUDE.md` 里写明了），每道现有题保留 ID。

**Q. 换浏览器 / 换设备了 — 怎么把进度搬过去？**
最简单的路径：在两个浏览器上配置 Gist 同步（PAT + 同一个 Gist ID）。最后一次编辑 30 秒后自动 push 让老浏览器始终是最新的；新浏览器上 per-key 合并引擎会自动协调，点一次 **⬇ Pull** 也行。万一拉错了，Settings → Sync 里的 **↩ Restore pre-pull backup** 可以一键回退。备选方案：**Export** → 拷文件 → 新浏览器 **Import**。

**Q. LLM Test 按钮卡死。**
批改器有 15 秒超时 — 如果真的卡死，多半是 provider 拒绝浏览器直连（Doubao 是常见的）。换一个支持 CORS 的 provider（Anthropic / OpenAI / DeepSeek / Ollama）。

**Q. 批改器判我错了，但我看答案没问题。**
先看 missed 列表里说的是不是题面真正要求的东西。批改器已配置成 (a) 容忍题面没指定的字段值 (b) 容忍 verify 步骤缺失 —— 但 bug 总是有的。点那张卡片的 🐛 Suggest a fix 报一个 `answer-fix` issue。

**Q. API key 可以同步吗？**
不行 — 出于安全考虑。Export 和 Gist Push payload 都会擦除 API key。每个设备上单独填一次。

**Q. 哪里报 bug / 建议加新题？**
卡片上点 **🐞 Quick Flag** 入队，等准备好的时候从 header 🐛 弹层批量去 GitHub 开 issue（§7）。或直接 <https://github.com/xooooooooox/cka-exercises/issues>。

---

## 13. 🎨 Emoji 语义表

SPA 中每个 emoji 都有一个固定的 UI 语义 —— 同一个 emoji 在多个 surface 出现时含义不变。

| Emoji | 语义 | 出现位置 |
|-------|------|---------|
| 📚 | Browse 模式 | mode tab（顶栏 + 手机底部栏）|
| 🎯 | Quiz 模式 | mode tab |
| 📖 | Docs 模式 | mode tab |
| ❓ | Help 模式 | mode tab |
| 🔧 | Tools 模式 / Tools 抽屉（同语义） | mode tab + 全屏答题框 label 行 |
| 🖥 | Nodes 模式 | mode tab |
| 📝 | Task 抽屉 | 全屏答题框 label 行 |
| 🐞 | Flag-scope 切换按钮 | Browse 卡片 + 全屏 quizbar |
| 🐛 | 内联问题链接 / Issues 队列入口 | "Suggest a fix" 链接 / 顶栏弹窗 |
| 🚩 | Quiz "标记此题待复盘" | active quiz session |
| 🔄 | Refresh | 顶栏 + 更新提示横幅 |
| ☁ | Sync（Gist） | 顶栏 + 全屏 quizbar |
| 🤖 | LLM picker | 顶栏 |
| 📋 | Quiz Questions 抽屉 / Copy | quiz nav + 报告 modal |
| 📊 | Outline 抽屉 | 手机端 filter toolbar |
| ↑ | 回到顶部 | Browse 浮动按钮 |
| ⭐ | 收藏 | Browse 卡片 |
