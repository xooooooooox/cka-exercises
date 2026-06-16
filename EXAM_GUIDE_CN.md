# CKA 备考索引

[English version](EXAM_GUIDE.md) · [工程 README](README_CN.md)

这是本仓库题库的**备考索引**。两种用法：

- **按大纲线性学** — 跟着下方表格从上到下，依次打开各个 `exercises/*.md` 文件做题。
- **在浏览器里交互式练** — 打开[在线练习页面](https://xooooooooox.github.io/cka-exercises/)，用浏览 / 测验 / Docs 树 三种模式驱动学习。

如果你想了解本仓库是如何整理、清洗题库的，或者想本地运行/贡献，请看 [`README_CN.md`](README_CN.md)。

---

## 📋 CKA 考试大纲

基于 [CKA Curriculum v1.35](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf)，271 道题按考试权重分布在 5 个考点上：

| 部分 | 占比 | 练习 |
|------|------|------|
| [Cluster Architecture, Installation and Configuration](exercises/cluster-architecture.md) | 25% | 114 |
| [Workloads & Scheduling](exercises/scheduling.md) | 15% | 49 |
| [Services & Networking](exercises/networking.md) | 20% | 32 |
| [Storage](exercises/storage.md) | 10% | 28 |
| [Troubleshooting](exercises/troubleshooting.md) | 30% | 48 |

## 🏷 题目的标签说明

大部分题目没有前缀，是覆盖某个考点的常规练习题。

- **[CKA Past Exam]** — 历年真题，按考试大纲归类到对应章节（来源于社区流传的真题合集）
- **[Killer.sh A-Qn / B-Qn]** — killer.sh CKA 模拟考题（Simulator A & B），统一归在每个文件末尾的专门章节。原版 PDF 见 [`assets/`](assets/)

在 webapp 中可按以上标签任意组合过滤。

## 🎯 打开在线练习页面

**Live:** <https://xooooooooox.github.io/cka-exercises/> · **使用指南：** [`WEBAPP_GUIDE_CN.md`](WEBAPP_GUIDE_CN.md)

页面有三个模式：

- **📚 Browse** — 搜索/过滤所有题目；每张卡片可单独展开/折叠解答；可标记 Done、收藏；侧边栏按 domain 显示进度条。
- **🎯 Quiz** — 从源过滤条件中随机抽 N 题，可选 30 / 60 / 120 分钟限时，自我打分，会话结束有总结。
- **📖 Docs** — 镜像 kubernetes.io 导航树，反向关联：点开某个 docs 页就能看见关联的题目。

进度通过 `localStorage` 持久化。在 webapp 内按 <kbd>?</kbd> 可看键盘快捷键。

### ✏️ 自动批改答案

webapp 支持用 LLM 自动批改你的答案。点击 header 里的 ⚙️ 配置：

1. 选 provider — **Anthropic** / **OpenAI** / **DeepSeek** / **千问 Qwen** / **豆包 Doubao** / **Ollama**（本地）
2. 填 API key（Ollama 不需要）
3. 点 **Test** —— 验证 key 是否生效，并自动用该 provider 的真实模型列表填充 Model 下拉
4. 选模型（也可手输自定义 id）；设置"score ≥ N 时自动标记 Done"

然后在题目卡片上的 **✏️ Your answer** 框里输入你的答案，点 **✓ Check**。批改返回 verdict（Correct / Partial / Not yet）、0–100 分、一句话总结，以及"做对了什么 / 漏了什么"的列表。每道题的答案会持久化。

> 批改对路径是宽容的 — kubectl imperative、声明式 YAML、helm、kustomize 只要能完成任务都算对。隐私说明：你的答案 + 题目 + 参考解答会发送给你选的 provider（Ollama 只在本机 localhost 处理）；不会发到任何其他地方。

---

## ⚙️ 考前配置

CKA 考试在 PSI 在线监考平台进行。下面这些配置建议在考试开始后立即应用，加快操作速度。

> **重要：** 考试中每道题都需要在不同的远程主机上完成（从候选终端 ssh 过去）。**只在宿主候选终端配置 dotfiles 是不够的** —— 每台目标主机有自己的 HOME 目录。使用下方的[配置同步脚本](#%E5%90%8C%E6%AD%A5%E9%85%8D%E7%BD%AE%E5%88%B0%E6%89%80%E6%9C%89%E8%BF%9C%E7%A8%8B%E4%B8%BB%E6%9C%BA)一次性把 dotfiles 推送到所有 `cka*` 主机即可。

### .bashrc

```shell
# setup kubectl autocompletion
source <(kubectl completion bash)

# aliases
alias cl=clear
alias vi=vim
alias k=kubectl
complete -o default -F __start_kubectl k

# 加载额外的 alias（helm 等）
[ -f ~/.bash_aliases ] && . ~/.bash_aliases
```

### .bash_aliases

```shell
alias cl=clear
alias vi=vim
alias h=helm
if command -v helm >/dev/null 2>&1; then
    complete -o default -F __start_helm h
fi
```

### .vimrc

```vim
set et                  " Expand Tab to Space
set ts=2                " Tab 相当于 2 Spaces
set sw=2                " 自动缩进最小单位为 2 个 space
set nu                  " 启用行号
set ai                  " 启用自动缩进
inoremap jk <Esc>       " 插入模式下, 使用 jk 代替 Esc 退出插入模式
```

### .inputrc

```
set editing-mode vi             " 使用 vim 编辑模式
set show-mode-in-prompt on      " 提示符显示当前 vim mode
$if mode=vi                     " 设置 vim 快捷键
    set keymap vi-insert
    "jk": vi-movement-mode
    "\C-n": next-history
    "\C-p": previous-history
$endif
```

### .tmux.conf

```
set -g display-panes-time 3000
set-window-option -g mode-keys vi
```

### 同步配置到所有远程主机

考试中每道题都在不同的远程主机上作答，仅在宿主候选终端配置 dotfiles 无法覆盖目标主机。下面这个脚本会读取 `/etc/hosts` 中所有 `cka*` 主机名，逐个 scp 推送 dotfiles：

```shell
#!/usr/bin/env bash

FILES=(
  "$HOME/.bash_aliases"
  "$HOME/.vimrc"
  "$HOME/.inputrc"
  "$HOME/.tmux.conf"
)

for host in $(awk '/cka/{print $2}' /etc/hosts); do
  echo ">>> $host"
  for file in "${FILES[@]}"; do
    scp "$file" "$host:~"
  done
done
```

保存为 `~/sync-dotfiles.sh`，`chmod +x ~/sync-dotfiles.sh`，考试开始后运行一次即可。

---

## 📚 参考资源

- [CKA Curriculum v1.35 (PDF)](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

## 🧪 额外练习资源

- **[Killercoda CKA 模拟考 (sachin)](https://killercoda.com/sachin/course/CKA)** — 79+ 道交互式浏览器实操场景，覆盖完整 CKA 大纲（需登录）
- **[Killer.sh CKA 模拟考](https://killer.sh)** — CKA 官方模拟考试（报名考试后赠送 2 次）。Simulator A & B PDF 已放入 [`assets/`](assets/)；34 道题已按 `[Killer.sh A-Qn]` / `[Killer.sh B-Qn]` 标签整合到对应练习中
- [Killercoda CKA Exercises (chadmcrowell)](https://killercoda.com/cka)
