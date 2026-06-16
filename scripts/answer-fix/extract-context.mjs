#!/usr/bin/env node
// Reads a `gh issue view --json title,body,labels,number` payload from stdin
// and emits one of three outputs:
//   --env                   $GITHUB_ENV-compatible KEY=VALUE lines (no
//                           `export`, no quotes). Cat the output directly
//                           into $GITHUB_ENV.
//   --prompt-template=<p>   Substituted prompt to stdout.
//   (default)               JSON manifest for ad-hoc debugging.
//
// Workflow usage:
//   gh issue view "$ISSUE" --json title,body,labels,number > /tmp/issue.json
//   node scripts/answer-fix/extract-context.mjs --env < /tmp/issue.json \
//     >> "$GITHUB_ENV"
//   node scripts/answer-fix/extract-context.mjs \
//     --prompt-template=.github/answer-fix/prompt.md < /tmp/issue.json \
//     > /tmp/prompt.md
//
// Issue-type resolution order:
//   1. `kind/<id>` label (set by the SPA's pre-filled URL once the labels
//      exist on the repo).
//   2. Body fallback — parses the `**Issue type:** …` line and reverse-maps
//      to a kind id. Handles issues filed before the labels existed.
//   3. Default `other`.
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

// Reverse-map the human-readable "Issue type" string emitted by the SPA's
// renderReportMarkdown() back to the kind id used by the prompt + GitHub
// labels. Used as a fallback when the kind/* label didn't make it onto the
// issue (e.g. the SPA pre-fill URL referenced labels that didn't exist yet).
const KIND_BY_BODY_SNIPPET = [
  // Solution-mode (answer-fix) kinds
  ['bundles verification',  'verification-bundled'],
  ['wrong resource',        'wrong-resource'],
  ['outdated',              'outdated-flag'],
  ['incomplete',            'missing-step'],
  ['missing a required',    'missing-step'],
  ['typo',                  'typo'],
  ['formatting',            'typo'],
  // Task-mode (task-fix) kinds. Reached only when no `kind/*` label was
  // present on the issue — defensive fallback for issues filed by URL during
  // a brief window before the repo labels existed. The SPA always sets the
  // label, in which case the label-walk above picks the kind directly.
  ['missing a relevant',                       'missing-docs-link'],
  ['existing docs link points to the wrong',   'incorrect-docs-link'],
  ['breadcrumb text drifted',                  'outdated-breadcrumb'],
  ['wording is ambiguous',                     'unclear-task'],
  ['factual error',                            'factual-error'],
];

let issueType = (labels.find(l => l.startsWith('kind/')) || '').slice(5);
if (!issueType) {
  const m = body.match(/\*\*Issue type:\*\*\s*(.+)/i)?.[1]?.toLowerCase() || '';
  for (const [needle, id] of KIND_BY_BODY_SNIPPET) {
    if (m.includes(needle)) { issueType = id; break; }
  }
}
issueType = issueType || 'other';

if (!exerciseId || !sourceFile) {
  console.error(`Issue #${number} body is missing **ID:** or **Source file:** markers.`);
  console.error('Refile the issue from the SPA report modal so the workflow can parse it.');
  process.exit(2);
}

if (args.env) {
  // $GITHUB_ENV expects plain KEY=VALUE lines — no `export`, no surrounding
  // quotes. All values here are simple single-line strings.
  const lines = [
    `ISSUE=${number}`,
    `EXERCISE_ID=${exerciseId}`,
    `SOURCE_FILE=${sourceFile}`,
    `ISSUE_TYPE=${issueType}`,
    `APP_LINK=${appLink}`,
  ];
  process.stdout.write(lines.join('\n') + '\n');
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
