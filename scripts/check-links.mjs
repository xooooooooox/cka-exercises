#!/usr/bin/env node
// Pings every kubernetes.io / external URL referenced by an exercise.
//
//   node scripts/check-links.mjs
//
// Reads docs/exercises.json (run scripts/build-exercises.mjs first if it's stale).
// Issues a HEAD request for each unique docsLinks[].url; falls back to GET on
// 405/501 (some sites reject HEAD). 2xx and 3xx count as OK. Concurrency is
// capped at 8 to be polite. Exits non-zero if any URL fails.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'docs', 'exercises.json');

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 8;
const UA = 'cka-exercises-link-check/1.0 (+https://github.com/xooooooooox/cka-exercises)';

if (!fs.existsSync(JSON_PATH)) {
  console.error(`✗ ${path.relative(ROOT, JSON_PATH)} not found.`);
  console.error(`  Run: node scripts/build-exercises.mjs`);
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const urls = new Set();
// Reverse index URL → [exerciseId, …]. The link-check workflow's auto-pr job
// uses this to fan out one PR per unique broken URL, listing every affected
// exercise in the PR body so the maintainer can apply the same fix to siblings.
const urlToExercises = new Map();
for (const dom of data.domains) {
  for (const sec of dom.sections) {
    for (const ex of sec.exercises) {
      for (const lnk of (ex.docsLinks || [])) {
        if (!lnk.url) continue;
        urls.add(lnk.url);
        if (!urlToExercises.has(lnk.url)) urlToExercises.set(lnk.url, []);
        urlToExercises.get(lnk.url).push(ex.id);
      }
    }
  }
}

const all = [...urls].sort();
console.log(`Checking ${all.length} unique URLs (concurrency ${CONCURRENCY})…\n`);

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);
  const opts = {
    method: 'HEAD',
    redirect: 'follow',
    signal: controller.signal,
    headers: { 'User-Agent': UA, 'Accept': '*/*' },
  };
  try {
    let res = await fetch(url, opts);
    if (res.status === 405 || res.status === 501) {
      // Some servers don't support HEAD — retry with GET
      const getOpts = { ...opts, method: 'GET' };
      res = await fetch(url, getOpts);
      res.body?.cancel?.();
    }
    return { url, status: res.status, ok: res.status >= 200 && res.status < 400 };
  } catch (e) {
    return { url, status: 0, ok: false, error: e.name === 'AbortError' ? 'timeout' : (e.message || String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// Retry transient failures (5xx, 429, network errors, timeouts) up to 2 times
// with exponential backoff. 4xx fails immediately — it's a genuinely broken
// link and retrying won't fix it. Eliminates the false-positive workflow runs
// caused by sporadic kubernetes.io 5xx / TLS-handshake hiccups from GitHub
// Actions runner IPs (the original cause of the 2026-06-15 link-check fail).
async function probeWithRetry(url, maxAttempts = 3) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await probe(url);
    r.attempts = attempt;
    if (r.ok) return r;
    // 4xx (except 429) is a hard fail — don't retry.
    if (r.status >= 400 && r.status < 500 && r.status !== 429) return r;
    last = r;
    if (attempt < maxAttempts) {
      const backoffMs = attempt === 1 ? 500 : 2000;
      await new Promise(res => setTimeout(res, backoffMs));
    }
  }
  return last;
}

const results = await runPool(all, async (url) => {
  const r = await probeWithRetry(url);
  const mark = r.ok ? '✓' : '✗';
  const code = r.status || (r.error || '?');
  const retried = (r.attempts || 1) > 1 ? ` (retried ${r.attempts - 1}x)` : '';
  process.stdout.write(`${mark} ${String(code).padEnd(8)} ${url}${retried}\n`);
  return r;
}, CONCURRENCY);

const failed = results.filter(r => !r.ok);

console.log();
console.log(`Summary: ${results.length - failed.length} ok, ${failed.length} failed`);

if (failed.length) {
  console.log();
  console.log('Failed URLs:');
  for (const r of failed) {
    console.log(`  ${r.status || r.error}  ${r.url}`);
  }
  // Structured JSON consumed by .github/workflows/link-check.yml:
  //   - the link-check job pipes it through scripts/render-link-rot-summary.mjs
  //     to populate $GITHUB_STEP_SUMMARY
  //   - the auto-pr job feeds it into a matrix (one entry per unique URL) and
  //     runs aider against the first referencing exercise
  const out = failed.map(r => ({
    url: r.url,
    status: r.status || 0,
    error: r.error || null,
    attempts: r.attempts || 1,
    exercises: urlToExercises.get(r.url) || [],
  }));
  fs.writeFileSync('/tmp/link-check-failures.json', JSON.stringify(out, null, 2));
  process.exit(1);
}

process.exit(0);
