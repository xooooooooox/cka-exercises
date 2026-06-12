// CKA Practice — browse + quiz logic.
// Loads docs/exercises.json, renders cards with Marked.js, persists progress in localStorage.

'use strict';

// ---------- State ----------
const State = {
  data: null,                    // exercises.json
  allExercises: [],              // flat list with domain/section back-refs
  byId: new Map(),
  mode: 'browse',
  filters: {
    domains: new Set(),          // all selected by default
    tags: new Set(['general', 'cka-past-exam', 'killersh-a', 'killersh-b']),
    search: '',
    onlyBookmarks: false,
    onlyUndone: false,
    revealSolutions: false,
  },
  quiz: null,                    // { ids, idx, status: Map<id, 'got'|'missed'|'skipped'>, flagged: Set, revealed: Set, deadline, solutionsHidden }
  quizTimerHandle: null,
  docs: null,                    // { tree, leaves: Map<url, leaf>, selectedUrl }
  tools: null,                   // { rootKinds, definitions, kubectl: { version, commands } }
  toolsExplain: { kindRef: null, path: [] },
  toolsKubectl: { cmdPath: null },
  toolsSubtab: 'explain',
};

// ---------- Storage ----------
const KEY = {
  done: 'cka:done',
  bookmark: 'cka:bookmark',
  theme: 'cka:theme',
  quizActive: 'cka:quiz:active',
  quizSnapshots: 'cka:quiz:snapshots',
  toolsSubtab: 'cka:tools:lastSubtab',
  toolsKind: 'cka:tools:lastKind',
  toolsPath: 'cka:tools:lastPath',
  toolsCmd: 'cka:tools:lastCmd',
  docsLastUrl: 'cka:docs:lastUrl',
  llmSettings: 'cka:llm:settings',
  privacyAck: 'cka:llm:privacyAck',
  answerPrefix: 'cka:answer:',   // appended with <exerciseId>
  gistToken: 'cka:gist:token',
  gistId: 'cka:gist:id',
};

const LLM_DEFAULT_SETTINGS = {
  provider: 'anthropic',
  apiKey: '',
  model: '',          // empty → use provider default
  baseUrl: '',        // empty → use provider default
  autoDoneThreshold: -1,
};

function getLLMSettings() {
  return Object.assign({}, LLM_DEFAULT_SETTINGS, storageGet(KEY.llmSettings, {}));
}
function setLLMSettings(s) { storageSet(KEY.llmSettings, s); }

function getAnswer(exerciseId) { return storageGet(KEY.answerPrefix + exerciseId, null); }
function setAnswer(exerciseId, payload) { storageSet(KEY.answerPrefix + exerciseId, payload); }
function storageGet(k, fallback) {
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function storageSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}
function isDone(id)     { return !!storageGet(KEY.done, {})[id]; }
function isBookmark(id) { return !!storageGet(KEY.bookmark, {})[id]; }
function setDone(id, v) {
  const m = storageGet(KEY.done, {}); if (v) m[id] = true; else delete m[id]; storageSet(KEY.done, m);
}
function setBookmark(id, v) {
  const m = storageGet(KEY.bookmark, {}); if (v) m[id] = true; else delete m[id]; storageSet(KEY.bookmark, m);
}

// ---------- Helpers ----------
function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v === false || v == null) {}
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

const TAG_LABEL = {
  'general': 'General',
  'cka-past-exam': 'CKA Past Exam',
  'killersh-a': 'Killer.sh A',
  'killersh-b': 'Killer.sh B',
};

function tagPill(tag) {
  return el('span', { class: `tag-pill tag-${tag}` }, TAG_LABEL[tag] || tag);
}

function renderMarkdown(md) {
  if (!md) return '';
  // marked v12 — safe defaults; we don't have user-supplied HTML to worry about.
  return marked.parse(md, { gfm: true, breaks: false });
}

function attachCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = el('button', { class: 'copy-btn', type: 'button', title: 'Copy to clipboard' }, 'Copy');
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const code = pre.querySelector('code');
      const text = code ? code.innerText : pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '✓ Copied';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1200);
      } catch { btn.textContent = '✗ failed'; }
    });
    pre.appendChild(btn);
  });
}

// ---------- Data loading ----------
async function loadData() {
  const resp = await fetch('exercises.json', { cache: 'no-cache' });
  if (!resp.ok) throw new Error(`exercises.json: ${resp.status}`);
  State.data = await resp.json();

  // Flatten
  for (const dom of State.data.domains) {
    for (const sec of dom.sections) {
      for (const ex of sec.exercises) {
        const flat = { ...ex, domain: dom, section: sec };
        State.allExercises.push(flat);
        State.byId.set(ex.id, flat);
      }
    }
  }

  // All domains selected by default
  for (const dom of State.data.domains) State.filters.domains.add(dom.key);

  const meta = document.getElementById('build-meta');
  if (meta && State.data.generatedAt) {
    meta.textContent = `generated ${new Date(State.data.generatedAt).toLocaleString()}`;
  }
}

// ---------- Filtering ----------
function applyFilters() {
  const { domains, tags, search, onlyBookmarks, onlyUndone } = State.filters;
  const q = search.trim().toLowerCase();
  return State.allExercises.filter(ex => {
    if (!domains.has(ex.domain.key)) return false;
    if (!tags.has(ex.tag)) return false;
    if (onlyBookmarks && !isBookmark(ex.id)) return false;
    if (onlyUndone && isDone(ex.id)) return false;
    if (q) {
      const hay = (ex.title + ' ' + (ex.task || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------- Browse mode rendering ----------
function renderFilterBar() {
  const domList = document.getElementById('filter-domain-list');
  domList.innerHTML = '';
  for (const dom of State.data.domains) {
    const cb = el('input', { type: 'checkbox', value: dom.key, checked: State.filters.domains.has(dom.key) });
    cb.addEventListener('change', () => {
      if (cb.checked) State.filters.domains.add(dom.key);
      else State.filters.domains.delete(dom.key);
      renderBrowse();
    });
    domList.appendChild(el('label', {}, cb, ` ${dom.title} (${dom.weight})`));
  }
  document.querySelectorAll('#filter-tag-list input[type=checkbox]').forEach(cb => {
    cb.checked = State.filters.tags.has(cb.value);
    cb.addEventListener('change', () => {
      if (cb.checked) State.filters.tags.add(cb.value);
      else State.filters.tags.delete(cb.value);
      renderBrowse();
    });
  });
  const search = document.getElementById('filter-search');
  search.value = State.filters.search;
  search.addEventListener('input', () => { State.filters.search = search.value; renderBrowse(); });

  const bm = document.getElementById('filter-bookmark');
  bm.addEventListener('change', () => { State.filters.onlyBookmarks = bm.checked; renderBrowse(); });
  const un = document.getElementById('filter-undone');
  un.addEventListener('change', () => { State.filters.onlyUndone = un.checked; renderBrowse(); });
  const rs = document.getElementById('filter-reveal-solutions');
  rs.addEventListener('change', () => { State.filters.revealSolutions = rs.checked; renderBrowse(); });

  document.getElementById('filter-reset').addEventListener('click', () => {
    State.filters = {
      domains: new Set(State.data.domains.map(d => d.key)),
      tags: new Set(['general', 'cka-past-exam', 'killersh-a', 'killersh-b']),
      search: '', onlyBookmarks: false, onlyUndone: false, revealSolutions: false,
    };
    renderFilterBar();
    renderBrowse();
  });
}

function renderSidebar(visibleExercises) {
  const tree = document.getElementById('sidebar-tree');
  tree.innerHTML = '';
  const visibleByDomain = new Map();
  for (const ex of visibleExercises) {
    if (!visibleByDomain.has(ex.domain.key)) visibleByDomain.set(ex.domain.key, new Map());
    const bySec = visibleByDomain.get(ex.domain.key);
    if (!bySec.has(ex.section.number)) bySec.set(ex.section.number, []);
    bySec.get(ex.section.number).push(ex);
  }

  for (const dom of State.data.domains) {
    const bySec = visibleByDomain.get(dom.key);
    if (!bySec) continue;
    const totalEx = dom.sections.reduce((s, sec) => s + sec.exercises.length, 0);
    const doneEx = dom.sections.reduce(
      (s, sec) => s + sec.exercises.filter(e => isDone(e.id)).length, 0);
    const domEl = el('details', { class: 'tree-domain', open: true });
    domEl.appendChild(el('summary', {},
      el('span', { class: 'label' }, dom.title.replace(/ \(.+?\)/, '')),
      el('small', { class: 'muted' }, `${doneEx}/${totalEx}`),
    ));

    for (const sec of dom.sections) {
      const exs = bySec.get(sec.number);
      if (!exs) continue;
      const secEl = el('details', { class: 'tree-section', open: false });
      const secLabel = sec.kind === 'killersh' ? '🎯 ' + sec.title : `${sec.number}. ${sec.title}`;
      secEl.appendChild(el('summary', {},
        el('span', { class: 'label' }, secLabel),
        el('small', {}, `${exs.length}`),
      ));
      for (const ex of exs) {
        const btn = el('button', {
          class: 'tree-exercise' + (isDone(ex.id) ? ' done' : '') + (isBookmark(ex.id) ? ' bookmarked' : ''),
          title: ex.title,
          'data-id': ex.id,
        },
          el('span', { class: 'qnum' }, `Q${ex.numberInDomain}`),
          el('span', { class: 'label' }, ex.title),
        );
        btn.addEventListener('click', () => {
          document.getElementById('card-' + ex.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        secEl.appendChild(btn);
      }
      domEl.appendChild(secEl);
    }
    tree.appendChild(domEl);
  }
}

// Short labels for the sidebar progress widget (avoid the long domain titles).
const PROGRESS_SHORT_LABEL = {
  'cluster-architecture': 'Cluster Arch',
  'scheduling':           'Scheduling',
  'networking':           'Networking',
  'storage':              'Storage',
  'troubleshooting':      'Troubleshooting',
};

function renderSidebarProgress() {
  const elProgress = document.getElementById('sidebar-progress');
  elProgress.innerHTML = '';
  let allTotal = 0, allDone = 0, allBookmark = 0;

  // Per-domain rows
  for (const dom of State.data.domains) {
    const total = dom.sections.reduce((s, sec) => s + sec.exercises.length, 0);
    const done = dom.sections.reduce((s, sec) => s + sec.exercises.filter(e => isDone(e.id)).length, 0);
    allTotal += total; allDone += done;

    const pct = total ? (done / total) * 100 : 0;
    const row = el('div', { class: 'prog-row' + (done === total ? ' complete' : '') });
    row.appendChild(el('div', { class: 'prog-label' },
      el('span', { class: 'prog-name' }, PROGRESS_SHORT_LABEL[dom.key] || dom.key),
      el('span', { class: 'prog-count' }, `${done}/${total}`),
    ));
    const bar = el('div', { class: 'prog-bar' });
    const fill = el('div', { class: 'prog-bar-fill', style: { width: `${pct}%` } });
    bar.appendChild(fill);
    row.appendChild(bar);
    elProgress.appendChild(row);
  }

  for (const ex of State.allExercises) if (isBookmark(ex.id)) allBookmark++;

  // Divider + overall + bookmarks
  elProgress.appendChild(el('div', { class: 'prog-divider' }));
  elProgress.appendChild(el('div', { class: 'prog-overall' },
    el('span', {}, 'Overall'),
    el('strong', {}, `${allDone} / ${allTotal}`),
  ));
  elProgress.appendChild(el('div', { class: 'prog-overall muted' },
    el('span', {}, '⭐ Bookmarked'),
    el('strong', {}, `${allBookmark}`),
  ));
}

// ---------- Settings overlay (LLM grading config) ----------

// Fallback model list per provider — shown until the user runs Test, or when
// the live /v1/models call fails. Kept short on purpose.
const MODEL_FALLBACK = {
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
  deepseek:  ['deepseek-chat', 'deepseek-reasoner'],
  qwen:      ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-max', 'qwen3-coder-plus'],
  doubao:    ['doubao-1-5-pro-256k', 'doubao-1-5-pro-32k', 'doubao-pro-256k'],
  ollama:    ['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b'],
};

function populateModelChips(models) {
  const row = document.getElementById('settings-model-suggestions');
  if (!row) return;
  row.innerHTML = '';
  const input = document.getElementById('settings-model');
  const currentValue = input?.value || '';
  for (const m of (models || [])) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'model-chip' + (m === currentValue ? ' active' : '');
    chip.textContent = m;
    chip.addEventListener('click', () => {
      if (!input) return;
      input.value = m;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      row.querySelectorAll('.model-chip.active').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
    row.appendChild(chip);
  }
}

function installSettingsOverlay() {
  const overlay = document.getElementById('settings-overlay');
  const toggle = document.getElementById('settings-toggle');
  const close = document.getElementById('settings-close');
  const save = document.getElementById('settings-save');
  const clearBtn = document.getElementById('settings-clear');
  const status = document.getElementById('settings-status');
  const providerInputs = document.querySelectorAll('input[name="llm-provider"]');
  const keyInput = document.getElementById('settings-key');
  const modelInput = document.getElementById('settings-model');
  const baseUrlInput = document.getElementById('settings-baseurl');
  const autoDoneSelect = document.getElementById('settings-autodone');
  const modelHint = document.getElementById('settings-model-hint');
  const keyRow = document.getElementById('settings-key-row');
  const testBtn = document.getElementById('settings-test');
  const testStatus = document.getElementById('settings-test-status');

  function reflectProvider(p) {
    const def = window.LLM?.DEFAULTS[p] || {};
    if (!modelInput.value) modelInput.placeholder = def.model || '';
    if (!baseUrlInput.value) baseUrlInput.placeholder = def.baseUrl || '';
    if (modelHint) modelHint.textContent = def.model ? `Default: ${def.model}` : '';
    // Ollama doesn't need a key
    if (keyRow) keyRow.style.display = (p === 'ollama') ? 'none' : '';
    // Reset model dropdown to the hardcoded fallback when switching providers
    populateModelChips(MODEL_FALLBACK[p]);
    // Clear any stale test status (different provider)
    if (testStatus) { testStatus.hidden = true; testStatus.textContent = ''; }
  }

  function loadIntoForm() {
    const s = getLLMSettings();
    providerInputs.forEach(r => { r.checked = (r.value === s.provider); });
    keyInput.value = s.apiKey || '';
    modelInput.value = s.model || '';
    baseUrlInput.value = s.baseUrl || '';
    autoDoneSelect.value = String(s.autoDoneThreshold);
    reflectProvider(s.provider);
  }

  function open() { loadIntoForm(); overlay.hidden = false; }
  function shut() { overlay.hidden = true; status.textContent = ''; }

  toggle?.addEventListener('click', open);
  close?.addEventListener('click', shut);
  overlay?.addEventListener('click', (e) => { if (e.target.id === 'settings-overlay') shut(); });

  providerInputs.forEach(r => r.addEventListener('change', () => reflectProvider(r.value)));

  save?.addEventListener('click', () => {
    const provider = [...providerInputs].find(r => r.checked)?.value || 'anthropic';
    const s = {
      provider,
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
      autoDoneThreshold: parseInt(autoDoneSelect.value, 10),
    };
    setLLMSettings(s);
    status.textContent = '✓ Saved';
    setTimeout(() => { status.textContent = ''; }, 1200);
    // Refresh the visible cards so the answer-box hint reflects the new provider/key state.
    // Preserves typed answers and verdicts since both come from localStorage.
    if (State.mode === 'browse') renderBrowse();
  });

  clearBtn?.addEventListener('click', () => {
    if (!confirm('Clear all grading settings (provider, API key, model)? Answers and progress are not affected.')) return;
    storageSet(KEY.llmSettings, null);
    storageSet(KEY.privacyAck, false);
    loadIntoForm();
    status.textContent = '✓ Cleared';
    setTimeout(() => { status.textContent = ''; }, 1200);
  });

  // Test connection: probe the provider's list-models endpoint, repopulate the
  // model dropdown with the live response on success.
  testBtn?.addEventListener('click', async () => {
    if (!testStatus) return;
    const provider = [...providerInputs].find(r => r.checked)?.value || 'anthropic';
    testStatus.hidden = false;
    testStatus.className = 'test-status testing';
    testStatus.textContent = '⏳ Testing…';
    try {
      const r = await window.LLM.testConnection({
        provider,
        apiKey: keyInput.value.trim(),
        model: modelInput.value.trim(),
        baseUrl: baseUrlInput.value.trim(),
      });
      const latency = `${Math.round(r.latencyMs)} ms`;
      if (r.ok) {
        const cls = r.warn ? 'test-status warn' : 'test-status ok';
        testStatus.className = cls;
        const suffix = r.models?.length ? ` — ${r.models.length} models available` : '';
        testStatus.textContent = `${r.warn ? '⚠' : '✓'} ${r.message}${suffix} (${latency})`;
        if (r.models?.length) populateModelChips(r.models);
      } else {
        testStatus.className = 'test-status err';
        let msg = `✗ ${r.message} (${latency})`;
        // Friendly hint for providers known to often block browser-direct calls
        if (provider === 'doubao' && /CORS|unreachable|timed out|Failed to fetch/i.test(r.message)) {
          msg += ' — Doubao usually blocks direct browser calls; consider Anthropic / OpenAI / DeepSeek / Ollama.';
        }
        testStatus.textContent = msg;
      }
    } catch (e) {
      testStatus.className = 'test-status err';
      testStatus.textContent = `✗ ${e.message || String(e)}`;
    }
  });

  installBackupHandlers();
  installGistHandlers();
}

// ---------- Backup / Import ----------

// Scrubs API key from llm settings; never includes the gist PAT.
function collectExportable() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('cka:')) continue;
    if (k === KEY.gistToken) continue;
    let val = storageGet(k, null);
    if (k === KEY.llmSettings && val && typeof val === 'object') {
      val = Object.assign({}, val, { apiKey: '' });
    }
    data[k] = val;
  }
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), data };
}

function importPayload(payload) {
  if (!payload || payload.schemaVersion !== 1 || !payload.data) {
    throw new Error('Unrecognized backup format (schemaVersion mismatch).');
  }
  for (const [k, v] of Object.entries(payload.data)) {
    if (!k.startsWith('cka:')) continue;
    if (k === KEY.llmSettings && v && typeof v === 'object' && !v.apiKey) {
      const existing = storageGet(k, {}) || {};
      v.apiKey = existing.apiKey || '';
    }
    storageSet(k, v);
  }
}

function summariseImport(payload) {
  const data = payload?.data || {};
  const done = Object.keys(data[KEY.done] || {}).length;
  const bookmark = Object.keys(data[KEY.bookmark] || {}).length;
  let answers = 0;
  for (const k of Object.keys(data)) {
    if (k.startsWith(KEY.answerPrefix)) answers++;
  }
  return { done, bookmark, answers };
}

function installBackupHandlers() {
  const exportBtn = document.getElementById('backup-export');
  const importBtn = document.getElementById('backup-import');
  const fileInput = document.getElementById('backup-file');
  const status = document.getElementById('backup-status');

  function flash(msg, ms = 1500) {
    if (!status) return;
    status.textContent = msg;
    if (ms) setTimeout(() => { if (status.textContent === msg) status.textContent = ''; }, ms);
  }

  exportBtn?.addEventListener('click', () => {
    try {
      const payload = collectExportable();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `cka-progress-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      flash('✓ Downloaded');
    } catch (e) {
      flash(`✗ ${e.message}`, 4000);
    }
  });

  importBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const payload = JSON.parse(text);
      const c = summariseImport(payload);
      const ok = confirm(
        'Import will overwrite local state:\n' +
        `  ${c.done} exercises marked Done\n` +
        `  ${c.bookmark} bookmarks\n` +
        `  ${c.answers} saved answers\n` +
        '  + theme, last-quiz, docs-last-url settings\n\nContinue?'
      );
      if (!ok) { flash(''); return; }
      importPayload(payload);
      flash('✓ Imported — reloading…', 0);
      setTimeout(() => location.reload(), 500);
    } catch (err) {
      flash(`✗ ${err.message}`, 5000);
    } finally {
      e.target.value = '';
    }
  });
}

// ---------- GitHub Gist sync ----------

function getGistToken() { return storageGet(KEY.gistToken, '') || ''; }
function setGistToken(v) { storageSet(KEY.gistToken, v || null); }
function getGistId() { return storageGet(KEY.gistId, '') || ''; }
function setGistId(v) { storageSet(KEY.gistId, v || null); }

// Storage-driven helpers — reusable from Settings AND the header ☁ popover.
// Each reads token / id from localStorage and (for Push) persists any newly created gist id.
async function doGistPush() {
  if (!window.GistSync) throw new Error('sync.js failed to load');
  const token = getGistToken();
  if (!token) throw new Error('Need a GitHub PAT first');
  const payload = collectExportable();
  let id = getGistId();
  if (id) {
    await window.GistSync.updateGist(token, id, payload);
  } else {
    const res = await window.GistSync.createGist(token, payload);
    id = res.id;
    setGistId(id);
  }
  return id;
}

async function doGistPull() {
  if (!window.GistSync) throw new Error('sync.js failed to load');
  const token = getGistToken();
  const id = getGistId();
  if (!token || !id) throw new Error('Need both PAT and Gist ID');
  return await window.GistSync.readGist(token, id);
}

async function doGistTest() {
  if (!window.GistSync) throw new Error('sync.js failed to load');
  const token = getGistToken();
  if (!token) throw new Error('Need a PAT');
  return await window.GistSync.testAuth(token);
}

function confirmPullOverwrite(payload) {
  const c = summariseImport(payload);
  return confirm(
    'Pull will overwrite local state:\n' +
    `  ${c.done} exercises marked Done\n` +
    `  ${c.bookmark} bookmarks\n` +
    `  ${c.answers} saved answers\nContinue?`
  );
}

function installGistHandlers() {
  const tokenInput = document.getElementById('gist-token');
  const idInput = document.getElementById('gist-id');
  const status = document.getElementById('gist-status');
  const pushBtn = document.getElementById('gist-push');
  const pullBtn = document.getElementById('gist-pull');
  const testBtn = document.getElementById('gist-test');
  if (!tokenInput || !idInput) return;

  tokenInput.value = getGistToken();
  idInput.value = getGistId();

  function persistInputs() {
    setGistToken(tokenInput.value.trim());
    setGistId(idInput.value.trim());
  }
  tokenInput.addEventListener('change', persistInputs);
  idInput.addEventListener('change', persistInputs);

  function setStatus(msg) {
    if (status) status.textContent = msg;
  }

  if (!window.GistSync) {
    setStatus('✗ sync.js failed to load');
    return;
  }

  pushBtn?.addEventListener('click', async () => {
    persistInputs();
    setStatus('⏳ Pushing…');
    try {
      const id = await doGistPush();
      idInput.value = id;
      setStatus(`✓ Pushed to gist ${id.slice(0, 8)}…`);
    } catch (e) {
      setStatus(`✗ ${e.message}`);
    }
  });

  pullBtn?.addEventListener('click', async () => {
    persistInputs();
    setStatus('⏳ Pulling…');
    try {
      const payload = await doGistPull();
      if (!confirmPullOverwrite(payload)) { setStatus(''); return; }
      importPayload(payload);
      setStatus('✓ Pulled — reloading…');
      setTimeout(() => location.reload(), 500);
    } catch (e) {
      setStatus(`✗ ${e.message}`);
    }
  });

  testBtn?.addEventListener('click', async () => {
    setStatus('⏳ Testing…');
    try {
      const info = await doGistTest();
      setStatus(`✓ Authenticated as @${info.login}`);
    } catch (e) {
      setStatus(`✗ ${e.message}`);
    }
  });
}

// ---------- Header ☁ sync popover ----------

function installSyncMenu() {
  const toggle = document.getElementById('sync-toggle');
  const menu = document.getElementById('sync-menu');
  const idLabel = document.getElementById('sync-menu-id');
  const pushBtn = document.getElementById('sync-menu-push');
  const pullBtn = document.getElementById('sync-menu-pull');
  const testBtn = document.getElementById('sync-menu-test');
  const status = document.getElementById('sync-menu-status');
  const settingsLink = document.getElementById('sync-menu-settings');
  if (!toggle || !menu) return;

  let statusTimer = null;
  function setStatus(msg, autoClearMs = 0) {
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    status.textContent = msg;
    if (autoClearMs) {
      statusTimer = setTimeout(() => { if (status.textContent === msg) status.textContent = ''; }, autoClearMs);
    }
  }

  function refreshState() {
    const token = getGistToken();
    const id = getGistId();
    if (id) {
      idLabel.textContent = `gist ${id.slice(0, 8)}…`;
    } else if (token) {
      idLabel.textContent = 'no gist yet';
    } else {
      idLabel.textContent = 'not configured';
    }
    const hasToken = !!token;
    pushBtn.disabled = !hasToken;
    pullBtn.disabled = !hasToken || !id;
    testBtn.disabled = !hasToken;
    if (!hasToken) {
      setStatus('Configure a GitHub PAT in Settings first');
    } else if (!status.textContent || status.textContent === 'Configure a GitHub PAT in Settings first') {
      setStatus('');
    }
  }

  function openMenu() {
    refreshState();
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });

  // Click-outside dismiss
  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (menu.contains(e.target) || toggle.contains(e.target)) return;
    closeMenu();
  });
  // Esc dismiss
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
  });

  pushBtn?.addEventListener('click', async () => {
    setStatus('⏳ Pushing…');
    try {
      const id = await doGistPush();
      setStatus(`✓ Pushed to gist ${id.slice(0, 8)}…`, 3000);
      refreshState();
    } catch (e) {
      setStatus(`✗ ${e.message}`, 5000);
    }
  });

  pullBtn?.addEventListener('click', async () => {
    setStatus('⏳ Pulling…');
    try {
      const payload = await doGistPull();
      if (!confirmPullOverwrite(payload)) { setStatus(''); return; }
      importPayload(payload);
      setStatus('✓ Pulled — reloading…');
      setTimeout(() => location.reload(), 500);
    } catch (e) {
      setStatus(`✗ ${e.message}`, 5000);
    }
  });

  testBtn?.addEventListener('click', async () => {
    setStatus('⏳ Testing…');
    try {
      const info = await doGistTest();
      setStatus(`✓ Authenticated as @${info.login}`, 4000);
    } catch (e) {
      setStatus(`✗ ${e.message}`, 5000);
    }
  });

  settingsLink?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMenu();
    document.getElementById('settings-toggle')?.click();
    // Scroll the Gist section into view inside the overlay card
    setTimeout(() => {
      document.querySelector('.settings-gist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  });
}

// ---------- Auto-grading UI (textarea + Check + verdict) ----------

function renderAnswerBox(ex, opts = {}) {
  const box = el('div', { class: 'answer-box' });
  box.appendChild(el('div', { class: 'answer-label' }, '✏️ Your answer'));

  const ta = el('textarea', {
    class: 'answer-textarea',
    placeholder: 'Paste your kubectl commands or YAML manifest, then click Check…',
    rows: '4',
    spellcheck: 'false',
    autocomplete: 'off',
  });
  const saved = getAnswer(ex.id);
  if (saved && typeof saved.text === 'string') ta.value = saved.text;
  // Debounced persist on input
  let saveTimer;
  ta.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const existing = getAnswer(ex.id) || {};
      setAnswer(ex.id, Object.assign(existing, { text: ta.value }));
    }, 400);
  });
  box.appendChild(ta);

  const actions = el('div', { class: 'answer-actions' });
  const checkBtn = el('button', { type: 'button', class: 'check-btn primary' }, '✓ Check');
  const resetBtn = el('button', { type: 'button', class: 'answer-reset' }, '↻ Reset');
  const hint = el('span', { class: 'answer-hint muted' }, '');
  actions.append(checkBtn, resetBtn, hint);
  box.appendChild(actions);

  const verdictSlot = el('div', { class: 'verdict-slot' });
  box.appendChild(verdictSlot);

  // Restore prior verdict
  if (saved && saved.verdict) renderVerdict(verdictSlot, saved.verdict, ex);

  function updateHint() {
    const s = getLLMSettings();
    if (!s.provider) { hint.textContent = '⚙️ Configure a provider to grade'; return; }
    if (s.provider !== 'ollama' && !s.apiKey) { hint.textContent = `⚙️ ${s.provider} key missing`; return; }
    hint.textContent = `Using ${s.provider} (${s.model || (window.LLM?.DEFAULTS[s.provider]?.model || 'default')})`;
  }
  updateHint();

  checkBtn.addEventListener('click', async () => {
    const answer = ta.value.trim();
    if (!answer) { hint.textContent = '⚠ Type an answer first'; return; }

    // First-use privacy gate (unless using Ollama, which stays local)
    const settings = getLLMSettings();
    const skipPrivacy = settings.provider === 'ollama' || storageGet(KEY.privacyAck, false);
    if (!skipPrivacy) {
      const ok = await openPrivacyDialog(settings.provider);
      if (!ok) return;
      storageSet(KEY.privacyAck, true);
    }

    checkBtn.disabled = true;
    checkBtn.textContent = '⏳ Grading…';
    verdictSlot.innerHTML = '';
    try {
      const v = await window.LLM.grade({
        task: ex.task || '',
        solution: ex.solution || '',
        answer,
        settings,
      });
      // Persist
      const existing = getAnswer(ex.id) || {};
      setAnswer(ex.id, Object.assign(existing, { text: ta.value, verdict: v }));
      renderVerdict(verdictSlot, v, ex);

      // Auto-Done if user has a threshold set
      const t = settings.autoDoneThreshold;
      if (typeof t === 'number' && t >= 0 && v.score >= t) {
        if (!isDone(ex.id)) {
          setDone(ex.id, true);
          // Refresh visual state of this card if browse is active
          document.getElementById('card-' + ex.id)?.classList.add('done');
          renderSidebarProgress();
        }
      }

      // Quiz mode hook: feed verdict into the quiz status
      if (State.mode === 'quiz' && State.quiz && opts.fromQuiz) {
        State.quiz.status.set(ex.id, v.correct ? 'got' : (v.verdict === 'partial' ? 'partial' : 'missed'));
      }
    } catch (e) {
      verdictSlot.appendChild(el('div', { class: 'verdict verdict-error' },
        el('strong', {}, '✗ Grading failed'),
        el('div', {}, e.message || String(e)),
      ));
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = '✓ Check';
    }
  });

  resetBtn.addEventListener('click', () => {
    ta.value = '';
    verdictSlot.innerHTML = '';
    setAnswer(ex.id, { text: '', verdict: null });
    updateHint();
  });

  return box;
}

function renderVerdict(container, v, ex) {
  container.innerHTML = '';
  const cls = v.verdict === 'correct' ? 'verdict verdict-correct'
            : v.verdict === 'partial' ? 'verdict verdict-partial'
            : 'verdict verdict-incorrect';
  const head = el('div', { class: 'verdict-head' },
    el('span', { class: 'verdict-mark' },
      v.verdict === 'correct' ? '✓ Correct' :
      v.verdict === 'partial' ? '◐ Partial' :
      '✗ Not yet'),
    el('span', { class: 'verdict-score' }, `${v.score} / 100`),
  );
  const body = el('div', { class: cls });
  body.appendChild(head);
  if (v.summary) body.appendChild(el('div', { class: 'verdict-summary' }, v.summary));
  if (v.passed && v.passed.length) {
    body.appendChild(el('div', { class: 'verdict-section-label' }, '✓ Got right'));
    const ul = el('ul', { class: 'verdict-list' });
    v.passed.forEach(s => ul.appendChild(el('li', {}, s)));
    body.appendChild(ul);
  }
  if (v.missed && v.missed.length) {
    body.appendChild(el('div', { class: 'verdict-section-label' }, '✗ Missed'));
    const ul = el('ul', { class: 'verdict-list' });
    v.missed.forEach(s => ul.appendChild(el('li', {}, s)));
    body.appendChild(ul);
  }
  container.appendChild(body);
}

function openPrivacyDialog(provider) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('privacy-overlay');
    if (!overlay) { resolve(true); return; }
    overlay.hidden = false;
    const accept = document.getElementById('privacy-accept');
    const cancel = document.getElementById('privacy-cancel');
    const cleanup = () => {
      overlay.hidden = true;
      accept.removeEventListener('click', onAccept);
      cancel.removeEventListener('click', onCancel);
    };
    const onAccept = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    accept.addEventListener('click', onAccept);
    cancel.addEventListener('click', onCancel);
  });
}

function renderExerciseCard(ex, opts = {}) {
  // opts:
  //   openSolution  bool — start with solution visible (browse: from filter; quiz: from solutionsHidden)
  //   inlineToggle  bool — show the inline "Show solution" toggle button (default true)
  const card = el('div', { class: 'exercise-card', id: 'card-' + ex.id });
  if (isDone(ex.id)) card.classList.add('done');
  if (opts.openSolution) card.classList.add('solution-open');

  // Header
  const tools = el('div', { class: 'exercise-tools' });
  const doneBtn = el('button', { type: 'button', title: 'Toggle done' }, isDone(ex.id) ? '✓ Done' : '☐ Done');
  doneBtn.addEventListener('click', () => {
    setDone(ex.id, !isDone(ex.id));
    if (isDone(ex.id)) card.classList.add('done'); else card.classList.remove('done');
    doneBtn.textContent = isDone(ex.id) ? '✓ Done' : '☐ Done';
    renderSidebarProgress();
    document
      .querySelectorAll(`.tree-exercise[data-id="${ex.id}"]`)
      .forEach(b => b.classList.toggle('done', isDone(ex.id)));
  });
  const bmBtn = el('button', { type: 'button', title: 'Toggle bookmark' }, isBookmark(ex.id) ? '⭐' : '☆');
  bmBtn.addEventListener('click', () => {
    setBookmark(ex.id, !isBookmark(ex.id));
    bmBtn.textContent = isBookmark(ex.id) ? '⭐' : '☆';
    renderSidebarProgress();
  });
  tools.append(doneBtn, bmBtn);

  const titleEl = el('h3', { class: 'exercise-title' }, ex.title);
  const header = el('div', { class: 'exercise-header' }, titleEl, tools);
  card.appendChild(header);

  // Meta line
  const meta = el('div', { class: 'exercise-meta' });
  if (ex.numberInDomain != null) {
    meta.appendChild(el('span', { class: 'qnum-pill', title: `Question ${ex.numberInDomain} in ${ex.domain.title.split(',')[0]}` }, `Q${ex.numberInDomain}`));
  }
  meta.appendChild(tagPill(ex.tag));
  if (ex.points != null) meta.appendChild(el('span', { class: 'points-pill' }, `${ex.points} pts`));
  meta.appendChild(el('span', { class: 'id-pill' }, ex.id));
  meta.appendChild(el('span', {}, `${ex.domain.title.split(',')[0]} · ${ex.section.kind === 'killersh' ? 'Killer.sh' : `§${ex.section.number} ${ex.section.title}`}`));
  if (ex.solveOn) {
    meta.appendChild(el('span', { class: 'solve-on-chip', title: 'Solve this question on this host' }, `🖥 ${ex.solveOn}`));
  }
  card.appendChild(meta);

  // Docs links — one row per link, primary gets the 📖 icon
  const links = (ex.docsLinks && ex.docsLinks.length) ? ex.docsLinks
              : ex.docsLink ? [{ text: ex.docsLinkText || ex.docsLink, url: ex.docsLink }]
              : [];
  if (links.length) {
    const docs = el('div', { class: 'exercise-docs' });
    links.forEach((lnk, i) => {
      docs.appendChild(el('div', { class: 'exercise-docs-row' },
        el('span', { class: 'exercise-docs-icon' }, i === 0 ? '📖' : '↳'),
        el('a', { href: lnk.url, target: '_blank', rel: 'noopener' }, lnk.text),
      ));
    });
    card.appendChild(docs);
  }

  // Task
  if (ex.task) {
    card.appendChild(el('div', { class: 'task-label' }, 'Task'));
    let taskMd = ex.task;
    // Strip a leading "**Task:**" marker — we have our own label now.
    taskMd = taskMd.replace(/^\s*\*\*Task:\*\*\s*\n+/, '');
    const task = el('div', { class: 'exercise-task', html: renderMarkdown(taskMd) });
    // Promote ℹ️ blockquotes to info callouts.
    task.querySelectorAll('blockquote').forEach(bq => {
      const first = bq.textContent.trim();
      if (first.startsWith('ℹ️') || first.startsWith('ℹ')) {
        bq.classList.add('info-callout');
      }
    });
    // Render "**Lab context:**" prefix as a uppercase label for visual separation.
    task.querySelectorAll('p').forEach(p => {
      const onlyChild = p.children.length === 1 ? p.children[0] : null;
      if (onlyChild && onlyChild.tagName === 'STRONG' && /^Lab context:?$/i.test(onlyChild.textContent.trim())) {
        const label = document.createElement('div');
        label.className = 'lab-context-label';
        label.textContent = 'Lab context';
        p.replaceWith(label);
      }
    });
    card.appendChild(task);
    attachCopyButtons(task);
  }

  // Auto-grading answer box (between task/lab-context and solution).
  // Quiz mode passes opts.fromQuiz so the verdict updates State.quiz.status.
  card.appendChild(renderAnswerBox(ex, { fromQuiz: !!opts.fromQuiz }));

  // Solution toggle + body
  if (ex.solution) {
    const showInlineToggle = opts.inlineToggle !== false;
    let toggle;
    if (showInlineToggle) {
      toggle = el('button', { type: 'button', class: 'solution-toggle', 'aria-expanded': 'false' }, 'Show solution');
      toggle.addEventListener('click', () => {
        const open = card.classList.toggle('solution-open');
        toggle.textContent = open ? 'Hide solution' : 'Show solution';
        toggle.setAttribute('aria-expanded', String(open));
      });
      card.appendChild(toggle);
    }
    const solHtml = renderMarkdown(ex.solution);
    const solDiv = el('div', { class: 'exercise-solution', html: solHtml });
    card.appendChild(solDiv);
    attachCopyButtons(solDiv);
    if (toggle && card.classList.contains('solution-open')) {
      toggle.textContent = 'Hide solution';
      toggle.setAttribute('aria-expanded', 'true');
    }
  }

  return card;
}

function renderBrowse() {
  const visible = applyFilters();
  document.getElementById('filter-stats').textContent = `${visible.length} / ${State.allExercises.length} exercises`;
  renderSidebar(visible);
  renderSidebarProgress();
  const main = document.getElementById('main');
  main.innerHTML = '';
  if (visible.length === 0) {
    main.appendChild(el('div', { class: 'empty-state' }, 'No exercises match the current filters.'));
    return;
  }
  // Group by domain for headings
  let currentDomain = null, currentSection = null;
  for (const ex of visible) {
    if (ex.domain.key !== currentDomain) {
      main.appendChild(el('h2', {}, `${ex.domain.title} (${ex.domain.weight})`));
      currentDomain = ex.domain.key;
      currentSection = null;
    }
    if (ex.section.number !== currentSection) {
      const label = ex.section.kind === 'killersh' ? '🎯 ' + ex.section.title : `§${ex.section.number} ${ex.section.title}`;
      main.appendChild(el('h3', { class: 'muted', style: { marginTop: '12px' } }, label));
      currentSection = ex.section.number;
    }
    main.appendChild(renderExerciseCard(ex, { openSolution: State.filters.revealSolutions }));
  }
}

// ---------- Quiz mode ----------

// State.quiz contains Map (status) and Set (flagged, revealed) — convert to plain JSON.
function serialiseQuiz(q) {
  return {
    schemaVersion: 1,
    ids: [...q.ids],
    idx: q.idx,
    status: [...q.status.entries()],
    flagged: [...q.flagged],
    revealed: [...q.revealed],
    deadline: q.deadline,
    solutionsHidden: !!q.solutionsHidden,
    totalMinutes: q.totalMinutes || 0,
    startedAt: q.startedAt || Date.now(),
    lastSavedAt: Date.now(),
  };
}

function deserialiseQuiz(p) {
  if (!p || p.schemaVersion !== 1) return null;
  return {
    ids: [...p.ids],
    idx: p.idx | 0,
    status: new Map(p.status || []),
    flagged: new Set(p.flagged || []),
    revealed: new Set(p.revealed || []),
    deadline: p.deadline,
    solutionsHidden: !!p.solutionsHidden,
    totalMinutes: p.totalMinutes || 0,
    startedAt: p.startedAt || Date.now(),
  };
}

function saveActiveQuiz() {
  if (!State.quiz) return;
  try {
    storageSet(KEY.quizActive, serialiseQuiz(State.quiz));
    refreshQuizTabDot();
  } catch (e) {
    // localStorage quota etc — silently drop. User-visible feedback would be noise.
  }
}

function clearActiveQuiz() {
  storageSet(KEY.quizActive, null);
  refreshQuizTabDot();
}

function refreshQuizTabDot() {
  const dot = document.querySelector('.mode-tab[data-mode="quiz"] .tab-dot');
  if (!dot) return;
  const active = State.quiz || storageGet(KEY.quizActive, null);
  dot.hidden = !active;
}

function getSnapshots() {
  const raw = storageGet(KEY.quizSnapshots, []);
  return Array.isArray(raw) ? raw : [];
}

function setSnapshots(list) {
  storageSet(KEY.quizSnapshots, list);
}

function relativeTime(ms) {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function quizMinutesLeft(deadline) {
  if (!deadline) return null;
  const left = deadline - Date.now();
  if (left <= 0) return 0;
  return Math.ceil(left / 60_000);
}

function renderQuizResumePanel() {
  const panel = document.getElementById('quiz-resume-panel');
  if (!panel) return;
  const saved = storageGet(KEY.quizActive, null);
  const snaps = getSnapshots();
  if (!saved && (!snaps || snaps.length === 0)) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = '';

  if (saved) {
    const card = el('div', { class: 'quiz-resume-active' });
    const answered = (saved.status || []).length;
    const total = (saved.ids || []).length;
    const min = quizMinutesLeft(saved.deadline);
    const expired = saved.deadline && min === 0;
    const meta = expired
      ? `${answered} / ${total} answered · ⏰ time expired · started ${relativeTime(saved.startedAt || Date.now())}`
      : (saved.deadline
        ? `${answered} / ${total} answered · ${min} min left · started ${relativeTime(saved.startedAt || Date.now())}`
        : `${answered} / ${total} answered · no time limit · started ${relativeTime(saved.startedAt || Date.now())}`);
    card.append(
      el('div', { class: 'resume-headline' },
        el('span', {}, '⏸ Saved quiz session'),
        el('span', { class: 'muted' }, meta)
      ),
      el('div', { class: 'resume-actions' },
        el('button', { type: 'button', class: 'primary', 'data-act': 'resume-active' }, '▶ Resume'),
        el('button', { type: 'button', class: 'danger', 'data-act': 'discard-active' }, '✕ Discard'),
      ),
    );
    panel.appendChild(card);
  }

  if (snaps && snaps.length) {
    const wrap = el('div', { class: 'quiz-resume-snapshots' });
    wrap.appendChild(el('h3', {}, '💾 Snapshots'));
    const ul = el('ul', {});
    snaps.forEach((s) => {
      const answered = (s.status || []).length;
      const total = (s.ids || []).length;
      const min = quizMinutesLeft(s.deadline);
      const expired = s.deadline && min === 0;
      const metaStr = expired
        ? `${answered}/${total} · ⏰ expired · saved ${relativeTime(s.lastSavedAt || s.startedAt)}`
        : (s.deadline
          ? `${answered}/${total} · ${min} min left · saved ${relativeTime(s.lastSavedAt || s.startedAt)}`
          : `${answered}/${total} · no time limit · saved ${relativeTime(s.lastSavedAt || s.startedAt)}`);
      ul.appendChild(el('li', {},
        el('span', { class: 'snap-name' }, s.name || 'Untitled'),
        el('span', { class: 'muted snap-meta' }, metaStr),
        el('button', { type: 'button', 'data-act': 'resume-snap', 'data-snap-id': s.id, title: 'Resume this snapshot' }, '▶ Resume'),
        el('button', { type: 'button', class: 'danger', 'data-act': 'delete-snap', 'data-snap-id': s.id, title: 'Delete this snapshot' }, '✕'),
      ));
    });
    wrap.appendChild(ul);
    panel.appendChild(wrap);
  }

  // Delegated handler
  panel.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'resume-active') resumeActiveQuiz();
    else if (act === 'discard-active') {
      if (confirm('Discard the saved quiz session? This cannot be undone.')) {
        clearActiveQuiz();
        renderQuizResumePanel();
      }
    } else if (act === 'resume-snap') resumeSnapshot(btn.dataset.snapId);
    else if (act === 'delete-snap') {
      if (confirm('Delete this snapshot?')) {
        deleteSnapshot(btn.dataset.snapId);
        renderQuizResumePanel();
      }
    }
  };
}

function resumeActiveQuiz() {
  const saved = storageGet(KEY.quizActive, null);
  if (!saved) return;
  const restored = deserialiseQuiz(saved);
  if (!restored) { alert("Saved session couldn't be loaded (schema mismatch). Discarding."); clearActiveQuiz(); renderQuizResumePanel(); return; }
  State.quiz = restored;
  document.getElementById('quiz-setup').hidden = true;
  document.getElementById('quiz-active').hidden = false;
  document.getElementById('quiz-summary').hidden = true;
  document.getElementById('quiz-timer').hidden = !restored.deadline;
  renderQuizCard();
  if (restored.deadline) startQuizTimer();
  refreshQuizTabDot();
}

function resumeSnapshot(id) {
  const snaps = getSnapshots();
  const idx = snaps.findIndex(s => s.id === id);
  if (idx < 0) return;
  // If an active session exists, ask before overwriting.
  if (storageGet(KEY.quizActive, null)) {
    if (!confirm('You have an auto-saved session. Discard it and resume this snapshot?')) return;
  }
  const payload = snaps[idx];
  const restored = deserialiseQuiz(payload);
  if (!restored) { alert("Snapshot couldn't be loaded."); return; }
  // Move snapshot → active (snapshot list shrinks by one).
  snaps.splice(idx, 1);
  setSnapshots(snaps);
  State.quiz = restored;
  saveActiveQuiz();
  document.getElementById('quiz-setup').hidden = true;
  document.getElementById('quiz-active').hidden = false;
  document.getElementById('quiz-summary').hidden = true;
  document.getElementById('quiz-timer').hidden = !restored.deadline;
  renderQuizCard();
  if (restored.deadline) startQuizTimer();
}

function deleteSnapshot(id) {
  setSnapshots(getSnapshots().filter(s => s.id !== id));
}

function saveAsSnapshot() {
  if (!State.quiz) return;
  const defaultName = `Snapshot ${new Date().toLocaleString()}`;
  const name = prompt('Name this snapshot:', defaultName);
  if (name === null) return; // cancelled
  const trimmed = (name || defaultName).trim().slice(0, 80);
  const payload = serialiseQuiz(State.quiz);
  payload.name = trimmed;
  payload.id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const list = getSnapshots();
  list.unshift(payload);
  try {
    setSnapshots(list);
  } catch (e) {
    alert(`Couldn't save snapshot: ${e.message}`);
    return;
  }
  // The snapshot is now the source of truth; clear the active slot and exit to setup.
  clearInterval(State.quizTimerHandle);
  State.quiz = null;
  clearActiveQuiz();
  document.getElementById('quiz-active').hidden = true;
  document.getElementById('quiz-timer').hidden = true;
  document.getElementById('quiz-setup').hidden = false;
  document.getElementById('quiz-summary').hidden = true;
  renderQuizResumePanel();
}

function renderQuizSetup() {
  const list = document.getElementById('quiz-domain-list');
  list.innerHTML = '';
  for (const dom of State.data.domains) {
    list.appendChild(el('label', {},
      el('input', { type: 'checkbox', name: 'quiz-domain', value: dom.key, checked: true }),
      ` ${dom.title.split(',')[0]} (${dom.weight})`));
  }
  list.querySelectorAll('input').forEach(cb => cb.addEventListener('change', updateQuizEligibleCount));
  document.querySelectorAll('[name="quiz-tag"]').forEach(cb => cb.addEventListener('change', updateQuizEligibleCount));
  document.getElementById('quiz-only-bookmarks').addEventListener('change', updateQuizEligibleCount);
  document.getElementById('quiz-only-undone').addEventListener('change', updateQuizEligibleCount);
  updateQuizEligibleCount();
  renderQuizResumePanel();
}

function gatherQuizFilters() {
  const domains = new Set([...document.querySelectorAll('[name="quiz-domain"]:checked')].map(c => c.value));
  const tags = new Set([...document.querySelectorAll('[name="quiz-tag"]:checked')].map(c => c.value));
  const onlyBookmarks = document.getElementById('quiz-only-bookmarks').checked;
  const onlyUndone = document.getElementById('quiz-only-undone').checked;
  return { domains, tags, onlyBookmarks, onlyUndone };
}

function getEligibleForQuiz() {
  const { domains, tags, onlyBookmarks, onlyUndone } = gatherQuizFilters();
  return State.allExercises.filter(ex => {
    if (!domains.has(ex.domain.key)) return false;
    if (!tags.has(ex.tag)) return false;
    if (onlyBookmarks && !isBookmark(ex.id)) return false;
    if (onlyUndone && isDone(ex.id)) return false;
    return true;
  });
}

function updateQuizEligibleCount() {
  const c = getEligibleForQuiz().length;
  document.getElementById('quiz-eligible-count').textContent = `${c} eligible questions`;
  document.getElementById('quiz-start-btn').disabled = c === 0;
}

function startQuiz() {
  const eligible = getEligibleForQuiz();
  if (eligible.length === 0) return;
  // Count
  const countRadio = document.querySelector('[name="quiz-count"]:checked').value;
  let count = countRadio === 'custom' ? parseInt(document.getElementById('quiz-count-custom').value, 10) : parseInt(countRadio, 10);
  count = Math.min(Math.max(1, count || 10), eligible.length);
  // Shuffle and pick
  const shuffled = [...eligible].sort(() => Math.random() - 0.5).slice(0, count);
  // Time limit
  const tmin = parseInt(document.querySelector('[name="quiz-time"]:checked').value, 10);
  const deadline = tmin > 0 ? Date.now() + tmin * 60 * 1000 : null;
  // Solutions
  const solutionsHidden = document.querySelector('[name="quiz-solutions"]:checked').value === 'hidden';

  State.quiz = {
    ids: shuffled.map(e => e.id),
    idx: 0,
    status: new Map(), // id -> 'got' | 'missed' | 'skipped'
    flagged: new Set(),
    revealed: new Set(),
    deadline,
    solutionsHidden,
    totalMinutes: tmin,
    startedAt: Date.now(),
  };

  document.getElementById('quiz-setup').hidden = true;
  document.getElementById('quiz-active').hidden = false;
  document.getElementById('quiz-summary').hidden = true;
  document.getElementById('quiz-timer').hidden = !deadline;
  renderQuizCard();
  if (deadline) startQuizTimer();
  saveActiveQuiz();
}

function renderQuizCard() {
  const q = State.quiz;
  const ex = State.byId.get(q.ids[q.idx]);
  document.getElementById('quiz-progress-text').textContent = `Question ${q.idx + 1} / ${q.ids.length} — ${ex.id}`;
  document.getElementById('quiz-progress-bar').value = (q.idx + 1) / q.ids.length;

  const card = document.getElementById('quiz-card');
  card.innerHTML = '';
  const solutionOpen = !q.solutionsHidden || q.revealed.has(ex.id);
  // In "Always visible" mode the inline toggle still lets you collapse for self-test.
  // In "Hidden until I click Reveal" mode the dedicated Reveal button controls visibility;
  // hide the inline toggle until the user has clicked Reveal (then it becomes a collapse button).
  const showInlineToggle = !q.solutionsHidden || q.revealed.has(ex.id);
  card.appendChild(renderExerciseCard(ex, { openSolution: solutionOpen, inlineToggle: showInlineToggle, fromQuiz: true }));

  const flagBtn = document.getElementById('quiz-flag');
  flagBtn.textContent = q.flagged.has(ex.id) ? '🚩 Flagged' : '🚩 Flag';
  flagBtn.classList.toggle('active', q.flagged.has(ex.id));

  const revealBtn = document.getElementById('quiz-reveal');
  revealBtn.hidden = !q.solutionsHidden || q.revealed.has(ex.id);

  document.getElementById('quiz-prev').disabled = q.idx === 0;
}

function quizNext() {
  if (State.quiz.idx < State.quiz.ids.length - 1) {
    State.quiz.idx++;
    renderQuizCard();
    saveActiveQuiz();
  } else {
    finishQuiz();
  }
}

function quizPrev() {
  if (State.quiz.idx > 0) {
    State.quiz.idx--;
    renderQuizCard();
    saveActiveQuiz();
  }
}

function quizGrade(verdict) {
  const id = State.quiz.ids[State.quiz.idx];
  State.quiz.status.set(id, verdict);
  if (verdict === 'got') setDone(id, true);
  quizNext();
}

function quizSkip() {
  const id = State.quiz.ids[State.quiz.idx];
  if (!State.quiz.status.has(id)) State.quiz.status.set(id, 'skipped');
  quizNext();
}

function quizFlag() {
  const id = State.quiz.ids[State.quiz.idx];
  if (State.quiz.flagged.has(id)) State.quiz.flagged.delete(id);
  else State.quiz.flagged.add(id);
  renderQuizCard();
  saveActiveQuiz();
}

function quizReveal() {
  const id = State.quiz.ids[State.quiz.idx];
  State.quiz.revealed.add(id);
  renderQuizCard();
  saveActiveQuiz();
}

function startQuizTimer() {
  const elTimer = document.getElementById('quiz-timer');
  clearInterval(State.quizTimerHandle);
  const tick = () => {
    const remaining = State.quiz.deadline - Date.now();
    if (remaining <= 0) {
      elTimer.textContent = '⏰ 0:00';
      clearInterval(State.quizTimerHandle);
      finishQuiz();
      return;
    }
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    elTimer.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
    elTimer.classList.toggle('danger', remaining < 5 * 60 * 1000);
    elTimer.classList.toggle('warn', remaining < 10 * 60 * 1000 && remaining >= 5 * 60 * 1000);
  };
  tick();
  State.quizTimerHandle = setInterval(tick, 1000);
}

function finishQuiz() {
  clearInterval(State.quizTimerHandle);
  document.getElementById('quiz-timer').hidden = true;
  document.getElementById('quiz-active').hidden = true;
  document.getElementById('quiz-summary').hidden = false;
  clearActiveQuiz();

  const q = State.quiz;
  const got = [...q.status.values()].filter(v => v === 'got').length;
  const missed = [...q.status.values()].filter(v => v === 'missed').length;
  const skipped = q.ids.length - got - missed;
  const flagged = q.flagged.size;

  const stats = document.getElementById('quiz-summary-stats');
  stats.innerHTML = '';
  const mk = (val, label) => el('div', { class: 'stat' }, el('div', { class: 'stat-value' }, String(val)), el('div', { class: 'stat-label' }, label));
  stats.append(
    mk(`${got}/${q.ids.length}`, 'Got it'),
    mk(missed, 'Missed'),
    mk(skipped, 'Skipped'),
    mk(flagged, 'Flagged'),
  );

  const list = document.getElementById('quiz-summary-list');
  list.innerHTML = '';
  for (const id of q.ids) {
    const ex = State.byId.get(id);
    const verdict = q.status.get(id) || 'skipped';
    const label = el('li', {});
    const a = el('a', { href: '#browse/' + id, onclick: (e) => { e.preventDefault(); location.hash = '#browse/' + id; } }, ex.title);
    label.append(
      el('span', { class: `status-${verdict}` }, verdict === 'got' ? '✓' : verdict === 'missed' ? '✗' : '↷'),
      ' ',
      a,
      ' ',
      tagPill(ex.tag),
      q.flagged.has(id) ? el('span', { class: 'status-flagged' }, ' 🚩') : null,
    );
    list.appendChild(label);
  }
}

// ---------- Docs mode ----------

const KNOWN_TOP_BUCKETS = new Set([
  'Concepts', 'Tasks', 'Tutorials', 'Reference', 'Setup', 'Getting started',
]);
// Preferred display order at the top level
const TOP_BUCKET_ORDER = [
  'Concepts', 'Tasks', 'Tutorials', 'Reference', 'Setup', 'Getting started', 'External',
];

function makeNode(name) {
  return { name, children: new Map(), leaf: null, count: 0 };
}

function buildDocsTree(allExercises) {
  // 1. Aggregate by URL: pick longest breadcrumb, accumulate referencing exercises
  const byUrl = new Map();
  for (const ex of allExercises) {
    for (const lnk of (ex.docsLinks || [])) {
      let entry = byUrl.get(lnk.url);
      if (!entry) {
        entry = { url: lnk.url, text: lnk.text, exerciseIds: [] };
        byUrl.set(lnk.url, entry);
      } else if (lnk.text && lnk.text.length > entry.text.length) {
        entry.text = lnk.text;
      }
      entry.exerciseIds.push(ex.id);
    }
  }

  // 2. Insert into tree
  const root = makeNode('root');
  for (const entry of byUrl.values()) {
    let segments;
    if (entry.text.includes(' > ')) {
      segments = entry.text.split(' > ').map(s => s.trim()).filter(Boolean);
      // Re-bucket unknown top-level under External
      if (!KNOWN_TOP_BUCKETS.has(segments[0])) {
        segments = ['External', ...segments];
      }
    } else {
      // No breadcrumb at all (e.g. plain "Helm Documentation: …" labels)
      const labelTop = entry.text.split(':')[0].trim() || 'Other';
      segments = ['External', labelTop, entry.text];
    }
    // Walk into tree
    let cursor = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!cursor.children.has(seg)) cursor.children.set(seg, makeNode(seg));
      cursor = cursor.children.get(seg);
    }
    cursor.leaf = {
      url: entry.url,
      fullBreadcrumb: segments.join(' > '),
      leafTitle: segments[segments.length - 1],
      breadcrumbSegments: segments,
      exerciseIds: [...new Set(entry.exerciseIds)],
    };
  }

  // 3. Post-pass to compute leaf-counts on internal nodes.
  // A node may have BOTH its own leaf AND children (e.g. a parent doc page that
  // also has child doc pages like "Pods" containing "Pod QoS Classes").
  function computeCount(node) {
    let total = node.leaf ? 1 : 0;
    for (const child of node.children.values()) total += computeCount(child);
    node.count = total;
    return total;
  }
  computeCount(root);

  return root;
}

function collectLeaves(node, out) {
  if (node.leaf) out.set(node.leaf.url, node.leaf);
  for (const child of node.children.values()) collectLeaves(child, out);
}

function sortTopLevelEntries(entries) {
  const orderIndex = new Map(TOP_BUCKET_ORDER.map((k, i) => [k, i]));
  return entries.sort((a, b) => {
    const ai = orderIndex.has(a[0]) ? orderIndex.get(a[0]) : 1000;
    const bi = orderIndex.has(b[0]) ? orderIndex.get(b[0]) : 1000;
    if (ai !== bi) return ai - bi;
    return a[0].localeCompare(b[0]);
  });
}

function renderDocsTree() {
  const root = document.getElementById('docs-tree-root');
  root.innerHTML = '';
  const tree = State.docs.tree;
  const stats = document.getElementById('docs-stats');
  stats.textContent = `${tree.count} pages · ${State.allExercises.length} exercises`;

  // Build the top-level entries in preferred order
  const topEntries = sortTopLevelEntries([...tree.children.entries()]);
  for (const [name, child] of topEntries) {
    root.appendChild(renderDocsNode(child, 0, /* defaultOpen */ name === 'Concepts' || name === 'Tasks'));
  }

  // Wire search
  const searchInput = document.getElementById('docs-search');
  searchInput.value = '';
  searchInput.removeEventListener('input', docsSearchHandler);
  searchInput.addEventListener('input', docsSearchHandler);
}

function renderLeafButton(leaf, displayLabel) {
  const btn = el('button', {
    class: 'docs-leaf',
    type: 'button',
    'data-url': leaf.url,
    title: leaf.fullBreadcrumb,
  },
    el('span', { class: 'label' }, displayLabel || leaf.leafTitle),
    el('span', { class: 'ex-count' }, String(leaf.exerciseIds.length)),
  );
  btn.addEventListener('click', () => selectDocsLeaf(leaf.url));
  return btn;
}

function renderDocsNode(node, depth, defaultOpen) {
  // Pure leaf (no children) → button
  if (node.leaf && node.children.size === 0) {
    return renderLeafButton(node.leaf);
  }

  // Has children (and possibly also its own leaf) → details
  const details = el('details', {
    class: 'docs-node',
    'data-depth': String(depth),
    open: defaultOpen ? true : null,
  });
  details.appendChild(el('summary', {},
    el('span', { class: 'label' }, node.name),
    el('span', { class: 'count' }, `${node.count}`),
  ));

  // If this node is also a documented page itself, surface it as the first leaf
  // inside, labeled with "(overview)" so users know it's the parent page.
  if (node.leaf) {
    details.appendChild(renderLeafButton(node.leaf, `${node.name} (overview)`));
  }

  // Sort children: leaves first alphabetically, then internal nodes alphabetically
  const childEntries = [...node.children.entries()].sort((a, b) => {
    const aPureLeaf = !!a[1].leaf && a[1].children.size === 0;
    const bPureLeaf = !!b[1].leaf && b[1].children.size === 0;
    if (aPureLeaf !== bPureLeaf) return aPureLeaf ? -1 : 1;
    return a[0].localeCompare(b[0]);
  });
  for (const [, child] of childEntries) {
    details.appendChild(renderDocsNode(child, depth + 1, /* defaultOpen */ false));
  }
  return details;
}

function selectDocsLeaf(url, opts = {}) {
  const leaf = State.docs.leaves.get(url);
  if (!leaf) return;
  State.docs.selectedUrl = url;
  storageSet(KEY.docsLastUrl, url);
  if (opts.source !== 'hash') updateHash('docs', url);

  // Highlight active in tree
  document.querySelectorAll('.docs-leaf.active').forEach(b => b.classList.remove('active'));
  const active = document.querySelector(`.docs-leaf[data-url="${CSS.escape(url)}"]`);
  if (active) {
    active.classList.add('active');
    // Open all ancestor <details>
    let parent = active.parentElement;
    while (parent && parent.id !== 'docs-tree-root') {
      if (parent.tagName === 'DETAILS') parent.open = true;
      parent = parent.parentElement;
    }
    active.scrollIntoView({ block: 'nearest' });
  }

  renderDocsDetail(leaf);
}

function renderDocsDetail(leaf) {
  const main = document.getElementById('docs-detail');
  main.innerHTML = '';

  // Title
  main.appendChild(el('h2', {}, leaf.leafTitle));

  // Breadcrumb
  const bc = el('div', { class: 'breadcrumb' });
  for (const seg of leaf.breadcrumbSegments) bc.appendChild(el('span', {}, seg));
  main.appendChild(bc);

  // Open on kubernetes.io
  main.appendChild(el('a', {
    class: 'open-link',
    href: leaf.url,
    target: '_blank',
    rel: 'noopener',
  }, '📖 ', el('span', {}, leafOpenTarget(leaf.url))));

  // Linked exercises
  const exs = leaf.exerciseIds
    .map(id => State.byId.get(id))
    .filter(Boolean)
    // Sort by domain then numberInDomain
    .sort((a, b) => {
      const ad = a.domain.key, bd = b.domain.key;
      if (ad !== bd) return ad.localeCompare(bd);
      return (a.numberInDomain || 0) - (b.numberInDomain || 0);
    });

  main.appendChild(el('div', { class: 'section-label' }, `Exercises (${exs.length})`));
  const ul = el('ul', { class: 'docs-ex-list' });
  for (const ex of exs) {
    const li = document.createElement('li');
    const btn = el('button', { type: 'button', title: ex.fullTitle || ex.title },
      el('span', { class: 'qnum-pill' }, `Q${ex.numberInDomain}`),
      tagPill(ex.tag),
      el('span', { class: 'ex-title' }, ex.title),
    );
    btn.addEventListener('click', () => {
      location.hash = '#browse/' + ex.id;
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
  main.appendChild(ul);
}

function leafOpenTarget(url) {
  try {
    const u = new URL(url);
    return `Open on ${u.hostname}`;
  } catch {
    return 'Open in new tab';
  }
}

function docsSearchHandler(ev) {
  const q = ev.target.value.trim().toLowerCase();
  const root = document.getElementById('docs-tree-root');
  if (!q) {
    // Reset: clear all .search-hidden, restore default open state
    root.querySelectorAll('.search-hidden').forEach(n => n.classList.remove('search-hidden'));
    return;
  }
  // For each leaf, decide visibility
  const matchedLeaves = new Set();
  for (const leaf of State.docs.leaves.values()) {
    if (leaf.leafTitle.toLowerCase().includes(q) || leaf.fullBreadcrumb.toLowerCase().includes(q)) {
      matchedLeaves.add(leaf.url);
    }
  }
  // Hide all by default, then unhide matched leaves and their ancestors; open ancestors
  root.querySelectorAll('.docs-leaf').forEach(btn => {
    const url = btn.getAttribute('data-url');
    if (matchedLeaves.has(url)) {
      btn.classList.remove('search-hidden');
      // Open ancestor details
      let parent = btn.parentElement;
      while (parent && parent.id !== 'docs-tree-root') {
        if (parent.tagName === 'DETAILS') { parent.open = true; parent.classList.remove('search-hidden'); }
        parent = parent.parentElement;
      }
    } else {
      btn.classList.add('search-hidden');
    }
  });
  // Hide internal nodes that have no visible descendant
  root.querySelectorAll('.docs-node').forEach(node => {
    const anyVisible = node.querySelector('.docs-leaf:not(.search-hidden)');
    if (!anyVisible) node.classList.add('search-hidden');
    else node.classList.remove('search-hidden');
  });
}

// ---------- URL hash routing ----------
// Supported hashes:
//   #browse                          → Browse mode (default)
//   #browse/<exerciseId>             → Browse + scroll to that card
//   #quiz                            → Quiz mode
//   #docs                            → Docs mode (no leaf selected)
//   #docs/<encodedUrl>               → Docs mode + select that leaf

let _suppressHash = false;            // prevent setMode → hashchange feedback loop

function parseHash() {
  const h = (location.hash || '#').slice(1);
  if (!h) return { mode: null };
  const [mode, ...rest] = h.split('/');
  const arg = rest.length ? decodeURIComponent(rest.join('/')) : null;
  if (['browse', 'quiz', 'docs'].includes(mode)) return { mode, arg };
  return { mode: null };
}

function updateHash(mode, arg) {
  const next = arg ? `#${mode}/${encodeURIComponent(arg)}` : `#${mode}`;
  if (location.hash === next) return;
  _suppressHash = true;
  location.hash = next;
  // hashchange fires async; clear the flag on next tick
  setTimeout(() => { _suppressHash = false; }, 0);
}

function applyHash() {
  const { mode, arg } = parseHash();
  if (!mode) { setMode('browse', { source: 'hash' }); return; }
  if (mode === 'browse' && arg) {
    setMode('browse', { source: 'hash' });
    setTimeout(() => {
      document.getElementById('card-' + arg)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return;
  }
  if (mode === 'docs' && arg) {
    setMode('docs', { source: 'hash' });
    // selectDocsLeaf needs the tree to be built; setMode('docs') does that synchronously
    if (State.docs && State.docs.leaves && State.docs.leaves.has(arg)) {
      selectDocsLeaf(arg, { source: 'hash' });
    }
    return;
  }
  setMode(mode, { source: 'hash' });
}

// ---------- Mode switching ----------
function setMode(mode, opts = {}) {
  State.mode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  // Iterate all .view containers so adding a new view = no setMode change required.
  document.querySelectorAll('.view').forEach(v => {
    const want = v.id === `view-${mode}`;
    v.classList.toggle('active', want);
    v.hidden = !want;
  });
  if (mode === 'quiz') {
    if (!document.getElementById('quiz-domain-list').firstChild) {
      renderQuizSetup();
    } else if (!State.quiz) {
      // Returning to Quiz with no active in-memory session — refresh the resume panel
      // in case storage changed since last visit (e.g. cross-tab Push/Pull).
      renderQuizResumePanel();
    }
  }
  if (mode === 'browse') renderBrowse();
  if (mode === 'help') renderHelpView();
  if (mode === 'tools') renderToolsView();
  if (mode === 'docs') {
    if (!State.docs) {
      State.docs = { tree: buildDocsTree(State.allExercises), leaves: null, selectedUrl: null };
      // Flatten leaves for quick lookup
      const leaves = new Map();
      collectLeaves(State.docs.tree, leaves);
      State.docs.leaves = leaves;
      renderDocsTree();
      const lastUrl = storageGet(KEY.docsLastUrl, null);
      if (lastUrl && leaves.has(lastUrl) && opts.source !== 'hash') selectDocsLeaf(lastUrl);
    }
  }
  // Update URL hash to reflect the new mode (unless we came from a hash event)
  if (opts.source !== 'hash') updateHash(mode);
}

// ---------- Help view ----------

let _helpRendered = false;

function renderHelpView() {
  if (_helpRendered) return;
  const body = document.getElementById('help-body');
  const toc = document.getElementById('help-toc');
  if (!body || !toc) return;
  const md = State.data && State.data.helpGuide;
  if (!md) {
    body.innerHTML = '<p class="muted">Help content not bundled — run <code>npm run build</code> to regenerate <code>exercises.json</code>.</p>';
    return;
  }
  body.innerHTML = renderMarkdown(md);

  // Rewrite repo-relative links → GitHub blob URLs (open in new tab).
  // Same-page anchors (#…) and absolute URLs (https://…, mailto:…) are left untouched.
  const REPO_BLOB = 'https://github.com/xooooooooox/cka-exercises/blob/main/';
  body.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    if (/^([a-z][a-z0-9+.-]*:)|^#|^\/\//i.test(href)) return;
    a.setAttribute('href', REPO_BLOB + href.replace(/^\.\//, ''));
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  // Assign id slugs to headings and build the TOC
  const headings = body.querySelectorAll('h1, h2, h3');
  const seen = new Set();
  const items = [];
  headings.forEach(h => {
    if (h.tagName === 'H1') return; // skip the doc title
    const text = h.textContent.trim();
    let slug = text.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'section';
    let unique = slug; let n = 2;
    while (seen.has(unique)) unique = `${slug}-${n++}`;
    seen.add(unique);
    h.id = unique;
    items.push({ level: h.tagName === 'H2' ? 2 : 3, id: unique, text });
  });

  const ul = document.createElement('ul');
  items.forEach(it => {
    const li = document.createElement('li');
    if (it.level === 3) li.className = 'h3';
    const a = document.createElement('a');
    a.href = `#help-section-${it.id}`;
    a.textContent = it.text;
    a.dataset.target = it.id;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(it.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    li.appendChild(a);
    ul.appendChild(li);
  });
  toc.innerHTML = '';
  toc.appendChild(ul);

  // Spy-scroll: highlight the TOC entry whose section is in view
  if ('IntersectionObserver' in window && items.length) {
    const linksById = new Map();
    toc.querySelectorAll('a').forEach(a => linksById.set(a.dataset.target, a));
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        const a = linksById.get(en.target.id);
        if (!a) return;
        if (en.isIntersecting) {
          toc.querySelectorAll('a.active').forEach(x => x.classList.remove('active'));
          a.classList.add('active');
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
    headings.forEach(h => { if (h.id) obs.observe(h); });
  }

  _helpRendered = true;
}

// ---------- Tools view (kubectl explain + kubectl -h) ----------

let _toolsRendered = false;
let _toolsLoadingPromise = null;

async function loadTools() {
  if (State.tools) return State.tools;
  if (_toolsLoadingPromise) return _toolsLoadingPromise;
  _toolsLoadingPromise = (async () => {
    const resp = await fetch('tools.json');
    if (!resp.ok) throw new Error(`tools.json HTTP ${resp.status}`);
    State.tools = await resp.json();
    return State.tools;
  })();
  return _toolsLoadingPromise;
}

async function renderToolsView() {
  const explainBody = document.getElementById('tools-explain-detail');
  const kubectlBody = document.getElementById('tools-kubectl-detail');
  if (!explainBody || !kubectlBody) return;

  if (!State.tools) {
    explainBody.innerHTML = '<p class="muted">Loading…</p>';
    kubectlBody.innerHTML = '<p class="muted">Loading…</p>';
    try {
      await loadTools();
    } catch (e) {
      explainBody.innerHTML = `<p class="muted">Couldn't load <code>tools.json</code>: ${e.message}. Run <code>npm run build:tools-bundle</code>.</p>`;
      return;
    }
  }

  if (_toolsRendered) {
    showToolsSubtab(State.toolsSubtab);
    return;
  }

  // Meta line in the subtabs strip
  const meta = document.getElementById('tools-meta');
  if (meta) {
    const t = State.tools;
    meta.textContent = `${t.k8sVersion || ''}${t.kubectl?.version ? ' · kubectl ' + t.kubectl.version : ''}`;
  }

  renderExplainKindList();
  renderKubectlCommandList();

  // Restore last sub-tab + selection
  const lastTab = storageGet(KEY.toolsSubtab, 'explain');
  State.toolsSubtab = (lastTab === 'kubectl') ? 'kubectl' : 'explain';
  showToolsSubtab(State.toolsSubtab);

  const lastKind = storageGet(KEY.toolsKind, null);
  const lastPath = storageGet(KEY.toolsPath, []) || [];
  if (lastKind && State.tools.definitions[lastKind]) {
    State.toolsExplain = { kindRef: lastKind, path: Array.isArray(lastPath) ? lastPath : [] };
    renderExplainDetail();
  }

  const lastCmd = storageGet(KEY.toolsCmd, null);
  if (lastCmd && State.tools.kubectl?.commands?.some(c => c.path === lastCmd)) {
    State.toolsKubectl.cmdPath = lastCmd;
    renderKubectlDetail();
  }

  installToolsHandlers();
  _toolsRendered = true;
}

function showToolsSubtab(name) {
  const sub = (name === 'kubectl') ? 'kubectl' : 'explain';
  State.toolsSubtab = sub;
  storageSet(KEY.toolsSubtab, sub);
  document.querySelectorAll('.tools-subtabs button[data-tools-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.toolsTab === sub));
  document.getElementById('tools-explain').hidden = sub !== 'explain';
  document.getElementById('tools-kubectl').hidden = sub !== 'kubectl';
}

function installToolsHandlers() {
  document.querySelectorAll('.tools-subtabs button[data-tools-tab]').forEach(b => {
    b.addEventListener('click', () => showToolsSubtab(b.dataset.toolsTab));
  });
  document.getElementById('tools-explain-search')?.addEventListener('input', (e) => {
    renderExplainKindList(e.target.value.trim().toLowerCase());
  });
  document.getElementById('tools-kubectl-search')?.addEventListener('input', (e) => {
    renderKubectlCommandList(e.target.value.trim().toLowerCase());
  });
}

// --- Explain panel ---

function renderExplainKindList(query = '') {
  const list = document.getElementById('tools-kind-list');
  if (!list) return;
  list.innerHTML = '';
  const kinds = State.tools.rootKinds;

  // If there's a query, also search across reachable field paths so users can
  // type "affinity" and see Pod/PodSpec rows.
  let matchedRefs = null;
  if (query) {
    matchedRefs = new Set();
    for (const k of kinds) {
      if (k.name.toLowerCase().includes(query)) matchedRefs.add(k.ref);
    }
    // Field-name search: walk reachable defs once
    for (const k of kinds) {
      const def = State.tools.definitions[k.ref];
      if (!def) continue;
      for (const f of def.fields || []) {
        if (f.name.toLowerCase().includes(query)) matchedRefs.add(k.ref);
      }
    }
  }

  for (const k of kinds) {
    if (matchedRefs && !matchedRefs.has(k.ref)) continue;
    const btn = el('button', {
      type: 'button',
      'data-kind-ref': k.ref,
      title: `${k.name} (${k.group || 'core'}/${k.version})`,
    }, k.name);
    if (k.ref === State.toolsExplain.kindRef) btn.classList.add('active');
    btn.addEventListener('click', () => {
      State.toolsExplain = { kindRef: k.ref, path: [] };
      storageSet(KEY.toolsKind, k.ref);
      storageSet(KEY.toolsPath, []);
      renderExplainKindList(query);
      renderExplainDetail();
    });
    list.appendChild(btn);
  }
  if (list.childElementCount === 0) {
    list.appendChild(el('p', { class: 'muted' }, query ? 'No matches.' : 'No kinds loaded.'));
  }
}

function renderExplainDetail() {
  const detail = document.getElementById('tools-explain-detail');
  if (!detail) return;
  detail.innerHTML = '';
  const { kindRef, path } = State.toolsExplain;
  if (!kindRef) return;

  // Walk the path from the root kind to the current node
  let cursorRef = kindRef;
  for (const seg of path) {
    const def = State.tools.definitions[cursorRef];
    if (!def) break;
    const field = (def.fields || []).find(f => f.name === seg);
    if (!field?.ref) break;
    cursorRef = field.ref;
  }
  const def = State.tools.definitions[cursorRef];
  if (!def) {
    detail.appendChild(el('p', { class: 'muted' }, `Schema not bundled: ${cursorRef}`));
    return;
  }

  // Header — KIND / VERSION / RESOURCE / DESCRIPTION
  const rootKind = State.tools.rootKinds.find(k => k.ref === kindRef);
  const header = el('div', { class: 'explain-header' });
  header.appendChild(el('div', {}, el('strong', {}, 'KIND:     '), rootKind?.name || ''));
  if (rootKind?.version) header.appendChild(el('div', {}, el('strong', {}, 'VERSION:  '), `${rootKind.group ? rootKind.group + '/' : ''}${rootKind.version}`));
  if (path.length) header.appendChild(el('div', {}, el('strong', {}, 'FIELD:    '), [rootKind?.name, ...path].join('.')));
  detail.appendChild(header);

  // Breadcrumb
  if (path.length) {
    const crumbs = el('div', { class: 'explain-breadcrumb' });
    const rootLink = el('a', { 'data-crumb-idx': '-1' }, rootKind?.name || 'root');
    rootLink.addEventListener('click', () => navigateExplain([]));
    crumbs.appendChild(rootLink);
    path.forEach((seg, i) => {
      crumbs.appendChild(document.createTextNode(' › '));
      const a = el('a', { 'data-crumb-idx': String(i) }, seg);
      a.addEventListener('click', () => navigateExplain(path.slice(0, i + 1)));
      crumbs.appendChild(a);
    });
    detail.appendChild(crumbs);
  }

  // Description
  if (def.description) {
    detail.appendChild(el('div', { class: 'explain-desc' }, el('strong', {}, 'DESCRIPTION:\n     '), def.description));
  }

  // Fields
  const fields = def.fields || [];
  if (fields.length) {
    detail.appendChild(el('div', { class: 'explain-section' }, el('strong', {}, 'FIELDS:')));
    for (const f of fields) {
      const row = el('div', { class: 'field-row' });
      const head = el('div', { class: 'field-head' });
      const nameSpan = el('span', { class: 'field-name' }, f.name);
      const typeSpan = el('span', { class: 'field-type' }, ` <${f.type}>${f.required ? ' -required-' : ''}`);
      if (f.ref) {
        const drill = el('button', { type: 'button', class: 'field-drill', title: 'Drill into this sub-schema' }, '↳');
        drill.addEventListener('click', () => navigateExplain([...path, f.name]));
        head.append(nameSpan, typeSpan, drill);
        nameSpan.addEventListener('click', () => navigateExplain([...path, f.name]));
        nameSpan.style.cursor = 'pointer';
      } else {
        head.append(nameSpan, typeSpan);
      }
      row.appendChild(head);
      if (f.description) row.appendChild(el('div', { class: 'field-desc' }, f.description));
      detail.appendChild(row);
    }
  } else {
    detail.appendChild(el('p', { class: 'muted' }, '(scalar / no sub-fields)'));
  }
}

function navigateExplain(newPath) {
  State.toolsExplain.path = newPath;
  storageSet(KEY.toolsPath, newPath);
  renderExplainDetail();
}

// --- kubectl -h panel ---

function renderKubectlCommandList(query = '') {
  const list = document.getElementById('tools-cmd-list');
  if (!list) return;
  list.innerHTML = '';
  const commands = State.tools.kubectl?.commands || [];
  let shown = 0;
  for (const c of commands) {
    if (query) {
      const hay = (c.path + ' ' + (c.summary || '')).toLowerCase();
      if (!hay.includes(query)) continue;
    }
    const depth = c.path.split(' ').length - 1;
    const btn = el('button', { type: 'button', 'data-cmd-path': c.path, title: c.summary || '' });
    btn.style.paddingLeft = `${8 + depth * 12}px`;
    btn.textContent = c.path.split(' ').pop();
    if (c.path === State.toolsKubectl.cmdPath) btn.classList.add('active');
    btn.addEventListener('click', () => {
      State.toolsKubectl.cmdPath = c.path;
      storageSet(KEY.toolsCmd, c.path);
      renderKubectlCommandList(query);
      renderKubectlDetail();
    });
    list.appendChild(btn);
    shown++;
  }
  if (!shown) list.appendChild(el('p', { class: 'muted' }, query ? 'No matches.' : 'No commands loaded.'));
}

function renderKubectlDetail() {
  const detail = document.getElementById('tools-kubectl-detail');
  if (!detail) return;
  const cmd = State.tools.kubectl?.commands?.find(c => c.path === State.toolsKubectl.cmdPath);
  if (!cmd) {
    detail.innerHTML = '<p class="muted">Pick a command on the left.</p>';
    return;
  }
  detail.innerHTML = '';
  const heading = el('div', { class: 'kubectl-heading' });
  heading.appendChild(el('div', { class: 'kubectl-path' }, `$ kubectl ${cmd.path} -h`));
  if (cmd.summary) heading.appendChild(el('div', { class: 'kubectl-summary muted' }, cmd.summary));
  const copyBtn = el('button', { type: 'button', class: 'kubectl-copy', title: 'Copy "kubectl <cmd>" to clipboard' }, '📋 Copy');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`kubectl ${cmd.path}`);
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
    } catch { copyBtn.textContent = '✗ Failed'; }
  });
  heading.appendChild(copyBtn);
  detail.appendChild(heading);

  const pre = el('pre', { class: 'kubectl-help' });
  pre.appendChild(el('code', {}, cmd.rawHelp || ''));
  detail.appendChild(pre);
}

// ---------- Theme ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  storageSet(KEY.theme, theme);
}

// ---------- Keyboard shortcuts ----------

const State_kbd = { focusedExerciseId: null };

function isTypingInField() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}

function getVisibleExerciseCards() {
  return [...document.querySelectorAll('#main > .exercise-card')];
}

function focusExerciseCard(card) {
  if (!card) return;
  document.querySelectorAll('.exercise-card.kbd-focused').forEach(c => c.classList.remove('kbd-focused'));
  card.classList.add('kbd-focused');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  State_kbd.focusedExerciseId = card.id.replace(/^card-/, '');
}

function moveFocus(delta) {
  if (State.mode !== 'browse') return;
  const cards = getVisibleExerciseCards();
  if (cards.length === 0) return;
  let idx = cards.findIndex(c => c.classList.contains('kbd-focused'));
  if (idx === -1) {
    // Pick the first card whose top is below the filter bar
    const bar = document.getElementById('filter-bar');
    const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
    idx = cards.findIndex(c => c.getBoundingClientRect().top >= barBottom - 1);
    if (idx === -1) idx = 0;
  } else {
    idx = Math.max(0, Math.min(cards.length - 1, idx + delta));
  }
  focusExerciseCard(cards[idx]);
}

function getFocusedCard() {
  if (State.mode !== 'browse') return null;
  return document.querySelector('.exercise-card.kbd-focused')
      || getVisibleExerciseCards()[0]
      || null;
}

function toggleHelp(force) {
  const overlay = document.getElementById('help-overlay');
  const open = typeof force === 'boolean' ? force : overlay.hidden;
  overlay.hidden = !open;
}

function focusSearch() {
  if (State.mode === 'browse') {
    document.getElementById('filter-search')?.focus();
  } else if (State.mode === 'docs') {
    document.getElementById('docs-search')?.focus();
  }
}

function installKeyboardShortcuts() {
  document.addEventListener('keydown', (ev) => {
    // '?' opens help (Shift+/)
    if (ev.key === '?' && !isTypingInField()) {
      ev.preventDefault();
      toggleHelp();
      return;
    }
    // Esc closes help / blurs input
    if (ev.key === 'Escape') {
      if (!document.getElementById('help-overlay').hidden) {
        toggleHelp(false); return;
      }
      if (isTypingInField()) { document.activeElement.blur(); return; }
    }
    if (isTypingInField()) return;

    // '/' focuses search
    if (ev.key === '/') { ev.preventDefault(); focusSearch(); return; }

    // 1/2/3 — switch tab
    if (ev.key === '1') { ev.preventDefault(); setMode('browse'); return; }
    if (ev.key === '2') { ev.preventDefault(); setMode('quiz'); return; }
    if (ev.key === '3') { ev.preventDefault(); setMode('docs'); return; }
    if (ev.key === '4') { ev.preventDefault(); setMode('help'); return; }
    if (ev.key === '5') { ev.preventDefault(); setMode('tools'); return; }

    // j/↓ next, k/↑ prev (Browse only — Quiz has its own next/prev buttons)
    if (ev.key === 'j' || ev.key === 'ArrowDown') {
      if (State.mode === 'browse') { ev.preventDefault(); moveFocus(+1); return; }
    }
    if (ev.key === 'k' || ev.key === 'ArrowUp') {
      if (State.mode === 'browse') { ev.preventDefault(); moveFocus(-1); return; }
    }

    // Card actions on focused card
    const card = getFocusedCard();
    if (!card) return;

    if (ev.key === ' ') {
      // Space toggles the solution
      ev.preventDefault();
      const toggle = card.querySelector('.solution-toggle');
      if (toggle) toggle.click();
      return;
    }
    if (ev.key === 'd' || ev.key === 'D') {
      ev.preventDefault();
      const btn = [...card.querySelectorAll('.exercise-tools button')].find(b => /Done/.test(b.textContent));
      if (btn) btn.click();
      return;
    }
    if (ev.key === 'b' || ev.key === 'B') {
      ev.preventDefault();
      const btn = [...card.querySelectorAll('.exercise-tools button')].find(b => /[⭐☆]/.test(b.textContent));
      if (btn) btn.click();
      return;
    }
  });

  document.getElementById('help-toggle')?.addEventListener('click', () => toggleHelp());
  document.getElementById('help-close')?.addEventListener('click', () => toggleHelp(false));
  document.getElementById('help-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'help-overlay') toggleHelp(false);
  });
}

// ---------- Init ----------
async function init() {
  try {
    await loadData();
  } catch (e) {
    document.getElementById('main').innerHTML = `<div class="empty-state">Failed to load exercises.json: ${e.message}<br>Run <code>node scripts/build-exercises.mjs</code> from the repo root, then serve <code>docs/</code> via a local HTTP server.</div>`;
    return;
  }

  // Theme
  const savedTheme = storageGet(KEY.theme, null) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));

  // Browse
  renderFilterBar();
  renderBrowse();

  // Hash routing — apply once at load, then on every hashchange
  window.addEventListener('hashchange', () => {
    if (_suppressHash) return;
    applyHash();
  });
  applyHash();

  // Keyboard shortcuts
  installKeyboardShortcuts();

  // Settings overlay (LLM grading)
  installSettingsOverlay();

  // Header ☁ sync popover
  installSyncMenu();

  // Reflect saved quiz state on the Quiz tab badge
  refreshQuizTabDot();

  // Mobile: Filters / Outline toggle buttons (CSS hides these on desktop)
  document.getElementById('filter-bar-toggle')?.addEventListener('click', () => {
    const bar = document.getElementById('filter-bar');
    const expanded = bar.classList.toggle('expanded');
    document.getElementById('filter-bar-toggle').setAttribute('aria-expanded', String(expanded));
  });
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    const expanded = sb.classList.toggle('expanded');
    document.getElementById('sidebar-toggle').setAttribute('aria-expanded', String(expanded));
  });

  // Mobile search input — mirror state to/from the desktop search
  const mobileSearch = document.getElementById('filter-search-mobile');
  const desktopSearch = document.getElementById('filter-search');
  if (mobileSearch && desktopSearch) {
    mobileSearch.addEventListener('input', () => {
      if (desktopSearch.value !== mobileSearch.value) {
        desktopSearch.value = mobileSearch.value;
        desktopSearch.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    desktopSearch.addEventListener('input', () => {
      if (mobileSearch.value !== desktopSearch.value) mobileSearch.value = desktopSearch.value;
    });
  }

  // Quiz controls
  document.getElementById('quiz-start-btn').addEventListener('click', () => {
    const saved = storageGet(KEY.quizActive, null);
    if (saved) {
      const answered = (saved.status || []).length;
      const total = (saved.ids || []).length;
      const ok = confirm(`A quiz is already in progress (${answered}/${total} answered). Discard it and start a new one?\n\nTip: cancel this dialog and click 💾 Save snapshot first if you want to keep it.`);
      if (!ok) return;
      clearActiveQuiz();
    }
    startQuiz();
  });
  document.getElementById('quiz-snapshot')?.addEventListener('click', saveAsSnapshot);
  document.getElementById('quiz-next').addEventListener('click', quizNext);
  document.getElementById('quiz-prev').addEventListener('click', quizPrev);
  document.getElementById('quiz-grade-got').addEventListener('click', () => quizGrade('got'));
  document.getElementById('quiz-grade-miss').addEventListener('click', () => quizGrade('missed'));
  document.getElementById('quiz-skip').addEventListener('click', quizSkip);
  document.getElementById('quiz-flag').addEventListener('click', quizFlag);
  document.getElementById('quiz-reveal').addEventListener('click', quizReveal);
  document.getElementById('quiz-finish').addEventListener('click', () => {
    if (confirm('End this quiz session and see your summary?')) finishQuiz();
  });
  document.getElementById('quiz-restart').addEventListener('click', () => {
    document.getElementById('quiz-summary').hidden = true;
    document.getElementById('quiz-setup').hidden = false;
    updateQuizEligibleCount();
    renderQuizResumePanel();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
