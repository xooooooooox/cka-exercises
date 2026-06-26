# CKA Exam Guide

[Chinese version](EXAM_GUIDE_CN.md) · [Engineering README](README.md)

This is the **study index** for the question bank in this repository. Use it two ways:

- **Linear, by curriculum** — work through the table below top to bottom, opening each `exercises/*.md` file as you go.
- **Interactive, in the browser** — open the [live practice webapp](https://xooooooooox.github.io/cka-exercises/) and let it drive your study with browse / quiz / docs-tree modes.

If you want to know *how* this repo collects and cleans the corpus, or to run/contribute locally, see [`README.md`](README.md).

---

## 📋 CKA Exam Curriculum

Based on [CKA Curriculum v1.35](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf). 271 exercises distributed across 5 domains in proportion to exam weight:

| Domain | Weight | Exercises |
|--------|--------|-----------|
| [Cluster Architecture, Installation and Configuration](exercises/cluster-architecture.md) | 25% | 114 |
| [Workloads & Scheduling](exercises/scheduling.md) | 15% | 49 |
| [Services & Networking](exercises/networking.md) | 20% | 32 |
| [Storage](exercises/storage.md) | 10% | 28 |
| [Troubleshooting](exercises/troubleshooting.md) | 30% | 48 |

## 📅 CKA Exam Changes

The CKA exam evolves with Kubernetes. This section captures the current state of the curriculum, the last major refresh (Feb 2025) that defined today's shape, and how to stay current.

> Inspired by [chadmcrowell/CKA-Exercises — cka-changes-2024](https://github.com/chadmcrowell/CKA-Exercises/blob/main/cka-changes-2024/README.md). Authoritative content is cross-checked against the [official CNCF curriculum PDF](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf).

### Current curriculum (v1.35)

The current exam is targeted at Kubernetes v1.35 and uses the curriculum at [`cncf/curriculum/CKA_Curriculum_v1.35.pdf`](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf). Verbatim bullets per domain:

**25% — Cluster Architecture, Installation and Configuration**
- Manage role based access control (RBAC)
- Prepare underlying infrastructure for installing a Kubernetes cluster
- Create and manage Kubernetes clusters using kubeadm
- Manage the lifecycle of Kubernetes clusters
- Implement and configure a highly-available control plane
- Use Helm and Kustomize to install cluster components
- Understand extension interfaces (CNI, CSI, CRI, etc.)
- Understand CRDs, install and configure operators

**15% — Workloads and Scheduling**
- Understand application deployments and how to perform rolling update and rollbacks
- Use ConfigMaps and Secrets to configure applications
- Configure workload autoscaling
- Understand the primitives used to create robust, self-healing, application deployments
- Configure Pod admission and scheduling (limits, node affinity, etc.)

**20% — Services and Networking**
- Understand connectivity between Pods
- Define and enforce Network Policies
- Use ClusterIP, NodePort, LoadBalancer service types and endpoints
- Use the Gateway API to manage Ingress traffic
- Know how to use Ingress controllers and Ingress resources
- Understand and use CoreDNS

**10% — Storage**
- Implement storage classes and dynamic volume provisioning
- Configure volume types, access modes and reclaim policies
- Manage persistent volumes and persistent volume claims

**30% — Troubleshooting**
- Troubleshoot clusters and nodes
- Troubleshoot cluster components
- Monitor cluster and application resource usage
- Manage and evaluate container output streams
- Troubleshoot services and networking

### 2025-02 — the big refresh (v1.32 → v1.35)

The CKA curriculum was significantly rewritten on **2025-02-17** with the release of **v1.32**. The 5 domains and their weights stayed the same (25/15/20/10/30), but the sub-bullets under each domain were heavily reshuffled.

After v1.32, the CNCF published v1.33 (2025-07-03), v1.34 (2025-10-28), and v1.35 (2026-03-03). **All four PDFs are byte-identical** (MD5 `d28372581378e1ff3aa49670a9c7781f`) — only the filename's version number changes to track the corresponding Kubernetes minor. **The actual curriculum content has not changed since v1.32.** In other words, `v1.35 ≡ v1.34 ≡ v1.33 ≡ v1.32`.

Practical implication: if you're using study material dated **before February 2025**, a meaningful portion of it no longer reflects what the exam tests. The table below pinpoints exactly what was added or removed.

| Source | Commit | Date |
|---|---|---|
| `CKA_Curriculum_v1.32.pdf` | [`4d1fe1e`](https://github.com/cncf/curriculum/commit/4d1fe1e) | 2025-02-17 |
| `CKA_Curriculum_v1.33.pdf` | [`4722108`](https://github.com/cncf/curriculum/commit/4722108) | 2025-07-03 |
| `CKA_Curriculum_v1.34.pdf` | [`12981bc`](https://github.com/cncf/curriculum/commit/12981bc) | 2025-10-28 |
| `CKA_Curriculum_v1.35.pdf` | [`008b73c`](https://github.com/cncf/curriculum/commit/008b73c) | 2026-03-03 |

### What's new vs old (side-by-side)

Compared to the pre-2025 curriculum (v1.27 / v1.28-era):

| Domain (weight unchanged) | Added in v1.32 | Removed / de-emphasized |
|---|---|---|
| Cluster Architecture (25%) | **Helm + Kustomize** for installing cluster components; **extension interfaces (CNI / CSI / CRI)** as a unified topic; **CRDs + operators**; explicit "manage the lifecycle of Kubernetes clusters" wording | Standalone `etcd backup/restore` bullet; standalone `perform a version upgrade using kubeadm` bullet (both subsumed by "manage lifecycle"); standalone "choose an appropriate CNI plugin" (subsumed by extension interfaces) |
| Workloads & Scheduling (15%) | **Configure workload autoscaling** (HPA / VPA); **Pod admission and scheduling** (limits, node affinity, taints/tolerations) | Generic "manifest management and common templating tools" (replaced by explicit Helm + Kustomize in Cluster Architecture) |
| Services & Networking (20%) | **Gateway API** for Ingress traffic (the major addition); **Define and enforce Network Policies** as a discrete bullet; **CoreDNS** as a discrete bullet | Standalone "host networking configuration on cluster nodes"; standalone "choose an appropriate CNI plugin"; standalone "configure and use CoreDNS" merged into a more general bullet |
| Storage (10%) | **Dynamic volume provisioning** made explicit alongside storage classes | None — only reorganized wording |
| Troubleshooting (30%) | No structural change — same 5 bullets, same emphasis | None |

> Removing the explicit `etcd backup/restore` bullet does **not** mean etcd is off the exam — `etcdctl snapshot save/restore`, etcd health checks, and recovery scenarios are now folded into the lifecycle + troubleshooting domains. Practice them anyway.

### How to stay current

- **Official curriculum**: [`github.com/cncf/curriculum`](https://github.com/cncf/curriculum). Each Kubernetes minor cuts a new `CKA_Curriculum_vX.YY.pdf` file. Diff against the previous version's PDF (or the MD5) to see whether content actually changed or it's just a version-label bump.
- **This repo's exercises** align with the latest curriculum the CNCF has published — see [`CHANGELOG.md`](CHANGELOG.md) (also browsable inside the webapp via **❓ Help → 📜 Changelog**) for which commit picked up which curriculum version.
- **Killer.sh** and **KillerCoda** ship updated mock exams alongside curriculum releases. The PDFs bundled in this repo are the latest as of the most recent commit; if you downloaded a copy of either earlier, refresh.
- **Curriculum version ≠ Kubernetes version**: the curriculum filename's `v1.X` tracks which Kubernetes minor the exam targets, but the exam questions don't need a brand-new k8s feature to appear in a curriculum bump. v1.32 → v1.35 is the same content; only the targeted k8s minor advanced.

## 🏷 How exercises are tagged

Most exercises carry no prefix — those are general practice questions covering a topic.

- **[CKA Past Exam]** — historical CKA exam questions integrated under the relevant curriculum sections (sourced from past-exam collections circulating in study communities)
- **[Killer.sh A-Qn / B-Qn]** — questions from the killer.sh CKA simulator (Simulator A & B), grouped in a dedicated `## Killer.sh Mock Exam Questions` section at the end of each domain file. Source PDFs are in [`assets/killer-sh/`](assets/killer-sh/).
- **[KillerCoda-Qn]** — questions from the KillerCoda CKA mock-exam PDFs (one per CKA domain, 66 questions total). Grouped in a dedicated `## KillerCoda Mock Exam Questions` section at the end of each domain file. Source PDFs are in [`assets/killercoda/`](assets/killercoda/).

In the webapp you can filter by any combination of these tags.

## 🎯 Open the practice webapp

**Live:** <https://xooooooooox.github.io/cka-exercises/> · **Usage guide:** [`WEBAPP_GUIDE.md`](WEBAPP_GUIDE.md)

The webapp has three modes:

- **📚 Browse** — search/filter every exercise; per-card show/hide solution; mark Done; bookmark; per-domain progress bars.
- **🎯 Quiz** — random N questions from a chosen source filter, optional 30 / 60 / 120 minute timer, self-graded, end-of-session summary.
- **📖 Docs** — kubernetes.io navigation tree, reverse-linked: pick a docs page and see the exercises that drill it.

Progress persists in `localStorage`. Press <kbd>?</kbd> in the webapp to see keyboard shortcuts.

The webapp also has built-in **LLM auto-grading** (Anthropic / OpenAI / DeepSeek / Qwen / Doubao / GLM / Ollama) — see [WEBAPP_GUIDE.md § 5](WEBAPP_GUIDE.md#5--auto-grading-llm) for setup + privacy.

---

## ⚙️ Pre-exam Setup

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

---

## 📚 References

- [CKA Curriculum v1.35 (PDF)](https://github.com/cncf/curriculum/blob/master/CKA_Curriculum_v1.35.pdf) — the official authoritative source
- [`cncf/curriculum`](https://github.com/cncf/curriculum) — full version history of CKA / CKAD / CKS / KCNA / KCSA curricula
- [chadmcrowell — `cka-changes-2024`](https://github.com/chadmcrowell/CKA-Exercises/blob/main/cka-changes-2024/README.md) — community-maintained notes on the 2025-02 refresh; inspired the structure of this guide's [📅 CKA Exam Changes](#-cka-exam-changes) chapter
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

## 🧪 Additional Practice Labs

- **[Killercoda CKA Mock Exam (sachin)](https://killercoda.com/sachin/course/CKA)** — 79+ interactive browser-based scenarios covering the full CKA curriculum (login required). The accompanying PDF mock exams are bundled in [`assets/killercoda/`](assets/killercoda/); **66 questions integrated** into exercises with `[KillerCoda-Qn]` tags.
- **[Killer.sh CKA Exam Simulator](https://killer.sh)** — official CKA simulator (2 sessions included with exam registration). Simulator A & B PDFs in [`assets/killer-sh/`](assets/killer-sh/); 34 questions integrated into exercises with `[Killer.sh A-Qn]` / `[Killer.sh B-Qn]` tags.
- [Killercoda CKA Exercises (chadmcrowell)](https://killercoda.com/cka)
