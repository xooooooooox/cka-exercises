#!/usr/bin/env node
// Reads /tmp/link-check-failures.json (or a path passed as argv[2]) and emits
// a GitHub-flavored markdown table to stdout. The link-check workflow pipes
// the output into $GITHUB_STEP_SUMMARY so broken URLs are visible on the
// Actions run page without having to scrub the raw log.
//
// Usage:
//   node scripts/render-link-rot-summary.mjs >> "$GITHUB_STEP_SUMMARY"
//   node scripts/render-link-rot-summary.mjs /tmp/link-check-failures.json

import fs from 'node:fs';

const path = process.argv[2] || '/tmp/link-check-failures.json';
if (!fs.existsSync(path)) {
  // Nothing to render — empty stdout is a valid no-op.
  process.exit(0);
}

const failures = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!Array.isArray(failures) || failures.length === 0) {
  process.exit(0);
}

const escape = (s) => String(s).replace(/\|/g, '\\|');

const lines = [];
lines.push('## 🔗 Broken kubernetes.io links — link-check run');
lines.push('');
lines.push(`The link-check workflow probed every URL in the corpus and **${failures.length} URL(s) remained broken after retry attempts** (500 ms + 2000 ms backoff for transient errors).`);
lines.push('');
lines.push('| Status | URL | Referenced by |');
lines.push('|---|---|---|');
for (const f of failures) {
  const status = f.status ? `\`${f.status}\`` : `\`${f.error || '?'}\``;
  const url = escape(f.url);
  const ids = (f.exercises || []).map(id => `\`${id}\``).join(', ') || '_(none)_';
  lines.push(`| ${status} | ${url} | ${ids} |`);
}
lines.push('');
lines.push('---');
lines.push('');
lines.push('**To get auto-PR drafts**: open the Actions tab → **Check kubernetes.io links** → **Run workflow** → set `mode: auto-pr` → dispatch. The workflow will run aider against each affected exercise and open a draft PR per broken URL.');
lines.push('');

process.stdout.write(lines.join('\n') + '\n');
