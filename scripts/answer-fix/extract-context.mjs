#!/usr/bin/env node
// Reads a `gh issue view --json title,body,labels,number` payload from stdin
// and emits a shell-sourceable env block describing the issue, plus a
// substituted prompt to stdout when --prompt-template=<path> is passed.
//
// Usage from the workflow:
//   gh issue view "$ISSUE" --json title,body,labels,number \
//     | node scripts/answer-fix/extract-context.mjs --env > /tmp/ctx.env
//   . /tmp/ctx.env
//   node scripts/answer-fix/extract-context.mjs \
//     --prompt-template .github/answer-fix/prompt.md < /tmp/issue.json \
//     > /tmp/prompt.md
//
// Exit codes:
//   0 — parsed OK
//   2 — missing required markers (exerciseId, sourceFile)

import { readFileSync } from 'node:fs';

const args = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) {
      args[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
}

const raw = readFileSync(0, 'utf8');
let issue;
try { issue = JSON.parse(raw); }
catch (e) { console.error('Could not parse stdin as JSON:', e.message); process.exit(2); }

const body   = issue.body || '';
const number = issue.number;
const labels = (issue.labels || []).map(l => l.name || l);

const exerciseId  = body.match(/\*\*ID:\*\*\s*`([^`]+)`/)?.[1];
const sourceFile  = body.match(/\*\*Source file:\*\*\s*`([^`]+)`/)?.[1];
const appLink     = body.match(/\*\*App link:\*\*\s*(https?:\S+)/)?.[1] || '';
const issueType   = (labels.find(l => l.startsWith('kind/')) || '').slice(5) || 'other';

if (!exerciseId || !sourceFile) {
  console.error(`Issue #${number} body is missing **ID:** or **Source file:** markers.`);
  console.error('Refile the issue from the SPA report modal so the workflow can parse it.');
  process.exit(2);
}

if (args.env) {
  const shEsc = (s) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
  const out = [
    `export ISSUE=${shEsc(number)}`,
    `export EXERCISE_ID=${shEsc(exerciseId)}`,
    `export SOURCE_FILE=${shEsc(sourceFile)}`,
    `export ISSUE_TYPE=${shEsc(issueType)}`,
    `export APP_LINK=${shEsc(appLink)}`,
  ].join('\n') + '\n';
  process.stdout.write(out);
  process.exit(0);
}

if (args['prompt-template']) {
  const tmpl = readFileSync(args['prompt-template'], 'utf8');
  const replaced = tmpl
    .replaceAll('{{ISSUE_NUMBER}}', String(number))
    .replaceAll('{{EXERCISE_ID}}', exerciseId)
    .replaceAll('{{SOURCE_FILE}}', sourceFile)
    .replaceAll('{{ISSUE_TYPE}}', issueType)
    .replaceAll('{{APP_LINK}}', appLink)
    .replaceAll('{{ISSUE_BODY}}', body);
  process.stdout.write(replaced);
  process.exit(0);
}

// Default: JSON manifest (useful for ad-hoc debugging).
process.stdout.write(JSON.stringify({
  number, exerciseId, sourceFile, issueType, appLink, labels,
}, null, 2) + '\n');
