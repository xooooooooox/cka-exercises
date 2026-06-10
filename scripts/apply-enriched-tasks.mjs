#!/usr/bin/env node
// One-shot script: apply enriched killer.sh task bodies to exercises/*.md.
// Reads .killersh-enriched.json (id → { solveOn, task }) and rewrites
// the body between the > 🔗 docs line and the <details> block.
//
// Kept in the repo as a reference for how the killer.sh exercises were
// enriched from the simulator PDFs. The intermediate
// .killersh-enriched.json file is no longer needed after the initial
// application; regenerate it from the PDFs if a re-enrichment is required.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENRICHED = path.join(ROOT, '.killersh-enriched.json');
const JSON_OUT = path.join(ROOT, 'docs', 'exercises.json');

const enriched = JSON.parse(fs.readFileSync(ENRICHED, 'utf8'));

// Map exercise id → file path
const idsByFile = new Map();
{
  const exercises = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8'));
  // domain.file is one of the markdown filenames
  for (const dom of exercises.domains) {
    for (const sec of dom.sections) {
      for (const ex of sec.exercises) {
        if (enriched[ex.id]) {
          if (!idsByFile.has(dom.file)) idsByFile.set(dom.file, []);
          idsByFile.get(dom.file).push({ id: ex.id, fullTitle: ex.fullTitle });
        }
      }
    }
  }
}

let totalApplied = 0;

for (const [file, entries] of idsByFile) {
  const filePath = path.join(ROOT, 'exercises', file);
  let content = fs.readFileSync(filePath, 'utf8');

  for (const { id, fullTitle } of entries) {
    const { solveOn, task } = enriched[id];
    const enrichedBody = `> 🖥 Solve on: \`${solveOn}\`\n\n${task}\n`;

    // Find the exercise's H3 heading.
    // fullTitle includes special regex chars (brackets, etc.) — escape them.
    const escapedTitle = fullTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const h3Re = new RegExp(`(^### ${escapedTitle}\\s*\\n)([\\s\\S]*?)(\\n<details>)`, 'm');
    const m = content.match(h3Re);
    if (!m) {
      console.warn(`! could not locate H3 for ${id}: ${fullTitle.slice(0, 60)}…`);
      continue;
    }

    const h3Line = m[1];
    const oldBody = m[2];
    const detailsStart = m[3];

    // Inside oldBody, find the `> 🔗 ...` docs link block.
    // The docs block is a sequence of consecutive blockquote lines starting with `> 🔗`.
    const lines = oldBody.split('\n');
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
      console.warn(`! no docs link block in ${id}`);
      continue;
    }

    const before = lines.slice(0, linkEnd).join('\n');
    const newBody = `\n${before}\n\n${enrichedBody}`;
    content = content.replace(h3Re, h3Line + newBody + detailsStart);
    totalApplied++;
    console.log(`  ✓ ${id}  ${fullTitle.slice(0, 70)}`);
  }

  fs.writeFileSync(filePath, content);
  console.log(`Updated ${file}`);
}

console.log(`\nDone. Applied ${totalApplied} enriched task bodies.`);
