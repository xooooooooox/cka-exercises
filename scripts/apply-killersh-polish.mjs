#!/usr/bin/env node
// One-shot polish for the 34 killer.sh exercises:
//   1. Append additional kubernetes.io hint links (from PDF breadcrumbs) under the
//      existing `> 🔗 …` block, using scripts/k8s-docs-map.json for URL lookup.
//   2. Shorten the H3 display title to a `<Topic>: <verb-phrase>` form.
//
// Idempotent: if an extra hint URL is already present, it isn't duplicated.
// Run via:  node scripts/apply-killersh-polish.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const URL_MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/k8s-docs-map.json'), 'utf8'));

// id  →  { hints: [breadcrumb titles in order], newTitle, file }
const ENTRIES = {
  // ===== Simulator A =====
  'ca-99-001': { file: 'cluster-architecture.md', hints: ['Configure Access to Multiple Clusters', 'Cluster Access with kubeconfig'],          oldTitle: 'Contexts: extract info from kubeconfig file',                                             newTitle: 'Contexts: extract info from kubeconfig file' },
  'ca-99-002': { file: 'cluster-architecture.md', hints: ['Helm Docs', 'Custom Resources'],                                                    oldTitle: 'Install cert-manager via Helm, create ClusterIssuer with CRL distribution point',          newTitle: 'Helm: install cert-manager + ClusterIssuer with CRL' },
  'sc-99-001': { file: 'scheduling.md',           hints: ['StatefulSets', 'Scale a StatefulSet'],                                              oldTitle: 'Scale down a StatefulSet',                                                                  newTitle: 'StatefulSet: scale down to 1 replica' },
  'sc-99-002': { file: 'scheduling.md',           hints: ['Pod Quality of Service Classes', 'Node-pressure Eviction'],                          oldTitle: 'Find Pods most likely to be evicted first under pressure (QoS)',                            newTitle: 'QoS: find BestEffort Pods evicted first under pressure' },
  'sc-99-003': { file: 'scheduling.md',           hints: ['Horizontal Pod Autoscaling', 'Kustomize'],                                          oldTitle: 'Configure HPA via Kustomize, override maxReplicas in prod overlay',                         newTitle: 'Kustomize HPA: replace external autoscaler, override maxReplicas in prod' },
  'st-99-001': { file: 'storage.md',              hints: ['Persistent Volumes', 'Configure a Pod to use storage'],                              oldTitle: 'PV + PVC + Deployment volume mount',                                                        newTitle: 'PV/PVC: create + mount in Deployment' },
  'ts-99-001': { file: 'troubleshooting.md',      hints: ['Tools for Monitoring Resources', 'kubectl Quick Reference'],                         oldTitle: 'Write bash scripts using kubectl top for node and pod resource usage',                      newTitle: 'kubectl top: scripts for node + pod resource usage' },
  'ca-99-003': { file: 'cluster-architecture.md', hints: ['Upgrading kubeadm clusters', 'kubeadm join'],                                        oldTitle: 'Update Kubernetes version and join new node to cluster',                                    newTitle: 'kubeadm join: upgrade node + join to cluster' },
  'ca-99-004': { file: 'cluster-architecture.md', hints: ['Accessing the Kubernetes API from a Pod', 'Configure Service Accounts for Pods'],   oldTitle: 'Contact Kubernetes API from inside a Pod using a ServiceAccount',                           newTitle: 'API from Pod: query Secrets via ServiceAccount token' },
  'ca-99-005': { file: 'cluster-architecture.md', hints: ['Using RBAC Authorization', 'Configure Service Accounts for Pods'],                  oldTitle: 'Create ServiceAccount with Role + RoleBinding for create-only on Secrets and ConfigMaps',   newTitle: 'RBAC: SA + create-only Role for Secrets/ConfigMaps' },
  'sc-99-004': { file: 'scheduling.md',           hints: ['DaemonSet', 'Taints and Tolerations'],                                              oldTitle: 'Create a DaemonSet that runs on all nodes including controlplane',                          newTitle: 'DaemonSet: run on all nodes including controlplane' },
  'sc-99-005': { file: 'scheduling.md',           hints: ['Deployments', 'Assigning Pods to Nodes'],                                           oldTitle: 'Deployment with multi-container Pods + podAntiAffinity to spread one per node',             newTitle: 'podAntiAffinity: Deployment with multi-container Pods, one per node' },
  'nw-99-001': { file: 'networking.md',           hints: ['Gateway API', 'Gateway API Documentation'],                                         oldTitle: 'Replace Ingress with Gateway API HTTPRoute including header-based routing',                 newTitle: 'Gateway API: replace Ingress with HTTPRoute + header routing' },
  'ca-99-006': { file: 'cluster-architecture.md', hints: ['Certificate Management with kubeadm'],                                              oldTitle: 'Check kube-apiserver certificate expiration and prepare renewal command',                   newTitle: 'Certs: check apiserver expiry + prep kubeadm renew' },
  'nw-99-002': { file: 'networking.md',           hints: ['Network Policies', 'Declare Network Policy'],                                       oldTitle: 'NetworkPolicy with multiple egress rules — separate rules form OR, not AND',               newTitle: 'NetworkPolicy: multi-egress (separate rules = OR pitfall)' },
  'nw-99-003': { file: 'networking.md',           hints: ['Customizing DNS Service', 'DNS for Services and Pods'],                              oldTitle: 'Update CoreDNS to resolve custom-domain alongside cluster.local',                           newTitle: 'CoreDNS: add custom-domain alongside cluster.local' },
  'ts-99-002': { file: 'troubleshooting.md',      hints: ['Debug with crictl'],                                                                oldTitle: 'Find the containerd container for a Pod via crictl, dump info and logs',                    newTitle: 'crictl: find Pod\'s container, dump info + logs' },
  // ===== Simulator B =====
  'nw-99-004': { file: 'networking.md',           hints: ['DNS for Services and Pods', 'Service'],                                              oldTitle: 'Build correct FQDNs for Service, Headless Service, Pod, Pod-by-IP',                         newTitle: 'DNS FQDNs: Service / headless / Pod / Pod-by-IP' },
  'ca-99-007': { file: 'cluster-architecture.md', hints: ['Create static Pods', 'Service'],                                                     oldTitle: 'Create a Static Pod on controlplane and expose via NodePort Service',                       newTitle: 'Static Pod: create on controlplane + NodePort Service' },
  'ca-99-008': { file: 'cluster-architecture.md', hints: ['TLS bootstrapping', 'Certificates best practices'],                                  oldTitle: 'Inspect kubelet client and server certificate Issuer and Extended Key Usage',               newTitle: 'Kubelet certs: inspect client + server Issuer / EKU' },
  'sc-99-006': { file: 'scheduling.md',           hints: ['Configure Probes'],                                                                  oldTitle: 'Pod becomes Ready only when an upstream Service is reachable',                               newTitle: 'Readiness probe: Pod ready only when Service reachable' },
  'ts-99-003': { file: 'troubleshooting.md',      hints: ['kubectl Quick Reference'],                                                           oldTitle: 'kubectl sorting scripts (creationTimestamp and uid)',                                       newTitle: 'kubectl sort: by creationTimestamp and uid' },
  'ts-99-004': { file: 'troubleshooting.md',      hints: ['Troubleshooting kubeadm'],                                                           oldTitle: 'Fix broken kubelet ExecStart path, then create a Pod',                                      newTitle: 'Kubelet: fix broken ExecStart path, then create Pod' },
  'ca-99-009': { file: 'cluster-architecture.md', hints: ['Operating etcd clusters for Kubernetes'],                                            oldTitle: 'Etcd version check and snapshot',                                                            newTitle: 'etcd: version check + snapshot save' },
  'ca-99-010': { file: 'cluster-architecture.md', hints: ['Kubernetes Components', 'Create static Pods'],                                       oldTitle: 'Identify how each controlplane component is started/installed',                             newTitle: 'Controlplane: identify how each component is started' },
  'ts-99-005': { file: 'troubleshooting.md',      hints: ['Assigning Pods to Nodes', 'Kubernetes Scheduler'],                                   oldTitle: 'Temporarily disable kube-scheduler, manually schedule a Pod, then restore',                 newTitle: 'Scheduler: disable + manually schedule a Pod + restore' },
  'st-99-002': { file: 'storage.md',              hints: ['Storage Classes', 'Dynamic Volume Provisioning'],                                   oldTitle: 'StorageClass with WaitForFirstConsumer + Retain, use PVC in Job',                           newTitle: 'StorageClass: WaitForFirstConsumer + Retain, PVC in Job' },
  'sc-99-007': { file: 'scheduling.md',           hints: ['Secrets', 'Distribute Credentials Securely'],                                       oldTitle: 'Create namespace, mount Secret as file + env vars',                                         newTitle: 'Secrets: mount as file + env vars' },
  'sc-99-008': { file: 'scheduling.md',           hints: ['Assigning Pods to Nodes', 'Taints and Tolerations'],                                oldTitle: 'Schedule Pod only on controlplane nodes (no new labels)',                                   newTitle: 'Tolerations: schedule Pod only on controlplane (no new labels)' },
  'sc-99-009': { file: 'scheduling.md',           hints: ['Shared Volume Between Containers', 'Pod Info via Env'],                              oldTitle: 'Multi-container Pod sharing emptyDir volume with downward API env',                         newTitle: 'Multi-container Pod: shared emptyDir + downward API env' },
  'ca-99-011': { file: 'cluster-architecture.md', hints: ['Cluster Networking', 'Create static Pods'],                                          oldTitle: 'Discover cluster topology and configuration',                                                newTitle: 'Cluster info: discover topology + configuration' },
  'ts-99-006': { file: 'troubleshooting.md',      hints: ['Debug with crictl', 'kubectl Quick Reference'],                                      oldTitle: 'Cluster event logging script + capture pod-kill vs container-kill events',                  newTitle: 'Events: log script + diff pod-kill vs container-kill' },
  'ca-99-012': { file: 'cluster-architecture.md', hints: ['kubectl Quick Reference', 'Namespaces'],                                            oldTitle: 'List namespaced API resources and find Namespace with most Roles',                          newTitle: 'api-resources: list namespaced + find ns with most Roles' },
  'ca-99-013': { file: 'cluster-architecture.md', hints: ['Using RBAC Authorization', 'Kustomize'],                                            oldTitle: 'Install operator via Kustomize, debug missing RBAC, add CR',                                newTitle: 'Operator: install via Kustomize, fix RBAC, add CR' },
};

let totalApplied = 0;
const filesTouched = new Set();
for (const [id, info] of Object.entries(ENTRIES)) {
  const { file, hints, oldTitle, newTitle } = info;
  const filePath = path.join(ROOT, 'exercises', file);
  let content = fs.readFileSync(filePath, 'utf8');

  // -------- Title rewrite --------
  // Match the bracketed tag prefix exactly, then replace the description.
  const escOld = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleRe = new RegExp(`^(### \\[Killer\\.sh [AB]-Q\\d+\\]) ${escOld}\\s*$`, 'm');
  const titleMatch = content.match(titleRe);
  let h3LineNew;
  if (titleMatch) {
    h3LineNew = `${titleMatch[1]} ${newTitle}`;
    content = content.replace(titleRe, h3LineNew);
  } else {
    // Maybe already polished. Find an H3 line that starts with [Killer.sh …] newTitle.
    const escNew = newTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const altRe = new RegExp(`^(### \\[Killer\\.sh [AB]-Q\\d+\\]) ${escNew}\\s*$`, 'm');
    const am = content.match(altRe);
    if (am) {
      h3LineNew = am[0];
    } else {
      console.warn(`! ${id}: title not found (old="${oldTitle.slice(0,60)}…", new="${newTitle.slice(0,60)}…")`);
      continue;
    }
  }

  // -------- Extra docs hints --------
  // Locate the > 🔗 link block under that H3.
  const h3EscNew = h3LineNew.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockRe = new RegExp(`(${h3EscNew}\\s*\\n)([\\s\\S]*?)(\\n> 🖥)`, 'm');
  const blockMatch = content.match(blockRe);
  if (!blockMatch) {
    console.warn(`! ${id}: could not locate exercise body section`);
    continue;
  }
  const between = blockMatch[2];
  // Find the > 🔗 ... block — first such line plus following > lines.
  const lines = between.split('\n');
  let linkStart = -1, linkEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^>\s*🔗/.test(lines[i])) {
      linkStart = i;
      let j = i;
      while (j < lines.length && /^>/.test(lines[j])) j++;
      linkEnd = j;
      break;
    }
  }
  if (linkStart === -1) {
    console.warn(`! ${id}: no > 🔗 block found`);
    continue;
  }
  const existingDocsBlock = lines.slice(linkStart, linkEnd);

  // Build URL → breadcrumb lookup (inverse of URL_MAP)
  const URL_TO_BREADCRUMB = new Map();
  for (const [_title, entry] of Object.entries(URL_MAP)) {
    URL_TO_BREADCRUMB.set(entry.url, entry.breadcrumb);
  }

  // Pass 1: rewrite any existing secondary line whose URL is known in the map but
  // whose link text doesn't match the canonical breadcrumb.
  // Leaves the primary `> 🔗 …` line alone (it was hand-crafted and may have
  // intentional wording differences).
  const rewritten = [];
  let rewriteCount = 0;
  for (let i = 0; i < existingDocsBlock.length; i++) {
    const ln = existingDocsBlock[i];
    if (i === 0) { rewritten.push(ln); continue; }   // primary line
    // Match `> [text](url)` (with optional whitespace)
    const m = ln.match(/^(>\s*)\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (m) {
      const prefix = m[1], text = m[2], url = m[3];
      const breadcrumb = URL_TO_BREADCRUMB.get(url);
      if (breadcrumb && text !== breadcrumb) {
        rewritten.push(`${prefix}[${breadcrumb}](${url})`);
        rewriteCount++;
        continue;
      }
    }
    rewritten.push(ln);
  }

  // Track which URLs are now present (so we can skip duplicates)
  const present = new Set();
  for (const ln of rewritten) {
    const m = ln.match(/\]\(([^)]+)\)/);
    if (m) present.add(m[1]);
  }

  // Pass 2: append any hint URLs that aren't already in the block
  const newHintLines = [];
  for (const hint of hints) {
    const entry = URL_MAP[hint];
    if (!entry) {
      console.warn(`  · ${id}: unknown breadcrumb "${hint}" — emitting as text-only`);
      newHintLines.push(`> **${hint}**`);
      continue;
    }
    if (present.has(entry.url)) continue;
    newHintLines.push(`> [${entry.breadcrumb}](${entry.url})`);
    present.add(entry.url);
  }

  if (newHintLines.length === 0 && rewriteCount === 0) {
    totalApplied++;
    fs.writeFileSync(filePath, content);
    filesTouched.add(file);
    console.log(`  ✓ ${id} (title only; docs already canonical)`);
    continue;
  }

  const newDocsBlock = [...rewritten, ...newHintLines].join('\n');
  const newBetween = [...lines.slice(0, linkStart), newDocsBlock, ...lines.slice(linkEnd)].join('\n');
  content = content.replace(blockRe, `$1${newBetween}$3`);

  fs.writeFileSync(filePath, content);
  filesTouched.add(file);
  totalApplied++;
  const parts = [];
  if (newHintLines.length) parts.push(`+${newHintLines.length} hint${newHintLines.length === 1 ? '' : 's'}`);
  if (rewriteCount)        parts.push(`~${rewriteCount} rewrite${rewriteCount === 1 ? '' : 's'}`);
  console.log(`  ✓ ${id} (${parts.join(', ')})`);
}

console.log(`\nDone. Applied ${totalApplied} of ${Object.keys(ENTRIES).length} entries.`);
console.log(`Files touched: ${[...filesTouched].join(', ')}`);
