# cka-exercises

[English version](README.md)

整理过的 CKA（Certified Kubernetes Administrator）练习题库，来源于上游 [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises)、killer.sh Simulator A/B PDF、KillerCoda CKA 模拟考 PDF（每个考点一份），以及社区流传的 CKA 历年真题。清洗、规整、按来源打标签，最终以两种形态呈现：

- **Markdown 文件** —— [`exercises/`](exercises/) 下，每个 CKA 考点一个文件，共 ~271 个 H3 条目。
- **静态 SPA** —— [`docs/`](docs/)，提供浏览 / 测验 / Docs 树 三种模式。通过 GitHub Actions 自动构建并部署。

> 👉 **要备考 CKA 吗？** 从 [`EXAM_GUIDE_CN.md`](EXAM_GUIDE_CN.md) 开始 —— 那是面向考生的备考索引（大纲、标签说明、考前 dotfiles、同步脚本、参考资料、其他练习平台）。

## 🎯 在线练习页面

**在线地址：** <https://xooooooooox.github.io/cka-exercises/> · **使用指南：** [`WEBAPP_GUIDE_CN.md`](WEBAPP_GUIDE_CN.md)

[`docs/`](docs/) 下是一个静态 SPA，提供浏览 / 测验 / 文档树 三种模式，覆盖全部 ~271 道题。支持按考点 / 标签（`CKA Past Exam` / `Killer.sh A / B` / `KillerCoda` / 通用）/ 收藏 / 未完成多维过滤。测验模式可随机抽题、设置 30 / 60 / 120 分钟限时、自我打分、生成会话总结。Docs 模式镜像 kubernetes.io 导航树，每个文档页反向链接关联的题目。

推送到 `main` 后，GitHub Pages 通过 [`.github/workflows/build-and-deploy-docs.yml`](.github/workflows/build-and-deploy-docs.yml) 自动部署（需在仓库 Settings → Pages → Source 选择 GitHub Actions）。

进度（✓ 已完成、⭐ 收藏、主题、Docs 上次选中页）通过 `localStorage` 持久化。Markdown 由 CDN 加载的 Marked.js 渲染，运行时无需构建。

## 📸 截图

### 电脑端

![Browse 模式 —— 左侧目录树、顶部筛选条、中部题目卡片。](assets/screenshots/desktop-browse.png)

![Quiz 模式 —— 答题中的会话，含答题编辑器与 LLM 评分卡（Got it / ◐ Partial / ✗ Missed 三档自评）。](assets/screenshots/desktop-quiz.png)

![Docs 模式 —— 左侧 kubernetes.io 导航树，右侧叶子页详情 + 反向链接到对应练习。](assets/screenshots/desktop-docs.png)

### 手机端

<p align="center">
  <img src="assets/screenshots/mobile-browse.png" width="240" alt="iPhone 上的 Browse —— 底部固定 mode-tabs（Browse / Quiz / Docs / Help / Tools / Nodes），紧凑的筛选工具栏。">
  <img src="assets/screenshots/mobile-quiz.png" width="240" alt="iPhone 上的 Quiz —— 三档自评行（Got it / Partial / Missed）当前状态高亮，下面是工具行（Prev / Flag / Reveal / Skip / Next）。">
  <img src="assets/screenshots/mobile-docs.png" width="240" alt="iPhone 上的 Docs 树，分类可折叠。">
</p>

## 项目结构

```
.
├── README.md / README_CN.md           # 本文件 —— 工程 README
├── EXAM_GUIDE.md / EXAM_GUIDE_CN.md   # 面向 CKA 考生的备考索引
├── WEBAPP_GUIDE.md / WEBAPP_GUIDE_CN.md # webapp 使用指南
├── CHANGELOG.md                       # 全部仓库变更；Help mode 内可读
├── CLAUDE.md                          # Claude Code 的仓库指引
├── package.json                       # npm run build / lint / serve / link-check / release
├── assets/
│   ├── killer-sh/                     # killer.sh Simulator A/B PDF
│   ├── killercoda/                    # KillerCoda CKA 模拟考 PDF（按 domain 拆分）
│   └── screenshots/                   # README 截图（电脑端 + 手机端）
├── docs/                              # 练习 SPA（GitHub Pages 源目录）
│   ├── index.html / app.js / style.css
│   ├── llm.js / sync.js               # LLM 评分 + Gist 同步引擎
│   ├── sw.js                          # service worker 源（sw.gen.js 是构建产物）
│   ├── manifest.webmanifest + icons/  # PWA 安装 + app 图标
│   └── *.json / sw.gen.js             # gitignored —— 构建产物（exercises / version / tools / nodes）
├── exercises/                         # 源 markdown —— 每个 CKA 考点一个文件
│   ├── cluster-architecture.md        # 25% — 114 道题
│   ├── scheduling.md                  # 15% —  49 道题
│   ├── networking.md                  # 20% —  32 道题
│   ├── storage.md                     # 10% —  28 道题
│   └── troubleshooting.md             # 30% —  48 道题
├── tools/
│   └── nodes/snapshot/                # Nodes 模式文件系统快照源 + versions.json
├── scripts/                           # build / lint / release / verify / 一次性 enrichment 脚本
└── .github/
    ├── answer-fix/prompt.md / task-fix/prompt.md  # 修复 PR 工作流的 aider 提示词
    └── workflows/                     # build-and-deploy / lint / link-check / curriculum-watch / release / fix-PR / seed-labels
```

`CLAUDE.md` 包含完整的逐文件清单，供贡献者参考。`scripts/` 下的 `apply-*.mjs` 是幂等的一次性脚本，保留作为可追溯记录。CI 中只运行 `build-exercises.mjs` / `build-sw.mjs` / `lint-exercises.mjs` / `check-links.mjs`。

## 本地运行

要求 **Node 20+** 和 Python 3（用于静态文件服务器）。

```shell
npm run serve        # 自动重新构建 docs/exercises.json 后启动 :8080
# 打开 http://localhost:8080

npm run build        # 重新生成 docs/exercises.json + docs/sw.gen.js
npm run lint         # 校验 exercises/*.md 格式
npm run link-check   # ping 所有 kubernetes.io URL（慢 —— 约 106 个 URL）
npm run release:dry  # 预览下一次 semver bump（不写文件、不 push）
```

`docs/exercises.json` 是 `exercises/*.md` 的构建产物，每次 `npm run build` / `npm run serve` 以及 Pages 部署时自动重生。该文件已 gitignore，不会出现在 PR 中。

版本遵循 [semver](https://semver.org/)（`vX.Y.Z`），通过 Actions UI → **Release** → **Run workflow** 手动触发（默认从 [CHANGELOG.md](CHANGELOG.md) 的 `[Unreleased]` 块自动推断 bump）。release 流水线会把 changelog 的 `[Unreleased]` 改名为 `[vX.Y.Z] - YYYY-MM-DD`、commit、打 tag、创建 [GitHub Release](https://github.com/xooooooooox/cka-exercises/releases)，部署紧随其后。完整规则见 [CLAUDE.md](CLAUDE.md) 的 `## Release workflow` 一节。

## CI

八个 GitHub Actions workflow：

- **`build-and-deploy-docs.yml`** —— `main` 推送时：lint、build `exercises.json` + `sw.gen.js` + 每版本 Tools / Nodes bundle，把 `docs/` 部署到 Pages。
- **`lint.yml`** —— 非 main 分支推送和 PR 时：lint + 验证 build 仍可用。
- **`link-check.yml`** —— 每周一定时 + 手动触发：ping 题目里引用的所有 kubernetes.io URL。
- **`curriculum-watch.yml`** —— 每周一定时 + 手动触发：检测上游 CNCF curriculum PDF 是否漂移，触发时自动开 issue。
- **`release.yml`** —— 手动触发：bump `package.json.version`、改写 `CHANGELOG.md` `[Unreleased]` → `[vX.Y.Z]`、打 tag、创建 GitHub Release。
- **`answer-fix-pr.yml`** —— 手动触发：把指定的 `answer-fix` issue 用 aider 处理一段 H3 → 开 draft PR 关闭该 issue。
- **`task-fix-pr.yml`** —— 手动触发：跟 `answer-fix-pr.yml` 同形态，但处理 `task-fix` issue（缺失的 docs 链接、不清晰的题干等等）。
- **`seed-labels.yml`** —— 幂等的 label 引导。触发条件：`workflow_dispatch` + 推送到 `main` 且路径限定在它自己 —— 首次部署时自动跑一次，之后只在 seed 文件本身被改动（例如新增 `kind/*` 标签）时才再跑，常规 push 不会触发它。

## 贡献

参见 `CLAUDE.md`：题目文件格式规约、标签约定、常见任务套路。改动 `exercises/*.md` 的 PR 合并前需 lint 通过（`npm run lint`）。
