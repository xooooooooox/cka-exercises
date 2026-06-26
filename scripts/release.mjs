#!/usr/bin/env node
// release.mjs — App-store-style version release machinery.
//
// Workflow:
//   1. read package.json's current version
//   2. parse CHANGELOG.md's [Unreleased] block
//   3. infer bump kind (auto mode) from the section composition:
//        Removed / BREAKING → minor in v0.x, major in v1+
//        Added / Changed    → minor
//        Fixed only         → patch
//        all empty          → fail
//   4. rewrite CHANGELOG: rename [Unreleased] → [vX.Y.Z] - YYYY-MM-DD,
//      prepend a fresh empty [Unreleased] block
//   5. write package.json with new version
//   6. git commit "release: vX.Y.Z"
//   7. git tag vX.Y.Z (annotated, body = release notes)
//   8. push branch + tag
//   9. gh release create vX.Y.Z --notes-file <release-notes>
//
// Flags:
//   --bump=auto|major|minor|patch     default 'auto'
//   --dry-run                          print plan, don't write/commit/push
//   --no-push                          do everything locally but skip push + gh
//   --date=YYYY-MM-DD                  override the date stamp (mostly for tests)
//
// Constraints: pure Node, no deps. Calls `git` and `gh` via child_process.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

const REPO_SLUG = 'xooooooooox/cka-exercises';

function parseFlags(argv) {
  const out = { bump: 'auto', dryRun: false, noPush: false, date: null };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--no-push') out.noPush = true;
    else if (a.startsWith('--bump=')) out.bump = a.slice('--bump='.length);
    else if (a.startsWith('--date=')) out.date = a.slice('--date='.length);
  }
  if (!['auto', 'major', 'minor', 'patch'].includes(out.bump)) {
    throw new Error(`invalid --bump=${out.bump} (expected: auto | major | minor | patch)`);
  }
  return out;
}

function readPkgVersion() {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const v = pkg.version || '0.0.0';
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`package.json version '${v}' is not semver MAJOR.MINOR.PATCH`);
  return { raw: v, major: +m[1], minor: +m[2], patch: +m[3] };
}

function writePkgVersion(newVersion) {
  const txt = fs.readFileSync(PKG_PATH, 'utf8');
  // Replace only the first top-level "version": "x.y.z" line. This keeps
  // formatting / trailing newline intact (JSON.stringify-and-rewrite would
  // re-indent and possibly reorder).
  const updated = txt.replace(/("version"\s*:\s*)"\d+\.\d+\.\d+"/, `$1"${newVersion}"`);
  if (updated === txt) throw new Error('failed to splice version into package.json');
  fs.writeFileSync(PKG_PATH, updated);
}

// Parse CHANGELOG.md into pieces:
//   { header: lines above [Unreleased],
//     unreleased: { full: '...', sections: { Added:[lines], Changed, Fixed, Removed } },
//     rest: lines below (already-released versions + footer links) }
function parseChangelog() {
  const txt = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const lines = txt.split('\n');

  let unreleasedStart = -1;
  let unreleasedEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+\[Unreleased\]/.test(lines[i])) { unreleasedStart = i; continue; }
    if (unreleasedStart !== -1 && unreleasedEnd === -1 && /^##\s+\[/.test(lines[i])) {
      unreleasedEnd = i;
      break;
    }
    if (unreleasedStart !== -1 && unreleasedEnd === -1 && /^---\s*$/.test(lines[i])) {
      // Hit the footer divider before another version section — treat as end of Unreleased.
      unreleasedEnd = i;
      break;
    }
  }
  if (unreleasedStart === -1) throw new Error('CHANGELOG.md is missing a `## [Unreleased]` block');
  if (unreleasedEnd === -1) unreleasedEnd = lines.length;

  const headerLines = lines.slice(0, unreleasedStart);
  const unreleasedLines = lines.slice(unreleasedStart, unreleasedEnd);
  const restLines = lines.slice(unreleasedEnd);

  const sections = { Added: [], Changed: [], Fixed: [], Removed: [] };
  let cur = null;
  for (const line of unreleasedLines.slice(1)) {  // skip the `## [Unreleased]` header line
    const m = line.match(/^###\s+(Added|Changed|Fixed|Removed)\b/);
    if (m) { cur = m[1]; continue; }
    if (cur != null && line.trim()) sections[cur].push(line);
  }

  return {
    headerLines,
    unreleasedLines,
    sections,
    restLines,
  };
}

function inferBump(sections, currentMajor) {
  const has = (s) => sections[s].length > 0;
  const breakingMarker = ['Added', 'Changed', 'Fixed', 'Removed']
    .some(s => sections[s].some(l => /BREAKING/i.test(l)));

  if (!has('Added') && !has('Changed') && !has('Fixed') && !has('Removed')) {
    return null;  // nothing to release
  }
  if (currentMajor === 0) {
    // v0.x — pre-stable. Removed / breaking + Added / Changed all upgrade minor.
    if (has('Removed') || breakingMarker) return 'minor';
    if (has('Added') || has('Changed')) return 'minor';
    return 'patch';
  } else {
    // v1+ — strict semver.
    if (has('Removed') || breakingMarker) return 'major';
    if (has('Added') || has('Changed')) return 'minor';
    return 'patch';
  }
}

function bumpVersion(cur, kind) {
  if (kind === 'major') return { major: cur.major + 1, minor: 0, patch: 0 };
  if (kind === 'minor') return { major: cur.major, minor: cur.minor + 1, patch: 0 };
  if (kind === 'patch') return { major: cur.major, minor: cur.minor, patch: cur.patch + 1 };
  throw new Error(`unknown bump kind: ${kind}`);
}

function fmtVersion(v) { return `${v.major}.${v.minor}.${v.patch}`; }
function fmtTag(v)     { return `v${fmtVersion(v)}`; }

function todayUtc() {
  // 2026-06-25 style. Workflow runs in UTC; date stamp matches that.
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function renderReleaseNotes(sections) {
  const out = [];
  for (const key of ['Added', 'Changed', 'Fixed', 'Removed']) {
    if (sections[key].length === 0) continue;
    out.push(`### ${key}`);
    out.push('');
    for (const line of sections[key]) out.push(line);
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}

function rewriteChangelog(parsed, newVersionTag, date, prevVersionTag) {
  const releasedHeader = `## [${newVersionTag}] - ${date}`;
  // Fresh [Unreleased] is just the heading + blank line. Per CLAUDE.md
  // `## Changelog discipline` ("omit empty category sub-sections"), the
  // ### Added / Changed / Fixed / Removed headings only appear when an
  // entry of that category actually lands — the first matching commit
  // adds the heading along with its entry.
  const freshUnreleased = [
    '## [Unreleased]',
    '',
  ];
  // Walk unreleasedLines and replace `## [Unreleased]` with the release header.
  const releasedBlock = parsed.unreleasedLines.slice();
  releasedBlock[0] = releasedHeader;

  // Strip empty trailing lines that may surround the block; keep visual rhythm.
  while (releasedBlock.length && !releasedBlock[releasedBlock.length - 1].trim()) releasedBlock.pop();
  releasedBlock.push('');

  const out = []
    .concat(parsed.headerLines)
    .concat(freshUnreleased)
    .concat(releasedBlock)
    .concat(parsed.restLines);

  // Append a comparison link reference at the bottom (above any existing
  // version compare links). Detect the `[da57e8f]:` style footer block.
  let txt = out.join('\n');
  const cmpLine = prevVersionTag
    ? `[${newVersionTag}]: https://github.com/${REPO_SLUG}/compare/${prevVersionTag}...${newVersionTag}`
    : `[${newVersionTag}]: https://github.com/${REPO_SLUG}/releases/tag/${newVersionTag}`;
  if (/^\[[\w.-]+\]:\s+https/m.test(txt)) {
    // Insert right above the first existing link def
    txt = txt.replace(/(\n)(\[[\w.-]+\]:\s+https)/, `$1${cmpLine}\n$2`);
  } else {
    if (!txt.endsWith('\n')) txt += '\n';
    txt += `\n${cmpLine}\n`;
  }

  return txt;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) {
    const err = new Error(`${cmd} ${args.join(' ')} → exit ${r.status}\nstderr: ${r.stderr || ''}`);
    err.stdout = r.stdout;
    err.stderr = r.stderr;
    throw err;
  }
  return r.stdout || '';
}

// Wrapper around `git push …` that, on rejection by a protected branch's
// Repository Rule, prints an actionable hint pointing at the one-time
// bypass setup in CLAUDE.md. Without this hint the failure log shows the
// raw `GH013` line and the next maintainer wastes 15 minutes figuring
// out which knob to flip.
function runGitPush(args) {
  try {
    return run('git', ['push', ...args]);
  } catch (err) {
    const stderr = String(err.stderr || err.message || '');
    if (/GH013|protected ref|rule violations/i.test(stderr)) {
      console.error('');
      console.error('💡 Push to a protected ref was rejected by a Repository Rule.');
      console.error('   The release workflow needs a fine-grained PAT instead of GITHUB_TOKEN:');
      console.error('     1. Generate a PAT scoped to this repo with Contents: Read and write.');
      console.error('     2. Store it as repo secret RELEASE_PAT.');
      console.error('     3. Confirm release.yml uses ${{ secrets.RELEASE_PAT }} for both');
      console.error('        actions/checkout@v4 token and the release step GH_TOKEN.');
      console.error('   See CLAUDE.md `## Release workflow → One-time setup: PAT for protected-main pushes`.');
      console.error('');
    }
    throw err;
  }
}

function findPreviousTag() {
  try {
    const out = run('git', ['tag', '--list', 'v*', '--sort=-version:refname']);
    const tags = out.split('\n').filter(Boolean);
    return tags[0] || null;
  } catch {
    return null;
  }
}

async function main() {
  const flags = parseFlags(process.argv);
  const cur = readPkgVersion();
  const parsed = parseChangelog();

  let kind = flags.bump;
  if (kind === 'auto') {
    kind = inferBump(parsed.sections, cur.major);
    if (kind == null) {
      console.error('release: [Unreleased] block is empty — nothing to release.');
      process.exit(1);
    }
  }

  const next = bumpVersion(cur, kind);
  const newTag = fmtTag(next);
  const prevTag = findPreviousTag();
  const date = flags.date || todayUtc();
  const releaseNotes = renderReleaseNotes(parsed.sections);

  console.log(`current : v${cur.raw}`);
  console.log(`bump    : ${kind} (${flags.bump === 'auto' ? 'auto-inferred' : 'forced'})`);
  console.log(`new     : ${newTag}`);
  console.log(`prev tag: ${prevTag || '<none>'}`);
  console.log(`date    : ${date}`);
  console.log('');
  console.log('── release notes preview ──');
  console.log(releaseNotes);
  console.log('───────────────────────────');

  if (flags.dryRun) {
    console.log('--dry-run set — no files written, no git/gh ops.');
    return;
  }

  // Apply file changes.
  writePkgVersion(fmtVersion(next));
  const newChangelog = rewriteChangelog(parsed, newTag, date, prevTag);
  fs.writeFileSync(CHANGELOG_PATH, newChangelog);

  // Git.
  run('git', ['add', 'package.json', 'CHANGELOG.md']);
  run('git', ['commit', '-m', `release: ${newTag}`]);
  // Annotated tag with release notes body so `git show vX.Y.Z` is useful.
  const tagFile = path.join(ROOT, '.release-tag-msg.tmp');
  fs.writeFileSync(tagFile, `Release ${newTag}\n\n${releaseNotes}`);
  try {
    run('git', ['tag', '-a', newTag, '-F', tagFile]);
  } finally {
    try { fs.unlinkSync(tagFile); } catch {}
  }

  if (flags.noPush) {
    console.log(`✓ local release prepared (${newTag}). --no-push set, skipping push + gh.`);
    return;
  }

  // Push commit + tag.
  runGitPush(['origin', 'HEAD']);
  runGitPush(['origin', newTag]);

  // GH Release.
  const notesFile = path.join(ROOT, '.release-notes.tmp');
  fs.writeFileSync(notesFile, releaseNotes);
  try {
    run('gh', ['release', 'create', newTag, '--title', newTag, '--notes-file', notesFile]);
  } finally {
    try { fs.unlinkSync(notesFile); } catch {}
  }

  console.log(`✓ released ${newTag} — https://github.com/${REPO_SLUG}/releases/tag/${newTag}`);
}

main().catch(err => {
  console.error('release error:', err.stack || err.message || err);
  process.exit(1);
});
