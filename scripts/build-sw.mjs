#!/usr/bin/env node
// build-sw.mjs — generate docs/sw.gen.js by stamping the build version into
// docs/sw.js's `__BUILD__` placeholder.
//
// Why we don't ship docs/sw.js directly:
//   The version literal needs to change every deploy so the service worker
//   `activate` event drops stale caches. We bake docs/version.json's
//   generatedAt timestamp into the source — that gives us monotonic-ish,
//   per-deploy cache keys without needing a separate revisioning scheme.
//
// docs/sw.gen.js is the file the SPA actually registers (see app.js init).
// It is gitignored; CI regenerates it on every deploy.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs', 'sw.js');
const OUT = path.join(ROOT, 'docs', 'sw.gen.js');
const VERSION_FILE = path.join(ROOT, 'docs', 'version.json');

if (!fs.existsSync(SRC)) {
  console.error(`build-sw: source not found at ${SRC}`);
  process.exit(1);
}

let buildTag = 'dev';
try {
  const v = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
  // Prefer the released semver (v0.1.0 → cka-shell-v0_1_0). When no
  // release has been cut yet (v.version === '0.0.0' or absent), fall
  // back to the build timestamp digits so cache keys still bump per
  // deploy — but they'll start being semver-stable as soon as the
  // first release lands.
  const semver = (v && typeof v.version === 'string') ? v.version : '';
  if (semver && semver !== '0.0.0') {
    buildTag = semver.replace(/\./g, '_');
  } else if (v && typeof v.generatedAt === 'string') {
    buildTag = v.generatedAt.replace(/[^0-9]/g, '');
  }
} catch (err) {
  console.warn(`build-sw: could not read ${VERSION_FILE} (${err.message}); falling back to "dev"`);
}

const src = fs.readFileSync(SRC, 'utf8');
const out = src.replace(/__BUILD__/g, buildTag);
fs.writeFileSync(OUT, out);
console.log(`✓ wrote ${path.relative(ROOT, OUT)} with build tag ${buildTag}`);
