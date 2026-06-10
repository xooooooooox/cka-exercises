# CKA Exam Exercises

[English](README.md)

Certified Kubernetes Administrator (CKA) 考试准备，基于 [CKA Curriculum v1.35](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf)。

练习来源于 [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises)，按照考试大纲结构重新组织，并为每个练习标注了对应的 [kubernetes.io](https://kubernetes.io/docs/) 官方文档链接。

## CKA 考试大纲

| 部分 | 占比 | 练习 |
|------|------|------|
| [Cluster Architecture, Installation and Configuration](exercises/cluster-architecture.md) | 25% | 100 |
| [Workloads & Scheduling](exercises/scheduling.md) | 15% | 39 |
| [Services & Networking](exercises/networking.md) | 20% | 24 |
| [Storage](exercises/storage.md) | 10% | 18 |
| [Troubleshooting](exercises/troubleshooting.md) | 30% | 24 |

练习标签说明：
- **[CKA 真题]** — 历年真题，按考试大纲归类到对应章节
- **[Killer.sh A-Qn / B-Qn]** — killer.sh CKA 模拟考题（Simulator A & B），统一归在每个文件末尾的专门章节。原版 PDF 见 [`assets/`](assets/)

## 项目结构

```
.
├── README.md
├── README_CN.md
├── assets/                             # killer.sh Simulator A/B PDF（报名后官方提供）
├── exercises/                          # 按考试大纲组织的练习
│   ├── cluster-architecture.md         # 集群架构、安装与配置 (25%)
│   ├── scheduling.md                   # 工作负载与调度 (15%)
│   ├── networking.md                   # 服务与网络 (20%)
│   ├── storage.md                      # 存储 (10%)
│   └── troubleshooting.md              # 故障排查 (30%)
└── prepare/                            # 考前准备 (见下方)
```

## 考前准备

CKA 考试在 PSI 考试系统上进行线上考试。以下配置建议在考试开始后立即设置，以加快操作速度并符合日常习惯。

> **重要：** 考试中每道题都需要在不同的远程主机上完成（从候选终端 ssh 过去）。**只在宿主候选终端配置 dotfiles 是不够的** —— 每台目标主机有自己的 HOME 目录。使用下方的 [配置同步脚本](#同步配置到所有远程主机) 一次性把 dotfiles 推送到所有 `cka*` 主机即可。

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

## 参考资源

- [CKA Curriculum v1.35 (PDF)](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

## 额外练习资源

- **[Killercoda CKA 模拟考 (sachin)](https://killercoda.com/sachin/course/CKA)** — 79+ 道交互式浏览器实操场景，覆盖完整 CKA 大纲（需登录）
- **[Killer.sh CKA 模拟考](https://killer.sh)** — CKA 官方模拟考试（报名考试后赠送 2 次）。Simulator A & B PDF 已放入 [`assets/`](assets/)；34 道题已按 `[Killer.sh A-Qn]` / `[Killer.sh B-Qn]` 标签整合到对应练习中
- [Killercoda CKA Exercises (chadmcrowell)](https://killercoda.com/cka)
