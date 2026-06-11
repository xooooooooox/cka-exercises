#!/usr/bin/env node
// Validates the format of exercises/*.md so that build-exercises.mjs can parse
// every entry into a complete JSON record without falling back to defaults.
//
// Run via: npm run lint
// Exits non-zero with a list of issues if anything is malformed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'cluster-architecture.md',
  'scheduling.md',
  'networking.md',
  'storage.md',
  'troubleshooting.md',
];

const ALLOWED_TAG_REGEXES = [
  /^\[CKA\s+Past\s+Exam\s+-\s+\d+\s+pts?\]/i,
  /^\[Killer\.sh\s+[AB]-Q\d+\]/i,
];

const SCENARIO_MARKERS = [
  /\*此为场景练习/, // common scenario placeholder text
];

const issues = [];

function pushIssue(file, line, msg) { issues.push({ file, line, msg }); }

function lintFile(filename) {
  const filePath = path.join(ROOT, 'exercises', filename);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Locate every H3 (### …) and the range until the next H3 / H2 / EOF
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s/.test(lines[i])) heads.push(i);
  }
  for (let i = 0; i < heads.length; i++) {
    const start = heads[i];
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
      if (/^(##\s|###\s)/.test(lines[j])) { end = j; break; }
    }
    const block = lines.slice(start, end);
    lintExerciseBlock(filename, start + 1, block);
  }

  // Also sanity-check section ordering: 1.. N then optional Killer.sh trailing
  const h2s = lines
    .map((ln, idx) => /^##\s+(.+)$/.test(ln) ? { idx, text: ln.replace(/^##\s+/, '') } : null)
    .filter(Boolean);
  let lastNum = 0;
  for (const h2 of h2s) {
    const m = h2.text.match(/^(\d+)\.\s+/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n !== lastNum + 1) {
      pushIssue(filename, h2.idx + 1,
        `non-sequential section number "${h2.text}" (expected ${lastNum + 1})`);
    }
    lastNum = n;
  }
}

function lintExerciseBlock(file, headLine, block) {
  const head = block[0];
  const title = head.replace(/^###\s+/, '').trim();
  const isTagged = title.startsWith('[');

  // 1. Tag format (when present)
  if (isTagged) {
    const ok = ALLOWED_TAG_REGEXES.some(re => re.test(title));
    if (!ok) {
      pushIssue(file, headLine,
        `H3 tag does not match any allowed pattern (allowed: [CKA Past Exam - N pts], [Killer.sh A-Q<N>], [Killer.sh B-Q<N>]): "${title.slice(0, 80)}"`);
    }
  }

  // 2. Must have at least one docs link block
  const bodyText = block.slice(1).join('\n');
  const hasDocsBlock = /^>\s*🔗\s*[\s\S]/m.test(bodyText);
  if (!hasDocsBlock) {
    pushIssue(file, headLine,
      `missing "> 🔗 [breadcrumb](url)" docs block`);
  } else {
    // Confirm the docs block has at least one [text](url) pair
    const hasLink = /^>[^\n]*\[[^\]]+\]\([^)]+\)/m.test(bodyText);
    if (!hasLink) {
      pushIssue(file, headLine,
        `"> 🔗" block has no [text](url) link`);
    }
  }

  // 3. killer.sh entries must have a "> 🖥 Solve on:" line
  if (/^\[Killer\.sh/i.test(title)) {
    if (!/^>\s*🖥[^\n]*Solve on/m.test(bodyText)) {
      pushIssue(file, headLine,
        `killer.sh entry missing "> 🖥 Solve on: \`ssh ...\`" line`);
    }
  }

  // 4. Must have either <details> block OR be marked as a scenario exercise
  const hasDetails = bodyText.includes('<details>');
  const isScenario = SCENARIO_MARKERS.some(re => re.test(bodyText));
  if (!hasDetails && !isScenario) {
    pushIssue(file, headLine,
      `no <details> block and no scenario marker — exercise has no solution`);
  }

  // 5. <details> balance and <p> tags
  if (hasDetails) {
    const openCount = (bodyText.match(/<details>/g) || []).length;
    const closeCount = (bodyText.match(/<\/details>/g) || []).length;
    if (openCount !== closeCount) {
      pushIssue(file, headLine,
        `unbalanced <details>/<\/details> tags (${openCount} open vs ${closeCount} close)`);
    }
    // Each <details> should contain "<summary>show</summary>" (with optional variants)
    const summaries = bodyText.match(/<summary>[^<]*<\/summary>/g) || [];
    if (summaries.length < openCount) {
      pushIssue(file, headLine,
        `<details> has fewer <summary> than expected (${summaries.length} vs ${openCount} details)`);
    }
  }
}

for (const f of FILES) lintFile(f);

if (issues.length === 0) {
  console.log('✓ Lint passed — all exercises match the expected format.');
  process.exit(0);
}

console.error(`✗ Lint found ${issues.length} issue${issues.length === 1 ? '' : 's'}:\n`);
const byFile = new Map();
for (const i of issues) {
  if (!byFile.has(i.file)) byFile.set(i.file, []);
  byFile.get(i.file).push(i);
}
for (const [file, list] of byFile) {
  console.error(`  exercises/${file}`);
  for (const i of list) {
    console.error(`    L${String(i.line).padStart(4)}: ${i.msg}`);
  }
  console.error('');
}
process.exit(1);
