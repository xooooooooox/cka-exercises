#!/usr/bin/env node
// Verifies the Quiz Order modes produce correct outputs against the real
// exercises.json corpus. Mirrors `pickQuizExercises()` from docs/app.js.
//
// Run: npm run verify:quiz-order

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'exercises.json'), 'utf8'));

// Build a flat eligible list with the same shape the SPA produces.
const eligible = [];
for (const dom of DATA.domains) {
  for (const sec of dom.sections) {
    for (const ex of sec.exercises) {
      eligible.push({ ...ex, domain: dom, section: sec });
    }
  }
}

// --- Mirror of docs/app.js helpers ---

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickQuizExercises(eligible, count, order) {
  if (order === 'sequential') return eligible.slice(0, count);
  const sample = shuffleInPlace([...eligible]).slice(0, count);
  if (order === 'random') return sample;
  if (order === 'tag') {
    const TAG_ORDER = ['general', 'cka-past-exam', 'killersh-a', 'killersh-b'];
    const idx = new Map(TAG_ORDER.map((t, i) => [t, i]));
    return sample
      .map((ex, i) => ({ ex, i, k: idx.get(ex.tag) ?? 999 }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .map(r => r.ex);
  }
  if (order === 'section') {
    const domIdx = new Map(DATA.domains.map((d, i) => [d.key, i]));
    return sample
      .map((ex, i) => ({ ex, i, d: domIdx.get(ex.domain.key) ?? 999, s: ex.section?.number ?? 999 }))
      .sort((a, b) => a.d - b.d || a.s - b.s || a.i - b.i)
      .map(r => r.ex);
  }
  return sample;
}

// --- Assertion machinery ---

let failures = 0;
function expect(label, cond, detail = '') {
  const tag = cond ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`  ${tag}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

function isNonDecreasing(arr) {
  for (let i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1]) return false;
  return true;
}

function distinctCount(arr) {
  return new Set(arr).size;
}

const COUNT = 10;
const DOM_IDX = new Map(DATA.domains.map((d, i) => [d.key, i]));
const TAG_IDX = new Map([['general', 0], ['cka-past-exam', 1], ['killersh-a', 2], ['killersh-b', 3]]);

console.log(`Eligible: ${eligible.length} exercises across ${DATA.domains.length} domains\n`);

// --- Sequential ---
console.log('— Sequential —');
{
  const out = pickQuizExercises(eligible, COUNT, 'sequential');
  const ids = out.map(e => e.id);
  expect(`output length is ${COUNT}`, out.length === COUNT, `got ${out.length}`);
  expect('first id is the first eligible id', ids[0] === eligible[0].id, `got ${ids[0]}`);
  expect('output matches eligible.slice(0,N) exactly',
    ids.join('|') === eligible.slice(0, COUNT).map(e => e.id).join('|'));
}

// --- Random ---
console.log('\n— Random —');
{
  const runs = [];
  for (let r = 0; r < 5; r++) {
    runs.push(pickQuizExercises(eligible, COUNT, 'random').map(e => e.id).join('|'));
  }
  const distinctSeqs = new Set(runs).size;
  expect('5 runs produce ≥4 distinct sequences', distinctSeqs >= 4,
    `${distinctSeqs}/5 distinct`);
  // Average distinct-domain count across 20 runs to check spread
  let totalDistinctDomains = 0;
  const N = 20;
  for (let r = 0; r < N; r++) {
    const doms = new Set(pickQuizExercises(eligible, COUNT, 'random').map(e => e.domain.key));
    totalDistinctDomains += doms.size;
  }
  const avgDistinct = totalDistinctDomains / N;
  expect('average distinct-domains-per-sample is > 3', avgDistinct > 3,
    `avg ${avgDistinct.toFixed(2)} across ${N} runs`);
}

// --- By tag ---
console.log('\n— By tag —');
{
  let nonDecRuns = 0, anyMultiTag = 0;
  const N = 30;
  for (let r = 0; r < N; r++) {
    const out = pickQuizExercises(eligible, COUNT, 'tag');
    const seq = out.map(e => TAG_IDX.get(e.tag) ?? 999);
    if (isNonDecreasing(seq)) nonDecRuns++;
    if (distinctCount(seq) >= 2) anyMultiTag++;
  }
  expect('tag-index sequence is non-decreasing in every run', nonDecRuns === N,
    `${nonDecRuns}/${N} runs were non-decreasing`);
  // At least most of the 30 runs have ≥2 distinct tags in the sample (sample
  // size 10 from a pool with ~140 general / ~19 past-exam / ~17 each killer)
  // — this is overwhelmingly likely.
  expect('typical run has ≥2 distinct tags', anyMultiTag >= 25,
    `${anyMultiTag}/${N} runs had ≥2 distinct tags`);
}

// --- By section ---
console.log('\n— By section —');
{
  let nonDecRuns = 0, avgDistinctSections = 0;
  const N = 30;
  for (let r = 0; r < N; r++) {
    const out = pickQuizExercises(eligible, COUNT, 'section');
    const seq = out.map(e => (DOM_IDX.get(e.domain.key) ?? 999) * 100 + (e.section?.number ?? 999));
    if (isNonDecreasing(seq)) nonDecRuns++;
    avgDistinctSections += distinctCount(seq);
  }
  avgDistinctSections /= N;
  expect('(domain, section) sequence is non-decreasing in every run', nonDecRuns === N,
    `${nonDecRuns}/${N} runs were non-decreasing`);
  expect('average distinct sections-per-sample is ≥ 3 (genuinely spread)',
    avgDistinctSections >= 3, `avg ${avgDistinctSections.toFixed(2)} sections`);
  // Demonstrate one sample for the human reader
  const demo = pickQuizExercises(eligible, COUNT, 'section');
  console.log('\n  demo: 10 picks by section (one run):');
  for (const ex of demo) {
    console.log(`    ${ex.id}  ${ex.domain.key} §${ex.section.number}  [${ex.tag}]`);
  }
}

console.log(`\n${failures === 0 ? '\x1b[32mALL PASS\x1b[0m' : `\x1b[31m${failures} FAIL\x1b[0m`}`);
process.exit(failures === 0 ? 0 : 1);
