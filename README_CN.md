# CKA Exam Exercises

[English](README.md)

Certified Kubernetes Administrator (CKA) 考试准备，基于 [CKA Curriculum v1.35](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf)。

练习来源于 [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises)，按照考试大纲结构重新组织，并为每个练习标注了对应的 [kubernetes.io](https://kubernetes.io/docs/) 官方文档链接。

## CKA 考试大纲

| 部分 | 占比 | 练习 |
|------|------|------|
| [Cluster Architecture, Installation and Configuration](exercises/cluster-architecture.md) | 25% | 58 |
| [Workloads & Scheduling](exercises/scheduling.md) | 15% | 17 |
| [Services & Networking](exercises/networking.md) | 20% | 0 |
| [Storage](exercises/storage.md) | 10% | 0 |
| [Troubleshooting](exercises/troubleshooting.md) | 30% | 10 |

> Services & Networking 和 Storage 部分的练习待补充。

## 项目结构

```
.
├── README.md
├── README_CN.md
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

### .bashrc

```shell
# setup kubectl autocompletion
source <(kubectl completion bash)

# aliases
alias cl=clear
alias vi=vim
alias k=kubectl
complete -o default -F __start_kubectl k
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

## 参考资源

- [CKA Curriculum v1.35 (PDF)](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Killercoda CKA Exercises](https://killercoda.com/cka)
- [Killer.sh Exam Simulator](https://killer.sh)
