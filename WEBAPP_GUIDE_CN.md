# 在线练习页面 — 使用指南

[English version](WEBAPP_GUIDE.md) · [工程 README](README_CN.md) · [备考索引](EXAM_GUIDE_CN.md)

5 分钟把 <https://xooooooooox.github.io/cka-exercises/> 完整讲清楚：三种模式、Quiz 每个按钮的作用、答题数据是如何持久化的、跨设备同步怎么用、隐私和安全到底保证了什么。

> **一句话总结。** 顶部切换模式，Browse 学习、Quiz 限时刷题、Docs 学官方文档树。所有操作都存在浏览器 `localStorage` 里 — 不会有任何数据出本机，除非你点 **Test / Check**（发给你选的 LLM provider）或 **Push / Pull**（发到你自己的 private GitHub Gist）。

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

默认模式。约 205 道题一个滚动列表。

- **搜索 / 过滤**：自由文本 + domain + 标签（`CKA Past Exam` / `Killer.sh A / B` / `General`）+ 收藏 + "未完成"
- 每张卡片可独立 **展开 / 折叠解答** — 不会剧透其它题
- 每题可标 **✓ Done** 和 **⭐ Bookmark**；侧边栏按 domain 显示进度条
- 在 **✏️ Your answer** 文本框输入答案，点 **✓ Check** 由 LLM 批改（需先在 Settings 中配置）

### 🎯 Quiz

模拟考场环境的随机抽题练习。

**配置页面** — 选择：

- 来源过滤（domain、标签、只看收藏、只看未完成）
- 题量（5 / 10 / 17 整套模考 / 自定义最多 500）
- 时限（无 / 30 / 60 / 120 分钟）
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

**Resume 和 snapshot。** 每次答题动作都会自动保存到 `localStorage`。如果不小心关了 tab 或刷新了页面，Quiz setup 页顶部会出现 ⏸ 横幅，提示 **▶ Resume** 或 **✕ Discard**。只要存在未完成的会话，🎯 Quiz 标签上会有一个小 ● 提示。需要同时保留多场进行中的 quiz？点 **💾 Save snapshot** 命名当前会话，它会出现在 setup 页的 **💾 Snapshots** 列表里，直到你 Resume 或删除它。

**结算页** — 显示：总数 / 答对 / 答错 / 跳过 / Flag 数，以及每题列表。点 **▶ New quiz** 重开。

> Quiz 的对错评判完全是**自评** — 数据靠你自觉。LLM 批改器（Settings 里那个）是独立功能，在 Browse 模式的每张卡片的 **✓ Check** 按钮上才用到。

### 📖 Docs

镜像 kubernetes.io 的文档导航树，并对题库做了反向索引。

- 左侧浏览 docs 层级
- 点任一文档页 → 右侧内联渲染 kubernetes.io 的内容 + 列出关联到这页的题目
- 用于反向打开思路："想专门刷 ConfigMap 相关的题 — 题目分布在哪些位置？"

### 🔧 Tools

两个工具，对标考试时在终端里最常用的两个动作 — 离线打包进 SPA，第一次打开后离线可用。

- **📘 Explain** — 一个 `kubectl explain` 的 schema 浏览器。左侧挑一个 kind（Pod / Deployment / Service / …），右侧像 CLI 一样显示 `KIND / VERSION / DESCRIPTION / FIELDS`。点任何带 sub-schema 的字段可以下钻（`Pod → spec → containers → resources → limits`），breadcrumb 可以回上一层。搜索框支持按 kind 名或字段名搜索（输入 "affinity" 会同时命中 Pod、Deployment 等）。
- **📋 kubectl -h** — **逐字**收录了 ~80 个 kubectl 子命令的 `kubectl <verb> -h` 输出（包括 `kubectl create deployment`、`kubectl set image`、`kubectl rollout undo` 等等），跟考试 shell 里看到的完全一致，monospace 渲染。顶部的 **📋 Copy** 按钮一键把 `kubectl <cmd>` 复制到剪贴板。

**版本下拉。** Tools 子标签栏里有个 `Version` 下拉，可以切换 kubernetes minor 版本 — 默认 **v1.35**（当前 CKA 考试目标）。Bundle 同时打包**最新两个稳定 minor + 始终包含 v1.35**：当前是 v1.35 + v1.34；k8s v1.36 发布后自动滚动到 v1.36 + v1.35。选择通过 `cka:tools:version` 持久化。每个版本的 bundle 在首次选中时才懒加载。

每个版本的内容在部署时从对应的 Kubernetes 发布版本和 kubectl 二进制中提取。每个 bundle 约 ~580KB 原始 / ~110KB gzipped，**只在你第一次打开 Tools 标签或切换版本时**才会懒加载，对初始页面打开速度没影响。

---

## 3. 顶栏控件

| 控件 | 作用 |
|---|---|
| 模式 Tab（📚 / 🎯 / 📖 / ❓ / 🔧）| 切换 Browse / Quiz / Docs / Help / Tools |
| 搜索框 | 自由文本过滤（Browse 模式） |
| ⏱ 计时器 | Quiz 限时倒计时 |
| ☁ 同步 | 快捷的 Gist Push / Pull / Test 弹层（使用 Settings 里配的 PAT + Gist ID） |
| 🌓 主题切换 | 浅 / 深色模式（持久化） |
| ⌨️ 帮助 | 快捷键速查 |
| ⚙️ 设置 | LLM 批改、Backup、Gist 同步 |

---

## 4. ⚙️ Settings 面板

### LLM 自动批改（可选）

让 Browse 卡片上的 **✓ Check** 把你的答案发给 LLM，返回 verdict（Correct / Partial / Not yet）、0–100 分、做对了什么、漏了什么。

1. **Provider** — Anthropic / OpenAI / DeepSeek / Qwen / Doubao / Ollama（本地） 任选
2. **API key** — provider 的 key（Ollama 不需要）
3. **Test** — 校验 key，同时用该 provider 的真实模型列表自动填充 Model 下拉
4. **Model** — 在列表里选，或粘贴自定义 model id
5. **Auto-mark Done at score ≥ N** — 当批改分数 ≥ 阈值时，自动标 Done
6. **Save** 保存；**Clear all** 只清除 LLM 设置（不动你的练习进度）

Check 时发出去的内容：`{ 题目 + 参考解答 + 你的答案 }`，通过 HTTPS 发到你选的 provider。**Ollama 跑在 `localhost`，数据完全留在本机。**

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

> Push 和 Pull 完全**手动**触发，没有自动同步。Last-write-wins（不会做合并）。API key 不会同步。

PAT 配置好之后，也可以直接点 header 上的 **☁ 同步** 图标，无需重新打开 Settings 就能 Push / Pull / Test。

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
| `cka:tools:lastSubtab` | `"explain"` 或 `"kubectl"` — 回到 Tools 标签时恢复 |
| `cka:tools:lastKind` | Tools › Explain 上次打开的 kind |
| `cka:tools:lastPath` | Explain 当前的钻取路径（如 `["spec","containers","resources"]`） |
| `cka:tools:lastCmd` | Tools › kubectl -h 上次打开的命令（如 `"create deployment"`） |
| `cka:tools:version` | Tools 标签当前选中的 k8s minor 版本（如 `"1.35"`）；未设置时默认 `1.35` |
| `cka:docs:lastUrl` | 上次打开的 docs 页 |
| `cka:llm:settings` | Provider、API key、model、Auto-Done 阈值 |
| `cka:llm:privacyAck` | 是否已经关闭首次使用时的隐私提示 |
| `cka:gist:token` | GitHub PAT（绝不会被导出 / 同步） |
| `cka:gist:id` | Push / Pull 用的 Gist ID |

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
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd> | 切到 Browse / Quiz / Docs / Help / Tools |
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
两种方式：(a) **Export** → 文件拷到新机器 → **Import**。(b) 两端都配置 Gist 同步 — 老机器 **Push**，把 gist ID 粘到新机器，**Pull**。

**Q. LLM Test 按下去一直转圈？**
批改器有 15 秒超时；如果真的卡住，多半是 provider 不允许浏览器直连（Doubao 经常如此）。换成对 CORS 友好的 provider（Anthropic / OpenAI / DeepSeek / Ollama）即可。

**Q. 能不能把 API key 也一起同步？**
故意不行。Export 和 Gist Push 的 payload 都会主动清除 API key — 每台设备需要单独配置。

**Q. 在哪反馈 bug / 建议加题？**
<https://github.com/xooooooooox/cka-exercises/issues>。
