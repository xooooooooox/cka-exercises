#!/usr/bin/env node
// Parses exercises/*.md and emits docs/exercises.json.
// No runtime deps — uses Node built-ins only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXERCISES_DIR = path.join(ROOT, 'exercises');
const OUTPUT = path.join(ROOT, 'docs', 'exercises.json');

const DOMAINS = [
  { file: 'cluster-architecture.md', key: 'cluster-architecture', title: 'Cluster Architecture, Installation and Configuration', weight: '25%', prefix: 'ca' },
  { file: 'scheduling.md',           key: 'scheduling',           title: 'Workloads & Scheduling',                                weight: '15%', prefix: 'sc' },
  { file: 'networking.md',           key: 'networking',           title: 'Services & Networking',                                 weight: '20%', prefix: 'nw' },
  { file: 'storage.md',              key: 'storage',              title: 'Storage',                                               weight: '10%', prefix: 'st' },
  { file: 'troubleshooting.md',      key: 'troubleshooting',      title: 'Troubleshooting',                                       weight: '30%', prefix: 'ts' },
];

function classifyTag(title) {
  if (/^\[CKA\s+Past\s+Exam/i.test(title)) return 'cka-past-exam';
  if (/^\[Killer\.sh\s*A-/i.test(title)) return 'killersh-a';
  if (/^\[Killer\.sh\s*B-/i.test(title)) return 'killersh-b';
  if (/^\[KillerCoda-/i.test(title))    return 'killercoda';
  return 'general';
}

function extractPoints(title) {
  // Supports "- 4 pts" (current) and "- 4分" (legacy Chinese form)
  const m = title.match(/-\s*(\d+)\s*(?:pts?\b|分)/);
  return m ? parseInt(m[1], 10) : null;
}

function stripTagPrefix(title) {
  return title.replace(/^\[[^\]]+\]\s*/, '').trim();
}

function trimBlank(s) {
  return s.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '').trim();
}

function parseExercise(titleLine, body) {
  // Find `> 🔗` line, then scan consecutive blockquote lines for [text](url).
  // Supports both:
  //   > 🔗 [text](url)            (single-line)
  //   > 🔗\n> [text](url)         (multi-line block, often with multiple links)
  // Now collects ALL links in the block into docsLinks[]; keeps docsLink /
  // docsLinkText as aliases of the first for back-compat.
  const docsLinks = [];
  let docsBlockStart = -1;
  let docsBlockEnd = -1;

  const lines = body.split('\n');
  const lineStarts = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    lineStarts.push(lineStarts[i] + lines[i].length + 1);
  }

  for (let i = 0; i < lines.length; i++) {
    if (/^>\s*🔗/.test(lines[i])) {
      docsBlockStart = lineStarts[i];
      const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
      let j = i;
      while (j < lines.length && /^>/.test(lines[j])) {
        let m;
        linkRe.lastIndex = 0;
        while ((m = linkRe.exec(lines[j])) !== null) {
          docsLinks.push({ text: m[1], url: m[2] });
        }
        j++;
      }
      docsBlockEnd = j < lines.length ? lineStarts[j] : body.length;
      break;
    }
  }
  const docsLink = docsLinks.length ? docsLinks[0].url : null;
  const docsLinkText = docsLinks.length ? docsLinks[0].text : null;

  // Task = text after docs block (or start) and before first <details> block.
  const detailsStart = body.indexOf('<details');
  const taskEnd = detailsStart === -1 ? body.length : detailsStart;
  let taskStart = 0;
  if (docsBlockEnd !== -1) {
    taskStart = docsBlockEnd;
  }
  let task = trimBlank(body.slice(taskStart, taskEnd));

  // Extract optional `> 🖥 Solve on: \`ssh xxx\`` line at the start of the task.
  // Strip it from the task body so it isn't rendered in the task area.
  let solveOn = null;
  const solveOnMatch = task.match(/^>\s*🖥[^\n]*?ssh\s+([^\s`'"]+)[^\n]*?(?:\n|$)/);
  if (solveOnMatch) {
    solveOn = `ssh ${solveOnMatch[1]}`;
    task = trimBlank(task.slice(solveOnMatch[0].length));
  }

  // Solution = concatenation of all <details>...</details> bodies.
  const detailsRegex = /<details>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>/g;
  let solution = '';
  let m;
  while ((m = detailsRegex.exec(body)) !== null) {
    const summary = m[1].replace(/<[^>]+>/g, '').trim();
    let inner = m[2].trim();
    inner = inner.replace(/^<p>\s*/, '').replace(/\s*<\/p>\s*$/, '').trim();
    if (solution) solution += '\n\n---\n\n';
    if (summary && summary !== 'show') {
      solution += `**${summary}**\n\n`;
    }
    solution += inner;
  }
  solution = solution || null;

  // If no <details>, the task body itself often ends with italic guidance
  // like "*此为场景练习，无固定答案。关键步骤：…*" — keep the task as-is.

  return { task, solution, docsLink, docsLinkText, docsLinks, solveOn };
}

function parseFile(file, domainInfo) {
  const content = fs.readFileSync(path.join(EXERCISES_DIR, file), 'utf8');

  // Locate all H2 headings (## ...) and their positions.
  const h2Re = /^##\s+(.+?)\s*$/gm;
  const h2s = [];
  let m;
  while ((m = h2Re.exec(content)) !== null) {
    h2s.push({ title: m[1].trim(), start: m.index, headerEnd: m.index + m[0].length });
  }

  const sections = [];
  for (let i = 0; i < h2s.length; i++) {
    const cur = h2s[i];
    const nextStart = i + 1 < h2s.length ? h2s[i + 1].start : content.length;
    const sectionContent = content.slice(cur.headerEnd, nextStart);

    let sectionNumber, sectionTitle, kind;
    const numMatch = cur.title.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      sectionNumber = parseInt(numMatch[1], 10);
      sectionTitle = numMatch[2].trim();
      kind = 'curriculum';
    } else if (/Killer\.sh\s*Mock\s*Exam/i.test(cur.title)) {
      sectionNumber = 99;
      sectionTitle = cur.title;
      kind = 'killersh';
    } else if (/KillerCoda\s*Mock\s*Exam/i.test(cur.title)) {
      sectionNumber = 98;
      sectionTitle = cur.title;
      kind = 'killercoda';
    } else {
      // skip intro sections like "考试大纲考点"
      continue;
    }

    // Extract H3s within section
    const h3Re = /^###\s+(.+?)\s*$/gm;
    const h3s = [];
    let m3;
    while ((m3 = h3Re.exec(sectionContent)) !== null) {
      h3s.push({ title: m3[1].trim(), start: m3.index, headerEnd: m3.index + m3[0].length });
    }

    const exercises = [];
    for (let j = 0; j < h3s.length; j++) {
      const cur3 = h3s[j];
      const nextStart3 = j + 1 < h3s.length ? h3s[j + 1].start : sectionContent.length;
      const exBody = sectionContent.slice(cur3.headerEnd, nextStart3);

      const parsed = parseExercise(cur3.title, exBody);
      const tag = classifyTag(cur3.title);
      const points = extractPoints(cur3.title);
      const displayTitle = stripTagPrefix(cur3.title);
      const id = `${domainInfo.prefix}-${sectionNumber}-${String(j + 1).padStart(3, '0')}`;

      exercises.push({
        id,
        fullTitle: cur3.title,
        title: displayTitle,
        tag,
        points,
        docsLink: parsed.docsLink,
        docsLinkText: parsed.docsLinkText,
        docsLinks: parsed.docsLinks,
        solveOn: parsed.solveOn,
        task: parsed.task,
        solution: parsed.solution,
        sourceFile: `exercises/${domainInfo.file}`,
      });
    }

    sections.push({
      number: sectionNumber,
      title: sectionTitle,
      kind,
      exercises,
    });
  }

  return sections;
}

const guidePath     = path.join(ROOT, 'WEBAPP_GUIDE.md');
const guideCnPath   = path.join(ROOT, 'WEBAPP_GUIDE_CN.md');
const examPath      = path.join(ROOT, 'EXAM_GUIDE.md');
const examCnPath    = path.join(ROOT, 'EXAM_GUIDE_CN.md');
const changelogPath = path.join(ROOT, 'CHANGELOG.md');
const helpGuide   = fs.existsSync(guidePath)     ? fs.readFileSync(guidePath,     'utf8') : '';
const helpGuideCN = fs.existsSync(guideCnPath)   ? fs.readFileSync(guideCnPath,   'utf8') : '';
const examGuide   = fs.existsSync(examPath)      ? fs.readFileSync(examPath,      'utf8') : '';
const examGuideCN = fs.existsSync(examCnPath)    ? fs.readFileSync(examCnPath,    'utf8') : '';
const changelog   = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';

const result = {
  generatedAt: new Date().toISOString(),
  domains: DOMAINS.map(d => ({
    key: d.key,
    file: d.file,
    title: d.title,
    weight: d.weight,
    sections: parseFile(d.file, d),
  })),
  helpGuide,
  helpGuideCN,
  examGuide,
  examGuideCN,
  changelog,
};

// Post-pass: assign a per-domain question number (1..N) in the order they
// appear in the source file. `numberInDomain` is what the SPA shows as `Qn`.
for (const dom of result.domains) {
  let n = 0;
  for (const sec of dom.sections) {
    for (const ex of sec.exercises) {
      n += 1;
      ex.numberInDomain = n;
    }
  }
}

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + '\n');

// Tiny version marker that the SPA fetches { cache: 'no-cache' } at launch
// to detect when a newer deploy is available (banner prompts the user to
// reload — important on iOS PWA standalone where forced quit is otherwise
// the only way to refresh).
const VERSION_OUT = path.join(ROOT, 'docs', 'version.json');
fs.writeFileSync(VERSION_OUT, JSON.stringify({ generatedAt: result.generatedAt }) + '\n');

const totalExercises = result.domains.reduce(
  (s, d) => s + d.sections.reduce((ss, sec) => ss + sec.exercises.length, 0), 0,
);
const totalSections = result.domains.reduce((s, d) => s + d.sections.length, 0);

console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
console.log(`  domains:   ${result.domains.length}`);
console.log(`  sections:  ${totalSections}`);
console.log(`  exercises: ${totalExercises}`);
for (const d of result.domains) {
  const count = d.sections.reduce((s, sec) => s + sec.exercises.length, 0);
  console.log(`    - ${d.key.padEnd(22)} ${count}`);
}
