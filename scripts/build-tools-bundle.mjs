#!/usr/bin/env node
// Orchestrator: builds Tools tab bundles for multiple kubernetes minors.
//
// Strategy: "the two latest stable kubernetes minors + always-include v1.35"
//   - Fetches the latest stable patch from dl.k8s.io/release/stable.txt
//   - Derives latest + previous minor
//   - Adds the CKA target minor (currently 1.35) on top, deduped
//   - For each minor: downloads the patch-pinned kubectl binary, captures
//     `kubectl <cmd> -h` output, fetches the matching OpenAPI release,
//     emits docs/tools-X.Y.json
//   - Writes docs/tools-versions.json manifest (default = v1.35)
//
// Local override: --minors=1.35,1.34 to skip the network probe entirely.
//
// Usage:
//   node scripts/build-tools-bundle.mjs
//   node scripts/build-tools-bundle.mjs --minors=1.35
//   node scripts/build-tools-bundle.mjs --minors=1.35 --keep-bin

import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIR = path.join(ROOT, 'tools', '.bin');
const DOCS = path.join(ROOT, 'docs');

// CKA target minor — always included in the bundle list, and is the default
// selection in the SPA dropdown.
const CKA_TARGET_MINOR = '1.35';

function parseArgs() {
  const out = { minors: null, keepBin: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--keep-bin') out.keepBin = true;
    const m = a.match(/^--(\w+)=(.*)$/);
    if (m && m[1] === 'minors') out.minors = m[2].split(',').map(s => s.trim()).filter(Boolean);
  }
  return out;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'cka-exercises-build/1.0' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        return resolve(fetchText(res.headers.location));
      }
      if (res.statusCode !== 200) return reject(new Error(`${url} → HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    }).on('error', reject);
  });
}

function fetchBinary(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'user-agent': 'cka-exercises-build/1.0' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        file.close(); fs.unlinkSync(dest);
        return resolve(fetchBinary(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlinkSync(dest);
        return reject(new Error(`${url} → HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (e) => { fs.unlinkSync(dest); reject(e); });
  });
}

function minorOf(versionString) {
  // "v1.35.4" → "1.35"
  const m = versionString.match(/^v?(\d+)\.(\d+)\./);
  if (!m) throw new Error(`Can't parse version: ${versionString}`);
  return `${m[1]}.${m[2]}`;
}

function prevMinor(minor) {
  const [maj, min] = minor.split('.').map(Number);
  return `${maj}.${min - 1}`;
}

async function resolveMinors(args) {
  if (args.minors && args.minors.length) {
    console.log(`Using explicit minors: ${args.minors.join(', ')}`);
    return [...new Set(args.minors)];
  }
  console.log(`Probing dl.k8s.io for latest stable…`);
  const latest = (await fetchText('https://dl.k8s.io/release/stable.txt')).trim();
  const latestMinor = minorOf(latest);
  const previousMinor = prevMinor(latestMinor);
  const minors = [...new Set([latestMinor, previousMinor, CKA_TARGET_MINOR])];
  console.log(`Auto-resolved minors (latest + previous + CKA target): ${minors.join(', ')}`);
  return minors;
}

function detectPlatform() {
  const p = os.platform();
  const a = os.arch();
  const platform = p === 'darwin' ? 'darwin' : 'linux';
  const arch = a === 'arm64' ? 'arm64' : 'amd64';
  return { platform, arch };
}

async function ensureKubectl(minor) {
  // Resolve patch version
  const stable = (await fetchText(`https://dl.k8s.io/release/stable-${minor}.txt`)).trim();
  const dest = path.join(BIN_DIR, `kubectl-${minor}`);
  if (fs.existsSync(dest)) {
    console.log(`  ✓ kubectl ${stable} (cached at ${path.relative(ROOT, dest)})`);
    return { path: dest, patch: stable };
  }
  const { platform, arch } = detectPlatform();
  const url = `https://dl.k8s.io/release/${stable}/bin/${platform}/${arch}/kubectl`;
  console.log(`  ⏬ downloading ${url}`);
  await fetchBinary(url, dest);
  fs.chmodSync(dest, 0o755);
  return { path: dest, patch: stable };
}

function runChild(args) {
  console.log(`  $ node ${args.slice(0, 2).join(' ')} ${args.slice(2).join(' ')}`);
  execFileSync('node', args, { stdio: 'inherit', cwd: ROOT });
}

async function buildOne(minor) {
  console.log(`\n=== ${minor} ===`);
  const { path: kubectlPath, patch } = await ensureKubectl(minor);
  runChild([
    'scripts/build-kubectl-help.mjs',
    `--kubectl=${kubectlPath}`,
    `--minor=${minor}`,
  ]);
  runChild([
    'scripts/build-kubectl-tools.mjs',
    `--minor=${minor}`,
  ]);
  // Verify output + size
  const outFile = path.join(DOCS, `tools-${minor}.json`);
  const bytes = fs.statSync(outFile).size;
  if (bytes > 800 * 1024) throw new Error(`tools-${minor}.json exceeds 800KB (got ${bytes})`);
  return {
    minor,
    kubectl: patch,
    openapi: `release-${minor}`,
    file: `tools-${minor}.json`,
    bytes,
    generatedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = parseArgs();
  const minors = await resolveMinors(args);
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const results = [];
  for (const m of minors) {
    try {
      results.push(await buildOne(m));
    } catch (e) {
      console.error(`✗ ${m}: ${e.message}`);
      process.exitCode = 1;
    }
  }

  if (!results.length) {
    console.error('No bundles produced — aborting manifest write.');
    process.exit(1);
  }

  // Sort newest first
  results.sort((a, b) => b.minor.localeCompare(a.minor, undefined, { numeric: true }));

  // Always default to the CKA target if it built; otherwise the newest.
  const ckaResult = results.find(r => r.minor === CKA_TARGET_MINOR);
  const defaultMinor = ckaResult ? CKA_TARGET_MINOR : results[0].minor;

  const manifest = {
    schemaVersion: 1,
    default: defaultMinor,
    generatedAt: new Date().toISOString(),
    versions: results.map(({ minor, kubectl, openapi, file, generatedAt }) =>
      ({ minor, kubectl, openapi, file, generatedAt })),
  };
  const manifestPath = path.join(DOCS, 'tools-versions.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(ROOT, manifestPath)} — default ${defaultMinor}, versions: ${results.map(r => r.minor).join(', ')}`);

  if (!args.keepBin && !process.env.KEEP_BIN) {
    // Keep cached binaries — CI cache restores them and re-runs skip the download.
    // (The flag is for explicit cleanup; default behaviour preserves cache hits.)
  }
}

main().catch(e => { console.error(e); process.exit(1); });
