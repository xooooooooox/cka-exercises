#!/usr/bin/env node
// Walk kubectl's command tree by recursively invoking `kubectl <path> -h`
// and parsing the "Available Commands:" section to discover children.
// Emits tools/kubectl-help.json with one entry per command path:
//   { path, summary, rawHelp }
//
// Usage: node scripts/build-kubectl-help.mjs
//        npm run build:kubectl-help
//
// Requires a local kubectl on PATH. Pin to the CKA-target version
// (currently v1.35.x) — the script logs the captured version so you
// can verify before deploying.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'kubectl-help.json');
const MAX_DEPTH = 3;

// Skip commands that are noisy / out of scope for CKA practice.
const SKIP = new Set([
  'options',
  'plugin',
  'completion',
  'version',
  'api-resources',
  'api-versions',
  'config',  // huge subtree; less exam-relevant
]);

function runKubectl(args) {
  try {
    return execFileSync('kubectl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // Some commands exit non-zero when shown without args (e.g. `kubectl get`)
    // but still print useful help to stderr. Combine if available.
    return (e.stdout || '') + (e.stderr || '');
  }
}

function captureVersion() {
  const out = runKubectl(['version', '--client=true', '-o', 'json']);
  try {
    const j = JSON.parse(out);
    return j.clientVersion?.gitVersion || 'unknown';
  } catch { return 'unknown'; }
}

// Parses command listings from a kubectl help dump.
// Top-level `kubectl -h` groups commands under category headings like
// "Basic Commands (Beginner):", "Deploy Commands:", "Settings Commands:", etc.
// Subcommand `kubectl <verb> -h` uses a single "Available Commands:" heading.
// Both styles are handled — any heading matching `*Commands?:` starts a listing.
// A subsequent non-Commands heading (Flags:/Options:/Usage:/etc.) ends it.
function parseChildren(helpText) {
  const lines = helpText.split('\n');
  const out = [];
  let inListing = false;
  // Top-level uses headings like "Basic Commands (Beginner):" or "Deploy Commands:".
  // Subcommand help uses "Available Commands:".
  const isCommandsHeading = (l) => /^\S[^\n]*\bCommands?\b[^:\n]*:\s*$/.test(l);
  const isOtherHeading   = (l) => /^\S.*:\s*$/.test(l) && !isCommandsHeading(l);

  for (const line of lines) {
    if (isCommandsHeading(line)) { inListing = true; continue; }
    if (!inListing) continue;
    if (isOtherHeading(line)) { inListing = false; continue; }
    if (!line.trim()) continue;   // blank lines just separate groups, don't end listing
    // Command rows: two+ leading spaces, then the verb, then optional summary
    const m = line.match(/^\s{2,}(\S+)(?:\s+(.*))?$/);
    if (m) out.push({ name: m[1], summary: (m[2] || '').trim() });
  }
  return out;
}

function walk(parts, depth, collector) {
  if (depth > MAX_DEPTH) return;
  const cmdPath = parts.join(' ');
  const help = runKubectl([...parts, '-h']);
  // Top-level help summary line — for the root we don't emit a record (no "kubectl" entry needed).
  if (parts.length > 0) {
    // First non-blank line of the help block is the command summary.
    const summary = (help.split('\n').find(l => l.trim().length) || '').trim();
    collector.push({ path: cmdPath, summary, rawHelp: help.trimEnd() });
  }
  const children = parseChildren(help);
  for (const c of children) {
    if (SKIP.has(c.name)) continue;
    walk([...parts, c.name], depth + 1, collector);
  }
}

function main() {
  const version = captureVersion();
  console.log(`Capturing kubectl ${version} help texts…`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const commands = [];
  walk([], 1, commands);  // start at depth 1 because root has no path

  // Sort: top-level alphabetically, then their subtrees stay grouped via stable sort
  commands.sort((a, b) => {
    const ap = a.path.split(' '), bp = b.path.split(' ');
    for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
      if (ap[i] !== bp[i]) return ap[i] < bp[i] ? -1 : 1;
    }
    return ap.length - bp.length;
  });

  const payload = { kubectlVersion: version, capturedAt: new Date().toISOString(), commands };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  const bytes = fs.statSync(OUT).size;
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${commands.length} commands, ${Math.round(bytes / 1024)} KB`);
}

main();
