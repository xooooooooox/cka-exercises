#!/usr/bin/env node
// Build the read-only kubeadm filesystem snapshot for the 🖥 Nodes tab.
// Walks tools/nodes/snapshot/files/{controlplane,worker}/ recursively, applies
// {{...}} placeholder substitution from tools/nodes/snapshot/versions.json,
// and emits docs/nodes-<minor>.json with two pre-built file trees.
//
// Usage:
//   node scripts/build-nodes-snapshot.mjs --minor=1.35
//
// Called per-minor by scripts/build-tools-bundle.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools', 'nodes', 'snapshot');
const FILES = path.join(SRC, 'files');
const VERSIONS = JSON.parse(fs.readFileSync(path.join(SRC, 'versions.json'), 'utf8'));

function parseArgs() {
  const out = { minor: '', kube: '' };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--(\w+)=(.*)$/);
    if (m && m[1] === 'minor') out.minor = m[2];
    if (m && m[1] === 'kube') out.kube = m[2];
  }
  if (!out.minor) {
    console.error('Usage: build-nodes-snapshot.mjs --minor=X.Y [--kube=vX.Y.Z]');
    process.exit(2);
  }
  return out;
}

// Pick the closest pinned minor when an unknown one is requested. Prefer
// nearest-but-not-greater (so a snapshot of "1.37" would borrow from "1.36"
// if "1.37" hasn't been pinned yet); otherwise fall back to the most recent
// pinned minor regardless of direction.
function pickFallbackPin(requestedMinor, versionsTable) {
  const keys = Object.keys(versionsTable).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }));
  if (!keys.length) return null;
  // Highest pinned ≤ requested
  let best = null;
  for (const k of keys) {
    if (k.localeCompare(requestedMinor, undefined, { numeric: true }) <= 0) best = k;
  }
  return best || keys[keys.length - 1];
}

function walkDir(dir, rel = '') {
  const entries = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === '.DS_Store') continue;
    const full = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      entries.push({ kind: 'dir', name, relPath, children: walkDir(full, relPath) });
    } else {
      entries.push({ kind: 'file', name, relPath, content: fs.readFileSync(full, 'utf8') });
    }
  }
  return entries;
}

function interpolate(text, vars) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => vars[key] ?? m);
}

function entriesToTree(entries, vars, pathPrefix = '/') {
  const out = [];
  for (const e of entries) {
    if (e.kind === 'dir') {
      out.push({
        type: 'dir',
        name: e.name,
        path: pathPrefix + e.name + '/',
        children: entriesToTree(e.children, vars, pathPrefix + e.name + '/'),
      });
    } else {
      out.push({
        type: 'file',
        name: e.name,
        path: pathPrefix + e.name,
        content: interpolate(e.content, vars),
      });
    }
  }
  return out;
}

function countFiles(tree) {
  let n = 0;
  for (const node of tree) {
    if (node.type === 'file') n++;
    else if (node.children) n += countFiles(node.children);
  }
  return n;
}

function main() {
  const { minor, kube: kubeOverride } = parseArgs();
  let pin = VERSIONS[minor];
  if (!pin) {
    const fallbackKey = pickFallbackPin(minor, VERSIONS);
    if (!fallbackKey) {
      console.error(`versions.json is empty — can't snapshot ${minor}`);
      process.exit(1);
    }
    console.warn(`⚠ No pin for ${minor} in versions.json — borrowing pause/etcd/coredns tags from ${fallbackKey}. Update versions.json to silence this warning.`);
    pin = { ...VERSIONS[fallbackKey] };
    // Don't borrow the kube tag — it must reflect the requested minor.
    pin.kube = kubeOverride || `v${minor}.0`;
  } else if (kubeOverride && kubeOverride !== pin.kube) {
    // Orchestrator provided a fresher patch than versions.json — prefer it.
    pin = { ...pin, kube: kubeOverride };
  }
  const vars = {
    KUBE_VERSION_FULL: pin.kube,
    KUBE_MINOR:        minor,
    PAUSE_VERSION:     pin.pause,
    ETCD_VERSION:      pin.etcd,
    COREDNS_VERSION:   pin.coredns,
  };

  function roleTree(role) {
    const dir = path.join(FILES, role);
    if (!fs.existsSync(dir)) return [];
    return entriesToTree(walkDir(dir), vars, '/');
  }

  const controlPlaneTree = roleTree('controlplane');
  const workerTree       = roleTree('worker');

  const payload = {
    schemaVersion: 1,
    minor,
    k8sVersion: pin.kube,
    generatedAt: new Date().toISOString(),
    controlPlane: { tree: controlPlaneTree, fileCount: countFiles(controlPlaneTree) },
    worker:       { tree: workerTree,       fileCount: countFiles(workerTree) },
  };

  const outFile = path.join(ROOT, 'docs', `nodes-${minor}.json`);
  fs.writeFileSync(outFile, JSON.stringify(payload) + '\n');
  const bytes = fs.statSync(outFile).size;
  console.log(`Wrote ${path.relative(ROOT, outFile)} — ${payload.controlPlane.fileCount} CP + ${payload.worker.fileCount} worker files, ${Math.round(bytes / 1024)} KB`);

  if (bytes > 200 * 1024) {
    console.error(`✗ nodes-${minor}.json exceeds 200KB budget`);
    process.exit(1);
  }
}

main();
