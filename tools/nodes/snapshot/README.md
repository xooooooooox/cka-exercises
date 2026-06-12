# Nodes snapshot — source content

This directory holds the canonical kubeadm filesystem snapshot that powers the
SPA's **🖥 Nodes** tab. One templated source tree → multiple per-minor bundles
written to `docs/nodes-<minor>.json` at build time by
`scripts/build-nodes-snapshot.mjs`.

## Layout

```
tools/nodes/snapshot/
├── README.md          (you are here)
├── versions.json      per-minor image/pause/etcd/coredns tags
└── files/
    ├── controlplane/  ~14 files mirroring an `/etc/...` /`/var/...` tree
    └── worker/        ~7 files (worker-relevant subset)
```

Each file lives at the path the SPA will display — e.g.
`controlplane/etc/kubernetes/manifests/kube-apiserver.yaml` becomes
`/etc/kubernetes/manifests/kube-apiserver.yaml` in the tree.

## Placeholders

The build script substitutes these `{{...}}` tokens per minor from
`versions.json`:

| Placeholder              | Example (v1.35) |
|--------------------------|-----------------|
| `{{KUBE_VERSION_FULL}}`  | `v1.35.5`       |
| `{{KUBE_MINOR}}`         | `1.35`          |
| `{{PAUSE_VERSION}}`      | `3.10`          |
| `{{ETCD_VERSION}}`       | `3.5.16-0`      |
| `{{COREDNS_VERSION}}`    | `v1.11.3`       |

## Provenance & redaction

Content is canonical kubeadm output cross-referenced against
[kubernetes.io](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/)
and the
[kubernetes/kubernetes static-pod templates](https://github.com/kubernetes/kubernetes/tree/master/cmd/kubeadm/app/phases/controlplane).
Hostnames (`cp01`), IPs (`192.168.56.10`), and service ranges
(`10.96.0.0/12`, `192.168.0.0/16`) are example defaults — the real exam will
substitute its own.

**No private keys, tokens, or base64 secret payloads are ever committed.**
Where a kubeadm-generated file holds bytes that would normally be secret
(`client-key-data`, etcd `peer.key`, etc.), this snapshot replaces them with
the sentinel `LS0tLS1CRUdJTiBSRURBQ1RFRC1...` (base64 of "BEGIN REDACTED-...")
so the *format* is unambiguous but nothing usable leaks. The
`pki/__listing__.txt` shows what cert files exist with realistic permissions
and brief Subject hints — no PEM bytes.

## How to refresh per minor

When bumping or adding a kubernetes minor:

1. Update `versions.json` with the new minor's pinned image tags. Look up
   the canonical kubeadm-pinned versions from kubernetes/kubernetes source
   (`cmd/kubeadm/app/constants/constants.go` for that release branch).
2. If a manifest gained / lost a flag between minors, edit the source `.yaml`
   files here directly. (Kubeadm's static-pod renderer changes very slowly —
   most bumps just update image tags via the placeholder.)
3. Run `npm run build:tools-bundle` (or `npm run build:tools-bundle -- --minors=1.36`
   for a single minor). The orchestrator picks up the snapshot builder
   automatically.

## How to regenerate from a real cluster (optional)

If you want to refresh against a real kubeadm cluster (e.g. to catch a
recent kubeadm template change):

```sh
# On a freshly-`kubeadm init`'d control plane:
sudo cp /etc/kubernetes/manifests/*.yaml          tools/nodes/snapshot/files/controlplane/etc/kubernetes/manifests/
sudo cp /var/lib/kubelet/config.yaml              tools/nodes/snapshot/files/controlplane/var/lib/kubelet/
sudo cp /var/lib/kubelet/kubeadm-flags.env        tools/nodes/snapshot/files/controlplane/var/lib/kubelet/
sudo cp /etc/systemd/system/kubelet.service.d/10-kubeadm.conf \
                                                  tools/nodes/snapshot/files/controlplane/etc/systemd/system/kubelet.service.d/
# Then: redact key bytes; re-insert placeholders for version-dependent values.
```

The build is *idempotent* over its source tree: rerun
`scripts/build-nodes-snapshot.mjs` after any edit to re-emit the JSON bundle.
