#!/usr/bin/env node
// Verifies the LLM grader's response parser (docs/llm.js):
//   - clean JSON → no truncation flag, score/verdict propagate
//   - truncated mid-value (cut at "summary":) → repair recovers score/verdict,
//     truncated flag set, synthetic summary
//   - truncated mid-string → repair finds the last completed comma, recovers
//   - garbage with no `{` → hard error mentioning truncation
//
// The grader lives in an IIFE that assigns to `window.LLM`. We run it in a
// sandbox with a fake `window` and then exercise the exported helpers.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const llmSrc = readFileSync(path.join(here, '..', 'docs', 'llm.js'), 'utf8');

const fakeWindow = {};
const ctx = {
  window: fakeWindow,
  fetch: () => { throw new Error('fetch unused in parse tests'); },
  setTimeout, clearTimeout,
  Promise,
  Math, JSON, Number, Boolean, Array, Object, Error,
  console,
};
vm.createContext(ctx);
vm.runInContext(llmSrc, ctx);

const { parseVerdict, tryRepairTruncated } = fakeWindow.LLM;
if (typeof parseVerdict !== 'function' || typeof tryRepairTruncated !== 'function') {
  console.error('window.LLM does not expose parseVerdict / tryRepairTruncated');
  process.exit(1);
}

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`✓ ${label}`);
  } else {
    console.log(`✗ ${label}`);
    failed++;
  }
}

// --- 1. Clean response ---
{
  const raw = JSON.stringify({
    correct: true, score: 95, verdict: 'correct',
    summary: 'Perfect.', passed: ['Used kubectl create'], missed: [],
  });
  const v = parseVerdict(raw);
  assert(v.score === 95, 'clean: score = 95');
  assert(v.verdict === 'correct', 'clean: verdict = correct');
  assert(v.correct === true, 'clean: correct = true');
  assert(v.truncated === false, 'clean: truncated flag false');
  assert(v.summary === 'Perfect.', 'clean: summary preserved');
}

// --- 2. The user's exact failure: truncated at "summary": ---
{
  const raw = '{ "correct": false, "score": 30, "verdict": "incorrect", "summary":';
  const v = parseVerdict(raw);
  assert(v.score === 30, 'cut-at-summary: score = 30');
  assert(v.verdict === 'incorrect', 'cut-at-summary: verdict = incorrect');
  assert(v.correct === false, 'cut-at-summary: correct = false');
  assert(v.truncated === true, 'cut-at-summary: truncated = true');
  assert(/truncated/i.test(v.summary), 'cut-at-summary: synthetic summary mentions truncation');
}

// --- 3. Truncated mid-string ---
{
  const raw = '{ "correct": false, "score": 30, "verdict": "incor';
  const v = parseVerdict(raw);
  assert(v.score === 30, 'mid-string: score = 30');
  assert(v.truncated === true, 'mid-string: truncated = true');
  // Verdict defaults from the score (30 → 'incorrect').
  assert(v.verdict === 'incorrect', 'mid-string: verdict defaulted from score');
}

// --- 4. Truncated with partial passed array (preserves what's complete) ---
{
  const raw = '{ "correct": true, "score": 80, "verdict": "partial", "summary": "Mostly right", "passed": ["wrote rolebinding"], "missed":';
  const v = parseVerdict(raw);
  assert(v.score === 80, 'partial-array: score = 80');
  assert(v.truncated === true, 'partial-array: truncated = true');
  assert(v.summary === 'Mostly right', 'partial-array: summary preserved');
  // The repair snips at the last top-level comma — the one before "missed".
  // So `passed` survives.
  assert(Array.isArray(v.passed) && v.passed.length === 1, 'partial-array: passed preserved');
}

// --- 5. Garbage with no `{` ---
{
  let threw = false;
  try { parseVerdict('Sorry, I cannot evaluate this response.'); }
  catch (e) {
    threw = true;
    assert(/truncated|JSON/i.test(e.message), 'garbage: error mentions truncation or JSON');
  }
  assert(threw, 'garbage: throws hard error');
}

// --- 6. Empty response ---
{
  let threw = false;
  try { parseVerdict(''); } catch { threw = true; }
  assert(threw, 'empty: throws hard error');
}

// --- 7. Code-fenced response ---
{
  const raw = '```json\n{"correct":true,"score":100,"verdict":"correct","summary":"Yes","passed":[],"missed":[]}\n```';
  const v = parseVerdict(raw);
  assert(v.score === 100, 'fenced: score = 100');
  assert(v.truncated === false, 'fenced: not truncated');
}

// --- 8. tryRepairTruncated directly: no opening brace ---
{
  assert(tryRepairTruncated('no json here') === null, 'helper: no opening brace returns null');
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll grader-parse assertions passed.');
