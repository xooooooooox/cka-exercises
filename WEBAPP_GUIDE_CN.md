# 在线练习页面 — 使用指南

[English version](WEBAPP_GUIDE.md) · [工程 README](README_CN.md) · [备考索引](EXAM_GUIDE_CN.md)

5 分钟把 <https://xooooooooox.github.io/cka-exercises/> 完整讲清楚：三种模式、Quiz 每个按钮的作用、答题数据是如何持久化的、跨设备同步怎么用、隐私和安全到底保证了什么。

> **一句话总结。** 顶部切换模式，Browse 学习、Quiz 限时刷题、Docs 学官方文档树。所有操作都存在浏览器 `localStorage` 里 — 不会有任何数据出本机，除非你点 **Test / Check**（发给你选的 LLM provider）或 **Push / Pull**（发到你自己的 private GitHub Gist）。

> **本次更新亮点。**
> - **流式批改。** 点 ✓ Check 实时看到响应流入，可随时取消（按钮变成 ✗ Cancel + 计秒 / 字符数），结束后 verdict 卡片底部多一行 🪙 token 使用量。
> - **🤖 LLM 快速切换。** 头部 ☁ Sync 旁边新增图标 — 已配置的 provider 之间一键切换，无需打开 Settings。
> - **新增 GLM provider（智谱 BigModel）。** 一共 7 个 provider：Anthropic / OpenAI / DeepSeek / Qwen / Doubao / GLM / Ollama。
> - **Tools 新增 📑 api-resources 子标签。** `kubectl api-resources` 查表，支持 `namespaced:false` / `verb:patch` / `group:apps` 过滤语法。
> - **Quiz 全屏模式现保留全部控件。** 答题编辑器最大化后底部固定显示 Prev / Next / Got / Missed / Skip / Flag / Reveal / 📋 Questions —— 不用退出全屏来翻页或判分。
> - **💡 Solution drawer。** 即使在全屏编辑器里，点 💡 或 Reveal 也能在悬浮 drawer 里看参考解答。
> - **自动同步 Gist —— 现已支持 per-key 合并。** 配置好 Gist 后，最后一次编辑 30 秒后自动 Push。多设备并发编辑会被无损合并 —— Done / Bookmark 取并集；答案按 `savedAt` 取新；tombstone 让取消 Done 也能跨设备传播。不再有冲突弹窗。
> - **答题编辑器改用 bash 语法高亮**（之前是 YAML — bash 更贴近你在考试中实际敲的内容）。

---

## 1. 快速开始

1. 打开 <https://xooooooooox.github.io/cka-exercises/>
2. 顶部选模式：**📚 Browse**、**🎯 Quiz** 或 **📖 Docs**
3.（可选）点 **⚙️** 配置 LLM 自动批改 / Gist 同步
4. 开始练题。状态自动保存
5.（可选）**Export** 导出 JSON 备份，或 **Push** 到 private GitHub Gist 实现跨设备同步

任意时候按 <kbd>?</kbd> 看快捷键。

### 📲 安装到桌面

这个 webapp 是基础 PWA，可以像原生 app 一样安装到 iPhone 和 Mac。

- **iPhone（Safari）**：打开网址 → 点 Share（分享）→ **添加到主屏幕** → 命名 → 添加。点击新图标即可进入全屏（无 Safari 工具栏）。
- **Mac（Safari 17+ / macOS Sonoma+）**：打开网址 → 菜单栏 **文件 → 添加到 Dock** → 添加。app 会出现在 Dock 和启动台中，独立窗口打开。

安装后**仍需联网**（每次启动会拉 `index.html` + `exercises.json`），其它行为完全一致：进度、收藏、答案、LLM 批改、☁ Gist 同步都和浏览器版一模一样。每个安装实例是独立的 profile，所以 **Mac 和 iPhone 上的进度互相独立**，除非通过 Gist Push / Pull 同步。

---

## 2. 三种模式

### 📚 Browse

默认模式。约 271 道题一个滚动列表。

- **搜索 / 过滤**：自由文本 + domain + 标签（`CKA Past Exam` / `Killer.sh A / B` / `KillerCoda` / `General`）+ 收藏 + "未完成"
- 每张卡片可独立 **展开 / 折叠解答** — 不会剧透其它题
- 每题可标 **✓ Done** 和 **⭐ Bookmark**；侧边栏按 domain 显示进度条
- 在 **✏️ Your answer** 编辑器输入答案，点 **✓ Check** 由 LLM 批改（需先在 Settings 中配置）。编辑器是 CodeMirror（首次聚焦时按需懒加载），**bash 语法高亮**（kubectl / openssl / heredoc 关键词正确着色；`<<EOF` 里的 YAML 显示为纯文本，这是有意的），Tab 缩进，右上角 **⛶** 按钮可一键全屏。全屏后答题框标签行会显示三个抽屉按钮 —— **🛠 Tools**（kubectl explain / kubectl -h）、**📝 Task**（题面）、**💡 Solution**（参考解答）—— 你无需退出全屏就能查语法或偷看解答。移动端字号为 16px，避免 iOS Safari 聚焦时自动放大。

### 🎯 Quiz

模拟考场环境的随机抽题练习。

**配置页面** — 选择：

- 来源过滤（domain、标签、只看收藏、只看未完成）
- 题量（5 / 10 / 17 整套模考 / 自定义最多 500）
- 时限（无 / 30 / 60 / 120 分钟）
- **顺序：** 🎲 Random（默认，均匀随机）、↑ Sequential（按题号顺序）、🏷 By tag、📑 By section。*By tag* 和 *By section* 都是先**均匀随机抽 N 道**，再把这 N 道按 tag（general → past exam → killer.sh A → B → killercoda）或 section（§1 → §2 → …）排序，让每个 tag/section 都按比例出现，而不是把所有题都给到第一组。
- 解答可见性（默认隐藏，点 **Reveal** 才显示 / 一直显示）

点 **▶ Start quiz** 开始。如果设置了时限，header 会显示倒计时。

**答题页 — 每个按钮的作用：**

| 按钮 | 作用 |
|---|---|
| **← Prev** | 跳到上一题。不会改变你的批改结果。 |
| **🚩 Flag** | 标记这题待回顾。被 Flag 的题会在结算页高亮。 |
| **👁 Reveal solution** | 显示参考解答。Reveal 之后，**Got it / Missed** 才可点击用于自评。 |
| **✓ Got it** | 自评：答对了。同时把这题标记为全局 **Done**（在 Browse 模式里也会看到）。 |
| **✗ Missed** | 自评：没答对。**不会**标 Done — 而且会清除已有的 Done 标记，让你以后还能再看到它。 |
| **↷ Skip** | 跳过不评分。Skip 的题会出现在结算页的"未评分"列表里。 |
| **Next →** | 跳到下一题。不会改变你的批改结果。 |
| **💾 Save snapshot** | 把整场 quiz 打个标签命名存起来，方便以后回来继续。保存后 active 槽位会清空，可以开新的 quiz；保存的 snapshot 出现在 setup 页。 |
| **⏹ End session** | 立刻结束。会直接显示已完成部分的总结。 |

**全屏编辑器 + 固定 quiz 控件栏。** 在答题框点 **⛶** 最大化编辑器 — 写长 YAML manifest 时尤其有用。最大化期间，悬浮层底部固定显示完整的 quiz 导航栏（**📋 Questions / ← Prev / 🚩 Flag / 👁 Reveal / ✓ Got it / ✗ Missed / ↷ Skip / Next →**），不用退出全屏就能翻题或判分。点 👁 Reveal 同时会弹出 **💡 Solution** 抽屉，参考解答覆盖在编辑器上方，无需退出全屏。Prev/Next 翻题会保留全屏状态，你可以一直在最大化视图里冲完整场。

**Resume 和 snapshot。** 每次答题动作都会自动保存到 `localStorage`。如果不小心关了 tab 或刷新了页面，Quiz setup 页顶部会出现 ⏸ 横幅，提示 **▶ Resume** 或 **✕ Discard**。只要存在未完成的会话，🎯 Quiz 标签上会有一个小 ● 提示。需要同时保留多场进行中的 quiz？点 **💾 Save snapshot** 命名当前会话，它会出现在 setup 页的 **💾 Snapshots** 列表里，直到你 Resume 或删除它。

**结算页** — 显示：总数 / 答对 / 答错 / 跳过 / Flag 数，以及每题列表。点 **▶ New quiz** 重开。

> Quiz 的对错评判完全是**自评** — 数据靠你自觉。LLM 批改器（Settings 里那个）是独立功能，在 Browse 模式的每张卡片的 **✓ Check** 按钮上才用到。

### 📖 Docs

镜像 kubernetes.io 的文档导航树，并对题库做了反向索引。

- 左侧浏览 docs 层级
- 点任一文档页 → 右侧内联渲染 kubernetes.io 的内容 + 列出关联到这页的题目
- 用于反向打开思路："想专门刷 ConfigMap 相关的题 — 题目分布在哪些位置？"

### 🔧 Tools

三个工具，对标考试时在终端里最常用的三个动作 — 离线打包进 SPA，第一次打开后离线可用。

- **📘 Explain** — 一个 `kubectl explain` 的 schema 浏览器。左侧挑一个 kind（Pod / Deployment / Service / …），右侧像 CLI 一样显示 `KIND / VERSION / DESCRIPTION / FIELDS`。点任何带 sub-schema 的字段可以下钻（`Pod → spec → containers → resources → limits`），breadcrumb 可以回上一层。搜索框支持按 kind 名或字段名搜索（输入 "affinity" 会同时命中 Pod、Deployment 等）。**详情内过滤**：进入某个 kind 后，详情面板顶部还有一个过滤框，可以在字段列表里再次缩小范围 —— 比如在 `Pod.spec` 里输 `tolerat` 就能把几十个字段直接收敛到 `tolerations`。手机端尤其有用，省了大量滚动。
- **📋 kubectl -h** — **逐字**收录了 ~80 个 kubectl 子命令的 `kubectl <verb> -h` 输出（包括 `kubectl create deployment`、`kubectl set image`、`kubectl rollout undo` 等等），跟考试 shell 里看到的完全一致，monospace 渲染。顶部的 **📋 Copy** 按钮一键把 `kubectl <cmd>` 复制到剪贴板。**详情内过滤**：详情面板顶部也有过滤框，按行隐藏不匹配的内容 —— 输 `--image`、`hostNetwork` 等就能直接定位到目标行。
- **手机（≤600 px）+ 抽屉内**：📘 Explain 和 📋 kubectl -h 采用 master-detail 流 —— 先看到全宽的列表，点某一项后详情会占满整个面板，顶部出现 `← Back` 按钮。点 Back 回到列表（焦点会跳回搜索框）。桌面端的并排布局不受影响。
- **📑 api-resources** — `kubectl api-resources -o wide` 风格的查表，收录 40 个 CKA 相关 kind。表头：**NAME**（plural）/ **SHORTNAMES** / **APIVERSION** / **NAMESPACED** / **KIND** / **VERBS**。过滤框接受任意列的纯文本匹配（如 `hpa`、`rbac`、`ingress`），还支持三种前缀语法：`namespaced:true|false`（cluster-scoped 还是 namespaced）、`verb:<动词>`（如 `verb:patch`）、`group:<组>`（如 `group:apps` 缩小到 Deployment / DaemonSet / ReplicaSet / StatefulSet）。点任意一行可直接跳进 📘 Explain 看该 kind 的完整 schema —— api-resources 当索引，Explain 当详情，跟 CLI 里这两个命令的关系一样。手机上（≤600px）表格自动折叠成卡片，避免横向滚动。

**版本下拉。** Tools 子标签栏里有个 `Version` 下拉，可以切换 kubernetes minor 版本 — 默认 **v1.35**（当前 CKA 考试目标）。Bundle 同时打包**最新两个稳定 minor + 始终包含 v1.35**：当前是 v1.35 + v1.34；k8s v1.36 发布后自动滚动到 v1.36 + v1.35。选择通过 `cka:tools:version` 持久化。每个版本的 bundle 在首次选中时才懒加载。

每个版本的内容在部署时从对应的 Kubernetes 发布版本和 kubectl 二进制中提取。每个 bundle 约 ~580KB 原始 / ~110KB gzipped，**只在你第一次打开 Tools 标签或切换版本时**才会懒加载，对初始页面打开速度没影响。

### 🖥 Nodes

CKA 考试跑在 kubeadm 装出来的集群上。🖥 Nodes 标签内置了一个 CP + worker 节点的**只读文件系统快照**，用来回答"这个文件在哪里？"/"static pod manifest 长什么样？"/"kubelet 读什么配置？"，即使没有真实集群也能查。

- **子标签：** **👑 Control plane**（~15 个文件：`/etc/kubernetes/manifests/*`、`admin.conf` / `super-admin.conf` / `*.conf`、`pki` 目录列表、kubelet config + service unit、containerd、CNI）和 **🛠 Worker**（~7 个文件：kubelet config、worker `kubelet.conf`、`pki/` 中只有 `ca.crt`、containerd、CNI）。
- **左侧文件树**，右侧文件内容 + **📋 Copy** 按钮。搜索框按路径过滤（如 `kube-apiserver`、`kubelet`、`containerd`）。
- **版本下拉**与 Tools 共享 `cka:tools:version` — 在任一标签切换版本，另一个也会跟着变。Static pod manifests 里的镜像 tag（如 `registry.k8s.io/kube-apiserver:v1.35.5`）按所选 minor 模板化。
- **脱敏：** 不会内置任何真实私钥、token、base64 secret — 敏感字节统一替换为 `LS0tLS1CRUdJTiBSRURBQ1RFRC1...` sentinel，格式可识别但内容不可还原。
- **只读。** 这不是模拟器 — 不能编辑、不能 `kubectl apply`、不能 drain。只用来查"标准文件长啥样"。

每个版本 bundle 约 30KB，**只在你第一次打开 Nodes 标签时**才会懒加载。

---

## 3. 顶栏控件

| 控件 | 作用 |
|---|---|
| 模式 Tab（📚 / 🎯 / 📖 / ❓ / 🔧 / 🖥）| 切换 Browse / Quiz / Docs / Help / Tools / Nodes。**手机端（≤768px）模式 Tab 会移到屏幕底部固定 Tab 栏**（iOS PWA 风格），把顶部 header 让出来。 |
| 搜索框 | 自由文本过滤（Browse 模式） |
| ⏱ 计时器 | Quiz 限时倒计时 |
| ☁ 同步 | 快捷的 Gist Push / Pull 弹层（使用 Settings 里配的 PAT + Gist ID；Test 在 Settings → Sync 里） |
| 🤖 LLM | LLM provider 快速切换 — 弹层列出所有已配置 API key 的 provider，当前活跃的会有 ✓ 标记。一键切换无需打开 Settings；每张答题卡的 "Using X (Y)" 提示会实时刷新。 |
| 🔄 刷新 | 强制重新加载最新部署内容 — 在 iOS PWA standalone 模式下尤其有用（不然必须强制退出 app 才能拿到新内容）。同时启动时会拉一份小小的 `version.json` 比对，发现新部署后底部会自动出现 "✨ New content available" 横幅。 |
| 🌓 主题切换 | 浅 / 深色模式（持久化） |
| ⌨️ 帮助 | 快捷键速查 |
| ⚙️ 设置 | LLM 批改、Backup、Gist 同步 |

---

## 4. ⚙️ Settings 面板

对话框分成三个子标签：**🤖 LLM**、**💾 Backup**、**☁ Sync**。一次只显示一个，所以对话框很紧凑，没有长长的滚动条。上次打开的子标签通过 `cka:settings:lastTab` 持久化，下次打开自动回到这里。

### 🤖 LLM（可选 · 自动批改）

让 Browse 卡片上的 **✓ Check** 把你的答案发给 LLM，返回 verdict（Correct / Partial / Not yet）、0–100 分、做对了什么、漏了什么。

1. **Provider** — Anthropic / OpenAI / DeepSeek / Qwen / Doubao / **GLM**（智谱 BigModel）/ Ollama（本地） 任选。一共 7 个。
2. **API key** — provider 的 key（Ollama 不需要）
3. **Test** — 校验 key，同时用该 provider 的真实模型列表自动填充 Model 下拉
4. **Model** — 在列表里选，或粘贴自定义 model id
5. **Auto-mark Done at score ≥ N** — 当批改分数 ≥ 阈值时，自动标 Done
6. **Save** 保存；**🧽 Clear this provider** 只清当前选中那个 provider 的槽位；**🗑 Clear all** 清掉所有 provider 的配置。两者都不会影响你的练习进度。

**每个 provider 独立记忆。** 每个 provider 的 API key、model、baseUrl、最近 Test 拿到的 model 列表都是**分开**存的。点不同的 provider 单选按钮只是把**表单视图**切到该 provider 已保存的配置 — 从 DeepSeek 切到 OpenAI 不会覆盖你的 DeepSeek key。标题旁显示 "N of 7 configured"；已配置的 provider 卡片显示绿色 ✓，当前活跃的还会有蓝色 ★。

**让 provider 变成活跃（用来批改的）：** 点击 provider 的单选按钮（表单视图会切到该 provider 已保存的 API key + model），然后点 **💾 Save & set as active** — 把表单写到当前选中 provider 的槽位 **并** 把这个 provider 设为活跃。状态行会确认是哪个 provider 刚被激活。配置了两个以上 provider 后，header 上的 **🤖 LLM** 弹层可以一键切换，无需再打开 Settings。

**流式 Check + Cancel。** 点 **✓ Check** 会启动流式批改 — 按钮本身变成 **✗ Cancel**，并实时显示 `(Xs · N chars)`；答题框下方出现虚线边的预览卡片，把响应流入的原始文本实时滚动展示出来。流结束后，标题短暂显示 **🧠 Parsing verdict…**，随后预览被解析后的 Got-right / Missed verdict 替换。任意时刻点 Cancel 都能立即中断 — 会留下 `✗ Cancelled after Xs · N chars received`，不会留下半成品状态。所有 provider 都支持（包括 Ollama）。

**🪙 Token 用量。** 每次 verdict 卡片底部多一行：`🪙 anthropic · claude-opus-4-7 · in 1,247 + out 567 = 1,814 tokens`。provider / model 是批改时刻锁定的，即使之后通过 🤖 弹层切了活跃 provider，这一行也仍然准确。Ollama（本地）显示 `🪙 Local model — no token accounting`。

Check 时发出去的内容：`{ 题目 + 参考解答 + 你的答案 }`，通过 HTTPS 发到你选的 provider。**Ollama 跑在 `localhost`，数据完全留在本机。**

**🐛 觉得参考答案有问题？** 当批改分数 < 100 时，verdict 下方会出现 **🐛 Reference solution looks wrong?** 链接。点开后是一个 issue 类型选择器，会根据 LLM 的 missed 关键词**自动预选**最接近的分类（例如包含 `auth can-i`、`kubectl get`、`kubectl describe` 时预选 "Verification bundled"）。六个分类：verification-bundled / wrong-resource / outdated-flag / missing-step / typo / other。每个分类自带预制 issue 正文模板。如果情况不在分类里，可以在 **Additional context** 里补充（选 "Other" 时必填）。解答展开区也有 **🐛 Suggest a fix** 入口。草稿保存在本地（`cka:fix-draft:<id>`），Export / Gist Push 会带上。每个 issue 会自动打上 `answer-fix` 标签和 `kind/<分类>` 标签，方便维护者按类型分流。

**`answer-fix` 分类选择指南**（auto-PR 工作流的 `kind/*` 标签会路由到对应的 aider prompt —— 选准分类才能拿到有用的 draft PR；`other` 默认按 no-op 处理）：

| 选择 | 何时用 | 具体例子 |
|---|---|---|
| `verification-bundled` | 参考答案里夹带了 `kubectl get` / `kubectl describe` / `kubectl logs` / `auth can-i` 这类验证命令，并不是题目要求的真正动作。 | 题目让你"为 Sandra 创建 CSR 并批准"，但参考解最后一行是 `kubectl get csr sandra -o jsonpath='{.status.certificate}' \| base64 -d > sandra.crt` —— 这是事后提取，不是创建+批准。 |
| `wrong-resource` | 参考用的 resource 名称 / namespace / kind / label 跟题目要求的不一致。 | 题目要求"在 `cka-20834` 命名空间下创建 role-binding"，参考解写的是 `default`。 |
| `outdated-flag` | 参考使用了已废弃的 kubectl flag 或语法，在当前 k8s 版本中已经无效。 | 参考里有 `--generator=run-pod/v1`（已被移除）。 |
| `missing-step` | 参考解答不完整，至少缺一个题目要求的步骤。 | 题目要求"批准 CSR **并提取证书**"，但参考只批准了。 |
| `typo` | 参考解答里有拼写错误或格式问题。 | `kubectl creat deployment`（少了 `e`）。 |
| `other` | 以上都不贴切。**只要你的 Additional context 里没有明确的动作动词**（add / remove / replace / reorder / fix），aider 会按 no-op 处理。**尽量优先选具体分类**，必要时拆成两个 issue。 | "参考解答里 `csr.spec.groups: -developers` 是可选的，题目没要求" —— 这种更适合单独开一个 `wrong-resource` issue，并在 Additional context 里明确写"删除 `groups:` 字段"，而不是用 `other`。 |

**🐛 发现题干或 docs 链接有问题？** 每张题卡的 task 正文下面（如果 H3 标题就是 task —— 来自 chadmcrowell 语料、没有 `**Task:**` 块的题 —— 则在 docs-link 行下方）有 **🐛 Suggest a fix for this task or docs** 按钮。点击后弹出同一个 report 弹窗，但切换到 **task 模式**：七个 issue 类型 *missing-docs-link*、*incorrect-docs-link*、*outdated-breadcrumb*、*unclear-task*、*factual-error*、*typo*、*other*。前三个跟 URL 相关的类型会显示 **Suggested kubernetes.io URL** 输入框；选了 *incorrect-docs-link* / *outdated-breadcrumb* 时还会出现一个下拉，列出该题现有的 docs 链接，让你明确指出是哪一个不对。弹窗同时把当前 task 正文 + 现有 docs 链接列表当作上下文展示，你可以确认维护者将看到什么。草稿保存在 `cka:task-fix-draft:<id>`，Export / Gist Push 会带上。每个 issue 自动打上 `task-fix` + `kind/<分类>` 标签，便于和 solution-fix issues 区分分流。

**`task-fix` 分类选择指南**（跟上面的 answer-fix 表同一逻辑 —— 分类对应 aider prompt 里的具体指令）：

| 选择 | 何时用 | 具体例子 |
|---|---|---|
| `missing-docs-link` | 题目涉及的概念 / 命令，对应的 kubernetes.io 页面**没有**出现在 `> 🔗` 块里。 | ca-1-002 只引用了 CSR 文档；Authentication 概念页也应该列上。 |
| `incorrect-docs-link` | `> 🔗` 块里已有的链接 URL 指向了错误的 kubernetes.io 页面（URL 跟面包屑或题目对不上）。 | 面包屑是 "Reference > API Access Control > RBAC"，但 URL 却是 `/docs/concepts/overview/`。 |
| `outdated-breadcrumb` | URL 没问题，但面包屑文字跟 kubernetes.io 现行导航对不上了。 | 面包屑写 "Concepts > Containers > …"，但页面已经移到 "Concepts > Workloads > Pods" 下。 |
| `unclear-task` | 题目措辞含糊 —— 两个读者可能写出完全不同但都"对"的答案。 | "Create a pod with a label" 没指明 label name / value。 |
| `factual-error` | 题目对 Kubernetes 行为的描述本身就是错的。 | 题目说 "kubelet 默认监听 10255 端口" —— 那是已弃用的只读端口，默认是 10250。 |
| `typo` | 题干或面包屑里有拼写或格式错误。 | `kubernates`（应该是 `kubernetes`）。 |
| `other` | 跟 answer-fix 那边一样的注意点 —— Additional context 不够明确时 aider 会按 no-op 处理。能用具体分类就别用 `other`。 | —— |

**提交流程**：**🚀 Open GitHub issue** 按钮的 URL 只预填 **title** 和 **labels**（保持 URL 短小，避免 iOS Safari 未登录跳转时被 GitHub 的 `?return_to=` 解析器搞出 500、也避免 GitHub iOS app 把超长 URL 直接吞掉）。完整的 **body 在点按瞬间自动复制到剪贴板** — 在 GitHub 的 issue 描述框里粘贴（Cmd+V / 长按 → 粘贴）即可。弹窗里另外提供 **📋 Copy title**（在 Issue title 行）和 **📋 Copy body**（在按钮行），分别复制每个字段 — iOS 安装了 GitHub app 后 Universal Links 可能把链接劫持进 app 并落到 app 首页（不到 new issue 页面），这时手动复制粘贴最稳。想保留浏览器内的预填，可以长按按钮 → **Open in Safari**。

**暂存到队列稍后批量提交 —— 三种入口**：刷题中途发现问题不想立刻打断节奏，有三种方式进队列：

- **🐞 Mark for follow-up**（每张卡片 ⭐ Bookmark 旁边）—— 一键标记 "这道题之后再看"，**完全不弹任何表单**，直接进队列。
- **🐛 Suggest a fix** + **💾 Save draft** —— 部分填写弹窗，存为草稿（数据保留，之后再编辑完）。
- **🐛 Suggest a fix** + **🚀 Open GitHub issue** —— 立即提交，并在队列里留一条 "Already opened" 记录。

之所以用 🐞 瓢虫而不是 🚩，是为了跟 Quiz 模式里"标记本题待复习"的 🚩 Flag 按钮在视觉上明确区分（两者含义完全不同）。

**Header 🐛 N 图标** 任意 tab 都能点开队列 popover。条目分两组：

- **To submit** —— 标记的题 + 你还没去 GitHub 开 issue 的草稿。每行按钮：**📝 Write report** / **✏ Edit**（打开弹窗）、**🚀 Open**（跳 GitHub，自动写 `submittedAt`）、**🗑 Remove**。
- **Already opened**（默认折叠）—— 已点过 🚀 Open 的草稿。每行按钮：**↻ Re-open**（清 submittedAt，重新开 GitHub 表单 —— 上次 GitHub 那边其实没真正提交时用）、**🗑 Remove**。

底部 **🚀 Open all unsubmitted** 批量打开所有 To-submit 项（间隔 150ms），同时把每条标为 submitted。

所有队列项通过 Gist 跨设备同步。

**Auto-PR 工作流（维护者一次性设置）**：仓库里有两个独立工作流 —— **Answer-fix → draft PR** (`.github/workflows/answer-fix-pr.yml`) 处理参考解答类的 issue，**Task-fix → draft PR** (`.github/workflows/task-fix-pr.yml`) 处理 task / docs 链接类的 issue。两者都通过 [aider](https://aider.chat) + 你选的 LLM（Anthropic / OpenAI / DeepSeek / Qwen / Doubao / Ollama / Copilot via GitHub Models）只改动单个 H3 块，转换成 draft PR。**第一次跑之前需要先打开**：**Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** — 否则工作流会跑完所有步骤、推上修复分支，但最后一步 `gh pr create` 会被 GitHub 拒绝；机器人会在 issue 上留 🚨 评论，并给出 `pull/new/<branch>` 的一键手动建 PR 链接。默认 provider 是 `copilot`（零密钥，复用工作流自带的 `GITHUB_TOKEN` + `models: read` 权限）；要用其它 provider 在仓库 Secrets 里加对应的 `*_API_KEY` 即可。另外有一个小的 `.github/workflows/seed-labels.yml` 工作流，提前在仓库创建好这两条流水线需要的全部 14 个 issue 标签 —— 它会在首次部署时自动跑一次，之后只在维护者修改这个 seed 文件本身时再触发，从而保证 SPA 预填的 `?labels=…` 即使是"第一次出现的某种 kind"也能正确落标。aider 的 prompt 模板分别放在 `.github/answer-fix/prompt.md` 和 `.github/task-fix/prompt.md`；两者共享 `scripts/answer-fix/` 下的工具脚本（issue 解析 + H3 提取 / splice）。

### Backup & restore

- **⬇ Export progress** — 下载 `cka-progress-<时间戳>.json`。包含：Done 状态、收藏、保存的答案、主题、上次 quiz 配置、docs 上次打开页。**LLM API key 不会包含在内。**
- **⬆ Import progress…** — 选择之前导出的文件。弹出计数确认对话框后，用文件内容覆盖本地状态（如果导入的文件没有 API key，则保留本地 key）。

### GitHub Gist 同步（跨设备）

和 Export/Import 的格式完全相同，但通过 GitHub Gist API 推 / 拉到 private Gist。

1. 在 <https://github.com/settings/tokens?type=beta> 创建 PAT，**只勾选 `gist` scope**（fine-grained 或 classic 均可）
2. 粘贴到 **GitHub PAT**（只存在 `localStorage`，绝不参与同步）
3. 已有 Gist 的话填进 **Gist ID**；留空则首次 Push 时自动创建
4. **Test** — 调 `/user` 验证 token，显示 `✓ Authenticated as @<你的 GitHub 用户名>`
5. **⬆ Push to Gist** — 上传当前状态。首次 Push 会自动把新 gist ID 填到输入框
6. **⬇ Pull from Gist** — 从 gist 拉取，确认对话框后用 gist 内容覆盖本地

**自动 Push（默认开启）。** 一旦 PAT 和 Gist ID 都配好，SPA 会在**最后一次"会改进度"的编辑**之后**等 30 秒**自动发起一次 Push（标 Done、加书签、保存答案、产生 verdict、quiz 任何状态变化都算）。10 秒内连点 5 次 Done = 30 秒后只有一次 Push。再也不用记得切设备前要手动推。纯 UI 偏好（主题、过滤、Tools 子标签）**不会**触发自动同步。要关闭：Settings → Sync 取消勾选 **Auto-push 30 s after changes**。

**Per-key 合并 —— 不再有冲突弹窗。** Push 和 Pull 现在都走 per-key 合并引擎，不再是整体覆盖。Push 之前若检测到远端比本设备基线新（无论是另一台设备改的，还是本设备自己上次 beacon push 留下的），SPA **自动** 拉取远端、合并本地未推送的改动、再推合并结果。规则：

- `cka:done` / `cka:bookmark`：按 id 取并集 + tombstone（在 A 设备取消 Done 会通过 `cka:sync:keymeta` 侧表里的 `{v:false, t:ISO}` 在 B 设备生效）。
- `cka:answer:*`：按 `savedAt` 取新。
- `cka:quiz:active` / `cka:quiz:snapshots`：按 `cka:sync:keymeta.t` 取新。
- LLM 设置：本设备的 `apiKey` 始终保留，不会被合并覆盖。

本设备未推送的本地编辑永远不会被 Pull 吃掉。手动 ⬇ Pull、⬆ Push 走同一套引擎 —— 都是无损的。

**Pre-pull backup + 一键回滚。** 每次 Pull（或 Backup 文件 Import）前，SPA 会先把当前状态快照到 `cka:sync:prepull-backup`，保证 import 可逆。回滚按钮走的是整体覆盖（要忠实还原 Pull 之前的状态）；普通 Pull / auto-merge 路径走合并引擎。

**关页面安全网。** 如果你在 30 秒 debounce 窗口内关掉浏览器，会有一次 best-effort 的 `keepalive:true` PATCH 在 `beforeunload` 时触发 — 不让你最后一波编辑丢失。下次打开页面时，SPA 会从 gist 当前的 `updated_at` 重新校准本地基线，避免本设备跟自己过去的 beacon push 打架。

**后台标签页安全网。** 浏览器会大幅压制后台标签里的 `setTimeout`（Chrome ≈ 1 次/分钟，Safari 更甚），所以 30 秒 debounce 在后台可能会睡很久。SPA 监听 `visibilitychange`：当标签回到前台时，如果待 push 已经过了 30 秒窗口，立即触发；否则按剩余时间重新排程。换标签页不会丢同步。

**如何确认 auto-sync 是否在工作。** 随时打开 ☁ 弹层 — 顶部一行明确显示当前 auto-sync 的状态：

| 顶部行 | 含义 |
|---|---|
| `🔄 Auto-push: on · idle` | 已配置、就绪，没有待 push 编辑 |
| `🔄 Auto-push: on · next push in ~22s` | 定时器在等，倒计时每秒刷新 |
| `🔄 Auto-pushing… (3.2s)` | 正在上传 |
| `🔄 Auto-push: off — enable in Settings → Sync` | 你在 Settings 关闭了自动 push |
| `⚙️ Auto-push: needs a Gist ID — run a manual ⬆ Push first` | 有 PAT 但还没 Gist ID；手动 Push 一次就有 |
| `⚙️ Auto-push: needs a GitHub PAT` | 没配 PAT |
| `⚠ Auto-push failed (X min ago): <message>` | 上次自动 push 失败；详情看 Settings → Sync |

`⬆ Last push` 行如果是 auto-sync 触发，会带 `(auto)` 标签（手动 push 没有）。☁ 状态点在等待时缓慢闪动 accent 色，推送中变蓝色，成功后绿色 ~30 秒，有未读错误时红色。

PAT 配置好之后，也可以直接点 header 上的 **☁ 同步** 图标，无需重新打开 Settings 就能 Push / Pull。（Test 仅在 Settings → Sync 里 —— 它是首次配置时的校验工具，平时用不到。）

---

## 5. 持久化机制

所有状态都在浏览器的 `localStorage`，前缀 `cka:`。**任何数据都不会被发送到任何服务器，除非你主动点击 Check / Test / Push / Pull。** 清除站点数据 = 全部丢失（Settings → Clear all 只会清除 LLM 设置）。

DevTools 里你能看到的 key：

| Key | 内容 |
|---|---|
| `cka:done` | `{ exerciseId: true, … }` |
| `cka:bookmark` | `{ exerciseId: true, … }` |
| `cka:answer:<exerciseId>` | 每题的答案 + 上次 LLM 批改结果 |
| `cka:theme` | `"light"` / `"dark"` |
| `cka:quiz:active` | 自动保存的进行中 quiz（单槽位，结束时自动清除） |
| `cka:quiz:snapshots` | 命名快照列表（每个 snapshot 是一场独立的 quiz 会话） |
| `cka:quiz:lastOrder` | 上次使用的 Quiz 顺序 — `"random"` / `"sequential"` / `"tag"` / `"section"`（默认 `random`） |
| `cka:tools:lastSubtab` | `"explain"`、`"kubectl"` 或 `"api-resources"` — 回到 Tools 标签时恢复 |
| `cka:tools:lastKind` | Tools › Explain 上次打开的 kind |
| `cka:tools:lastPath` | Explain 当前的钻取路径（如 `["spec","containers","resources"]`） |
| `cka:tools:lastCmd` | Tools › kubectl -h 上次打开的命令（如 `"create deployment"`） |
| `cka:tools:version` | Tools / Nodes 标签当前选中的 k8s minor 版本（如 `"1.35"`）；未设置时默认 `1.35` |
| `cka:settings:lastTab` | Settings 对话框上次打开的子标签 — `"grading"` / `"backup"` / `"sync"`（默认 `grading`） |
| `cka:nodes:lastRole` | Nodes 当前角色 — `"controlplane"` 或 `"worker"` |
| `cka:nodes:lastPath` | Nodes 上次打开的文件路径（如 `"/etc/kubernetes/manifests/kube-apiserver.yaml"`） |
| `cka:docs:lastUrl` | 上次打开的 docs 页 |
| `cka:llm:settings` | Provider、API key、model、Auto-Done 阈值 |
| `cka:llm:privacyAck` | 是否已经关闭首次使用时的隐私提示 |
| `cka:gist:token` | GitHub PAT（绝不会被导出 / 同步） |
| `cka:gist:id` | Push / Pull 用的 Gist ID |
| `cka:sync:meta` | 每设备的同步元数据 — 最近 push/pull/test 时间戳、最近错误、最近同步的 gist `updated_at`（永远不会随 gist 同步过去） |
| `cka:sync:prepull-backup` | 每次 Pull / Import 前留的快照，**↩ Restore pre-pull backup** 按钮用它回滚 |
| `cka:sync:autoDisabled` | 取消 Settings → Sync 的 **Auto-push 30 s after changes** 时为 `true` |
| `cka:sync:dirtyAt` | 最近一次"会改进度"编辑的 ISO 时间戳 — 自动 Push 成功后清空 |

题目 ID（如 `ca-1-005`）是按章节顺序生成的。仓库要求贡献者遵守 **append-only**（只在末尾追加）规则（见 `CLAUDE.md`），新增题目不会让已有 ID 漂移，从而不会破坏老用户的进度。

### GitHub Pages 更新时会怎样？

`docs/exercises.json` 会重新生成 — 但只要贡献者遵守只追加的规则，所有已有题目 ID 都保持不变，你的 Done / Bookmark / Answer 状态都不会丢。

---

## 6. 安全与隐私

整个页面**没有后端**。把它当作任何"BYO key"的 web 工具来理解。

| 关心的问题 | 实际情况 |
|---|---|
| 不同用户之间隔离吗？ | 是。`localStorage` 是按 origin **且按浏览器 profile** 隔离的。用户 A 的进度对用户 B 完全不可见 — 除非他们用同一个操作系统账号 + 同一个浏览器 profile。 |
| 我的 API key 存哪里？ | `localStorage` 里，明文（"at rest" 的加密交给浏览器做，我们没碰）。 |
| 谁能读到我的 API key？ | 任何能在你浏览器 profile 里执行代码的人 — 这跟其它"浏览器保存的凭证"是同一个信任边界。SPA 本身除了 Check / Test 时把它放到 `Authorization` header，绝不会记日志或上传到任何其它地方。 |
| 这个站会追踪我吗？ | 没有 analytics、没有 telemetry、没有 cookie。所有的网络调用只在：点 Check（→ 你的 LLM provider）、Test（→ 你的 LLM provider 或 GitHub）、Push / Pull（→ GitHub Gist API）时发生。 |
| 有人偷看屏幕能看到 key 吗？ | API key 输入框是 `type="password"`，默认是星号；但它保存在客户端，任何能打开 DevTools / Application 标签的人都能读到。 |
| Gist 是私有的吗？ | 创建的是 **secret gist**（`public: false`）。secret gist 不会出现在公开列表里，但**不是真正的访问控制** — 任何拿到 URL 的人都能读。所以同步数据里不要放敏感秘密。（API key 就是因为这个原因从来不参与同步。） |
| 网络上到底发了什么？ | HTTPS 发给：你选的 LLM provider（Check / Test 时）、`api.github.com`（Push / Pull / Test 时）。仅此而已。 |

**如果你的浏览器 profile 是和不信任的人共用的**，离开前点 Settings → Clear all，或干脆开无痕窗口使用。

---

## 7. 键盘快捷键

| 键 | 作用 |
|---|---|
| <kbd>j</kbd> / <kbd>↓</kbd> | 下一题（Browse） / 下一道（Quiz） |
| <kbd>k</kbd> / <kbd>↑</kbd> | 上一题 |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd> <kbd>6</kbd> | 切到 Browse / Quiz / Docs / Help / Tools / Nodes |
| <kbd>/</kbd> | 聚焦搜索框 |
| <kbd>Space</kbd> | 展开 / 收起解答（聚焦的 Browse 卡片） |
| <kbd>d</kbd> | 切换 Done（聚焦的 Browse 卡片） |
| <kbd>b</kbd> | 切换 Bookmark（聚焦的 Browse 卡片） |
| <kbd>?</kbd> | 切换帮助面板 |
| <kbd>Esc</kbd> | 关闭帮助 / 让搜索框失焦 |

在输入框打字时，快捷键不会被触发。

---

## 8. 常见问题

**Q. 站点重新部署后我的进度会丢吗？**
不会。`localStorage` 和静态资源是相互独立的。只要贡献者遵守 append-only 规则（这条已经写进 `CLAUDE.md`），所有已有题目 ID 都不会变。

**Q. 换浏览器 / 换设备了，怎么把进度带过去？**
最简单：两端都配好 Gist 同步（PAT + 同一个 Gist ID）。30 秒自动 Push 让老机器始终是最新的，新机器上点一次 **⬇ Pull** 就行。如果不小心 pull 反了，Settings → Sync 的 **↩ Restore pre-pull backup** 按钮一键回滚。也可以用：**Export** → 文件拷到新机器 → **Import**。

**Q. LLM Test 按下去一直转圈？**
批改器有 15 秒超时；如果真的卡住，多半是 provider 不允许浏览器直连（Doubao 经常如此）。换成对 CORS 友好的 provider（Anthropic / OpenAI / DeepSeek / Ollama）即可。

**Q. 能不能把 API key 也一起同步？**
故意不行。Export 和 Gist Push 的 payload 都会主动清除 API key — 每台设备需要单独配置。

**Q. 在哪反馈 bug / 建议加题？**
<https://github.com/xooooooooox/cka-exercises/issues>。
