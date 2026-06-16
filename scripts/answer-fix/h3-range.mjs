#!/usr/bin/env node
// Locate the line range of an exercise's H3 block inside `exercises/*.md`
// and either extract it (--extract) or splice a replacement back in (--splice).
//
// Mirrors the ID computation in scripts/build-exercises.mjs (DOMAINS table +
// H2 / H3 walk) so the ranges are identical to what the build script counts.
//
// Usage:
//   node scripts/answer-fix/h3-range.mjs --extract \
//        --source=exercises/cluster-architecture.md --id=ca-1-007 > snippet.md
//   node scripts/answer-fix/h3-range.mjs --splice \
//        --source=exercises/cluster-architecture.md --id=ca-1-007 \
//        --snippet=snippet.md
//
// Exit codes:
//   0 — done
//   2 — bad args / exercise id not found

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DOMAINS = [
  { file: 'cluster-architecture.md', prefix: 'ca' },
  { file: 'scheduling.md',           prefix: 'sc' },
  { file: 'networking.md',           prefix: 'nw' },
  { file: 'storage.md',              prefix: 'st' },
  { file: 'troubleshooting.md',      prefix: 'ts' },
];

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq >= 0) args[a.slice(2, eq)] = a.slice(eq + 1);
  else {
    const k = a.slice(2);
    const n = process.argv[i + 1];
    if (n !== undefined && !n.startsWith('--')) { args[k] = n; i++; }
    else args[k] = true;
  }
}

if (!args.source || !args.id || (!args.extract && !args.splice)) {
  console.error('Usage: --extract|--splice --source=<file> --id=<exerciseId> [--snippet=<file>]');
  process.exit(2);
}

const sourceFile = args.source;
const wantedId = args.id;

const domain = DOMAINS.find(d => path.basename(sourceFile) === d.file);
if (!domain) {
  console.error(`No DOMAINS entry for ${sourceFile}. Known: ${DOMAINS.map(d => d.file).join(', ')}`);
  process.exit(2);
}

const lines = readFileSync(sourceFile, 'utf8').split('\n');

// Walk the file, computing each H3's ID and line range as the build script does.
const ranges = [];   // { id, startLine, endLine }
let currentSectionNumber = null;
let h3CountInSection = 0;
let openH3 = null;   // { startLine }

function closeOpen(endLineInclusive) {
  if (openH3 == null || currentSectionNumber == null) { openH3 = null; return; }
  const id = `${domain.prefix}-${currentSectionNumber}-${String(h3CountInSection).padStart(3, '0')}`;
  ranges.push({ id, startLine: openH3.startLine, endLine: endLineInclusive });
  openH3 = null;
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('## ') && !line.startsWith('### ')) {
    closeOpen(i - 1);
    const title = line.slice(3).trim();
    const num = title.match(/^(\d+)\.\s+/);
    if (num) {
      currentSectionNumber = parseInt(num[1], 10);
      h3CountInSection = 0;
    } else if (/Killer\.sh\s*Mock\s*Exam/i.test(title)) {
      currentSectionNumber = 99;
      h3CountInSection = 0;
    } else {
      // intro / non-numbered section — exercises here are skipped by the build script
      currentSectionNumber = null;
    }
  } else if (line.startsWith('### ') && currentSectionNumber !== null) {
    closeOpen(i - 1);
    h3CountInSection++;
    openH3 = { startLine: i };
  }
}
closeOpen(lines.length - 1);

const target = ranges.find(r => r.id === wantedId);
if (!target) {
  console.error(`Exercise id "${wantedId}" not found in ${sourceFile}.`);
  console.error(`(${ranges.length} ids parsed; first 3: ${ranges.slice(0, 3).map(r => r.id).join(', ')}…)`);
  process.exit(2);
}

// Inter-H3 separator integrity:
//   target.endLine is the LAST line of the H3 block — i.e. the blank line
//   right before the next `### ` heading. If aider's edit strips trailing
//   whitespace from the snippet, naively splicing it back makes `</details>`
//   butt directly against the next `### `, corrupting the corpus structure.
//   Fix: on extract, drop trailing blank lines (so aider's snippet never
//   contains the separator and can't influence it); on splice, re-insert
//   exactly one blank line if the target wasn't the last H3 in the file.
const isLastRange = ranges.indexOf(target) === ranges.length - 1;

if (args.extract) {
  let slice = lines.slice(target.startLine, target.endLine + 1).join('\n');
  slice = slice.replace(/\n+$/, '');   // strip trailing blank lines
  process.stdout.write(slice + '\n');
  process.exit(0);
}

if (args.splice) {
  if (!args.snippet) {
    console.error('--splice requires --snippet=<path>');
    process.exit(2);
  }
  let snippetText = readFileSync(args.snippet, 'utf8');
  // Belt: drop ALL trailing blanks from whatever aider wrote so the
  // separator is always re-inserted from scratch.
  snippetText = snippetText.replace(/\n+$/, '');
  const snippetLines = snippetText.split('\n');
  // Re-insert exactly one blank-line separator when there's a next H3 in
  // the file. The last H3 in a file legitimately has no trailing separator.
  if (!isLastRange) snippetLines.push('');
  const before = lines.slice(0, target.startLine);
  const after  = lines.slice(target.endLine + 1);
  const merged = [...before, ...snippetLines, ...after].join('\n');
  writeFileSync(sourceFile, merged);
  process.exit(0);
}
