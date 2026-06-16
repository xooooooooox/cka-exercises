#!/usr/bin/env node
// One-shot idempotent importer for the five KillerCoda CKA mock-exam PDFs.
//
// Reads assets/killercoda/*.pdf via `pdftotext -layout` (poppler-utils),
// parses each numbered question (Weight : N → N) → Solution:- → divider),
// generates an H3 markdown block per question, and appends a
// `## KillerCoda Mock Exam Questions` section to each matching
// exercises/*.md file.
//
// Idempotent: if the target file already has `## KillerCoda Mock Exam`,
// the script aborts (warns) — re-running won't duplicate content.
//
// Requires `pdftotext` on PATH (brew install poppler / apt install poppler-utils).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// One-default-link-per-domain (linter requires at least one `> 🔗`). Reporters
// can refine per question via the SPA's task-fix workflow after deploy.
const PDF_TO_DOMAIN = {
  'a-workloads-and-scheduling.pdf': {
    file: 'scheduling.md',
    breadcrumb: 'Concepts > Workloads',
    url: 'https://kubernetes.io/docs/concepts/workloads/',
  },
  'b-architecture-installation-and-maintenance.pdf': {
    file: 'cluster-architecture.md',
    breadcrumb: 'Setup > Production environment > Installing Kubernetes with deployment tools',
    url: 'https://kubernetes.io/docs/setup/production-environment/tools/',
  },
  'c-services-and-networking.pdf': {
    file: 'networking.md',
    breadcrumb: 'Concepts > Services, Load Balancing, and Networking',
    url: 'https://kubernetes.io/docs/concepts/services-networking/',
  },
  'd-storage.pdf': {
    file: 'storage.md',
    breadcrumb: 'Concepts > Storage',
    url: 'https://kubernetes.io/docs/concepts/storage/',
  },
  'e-troubleshooting.pdf': {
    file: 'troubleshooting.md',
    breadcrumb: 'Tasks > Monitoring, Logging, and Debugging',
    url: 'https://kubernetes.io/docs/tasks/debug/',
  },
};

function extractText(pdfPath) {
  return execSync(`pdftotext -layout ${JSON.stringify(pdfPath)} -`, { encoding: 'utf8' });
}

// Each question is bounded by the `—----` divider (em-dash U+2014 + ASCII
// dashes). The first part of the file is the PDF title + first question;
// subsequent parts each start with `Weight : N\n\nN) ...`.
function splitQuestionBlocks(text) {
  return text.split(/^\s*—-+\s*$/m);
}

// Strip the "For this question, please set this context (In exam, diff
// cluster name)" line and the optional `kubectl config use-context …` line
// that follows it. The remaining prose is the actual task.
function stripContextBoilerplate(s) {
  return s
    .replace(/^For this question, please set this context[^\n]*\n+/m, '')
    .replace(/^\s*kubectl config use-context[^\n]*\n+/m, '')
    .trim();
}

// Convert KillerCoda's bullet rendering ("     ●    text" or "     ○    text")
// to markdown bullets. Preserve indentation depth.
function normaliseBullets(s) {
  return s
    .replace(/^(\s*)●\s+/gm, '$1- ')
    .replace(/^(\s*)○\s+/gm, '$1  - ');
}

function deriveTitle(taskBody) {
  // First non-trivial line, cap at 80 chars, strip trailing punctuation.
  const lines = taskBody.split('\n').map(l => l.trim()).filter(Boolean);
  let title = lines[0] || '(untitled)';
  // If the first line is itself a bullet, fall back to the line after.
  if (/^- /.test(title) && lines[1]) title = lines[1];
  title = title.replace(/^-+\s*/, '');
  title = title.slice(0, 80).trim().replace(/[.,;:]+$/, '');
  // Collapse runs of whitespace
  title = title.replace(/\s+/g, ' ');
  return title;
}

function parseBlock(block) {
  // Look for Weight : N + N) prefix
  const wMatch = block.match(/Weight\s*:\s*(\d+)/);
  const nMatch = block.match(/\n\s*(\d+)\)\s+/);
  if (!wMatch || !nMatch) return null;
  const points = parseInt(wMatch[1], 10);
  const num = parseInt(nMatch[1], 10);
  const afterNum = block.slice(nMatch.index + nMatch[0].length);
  // Split into task vs solution at "Solution:-"
  const solIdx = afterNum.indexOf('Solution:-');
  if (solIdx < 0) return null;
  const rawTask = afterNum.slice(0, solIdx);
  const rawSolution = afterNum.slice(solIdx + 'Solution:-'.length).trim();
  // Clean up task body
  let taskBody = stripContextBoilerplate(rawTask);
  taskBody = normaliseBullets(taskBody);
  // Collapse multiple blank lines to single blank
  taskBody = taskBody.replace(/\n{3,}/g, '\n\n').trim();
  // Clean up solution (preserve indentation since shell commands matter)
  const solution = rawSolution.replace(/\n{3,}/g, '\n\n').trim();
  return { num, points, taskBody, solution };
}

function formatExercise(q, domain) {
  const title = deriveTitle(q.taskBody);
  return `### [KillerCoda-Q${q.num}] ${title} - ${q.points} pts

> 🔗 [${domain.breadcrumb}](${domain.url})

**Task:**

${q.taskBody}

<details><summary>show</summary>
<p>

\`\`\`bash
${q.solution}
\`\`\`

</p>
</details>
`;
}

function importPdf(pdfFile, domain) {
  const pdfPath = path.join(ROOT, 'assets', 'killercoda', pdfFile);
  const text = extractText(pdfPath);
  const blocks = splitQuestionBlocks(text);
  const questions = blocks.map(parseBlock).filter(Boolean);
  console.log(`  ${pdfFile}: ${questions.length} questions parsed`);
  return questions;
}

function appendSection(mdFile, pdfFile, domain, questions) {
  const target = path.join(ROOT, 'exercises', domain.file);
  const current = fs.readFileSync(target, 'utf8');
  if (/^##\s+KillerCoda\s+Mock\s+Exam/m.test(current)) {
    console.warn(`  SKIP ${domain.file}: KillerCoda section already present`);
    return false;
  }
  const blocks = questions.map(q => formatExercise(q, domain)).join('\n');
  const provenance = `> 📚 Source PDF: [\`assets/killercoda/${pdfFile}\`](../assets/killercoda/${pdfFile})\n`;
  const section = `\n## KillerCoda Mock Exam Questions\n\n${provenance}\n${blocks}\n`;
  // Trim trailing whitespace from current then append the new section
  const next = current.replace(/\s+$/, '') + '\n' + section;
  fs.writeFileSync(target, next);
  console.log(`  WROTE ${domain.file}: appended ${questions.length} H3 blocks`);
  return true;
}

let total = 0;
for (const [pdfFile, domain] of Object.entries(PDF_TO_DOMAIN)) {
  console.log(`-- ${pdfFile} -> exercises/${domain.file} --`);
  const questions = importPdf(pdfFile, domain);
  if (questions.length === 0) continue;
  if (appendSection(null, pdfFile, domain, questions)) total += questions.length;
}
console.log(`\n${total} KillerCoda questions imported across ${Object.keys(PDF_TO_DOMAIN).length} domain files.`);
