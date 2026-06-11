# cka-exercises

[English version](README.md)

整理过的 CKA（Certified Kubernetes Administrator）练习题库，来源于上游 [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises)、killer.sh Simulator A/B PDF，以及社区流传的 CKA 历年真题。清洗、规整、按来源打标签，最终以两种形态呈现：

- **Markdown 文件** —— [`exercises/`](exercises/) 下，每个 CKA 考点一个文件，共 ~205 个 H3 条目。
- **静态 SPA** —— [`docs/`](docs/)，提供浏览 / 测验 / Docs 树 三种模式。通过 GitHub Actions 自动构建并部署。

> 👉 **要备考 CKA 吗？** 从 [`EXAM_GUIDE_CN.md`](EXAM_GUIDE_CN.md) 开始 —— 那是面向考生的备考索引（大纲、标签说明、考前 dotfiles、同步脚本、参考资料、其他练习平台）。

## 🎯 在线练习页面

**在线地址：** <https://xooooooooox.github.io/cka-exercises/>

[`docs/`](docs/) 下是一个静态 SPA，提供浏览 / 测验 / 文档树 三种模式，覆盖全部 ~205 道题。支持按考点 / 标签（`CKA Past Exam` / `Killer.sh A / B` / 通用）/ 收藏 / 未完成多维过滤。测验模式可随机抽题、设置 30 / 60 / 120 分钟限时、自我打分、生成会话总结。Docs 模式镜像 kubernetes.io 导航树，每个文档页反向链接关联的题目。

推送到 `main` 后，GitHub Pages 通过 [`.github/workflows/build-and-deploy-docs.yml`](.github/workflows/build-and-deploy-docs.yml) 自动部署（需在仓库 Settings → Pages → Source 选择 GitHub Actions）。

进度（✓ 已完成、⭐ 收藏、主题、Docs 上次选中页）通过 `localStorage` 持久化。Markdown 由 CDN 加载的 Marked.js 渲染，运行时无需构建。

## 项目结构

```
.
├── README.md / README_CN.md           # 本文件 —— 工程 README
├── EXAM_GUIDE.md / EXAM_GUIDE_CN.md   # 面向 CKA 考生的备考索引
├── CLAUDE.md                          # Claude Code 的仓库指引
├── package.json                       # npm run build / lint / link-check / serve
├── assets/                            # killer.sh Simulator A/B PDF
├── docs/                              # 练习 SPA（GitHub Pages 源目录）
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── exercises.json                 # gitignore —— 由 scripts/build-exercises.mjs 生成
├── exercises/                         # 源 markdown —— 每个 CKA 考点一个文件
│   ├── cluster-architecture.md        # 25% — 100 道题
│   ├── scheduling.md                  # 15% —  39 道题
│   ├── networking.md                  # 20% —  24 道题
│   ├── storage.md                     # 10% —  18 道题
│   └── troubleshooting.md             # 30% —  24 道题
└── scripts/
    ├── build-exercises.mjs            # MD → JSON 转换（每次构建 / Pages 部署都会运行）
    ├── lint-exercises.mjs             # 校验 exercises markdown 格式
    ├── check-links.mjs                # ping 所有 kubernetes.io URL
    ├── apply-enriched-tasks.mjs       # 一次性脚本: 从 PDF Q&A 补全 killer.sh task body
    ├── apply-killersh-polish.mjs      # 一次性脚本: 给 killer.sh 加 docs 链接 + 重写标题
    └── k8s-docs-map.json              # kubernetes.io 面包屑 → URL 查找表（polish 脚本使用）
```

两个 `apply-*.mjs` 是幂等的一次性脚本，保留作为 killer.sh 数据加工的可追溯记录。CI 中只运行 `build-exercises.mjs` 和 `lint-exercises.mjs`。

## 本地运行

要求 **Node 20+** 和 Python 3（用于静态文件服务器）。

```shell
npm run serve        # 自动重新构建 docs/exercises.json 后启动 :8080
# 打开 http://localhost:8080

npm run build        # 只重新生成 docs/exercises.json
npm run lint         # 校验 exercises/*.md 格式
npm run link-check   # ping 所有 kubernetes.io URL（慢 —— 约 106 个 URL）
```

`docs/exercises.json` 是 `exercises/*.md` 的构建产物，每次 `npm run build` / `npm run serve` 以及 Pages 部署时自动重生。该文件已 gitignore，不会出现在 PR 中。

## CI

三个 GitHub Actions workflow：

- **`build-and-deploy-docs.yml`** —— `main` 推送时：lint、build `exercises.json`、把 `docs/` 部署到 Pages。
- **`lint.yml`** —— 非 main 分支推送和 PR 时：lint + 验证 build 仍可用。
- **`link-check.yml`** —— 每周一定时 + 手动触发：ping 题目里引用的所有 kubernetes.io URL。

## 贡献

参见 `CLAUDE.md`：题目文件格式规约、标签约定、常见任务套路。改动 `exercises/*.md` 的 PR 合并前需 lint 通过（`npm run lint`）。
