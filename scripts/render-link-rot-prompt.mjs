#!/usr/bin/env node
// Substitutes {{BROKEN_URL}}, {{BROKEN_STATUS}}, {{EXERCISE_ID}},
// {{SOURCE_FILE}} placeholders into .github/link-rot/prompt.md and emits the
// result to stdout. Run by the auto-pr job in .github/workflows/link-check.yml.
//
// Env vars (all required):
//   BROKEN_URL, BROKEN_STATUS, EXERCISE_ID, SOURCE_FILE
//
// Optional flag:
//   --template=<path>   override default prompt template path

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_TEMPLATE = path.join(ROOT, '.github', 'link-rot', 'prompt.md');

let templatePath = DEFAULT_TEMPLATE;
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--template=')) templatePath = a.slice('--template='.length);
}

const required = ['BROKEN_URL', 'BROKEN_STATUS', 'EXERCISE_ID', 'SOURCE_FILE'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(2);
}

const template = fs.readFileSync(templatePath, 'utf8');
const out = template.replace(/\{\{(\w+)\}\}/g, (_, key) => process.env[key] ?? `{{${key}}}`);
process.stdout.write(out);
