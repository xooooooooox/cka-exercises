# CKA Exam Exercises

[中文版](README_CN.md)

Certified Kubernetes Administrator (CKA) exam preparation, based on [CKA Curriculum v1.35](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf).

Exercises sourced from [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises), reorganized by exam curriculum structure. Each exercise is annotated with the corresponding [kubernetes.io](https://kubernetes.io/docs/) documentation link.

## CKA Exam Curriculum

| Domain | Weight | Exercises |
|--------|--------|-----------|
| [Cluster Architecture, Installation and Configuration](exercises/cluster-architecture.md) | 25% | 100 |
| [Workloads & Scheduling](exercises/scheduling.md) | 15% | 39 |
| [Services & Networking](exercises/networking.md) | 20% | 24 |
| [Storage](exercises/storage.md) | 10% | 18 |
| [Troubleshooting](exercises/troubleshooting.md) | 30% | 24 |

Exercise tags:
- **[CKA 真题]** — historical exam questions integrated under the relevant curriculum sections
- **[Killer.sh A-Qn / B-Qn]** — questions from the killer.sh CKA simulator (Simulator A & B), grouped in a dedicated section at the end of each file. Source PDFs are in [`assets/`](assets/).

## Project Structure

```
.
├── README.md
├── README_CN.md
├── assets/                             # killer.sh Simulator A/B PDFs (provided after CKA registration)
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

> **Important:** Each question is solved on a different remote host (ssh'd from the candidate terminal). Configuring only the host terminal is not enough — use the [sync script](#sync-configs-to-remote-hosts) below to push your dotfiles to every target machine before you start.

### .bashrc

```shell
# setup kubectl autocompletion
source <(kubectl completion bash)

# aliases
alias cl=clear
alias vi=vim
alias k=kubectl
complete -o default -F __start_kubectl k

# load extra aliases (helm, etc.) if present
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

### Sync configs to remote hosts

In the exam, each question is solved on a different remote host you reach via ssh. Configuring your dotfiles only on the candidate terminal isn't enough — every target host has its own home directory. Use this script to push your dotfiles to all `cka*` hosts (the exam adds them to `/etc/hosts`):

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

Save it as e.g. `~/sync-dotfiles.sh`, `chmod +x ~/sync-dotfiles.sh`, then run once at the start of the exam.

## References

- [CKA Curriculum v1.35 (PDF)](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

## Additional Practice Labs

- **[Killercoda CKA Mock Exam (sachin)](https://killercoda.com/sachin/course/CKA)** — 79+ interactive browser-based scenarios covering the full CKA curriculum (login required)
- **[Killer.sh CKA Exam Simulator](https://killer.sh)** — official CKA simulator (2 sessions included with exam registration). Simulator A & B PDFs in [`assets/`](assets/); 34 questions integrated into exercises with `[Killer.sh A-Qn]` / `[Killer.sh B-Qn]` tags
- [Killercoda CKA Exercises (chadmcrowell)](https://killercoda.com/cka)
