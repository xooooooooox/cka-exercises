#!/usr/bin/env node
// check-curriculum.mjs — watches https://github.com/cncf/curriculum for
// new CKA curriculum PDF versions or content changes to the known ones.
//
// What's checked:
//   - GET https://api.github.com/repos/cncf/curriculum/contents/
//   - filter files matching /^CKA_Curriculum_v(\d+)\.(\d+)\.pdf$/
//   - for each known version (v1.32-v1.35): fetch + MD5 → compare with
//     EXPECTED_MD5 (the verified d28372581378e1ff3aa49670a9c7781f
//     fingerprint shared across all four).
//   - any name NOT in KNOWN_VERSIONS → "new_version" finding (e.g. v1.36).
//
// Modes:
//   --mode=detect  print findings JSON, exit 0 (used locally + CI step 1)
//   --mode=notify  same, plus open a GitHub issue if findings.length > 0
//                  and no open `curriculum-watch` issue with the same
//                  signature SHA1 exists (idempotency).
//
// Issue body carries a `<!-- signature: <sha1> -->` HTML comment so that
// re-runs with the same findings don't spam new issues; once the user
// closes an issue, the next non-empty check WILL open a new one — that's
// the design (close = "I handled it", reopen = "still pending").

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';

const REPO_API = 'https://api.github.com/repos/cncf/curriculum/contents/';
const PDF_PATTERN = /^CKA_Curriculum_v(\d+)\.(\d+)\.pdf$/;

const KNOWN_VERSIONS = ['v1.32', 'v1.33', 'v1.34', 'v1.35'];
const EXPECTED_MD5 = 'd28372581378e1ff3aa49670a9c7781f';

function parseFlags(argv) {
  const out = { mode: 'detect' };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function ghHeaders() {
  const h = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'cka-exercises-curriculum-watch' };
  if (process.env.GH_TOKEN) h.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  return h;
}

async function md5OfUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url}: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  return crypto.createHash('md5').update(buf).digest('hex');
}

function shortVersion(name) {
  const m = name.match(PDF_PATTERN);
  return m ? `v${m[1]}.${m[2]}` : null;
}

async function listPdfs() {
  const resp = await fetch(REPO_API, { headers: ghHeaders() });
  if (!resp.ok) {
    throw new Error(`list ${REPO_API}: ${resp.status} ${resp.statusText}`);
  }
  const entries = await resp.json();
  return entries
    .filter(e => e.type === 'file' && PDF_PATTERN.test(e.name))
    .map(e => ({ name: e.name, url: e.download_url, htmlUrl: e.html_url, version: shortVersion(e.name) }));
}

async function detect() {
  const pdfs = await listPdfs();
  const findings = [];
  for (const pdf of pdfs) {
    if (!KNOWN_VERSIONS.includes(pdf.version)) {
      findings.push({ kind: 'new_version', file: pdf.name, version: pdf.version, url: pdf.htmlUrl });
      continue;
    }
    let md5;
    try { md5 = await md5OfUrl(pdf.url); }
    catch (err) {
      findings.push({ kind: 'fetch_error', file: pdf.name, error: String(err.message || err) });
      continue;
    }
    if (md5 !== EXPECTED_MD5) {
      findings.push({ kind: 'content_changed', file: pdf.name, version: pdf.version, observedMd5: md5, expectedMd5: EXPECTED_MD5, url: pdf.htmlUrl });
    }
  }
  return { findings, checkedAt: new Date().toISOString(), knownVersions: KNOWN_VERSIONS, expectedMd5: EXPECTED_MD5 };
}

function signatureOf(findings) {
  const canon = findings
    .map(f => ({ kind: f.kind, file: f.file, observedMd5: f.observedMd5 || null }))
    .sort((a, b) => (a.file + a.kind).localeCompare(b.file + b.kind));
  return crypto.createHash('sha1').update(JSON.stringify(canon)).digest('hex');
}

function renderIssueBody(report, sig) {
  const lines = [];
  lines.push('The CNCF [`cncf/curriculum`](https://github.com/cncf/curriculum) repo looks different from the baseline this repo tracks.');
  lines.push('');
  lines.push(`**Checked at**: \`${report.checkedAt}\``);
  lines.push(`**Baseline known versions**: ${report.knownVersions.join(', ')}`);
  lines.push(`**Baseline MD5**: \`${report.expectedMd5}\``);
  lines.push('');
  lines.push('### Findings');
  lines.push('');
  lines.push('| Kind | File | Detail |');
  lines.push('| --- | --- | --- |');
  for (const f of report.findings) {
    if (f.kind === 'new_version') {
      lines.push(`| 🆕 New version | [\`${f.file}\`](${f.url}) | not in known list — likely v${f.version.replace(/^v/, '')} release |`);
    } else if (f.kind === 'content_changed') {
      lines.push(`| ⚠️ Content changed | [\`${f.file}\`](${f.url}) | observed MD5 \`${f.observedMd5}\` ≠ expected \`${f.expectedMd5}\` |`);
    } else if (f.kind === 'fetch_error') {
      lines.push(`| 🔌 Fetch error | \`${f.file}\` | ${f.error} |`);
    } else {
      lines.push(`| ❓ ${f.kind} | \`${f.file}\` | (see workflow logs) |`);
    }
  }
  lines.push('');
  lines.push('### Suggested actions');
  lines.push('');
  lines.push('- If a new version PDF appeared: download it, diff against the latest known version, decide whether to import via `scripts/apply-killercoda-import.mjs` (if it brings new questions) or just update `KNOWN_VERSIONS` in `scripts/check-curriculum.mjs` (if the content is byte-identical to the latest known fingerprint).');
  lines.push('- If `content_changed`: download the new PDF, manually verify, then update `EXPECTED_MD5` in `scripts/check-curriculum.mjs` and the MD5 quoted in `EXAM_GUIDE.md` / `EXAM_GUIDE_CN.md`.');
  lines.push('- If `fetch_error`: probably transient — re-run workflow_dispatch once.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`<sub>auto-filed by \`.github/workflows/curriculum-watch.yml\` — to suppress until next change, just close this issue (the watcher won't reopen it for the same findings signature).</sub>`);
  lines.push('');
  lines.push(`<!-- signature: ${sig} -->`);
  return lines.join('\n');
}

function runGh(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', args, { stdio: ['pipe', 'pipe', 'inherit'], ...opts });
    let stdout = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`gh ${args.join(' ')} exited ${code}`));
    });
    if (opts.input != null) {
      proc.stdin.write(opts.input);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }
  });
}

async function findExistingIssue(signature) {
  try {
    const out = await runGh(['issue', 'list', '--label', 'curriculum-watch', '--state', 'open', '--json', 'number,title,body', '--limit', '50']);
    const list = JSON.parse(out || '[]');
    return list.find(i => typeof i.body === 'string' && i.body.includes(`signature: ${signature}`)) || null;
  } catch (err) {
    console.error('warn: gh issue list failed:', err.message);
    return null;
  }
}

async function openIssue(report, signature) {
  const date = report.checkedAt.slice(0, 10);
  const title = `🆕 CKA curriculum may have changed — ${report.findings.length} finding(s) (${date} UTC)`;
  const body = renderIssueBody(report, signature);
  await runGh(['issue', 'create', '--title', title, '--label', 'curriculum-watch', '--label', 'enhancement', '--body-file', '-'], { input: body });
  console.log(`✓ filed issue: ${title}`);
}

async function notify(report) {
  if (report.findings.length === 0) {
    console.log('no findings — curriculum unchanged');
    return;
  }
  const sig = signatureOf(report.findings);
  console.log(`findings signature: ${sig}`);
  const existing = await findExistingIssue(sig);
  if (existing) {
    console.log(`✓ idempotent: open issue #${existing.number} already tracks this signature`);
    return;
  }
  await openIssue(report, sig);
}

async function main() {
  const flags = parseFlags(process.argv);
  const report = await detect();
  console.log(JSON.stringify(report, null, 2));
  if (flags.mode === 'notify') {
    await notify(report);
  }
}

main().catch(err => {
  console.error('error:', err.stack || err);
  process.exit(1);
});
