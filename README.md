# CKA Exam Exercises

[中文版](README_CN.md)

Certified Kubernetes Administrator (CKA) exam preparation, based on [CKA Curriculum v1.35](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf).

Exercises sourced from [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises), reorganized by exam curriculum structure. Each exercise is annotated with the corresponding [kubernetes.io](https://kubernetes.io/docs/) documentation link.

## CKA Exam Curriculum

| Domain | Weight | Exercises |
|--------|--------|-----------|
| [Cluster Architecture, Installation and Configuration](exercises/cluster-architecture.md) | 25% | 56 |
| [Workloads & Scheduling](exercises/scheduling.md) | 15% | 17 |
| [Services & Networking](exercises/networking.md) | 20% | 0 |
| [Storage](exercises/storage.md) | 10% | 0 |
| [Troubleshooting](exercises/troubleshooting.md) | 30% | 10 |

> Services & Networking and Storage exercises are yet to be added.

## Project Structure

```
.
├── README.md
├── README_CN.md
├── exercises/                          # Exercises organized by exam curriculum
│   ├── cluster-architecture.md         # Cluster Architecture, Installation & Configuration (25%)
│   ├── scheduling.md                   # Workloads & Scheduling (15%)
│   ├── networking.md                   # Services & Networking (20%)
│   ├── storage.md                      # Storage (10%)
│   └── troubleshooting.md              # Troubleshooting (30%)
└── prepare/                            # Pre-exam setup (see below)
```

## Pre-exam Setup

The CKA exam is an online proctored exam on the PSI platform. The following configurations should be applied immediately after the exam starts to speed up operations.

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
set ts=2                " Tab equals 2 Spaces
set sw=2                " Auto-indent unit is 2 spaces
set nu                  " Enable line numbers
set ai                  " Enable auto-indent
inoremap jk <Esc>       " Use jk to exit insert mode
```

### .inputrc

```
set editing-mode vi             " Use vim editing mode
set show-mode-in-prompt on      " Show current vim mode in prompt
$if mode=vi                     " Set vim keybindings
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

## References

- [CKA Curriculum v1.35 (PDF)](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Killercoda CKA Exercises](https://killercoda.com/cka)
- [Killer.sh Exam Simulator](https://killer.sh)
