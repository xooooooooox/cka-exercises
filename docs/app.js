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
    tags: new Set(['general', 'cka-past-exam', 'killersh-a', 'killersh-b', 'killercoda']),
    search: '',
    onlyBookmarks: false,
    onlyUndone: false,
    revealSolutions: false,
  },
  quiz: null,                    // { ids, idx, status: Map<id, 'got'|'missed'|'skipped'>, flagged: Set, revealed: Set, deadline, solutionsHidden }
  quizTimerHandle: null,
  docs: null,                    // { tree, leaves: Map<url, leaf>, selectedUrl }
  tools: null,                   // currently-active version payload (alias of toolsByMinor.get(currentMinor))
  toolsManifest: null,           // { default, versions: [{minor,kubectl,...}] }
  toolsByMinor: new Map(),       // minor → fetched payload (per-version cache)
  toolsCurrentMinor: null,
  toolsExplain: { kindRef: null, path: [] },
  toolsKubectl: { cmdPath: null },
  toolsSubtab: 'explain',
  nodes: null,                   // active version's nodes payload
  nodesByMinor: new Map(),
  nodesCurrentMinor: null,
  nodesRole: 'controlplane',
};

// ---------- Storage ----------
const KEY = {
  done: 'cka:done',
  bookmark: 'cka:bookmark',
  theme: 'cka:theme',
  quizActive: 'cka:quiz:active',
  quizSnapshots: 'cka:quiz:snapshots',
  quizOrder: 'cka:quiz:lastOrder',
  toolsSubtab: 'cka:tools:lastSubtab',
  settingsTab: 'cka:settings:lastTab',
  toolsKind: 'cka:tools:lastKind',
  toolsPath: 'cka:tools:lastPath',
  toolsCmd: 'cka:tools:lastCmd',
  toolsVersion: 'cka:tools:version',
  nodesRole: 'cka:nodes:lastRole',
  nodesPath: 'cka:nodes:lastPath',
  docsLastUrl: 'cka:docs:lastUrl',
  llmSettings: 'cka:llm:settings',
  privacyAck: 'cka:llm:privacyAck',
  answerPrefix: 'cka:answer:',   // appended with <exerciseId>
  fixDraftPrefix: 'cka:fix-draft:', // appended with <exerciseId>
  taskFixDraftPrefix: 'cka:task-fix-draft:', // task / docs reports — appended with <exerciseId>
  helpLang: 'cka:help:lang',     // 'en' | 'zh' — Help-tab language preference
  helpDoc:  'cka:help:doc',      // 'webapp' | 'exam' — Help-tab document preference
  filters: 'cka:filters',        // Browse-mode filter bar (persists across sessions + sync)
  gistToken: 'cka:gist:token',
  gistId: 'cka:gist:id',
  syncMeta: 'cka:sync:meta',    // { lastPushAt, lastPullAt, lastTestAt, lastError? }
};

// All providers we offer. Their slots get pre-created on first save so the
// Settings UI can show per-provider configured-state hints.
const ALL_PROVIDERS = ['anthropic', 'openai', 'deepseek', 'qwen', 'doubao', 'ollama'];
const LLM_DEFAULT_SETTINGS = {
  // Flat shape kept for downstream call sites (renderAnswerBox, LLM.check, …).
  provider: 'anthropic',
  apiKey: '',
  model: '',          // empty → use provider default
  baseUrl: '',        // empty → use provider default
  autoDoneThreshold: -1,
};

function emptyProviderSlot() {
  return { apiKey: '', model: '', baseUrl: '', models: [] };
}
function makeEmptyV2() {
  const providers = {};
  for (const p of ALL_PROVIDERS) providers[p] = emptyProviderSlot();
  return {
    schemaVersion: 2,
    active: 'anthropic',
    autoDoneThreshold: -1,
    providers,
  };
}

// Migrate v1 ({provider, apiKey, model, baseUrl, autoDoneThreshold}) into the
// v2 per-provider shape. Idempotent — returns v2 as-is.
function migrateLLM(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schemaVersion === 2 && raw.providers) {
    // Ensure every known provider has a slot (so the UI doesn't have to guard).
    const out = { ...raw, providers: { ...raw.providers } };
    for (const p of ALL_PROVIDERS) {
      if (!out.providers[p]) out.providers[p] = emptyProviderSlot();
    }
    return out;
  }
  const p = raw.provider || 'anthropic';
  const v2 = makeEmptyV2();
  v2.active = p;
  v2.autoDoneThreshold = raw.autoDoneThreshold ?? -1;
  v2.providers[p] = {
    apiKey:  raw.apiKey  || '',
    model:   raw.model   || '',
    baseUrl: raw.baseUrl || '',
    models:  [],
  };
  return v2;
}

function readLLMConfig() {
  const raw = storageGet(KEY.llmSettings, null);
  return migrateLLM(raw) || makeEmptyV2();
}
function writeLLMConfig(v2) { storageSet(KEY.llmSettings, v2); }

function setProviderSlot(provider, slot) {
  const v2 = readLLMConfig();
  v2.providers[provider] = { ...v2.providers[provider], ...slot };
  writeLLMConfig(v2);
}
function setActiveProvider(provider) {
  const v2 = readLLMConfig();
  v2.active = provider;
  writeLLMConfig(v2);
}

// Flat snapshot of the *active* provider. Callers downstream of Settings
// (renderAnswerBox, LLM.check) keep using this exactly as before.
function getLLMSettings() {
  const v2 = readLLMConfig();
  const slot = v2.providers[v2.active] || emptyProviderSlot();
  return Object.assign({}, LLM_DEFAULT_SETTINGS, {
    provider: v2.active,
    apiKey:   slot.apiKey  || '',
    model:    slot.model   || '',
    baseUrl:  slot.baseUrl || '',
    autoDoneThreshold: v2.autoDoneThreshold ?? -1,
  });
}
function setLLMSettings(s) {
  // Legacy entry point (still called by Save in older paths). Map flat → v2.
  const v2 = readLLMConfig();
  v2.active = s.provider || v2.active;
  v2.autoDoneThreshold = s.autoDoneThreshold ?? -1;
  v2.providers[v2.active] = {
    ...(v2.providers[v2.active] || emptyProviderSlot()),
    apiKey:  s.apiKey  || '',
    model:   s.model   || '',
    baseUrl: s.baseUrl || '',
  };
  writeLLMConfig(v2);
}

// Tiny pub/sub so already-rendered widgets (the answer-box "Using X (Y)" hint,
// the quick-switch popover) can react to an active-provider change without a
// full renderBrowse(). renderBrowse() still runs on Save for sidebar/badge
// refresh, but the emit makes the in-place hint update work in Quiz mode too
// (where renderBrowse never reaches) and the quick-switch popover doesn't
// need to trigger an expensive re-render at all.
//
// We don't track per-listener lifetimes; instead, callers that own a render
// pass (renderBrowse, the quiz session re-render) clear LLM_LISTENERS at the
// top of the pass and cards re-subscribe on mount. The Set is bounded by
// O(visible-cards).
const LLM_LISTENERS = new Set();
function onLLMSettingsChange(fn) { LLM_LISTENERS.add(fn); return () => LLM_LISTENERS.delete(fn); }
function emitLLMSettingsChange() {
  for (const fn of LLM_LISTENERS) {
    try { fn(); } catch (e) { console.error('LLM settings listener threw', e); }
  }
}
function clearLLMListeners() { LLM_LISTENERS.clear(); }

// True while the user is in quiz-mode fullscreen. renderQuizCard rebuilds the
// answer-box from scratch on every Prev/Next/Skip/Got/Missed, which would drop
// the .answer-fullscreen class — we re-apply it post-render so navigation
// doesn't kick the user out of fullscreen.
let _quizFullscreenSticky = false;

function getAnswer(exerciseId) { return storageGet(KEY.answerPrefix + exerciseId, null); }
function setAnswer(exerciseId, payload) { storageSet(KEY.answerPrefix + exerciseId, payload); }

// Browse-mode filter persistence. Set<string> fields serialise to arrays so the
// payload survives JSON round-trips (JSON.stringify(new Set([...])) returns {}).
function loadFilters() {
  const raw = storageGet(KEY.filters, null);
  const defaults = {
    domains: new Set(State.data ? State.data.domains.map(d => d.key) : []),
    tags: new Set(['general', 'cka-past-exam', 'killersh-a', 'killersh-b', 'killercoda']),
    search: '',
    onlyBookmarks: false,
    onlyUndone: false,
    revealSolutions: false,
  };
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    domains: Array.isArray(raw.domains) && raw.domains.length
      ? new Set(raw.domains)
      : defaults.domains,
    tags:    Array.isArray(raw.tags)
      ? new Set(raw.tags)
      : defaults.tags,
    search: typeof raw.search === 'string' ? raw.search : '',
    onlyBookmarks:   raw.onlyBookmarks === true,
    onlyUndone:      raw.onlyUndone === true,
    revealSolutions: raw.revealSolutions === true,
  };
}
function saveFilters() {
  const f = State.filters;
  storageSet(KEY.filters, {
    domains: Array.from(f.domains),
    tags:    Array.from(f.tags),
    search:  f.search,
    onlyBookmarks:   f.onlyBookmarks,
    onlyUndone:      f.onlyUndone,
    revealSolutions: f.revealSolutions,
  });
}
// Help-tab language preference. First visit picks based on the browser's
// reported locale; subsequent visits respect whatever the user clicked. The
// key sits in the `cka:*` namespace so it rides along in Backup / Gist sync.
function defaultHelpLang() {
  return /^zh\b/i.test(typeof navigator !== 'undefined' && navigator.language || '') ? 'zh' : 'en';
}
function getHelpLang() {
  return storageGet(KEY.helpLang, null) || defaultHelpLang();
}
function setHelpLang(lang) {
  storageSet(KEY.helpLang, lang === 'zh' ? 'zh' : 'en');
}

// Help-tab document preference. Two values: 'webapp' (default — the SPA's own
// usage guide, the user's most likely entry point) and 'exam' (the CKA study
// index). Persisted across reloads + carried in Backup / Gist export via the
// cka:* prefix walker.
function getHelpDoc() {
  return storageGet(KEY.helpDoc, null) === 'exam' ? 'exam' : 'webapp';
}
function setHelpDoc(doc) {
  storageSet(KEY.helpDoc, doc === 'exam' ? 'exam' : 'webapp');
}

function getFixDraft(id) { return storageGet(KEY.fixDraftPrefix + id, null); }
function setFixDraft(id, payload) {
  // Drop empty drafts entirely so they don't show in Backup. A draft is empty
  // if no type was chosen (or "other" with no additional text) and no
  // free-text was entered.
  const empty = !payload
    || (!payload.additional && (!payload.type || payload.type === 'other'));
  if (empty) {
    try { localStorage.removeItem(KEY.fixDraftPrefix + id); } catch {}
  } else {
    storageSet(KEY.fixDraftPrefix + id, payload);
  }
}
function getTaskFixDraft(id) { return storageGet(KEY.taskFixDraftPrefix + id, null); }
function setTaskFixDraft(id, payload) {
  const empty = !payload
    || (!payload.additional && !payload.suggestedUrl
        && (payload.existingLinkIdx == null || payload.existingLinkIdx === '')
        && (!payload.type || payload.type === 'other'));
  if (empty) {
    try { localStorage.removeItem(KEY.taskFixDraftPrefix + id); } catch {}
  } else {
    storageSet(KEY.taskFixDraftPrefix + id, payload);
  }
}
function allFixDrafts() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(KEY.fixDraftPrefix)) {
      try { out[k.slice(KEY.fixDraftPrefix.length)] = JSON.parse(localStorage.getItem(k)); } catch {}
    }
  }
  return out;
}
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
  'killercoda': 'KillerCoda',
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

  // Hydrate the filter bar from localStorage; loadFilters() falls back to
  // "all domains + all tags selected" when no saved payload exists.
  State.filters = loadFilters();

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
      saveFilters();
      renderBrowse();
    });
    domList.appendChild(el('label', {}, cb, ` ${dom.title} (${dom.weight})`));
  }
  document.querySelectorAll('#filter-tag-list input[type=checkbox]').forEach(cb => {
    cb.checked = State.filters.tags.has(cb.value);
    cb.addEventListener('change', () => {
      if (cb.checked) State.filters.tags.add(cb.value);
      else State.filters.tags.delete(cb.value);
      saveFilters();
      renderBrowse();
    });
  });
  const search = document.getElementById('filter-search');
  search.value = State.filters.search;
  search.addEventListener('input', () => { State.filters.search = search.value; saveFilters(); renderBrowse(); });

  // Restore the visual state of the toggle checkboxes from State.filters —
  // these were previously only restored for the search input, so reloading
  // the page with onlyUndone/onlyBookmarks/revealSolutions set would render
  // them unchecked even though the filter was in effect.
  const bm = document.getElementById('filter-bookmark');
  bm.checked = State.filters.onlyBookmarks;
  bm.addEventListener('change', () => { State.filters.onlyBookmarks = bm.checked; saveFilters(); renderBrowse(); });
  const un = document.getElementById('filter-undone');
  un.checked = State.filters.onlyUndone;
  un.addEventListener('change', () => { State.filters.onlyUndone = un.checked; saveFilters(); renderBrowse(); });
  const rs = document.getElementById('filter-reveal-solutions');
  rs.checked = State.filters.revealSolutions;
  rs.addEventListener('change', () => { State.filters.revealSolutions = rs.checked; saveFilters(); renderBrowse(); });

  document.getElementById('filter-reset').addEventListener('click', () => {
    State.filters = {
      domains: new Set(State.data.domains.map(d => d.key)),
      tags: new Set(['general', 'cka-past-exam', 'killersh-a', 'killersh-b', 'killercoda']),
      search: '', onlyBookmarks: false, onlyUndone: false, revealSolutions: false,
    };
    saveFilters();
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

// Model-suggestion picker state. _modelChipState.all is the full list
// returned by the provider's Test call; _modelChipState.expanded gates
// the "+ N more" / "Show less" toggle. Reset on each populateModelChips
// call so a re-Test (or provider switch) starts fresh.
const _modelChipState = { all: [], expanded: false };
const MODEL_CHIP_VISIBLE_CAP = 12;

function populateModelChips(models) {
  _modelChipState.all = Array.isArray(models) ? models.slice() : [];
  _modelChipState.expanded = false;
  const controls = document.getElementById('settings-model-suggestions-controls');
  const filterInput = document.getElementById('settings-model-filter');
  if (filterInput) filterInput.value = '';
  // Hide the filter + counter row entirely when there's no list to filter
  // (e.g. user hasn't Tested yet, or Test returned zero models).
  if (controls) controls.hidden = _modelChipState.all.length === 0;
  renderModelChips();
}

function renderModelChips() {
  const row = document.getElementById('settings-model-suggestions');
  if (!row) return;
  const input = document.getElementById('settings-model');
  const currentValue = input?.value || '';
  const filterInput = document.getElementById('settings-model-filter');
  const filter = (filterInput?.value || '').trim().toLowerCase();

  const matches = filter
    ? _modelChipState.all.filter(m => m.toLowerCase().includes(filter))
    : _modelChipState.all;
  const visible = _modelChipState.expanded ? matches : matches.slice(0, MODEL_CHIP_VISIBLE_CAP);

  // Counter
  const count = document.getElementById('settings-model-count');
  if (count) {
    if (_modelChipState.all.length === 0) {
      count.textContent = '';
    } else if (matches.length !== _modelChipState.all.length) {
      count.textContent = `${visible.length} of ${matches.length} match (${_modelChipState.all.length} total)`;
    } else {
      count.textContent = `${visible.length} of ${_modelChipState.all.length} shown`;
    }
  }

  // Chips
  row.innerHTML = '';
  row.classList.toggle('expanded', _modelChipState.expanded);
  for (const m of visible) {
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

  // Show-all toggle
  const showAll = document.getElementById('settings-model-show-all');
  if (showAll) {
    const overflow = matches.length - visible.length;
    if (overflow > 0) {
      showAll.hidden = false;
      showAll.textContent = `+ ${overflow} more`;
    } else if (_modelChipState.expanded && matches.length > MODEL_CHIP_VISIBLE_CAP) {
      showAll.hidden = false;
      showAll.textContent = 'Show less';
    } else {
      showAll.hidden = true;
      showAll.textContent = '';
    }
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

  const clearOne = document.getElementById('settings-clear-one');
  const providersCount = document.getElementById('settings-grading-count')
                       || document.getElementById('settings-providers-count');

  function currentProvider() {
    return [...providerInputs].find(r => r.checked)?.value || 'anthropic';
  }

  function reflectProvider(p) {
    const def = window.LLM?.DEFAULTS[p] || {};
    if (!modelInput.value) modelInput.placeholder = def.model || '';
    if (!baseUrlInput.value) baseUrlInput.placeholder = def.baseUrl || '';
    if (modelHint) modelHint.textContent = def.model ? `Default: ${def.model}` : '';
    // Ollama doesn't need a key
    if (keyRow) keyRow.style.display = (p === 'ollama') ? 'none' : '';
    // Clear any stale test status (different provider)
    if (testStatus) { testStatus.hidden = true; testStatus.textContent = ''; }
  }

  // Visual: paint each provider-card with .configured + .active states and
  // update the "n of 6 configured" header counter.
  function refreshProviderBadges() {
    const v2 = readLLMConfig();
    let configured = 0;
    for (const r of providerInputs) {
      const card = r.closest('.provider-card');
      if (!card) continue;
      const p = r.value;
      const slot = v2.providers[p] || {};
      // Ollama is "configured" if a model/baseUrl is set (no API key required).
      const hasConfig = p === 'ollama'
        ? !!(slot.model || slot.baseUrl)
        : !!slot.apiKey;
      card.classList.toggle('configured', hasConfig);
      card.classList.toggle('active', p === v2.active);
      const badge = card.querySelector('.provider-badge');
      if (badge) {
        badge.textContent = (p === v2.active && hasConfig) ? '★ active'
                          : (p === v2.active)             ? '★'
                          : hasConfig                     ? '✓'
                          : '';
        badge.classList.toggle('is-active', p === v2.active);
      }
      if (hasConfig) configured++;
    }
    if (providersCount) {
      providersCount.textContent = `${configured} of ${ALL_PROVIDERS.length} configured`;
    }
  }

  // Load a single provider's slot into the form fields.
  function loadSlotIntoForm(provider) {
    const v2 = readLLMConfig();
    const slot = v2.providers[provider] || emptyProviderSlot();
    keyInput.value = slot.apiKey || '';
    modelInput.value = slot.model || '';
    baseUrlInput.value = slot.baseUrl || '';
    // Always reset the placeholder + hint for the new provider, even if values
    // are present (so the user can see the default model id).
    modelInput.placeholder = (window.LLM?.DEFAULTS[provider]?.model) || 'Pick a suggestion below, or type a custom id';
    baseUrlInput.placeholder = (window.LLM?.DEFAULTS[provider]?.baseUrl) || '';
    // Chip row: persisted slot.models (last successful Test) → fallback to hardcoded.
    populateModelChips((slot.models && slot.models.length) ? slot.models : MODEL_FALLBACK[provider]);
    reflectProvider(provider);
  }

  function loadIntoForm() {
    const v2 = readLLMConfig();
    providerInputs.forEach(r => { r.checked = (r.value === v2.active); });
    autoDoneSelect.value = String(v2.autoDoneThreshold ?? -1);
    loadSlotIntoForm(v2.active);
    refreshProviderBadges();
  }

  // Subtab switching inside the Settings dialog.
  const settingsSubtabs = overlay.querySelectorAll('.settings-subtabs button[data-settings-tab]');
  const settingsPanels  = overlay.querySelectorAll('.settings-tab-panel');
  function showSettingsTab(name) {
    const target = (['grading', 'backup', 'sync'].includes(name)) ? name : 'grading';
    settingsPanels.forEach(p => { p.hidden = (p.dataset.settingsTab !== target); });
    settingsSubtabs.forEach(b => { b.classList.toggle('active', b.dataset.settingsTab === target); });
    storageSet(KEY.settingsTab, target);
  }
  settingsSubtabs.forEach(b => {
    b.addEventListener('click', () => showSettingsTab(b.dataset.settingsTab));
  });

  function open() {
    loadIntoForm();
    showSettingsTab(storageGet(KEY.settingsTab, 'grading'));
    overlay.hidden = false;
  }
  function shut() { overlay.hidden = true; status.textContent = ''; }

  toggle?.addEventListener('click', open);
  close?.addEventListener('click', shut);
  overlay?.addEventListener('click', (e) => { if (e.target.id === 'settings-overlay') shut(); });

  // Radio change: switch the form view to the clicked provider's saved slot.
  // No save happens until the user hits Save explicitly.
  providerInputs.forEach(r => r.addEventListener('change', () => {
    if (r.checked) loadSlotIntoForm(r.value);
  }));

  save?.addEventListener('click', () => {
    const provider = currentProvider();
    const v2 = readLLMConfig();
    v2.providers[provider] = {
      ...(v2.providers[provider] || emptyProviderSlot()),
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
      // Don't drop persisted .models on save — Test refreshes them.
    };
    v2.active = provider;
    v2.autoDoneThreshold = parseInt(autoDoneSelect.value, 10);
    writeLLMConfig(v2);
    // Defensive: re-anchor the form DOM to the freshly-saved active slot in
    // case anything in the click path drifted.
    providerInputs.forEach(r => { r.checked = (r.value === v2.active); });
    loadSlotIntoForm(v2.active);
    refreshProviderBadges();
    // Make activation explicit in the confirmation so the user can never wonder
    // "which provider just became active?"
    status.textContent = `✓ Saved — ${provider} is now active`;
    setTimeout(() => { status.textContent = ''; }, 1800);
    // Notify already-rendered widgets so the "Using X (Y)" hint refreshes in
    // place — works in Quiz mode where renderBrowse() never runs.
    emitLLMSettingsChange();
    // Refresh the visible cards so the answer-box hint reflects the new provider/key state.
    if (State.mode === 'browse') renderBrowse();
  });

  // Clear *only* the currently-selected provider's slot. If that was the
  // active one, the active selector falls back to the first remaining
  // configured provider (or anthropic if none are configured).
  clearOne?.addEventListener('click', () => {
    const provider = currentProvider();
    if (!confirm(`Clear saved config for ${provider}? (Other providers' configs are kept.)`)) return;
    const v2 = readLLMConfig();
    v2.providers[provider] = emptyProviderSlot();
    if (v2.active === provider) {
      const fallback = ALL_PROVIDERS.find(p => p !== provider && (v2.providers[p]?.apiKey || (p === 'ollama' && (v2.providers[p]?.model || v2.providers[p]?.baseUrl))));
      v2.active = fallback || 'anthropic';
    }
    writeLLMConfig(v2);
    // Re-select the active provider's radio so the form reflects reality.
    providerInputs.forEach(r => { r.checked = (r.value === v2.active); });
    loadSlotIntoForm(v2.active);
    refreshProviderBadges();
    status.textContent = `✓ Cleared ${provider}`;
    setTimeout(() => { status.textContent = ''; }, 1500);
    if (State.mode === 'browse') renderBrowse();
  });

  clearBtn?.addEventListener('click', () => {
    if (!confirm('Clear ALL providers (API keys, models, baseUrls)? Answers and progress are not affected.')) return;
    storageSet(KEY.llmSettings, null);
    storageSet(KEY.privacyAck, false);
    loadIntoForm();
    status.textContent = '✓ Cleared all';
    setTimeout(() => { status.textContent = ''; }, 1200);
    if (State.mode === 'browse') renderBrowse();
  });

  // Test connection: probe the provider's list-models endpoint, repopulate the
  // model dropdown with the live response on success. Persist that model list
  // into the provider's slot so the chips appear next time without re-Testing.
  testBtn?.addEventListener('click', async () => {
    if (!testStatus) return;
    const provider = currentProvider();
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
        if (r.models?.length) {
          populateModelChips(r.models);
          // Persist into the provider's slot.
          setProviderSlot(provider, { models: r.models });
        }
      } else {
        testStatus.className = 'test-status err';
        let msg = `✗ ${r.message} (${latency})`;
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

  // Filterable model-suggestion picker. Type `qwen-plus` to narrow the
  // chip list; Enter accepts the first visible chip; "+ N more" toggles
  // the full scrollable view. Avoids the 100+ chip brick-wall on Qwen.
  document.getElementById('settings-model-filter')?.addEventListener('input', renderModelChips);
  document.getElementById('settings-model-filter')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.querySelector('#settings-model-suggestions .model-chip')?.click();
    }
  });
  document.getElementById('settings-model-show-all')?.addEventListener('click', () => {
    _modelChipState.expanded = !_modelChipState.expanded;
    renderModelChips();
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
      // v2 shape: scrub every provider's apiKey. v1 legacy: scrub the top-level
      // apiKey field. In both cases the resulting payload contains no key bytes.
      if (val.providers) {
        const scrubbed = { ...val, providers: {} };
        for (const [pk, slot] of Object.entries(val.providers)) {
          scrubbed.providers[pk] = { ...(slot || {}), apiKey: '' };
        }
        val = scrubbed;
      } else {
        val = Object.assign({}, val, { apiKey: '' });
      }
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
    if (k === KEY.llmSettings && v && typeof v === 'object') {
      const existing = storageGet(k, {}) || {};
      // Preserve any apiKeys already present locally for providers whose slot
      // is being imported empty (e.g. a Backup file that was exported with
      // keys scrubbed). Works for both v1 and v2 shapes.
      if (v.providers && existing.providers) {
        for (const [pk, slot] of Object.entries(v.providers)) {
          if (slot && !slot.apiKey && existing.providers[pk]?.apiKey) {
            v.providers[pk] = { ...slot, apiKey: existing.providers[pk].apiKey };
          }
        }
      } else if (!v.apiKey && existing.apiKey) {
        v.apiKey = existing.apiKey;
      }
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

// Centralised sync controller. Owns the in-flight op (module-scope, not
// persisted) and persistent meta (cka:sync:meta — rides along in Backup /
// Gist Push via collectExportable's cka:* prefix walk).
const Sync = (() => {
  const subs = new Set();
  let inFlight = null; // { op: 'push'|'pull'|'test', startedAt: ISO } | null

  function loadMeta() { return storageGet(KEY.syncMeta, {}) || {}; }
  function saveMeta(m) { storageSet(KEY.syncMeta, m); }

  function getState() { return { inFlight, meta: loadMeta() }; }
  function notify() { for (const fn of subs) { try { fn(getState()); } catch {} } }

  function subscribe(fn) {
    subs.add(fn);
    try { fn(getState()); } catch {}
    return () => subs.delete(fn);
  }

  async function _run(op, doFn) {
    if (inFlight) throw new Error(`A ${inFlight.op} is already in progress`);
    inFlight = { op, startedAt: new Date().toISOString() };
    notify();
    try {
      const r = await doFn();
      const meta = loadMeta();
      const key = `last${op[0].toUpperCase()}${op.slice(1)}At`;
      meta[key] = new Date().toISOString();
      meta.lastError = null;
      saveMeta(meta);
      inFlight = null;
      notify();
      return r;
    } catch (e) {
      const meta = loadMeta();
      meta.lastError = {
        op,
        message: e.message || String(e),
        at: new Date().toISOString(),
        seen: false,
      };
      saveMeta(meta);
      inFlight = null;
      notify();
      throw e;
    }
  }

  function acknowledgeError() {
    const meta = loadMeta();
    if (!meta.lastError || meta.lastError.seen) return;
    meta.lastError = { ...meta.lastError, seen: true };
    saveMeta(meta);
    notify();
  }

  return {
    getState, subscribe, notify, acknowledgeError,
    runPush: () => _run('push', doGistPush),
    runPull: () => _run('pull', doGistPull),
    runTest: () => _run('test', doGistTest),
  };
})();

// Compact "2 min ago" / "just now" formatter used by the sync surfaces.
function humanTimeAgo(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 10)    return 'just now';
  if (s < 60)    return `${Math.round(s)}s ago`;
  if (s < 3600)  return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
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

  function renderStatus({ inFlight, meta }) {
    if (!status) return;
    if (!window.GistSync) { status.textContent = '✗ sync.js failed to load'; return; }
    if (inFlight) {
      status.textContent = `⏳ ${inFlight.op[0].toUpperCase()}${inFlight.op.slice(1)}ing…`;
      return;
    }
    const lines = [];
    if (meta.lastError) {
      lines.push(`✗ Last ${meta.lastError.op} failed (${humanTimeAgo(meta.lastError.at)}): ${meta.lastError.message}`);
    }
    if (meta.lastPushAt) lines.push(`⬆ Last push: ${humanTimeAgo(meta.lastPushAt)}`);
    if (meta.lastPullAt) lines.push(`⬇ Last pull: ${humanTimeAgo(meta.lastPullAt)}`);
    if (meta.lastTestAt) lines.push(`✓ Last test: ${humanTimeAgo(meta.lastTestAt)}`);
    status.replaceChildren();
    for (const l of lines) {
      const d = document.createElement('div');
      d.textContent = l;
      status.appendChild(d);
    }
  }
  Sync.subscribe(renderStatus);

  if (!window.GistSync) return;

  pushBtn?.addEventListener('click', async () => {
    persistInputs();
    try {
      const id = await Sync.runPush();
      idInput.value = id;
    } catch {}   // surfaced via the subscription
  });

  pullBtn?.addEventListener('click', async () => {
    persistInputs();
    try {
      const payload = await Sync.runPull();
      if (!confirmPullOverwrite(payload)) return;
      importPayload(payload);
      setTimeout(() => location.reload(), 500);
    } catch {}
  });

  testBtn?.addEventListener('click', async () => {
    try { await Sync.runTest(); } catch {}
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

  function renderHeader() {
    const id = getGistId();
    const token = getGistToken();
    if (id) idLabel.textContent = `gist ${id.slice(0, 8)}…`;
    else if (token) idLabel.textContent = 'no gist yet';
    else idLabel.textContent = 'not configured';
  }

  function renderStatus({ inFlight, meta }) {
    const token = getGistToken();
    const id = getGistId();
    const hasToken = !!token;

    // Disabled state — same logic as before, plus in-flight lock-out.
    pushBtn.disabled = !hasToken || !!inFlight;
    pullBtn.disabled = !hasToken || !id || !!inFlight;
    testBtn.disabled = !hasToken || !!inFlight;

    // Status block — in-flight wins; then errors; then "last X" history.
    status.replaceChildren();
    if (!hasToken) {
      status.textContent = 'Configure a GitHub PAT in Settings first';
      return;
    }
    if (inFlight) {
      status.textContent = `⏳ ${inFlight.op[0].toUpperCase()}${inFlight.op.slice(1)}ing…`;
      return;
    }
    const lines = [];
    if (meta.lastError) {
      lines.push(`✗ Last ${meta.lastError.op} failed (${humanTimeAgo(meta.lastError.at)}): ${meta.lastError.message}`);
    }
    if (meta.lastPushAt) lines.push(`⬆ Last push: ${humanTimeAgo(meta.lastPushAt)}`);
    if (meta.lastPullAt) lines.push(`⬇ Last pull: ${humanTimeAgo(meta.lastPullAt)}`);
    if (meta.lastTestAt) lines.push(`✓ Last test: ${humanTimeAgo(meta.lastTestAt)}`);
    if (!lines.length) {
      status.textContent = 'Ready';
      return;
    }
    for (const l of lines) {
      const d = document.createElement('div');
      d.textContent = l;
      status.appendChild(d);
    }
  }

  let unsubscribe = null;
  function openMenu() {
    renderHeader();
    unsubscribe = Sync.subscribe(renderStatus);
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    // The user is now looking at the error — clear the "unread" flag so the
    // ☁ icon's red dot turns off.
    Sync.acknowledgeError();
  }
  function closeMenu() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
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
    try { await Sync.runPush(); renderHeader(); }
    catch {}      // already surfaced via the subscription
  });

  pullBtn?.addEventListener('click', async () => {
    try {
      const payload = await Sync.runPull();
      if (!confirmPullOverwrite(payload)) return;
      importPayload(payload);
      setTimeout(() => location.reload(), 500);
    } catch {}
  });

  testBtn?.addEventListener('click', async () => {
    try { await Sync.runTest(); } catch {}
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

// ---------- Header 🤖 LLM quick-switch popover ----------
//
// Lists every CONFIGURED provider (has apiKey, or Ollama with a model/baseUrl
// set). Click → flip v2.active → emit settings-change → in-place hint
// refresh + popover re-render. The full ⚙️ Settings modal stays the single
// place to edit keys / baseUrl / model — this popover only flips which slot
// is active.
function installLlmMenu() {
  const toggle = document.getElementById('llm-toggle');
  const menu = document.getElementById('llm-menu');
  const currentLabel = document.getElementById('llm-menu-current');
  const listEl = document.getElementById('llm-menu-list');
  const statusEl = document.getElementById('llm-menu-status');
  const settingsLink = document.getElementById('llm-menu-settings');
  if (!toggle || !menu) return;

  function isConfigured(provider, slot) {
    if (!slot) return false;
    return provider === 'ollama' ? !!(slot.model || slot.baseUrl) : !!slot.apiKey;
  }

  function defaultModel(provider) {
    return (window.LLM && window.LLM.DEFAULTS && window.LLM.DEFAULTS[provider] && window.LLM.DEFAULTS[provider].model) || 'default';
  }

  function renderList() {
    const cfg = readLLMConfig();
    listEl.innerHTML = '';
    const configured = ALL_PROVIDERS.filter(p => isConfigured(p, cfg.providers[p]));
    if (!configured.length) {
      listEl.appendChild(el('div', { class: 'muted llm-menu-empty' }, 'No providers configured yet — open Settings.'));
      currentLabel.textContent = '(none)';
      return;
    }
    for (const p of configured) {
      const slot = cfg.providers[p];
      const model = slot.model || defaultModel(p);
      const isActive = cfg.active === p;
      const row = el('button', {
        type: 'button',
        class: 'llm-menu-row' + (isActive ? ' active' : ''),
        'data-provider': p,
        role: 'menuitem',
      },
        el('span', { class: 'llm-menu-row-name' }, p),
        el('span', { class: 'llm-menu-row-model muted' }, model),
        el('span', { class: 'llm-menu-row-check' }, isActive ? '✓' : ''),
      );
      row.addEventListener('click', () => {
        if (isActive) { closeMenu(); return; }
        const v2 = readLLMConfig();
        v2.active = p;
        writeLLMConfig(v2);
        emitLLMSettingsChange();
        renderList();
        statusEl.textContent = `✓ Now using ${p}`;
        setTimeout(() => { statusEl.textContent = ''; }, 1800);
      });
      listEl.appendChild(row);
    }
    const activeSlot = cfg.providers[cfg.active];
    if (activeSlot && isConfigured(cfg.active, activeSlot)) {
      currentLabel.textContent = `${cfg.active} · ${activeSlot.model || defaultModel(cfg.active)}`;
    } else {
      currentLabel.textContent = '(not configured)';
    }
  }

  function openMenu() {
    renderList();
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    statusEl.textContent = '';
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });

  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (menu.contains(e.target) || toggle.contains(e.target)) return;
    closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
  });

  settingsLink?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMenu();
    document.getElementById('settings-toggle')?.click();
  });
}

// Always-on dot on the ☁ toggle. Reflects in-flight / unread-error / recent-
// success state so the user gets passive feedback without keeping the
// popover open.
function installSyncDotIndicator() {
  const dot = document.querySelector('#sync-toggle .sync-dot');
  if (!dot) return;
  let fadeTimer = null;

  function render({ inFlight, meta }) {
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    dot.className = 'sync-dot';
    if (inFlight) {
      dot.classList.add('sync-dot--in-flight');
      dot.hidden = false;
      return;
    }
    if (meta.lastError && !meta.lastError.seen) {
      dot.classList.add('sync-dot--error');
      dot.hidden = false;
      return;
    }
    // Green dot for ~30s after a successful op so a closed-popover sync still
    // surfaces a signal.
    const last = Math.max(
      meta.lastPushAt ? Date.parse(meta.lastPushAt) : 0,
      meta.lastPullAt ? Date.parse(meta.lastPullAt) : 0,
      meta.lastTestAt ? Date.parse(meta.lastTestAt) : 0,
    );
    const SHOW_MS = 30_000;
    const age = last ? Date.now() - last : Infinity;
    if (last && age < SHOW_MS) {
      dot.classList.add('sync-dot--ok');
      dot.hidden = false;
      // Re-render once when the green window closes so the dot disappears
      // without a leak.
      fadeTimer = setTimeout(() => Sync.notify(), SHOW_MS - age + 50);
      return;
    }
    dot.hidden = true;
  }
  Sync.subscribe(render);
}

// ---------- Header 🔄 refresh + update-available banner ----------

function installRefreshAffordances() {
  document.getElementById('refresh-toggle')?.addEventListener('click', manualRefresh);
  document.getElementById('update-refresh')?.addEventListener('click', manualRefresh);
  document.getElementById('update-dismiss')?.addEventListener('click', () => {
    const b = document.getElementById('update-banner');
    if (b) b.hidden = true;
  });
  // Run the check after we've yielded so the first paint isn't blocked.
  setTimeout(checkForUpdate, 1500);
}

// Click handler for both the header 🔄 button and the in-banner Refresh button.
// Pre-checks `version.json` against the bundled `generatedAt`:
//   - unchanged  → toast "✓ Already up to date" and DO NOT reload
//   - newer      → toast "✨ New content — reloading…" then bust-the-cache reload
//   - fetch fail → toast "✗ Refresh check failed"
// Without this pre-check, clicks always reload, leaving the user with no signal
// that anything happened (especially painful when content is unchanged).
async function manualRefresh() {
  const btn = document.getElementById('refresh-toggle');
  btn?.classList.add('refreshing');
  try {
    const here = State.data?.generatedAt || '';
    const r = await fetch('version.json?_rev=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('version.json: HTTP ' + r.status);
    const v = await r.json();
    if (v?.generatedAt && v.generatedAt !== here) {
      showRefreshToast(`✨ New content (built ${formatBuildTime(v.generatedAt)}) — reloading…`, 'ok');
      setTimeout(() => {
        const u = new URL(location.href);
        u.searchParams.set('_rev', String(Date.now()));
        location.replace(u.toString());
      }, 700);
    } else {
      showRefreshToast(`✓ Already up to date (built ${formatBuildTime(here)})`, 'ok');
      btn?.classList.remove('refreshing');
    }
  } catch {
    showRefreshToast('✗ Refresh check failed — try again', 'err');
    btn?.classList.remove('refreshing');
  }
}

function showRefreshToast(msg, kind) {
  // Single-slot toast — any previous one is replaced.
  document.querySelectorAll('.refresh-toast').forEach(el => el.remove());
  const t = document.createElement('div');
  t.className = 'refresh-toast refresh-toast--' + (kind === 'err' ? 'err' : 'ok');
  t.textContent = msg;
  t.setAttribute('role', 'status');
  document.body.appendChild(t);
  // Auto-dismiss: 4s for errors so the user has time to read, 3s otherwise.
  setTimeout(() => t.remove(), kind === 'err' ? 4000 : 3000);
}

function formatBuildTime(iso) {
  if (!iso) return '?';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

async function checkForUpdate() {
  try {
    const resp = await fetch('version.json', { cache: 'no-cache' });
    if (!resp.ok) return;
    const v = await resp.json();
    if (!v?.generatedAt || !State.data?.generatedAt) return;
    if (v.generatedAt !== State.data.generatedAt) {
      const banner = document.getElementById('update-banner');
      if (banner) banner.hidden = false;
    }
  } catch {
    // Offline / CORS / fetch blocked — silently ignore.
  }
}

// ---------- Auto-grading UI (textarea + Check + verdict) ----------

// CodeMirror 6 — lazy-loaded from esm.sh on first answer-box focus. ~120 KB
// over the wire, cached by the browser; we cache the module promise so a
// second editor instance reuses the same download.
let _cmPromise = null;
function loadCodeMirror() {
  if (_cmPromise) return _cmPromise;
  _cmPromise = (async () => {
    // CM6's facet resolver does `instanceof` checks, so every package on the
    // graph MUST resolve `@codemirror/state` and `@codemirror/view` to the
    // exact same URL. esm.sh's default resolution returns semver-range URLs
    // which the browser sees as distinct modules from our direct exact-version
    // imports — triggering "multiple instances of @codemirror/state are loaded"
    // on Chrome 149.
    //
    // Solution: pin every package's transitive state+view with `?deps=…` so
    // esm.sh rewrites all references to *one* canonical variant URL, and use
    // versions recent enough that the transitive packages (autocomplete via
    // basicSetup, language, etc.) can find their expected exports. The
    // previous pin to view@6.26.3 + state@6.4.1 made language@6.12.3 attempt
    // to import `activateHover` from a stale view variant that didn't have it.
    // IMPORTANT — past failed attempts to add bash highlighting (DO NOT repeat
    // without solving the underlying issue first):
    //   1. Adding `@codemirror/language` or `@lezer/highlight` to this DEPS
    //      cascade. esm.sh re-bakes transitive packages and silently breaks
    //      basicSetup's extension array — net effect was monochrome editor
    //      with NO line numbers either (commit ca19cc9).
    //   2. Adding `syntaxHighlighting(defaultHighlightStyle, {fallback:true})`
    //      as a parallel extension to compensate. Doesn't help if basicSetup
    //      itself was broken upstream.
    //   3. Switching the language extension from yaml() to
    //      StreamLanguage.define(shell) without (1)+(2). Mounts cleanly but
    //      tokens never get styled — the two `@lezer/highlight` instances
    //      (one transitive from basicSetup, one from our explicit import)
    //      fail `instanceof` checks on tag identity (commit e085d9f).
    // The right path for bash highlighting needs a different architecture —
    // browser <script type="importmap"> in index.html so every @codemirror/*
    // specifier resolves to one canonical URL, OR self-host a pre-bundled CM
    // build under docs/vendor/. Tracked as a separate follow-up.
    const DEPS = 'deps=@codemirror/state@6.5.2,@codemirror/view@6.43.1&target=es2022';
    const [view, state, basic, langYaml, commands] = await Promise.all([
      import(`https://esm.sh/@codemirror/view@6.43.1?${DEPS}`),
      import('https://esm.sh/@codemirror/state@6.5.2?target=es2022'),
      import(`https://esm.sh/codemirror@6.0.1?${DEPS}`),
      import(`https://esm.sh/@codemirror/lang-yaml@6.1.3?${DEPS}`),
      import(`https://esm.sh/@codemirror/commands@6.10.3?${DEPS}`),
    ]);
    return {
      EditorView: view.EditorView,
      EditorState: state.EditorState,
      Prec: state.Prec,
      basicSetup: basic.basicSetup,
      yaml: langYaml.yaml,
      keymap: view.keymap,
      indentWithTab: commands.indentWithTab,
    };
  })().catch(e => { _cmPromise = null; throw e; });
  return _cmPromise;
}

// CodeMirror theme mapped to our existing CSS vars so dark/light mode and
// the accent colour follow whatever the user already set.
const CM_THEME = {
  '&': {
    background: 'var(--bg-code)',
    color: 'var(--fg)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '13px',
    padding: '8px 10px',
    caretColor: 'var(--accent)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-elev)',
    color: 'var(--fg-muted)',
    border: '0',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)',
  },
};

function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

// Visible breadcrumb when the lazy CodeMirror upgrade throws (e.g. esm.sh
// returned duplicate copies of @codemirror/state). Without this the user
// just sees a plain textarea and has no idea CM was supposed to upgrade —
// the previous `console.warn`-only path made debugging needlessly hard.
function showCmFailureBadge(labelRow, err) {
  if (!labelRow) return;
  let badge = labelRow.querySelector('.cm-fail-badge');
  if (!badge) {
    badge = el('span', { class: 'cm-fail-badge', role: 'status' }, '⚠ editor failed');
    labelRow.appendChild(badge);
  }
  badge.title = (err && err.message) ? err.message : 'CodeMirror upgrade failed — using plain textarea';
}
function clearCmFailureBadge(labelRow) {
  labelRow?.querySelector('.cm-fail-badge')?.remove();
}

function renderAnswerBox(ex, opts = {}) {
  const box = el('div', { class: 'answer-box' });
  // Label row also hosts the ⛶ fullscreen expand button.
  const labelRow = el('div', { class: 'answer-label' });
  labelRow.appendChild(el('span', { class: 'answer-label-text' }, '✏️ Your answer'));
  const expandBtn = el('button', {
    type: 'button',
    class: 'answer-expand',
    title: 'Expand to fullscreen — useful for long YAML manifests',
    'aria-label': 'Expand answer editor',
  }, '⛶');
  labelRow.appendChild(expandBtn);
  // Hidden until fullscreen via CSS — opens the Tools drawer over the editor
  // so the user can look up kubectl flags without exiting fullscreen.
  const toolsBtn = el('button', {
    type: 'button',
    class: 'answer-tools-btn',
    title: 'Open Tools (kubectl explain / kubectl -h) without closing fullscreen',
    'aria-label': 'Open Tools drawer',
  }, '🔧');
  labelRow.appendChild(toolsBtn);
  toolsBtn.addEventListener('click', () => { openToolsDrawer(); });
  // Same hidden-until-fullscreen pattern — surfaces the task body + docs
  // links over the fullscreen editor so the user doesn't have to exit to
  // re-read the question.
  const taskBtn = el('button', {
    type: 'button',
    class: 'answer-task-btn',
    title: 'Show the task description without closing fullscreen',
    'aria-label': 'Open task drawer',
  }, '📝');
  labelRow.appendChild(taskBtn);
  taskBtn.addEventListener('click', () => { openTaskDrawer(ex); });
  box.appendChild(labelRow);

  const ta = el('textarea', {
    class: 'answer-textarea',
    placeholder: 'Paste your kubectl commands or YAML manifest, then click Check…',
    rows: '4',
    spellcheck: 'false',
    autocomplete: 'off',
  });
  const saved = getAnswer(ex.id);
  if (saved && typeof saved.text === 'string') ta.value = saved.text;
  box.appendChild(ta);

  // Editor abstraction: starts as a plain textarea; upgrades to CodeMirror
  // lazily on first focus OR on entering fullscreen. getText / setText route
  // to whichever is active.
  let cmView = null;
  let _cmReadyPromise = null;
  // Invariant: after `ta.replaceWith(cmView.dom)` (inside upgradeToCodeMirror),
  // `ta` is a detached <textarea> whose `.value` is frozen at upgrade-time.
  // ALWAYS read live answer text via getText() and clear via setText('') —
  // never `ta.value` / `ta.value = ''`, or Check will re-grade the upgrade-time
  // snapshot and Reset will leave CodeMirror untouched.
  const getText = () => cmView ? cmView.state.doc.toString() : ta.value;
  const setText = (v) => {
    if (cmView) {
      cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: v } });
    } else {
      ta.value = v;
    }
  };

  // Debounced persist on every change — same contract as before.
  let saveTimer;
  const persistDebounced = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const existing = getAnswer(ex.id) || {};
      setAnswer(ex.id, Object.assign(existing, { text: getText() }));
    }, 400);
  };
  ta.addEventListener('input', persistDebounced);

  // Idempotent CM upgrade. Called from `focusin` (existing trigger) AND from
  // the fullscreen-toggle click (so users who never tap the textarea before
  // hitting ⛶ still get line numbers + Tab indent). The whole upgrade —
  // module load, EditorState build, EditorView mount — is wrapped in one
  // try/catch so any throw degrades to the plain textarea instead of
  // wedging _cmReadyPromise in a rejected state.
  function upgradeToCodeMirror() {
    if (cmView) return Promise.resolve(cmView);
    if (_cmReadyPromise) return _cmReadyPromise;
    _cmReadyPromise = (async () => {
      try {
        const cm = await loadCodeMirror();
        const { EditorView, EditorState, Prec, basicSetup, yaml, indentWithTab, keymap } = cm;
        const update = EditorView.updateListener.of(u => {
          if (u.docChanged) persistDebounced();
        });
        const state = EditorState.create({
          doc: ta.value,
          extensions: [
            basicSetup,
            // Prec.highest beats basicSetup's defaultKeymap binding for Tab,
            // which otherwise lets the key fall through to the browser's
            // focus-shift default.
            Prec.highest(keymap.of([indentWithTab])),
            // Language extension is `yaml()` — the corpus is heavy on YAML
            // manifests so this is the least-wrong default. Bash highlighting
            // is a known gap; see the cautionary comment in loadCodeMirror().
            yaml(),
            EditorView.lineWrapping,
            EditorView.theme(CM_THEME, { dark: isDark() }),
            // Layout theme — the outer .answer-cm container sets the height
            // (96-360 px normal, flex: 1; min-height: 60vh fullscreen) and CM
            // expands its scroller into that space. Without `height: 100%` on
            // `&`, the CM editor lays out at content-height and leaves a huge
            // empty area below in fullscreen.
            EditorView.theme({
              '&': { height: '100%' },
              '.cm-scroller': { overflow: 'auto' },
            }),
            update,
          ],
        });
        cmView = new EditorView({ state, parent: ta.parentNode });
        cmView.dom.classList.add('answer-cm');
        ta.replaceWith(cmView.dom);
        clearCmFailureBadge(labelRow);
        return cmView;
      } catch (e) {
        console.error('[answer-editor] CodeMirror upgrade failed:', e);
        showCmFailureBadge(labelRow, e);
        _cmReadyPromise = null;
        return null;
      }
    })();
    return _cmReadyPromise;
  }

  // Lazy upgrade on first focus. Pre-CM textarea remains fully functional
  // if the CDN load fails. On failure we re-arm the listener so a later
  // focus (e.g. after a transient esm.sh hiccup) retries automatically.
  function attemptUpgradeOnFocus() {
    upgradeToCodeMirror().then(view => {
      if (view) view.focus();
      else ta.addEventListener('focusin', attemptUpgradeOnFocus, { once: true });
    });
  }
  ta.addEventListener('focusin', attemptUpgradeOnFocus, { once: true });

  // ⛶ fullscreen toggle. Same CM instance / textarea stays mounted — we
  // just relocate its containing .answer-box via a CSS class. We also
  // trigger the CM upgrade here so users who go straight to fullscreen
  // (without focusing the textarea first) still get the real editor.
  expandBtn.addEventListener('click', () => {
    const onNow = box.classList.toggle('answer-fullscreen');
    expandBtn.textContent = onNow ? '✕' : '⛶';
    expandBtn.title = onNow ? 'Exit fullscreen (Esc)' : 'Expand to fullscreen — useful for long YAML manifests';
    if (onNow) {
      document.body.classList.add('answer-fullscreen-active');
      upgradeToCodeMirror().then(view => view?.focus());
    } else {
      document.body.classList.remove('answer-fullscreen-active');
    }
    // Track intent so Prev/Next/etc. don't dump the user out of fullscreen
    // when renderQuizCard rebuilds the answer-box (quiz mode only).
    _quizFullscreenSticky = onNow && !!opts.fromQuiz;
  });

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
  // Re-run on every active-provider change. The listener set is cleared at
  // the top of each render pass (renderBrowse / quiz session re-render) so
  // closures over removed DOM nodes don't leak.
  onLLMSettingsChange(updateHint);

  // Per-answer-box in-flight state. When non-null, the SAME checkBtn click
  // cancels instead of re-firing — so the button doubles as Cancel without
  // having to swap event listeners. Branch lives at the top of the handler.
  let inFlight = null;

  checkBtn.addEventListener('click', async () => {
    if (inFlight) {
      inFlight.controller.abort();
      return;
    }

    const answer = getText().trim();
    if (!answer) { hint.textContent = '⚠ Type an answer first'; return; }

    // First-use privacy gate (unless using Ollama, which stays local)
    const settings = getLLMSettings();
    const skipPrivacy = settings.provider === 'ollama' || storageGet(KEY.privacyAck, false);
    if (!skipPrivacy) {
      const ok = await openPrivacyDialog(settings.provider);
      if (!ok) return;
      storageSet(KEY.privacyAck, true);
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    let charsSeen = 0;
    inFlight = { controller };

    verdictSlot.innerHTML = '';
    // Labelled streaming card. Header carries the live elapsed/chars label so
    // the user always knows it's their request; body shows the raw response
    // tail. Both head and body are replaced by the parsed verdict on success.
    const head = el('div', { class: 'verdict-streaming-head' }, '📥 Streaming response · waiting…');
    const body = el('pre', { class: 'verdict-streaming-body', 'aria-live': 'polite' }, '');
    const card = el('div', { class: 'verdict-streaming' }, head, body);
    verdictSlot.appendChild(card);
    // In fullscreen mode (or any short viewport — e.g. DevTools open at the
    // bottom) the verdict slot sits below the editor + button row and lands
    // off-screen. `block: 'nearest'` only scrolls if the card isn't already
    // visible, so this is a no-op in the normal case.
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const updateBtn = () => {
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
      const label = charsSeen > 0
        ? `${secs}s · ${charsSeen.toLocaleString()} chars`
        : `${secs}s · waiting…`;
      checkBtn.textContent = `✗ Cancel (${label})`;
      head.textContent = `📥 Streaming response · ${label}`;
    };
    updateBtn();
    const tick = setInterval(updateBtn, 250);

    // Overall ceiling, independent of any per-fetch timeout. The streaming
    // adapters drop the 60s wrap because reads legitimately take longer; this
    // 120s cap is the long-stop. User can Cancel earlier.
    const ceiling = setTimeout(() => controller.abort(), 120000);

    try {
      const v = await window.LLM.grade({
        task: ex.task || '',
        solution: ex.solution || '',
        answer,
        settings,
        signal: controller.signal,
        onProgress: (_delta, total) => {
          charsSeen = total.length;
          body.textContent = total.slice(-400);
          body.scrollTop = body.scrollHeight;
        },
      });
      // Brief "Parsing verdict…" frame so the user perceives streaming →
      // parsing → result, instead of streaming → magic-appear.
      head.textContent = '🧠 Parsing verdict…';
      await new Promise(r => setTimeout(r, 200));
      // Persist + render the parsed verdict (replacing the streaming card).
      verdictSlot.innerHTML = '';
      const existing = getAnswer(ex.id) || {};
      setAnswer(ex.id, Object.assign(existing, { text: getText(), verdict: v }));
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
      verdictSlot.innerHTML = '';
      const aborted = e && (e.name === 'AbortError' || /aborted/i.test(e.message || ''));
      if (aborted) {
        const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
        verdictSlot.appendChild(el('div', { class: 'verdict-cancelled muted' },
          `✗ Cancelled after ${secs}s · ${charsSeen.toLocaleString()} chars received`));
      } else {
        verdictSlot.appendChild(el('div', { class: 'verdict verdict-error' },
          el('strong', {}, '✗ LLM call failed'),
          el('pre', { class: 'verdict-error-detail' }, e.message || String(e)),
        ));
      }
    } finally {
      clearInterval(tick);
      clearTimeout(ceiling);
      inFlight = null;
      checkBtn.textContent = '✓ Check';
    }
  });

  resetBtn.addEventListener('click', () => {
    setText('');
    verdictSlot.innerHTML = '';
    setAnswer(ex.id, { text: '', verdict: null });
    updateHint();
  });

  // Quiz-only: in-overlay control strip so Prev/Next/Got/Missed/Flag/Reveal
  // and the 📋 question navigator are reachable without exiting fullscreen.
  // The strip is hidden by CSS unless .answer-box.answer-fullscreen.
  // Buttons are thin proxies that .click() the real quiz controls so we don't
  // duplicate state — the real handlers in installQuizControls do the work.
  if (opts.fromQuiz) {
    const proxy = (id, label, extraClass) => {
      const btn = el('button', { type: 'button', class: extraClass || '' }, label);
      btn.addEventListener('click', () => {
        document.getElementById(id)?.click();
      });
      return btn;
    };
    const quizbar = el('div', { class: 'answer-fullscreen-quizbar' },
      proxy('quiz-nav-toggle', '📋 Questions'),
      proxy('quiz-prev',       '← Prev'),
      proxy('quiz-flag',       '🚩 Flag'),
      proxy('quiz-reveal',     '👁 Reveal'),
      el('span', { class: 'qbar-spacer' }),
      proxy('quiz-grade-got',  '✓ Got it',  'grade-got'),
      proxy('quiz-grade-miss', '✗ Missed',  'grade-miss'),
      proxy('quiz-skip',       '↷ Skip'),
      proxy('quiz-next',       'Next →'),
    );
    box.appendChild(quizbar);
  }

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
  if (v.truncated) {
    body.appendChild(el('div', { class: 'verdict-truncated-note' },
      '⚠ Grader response was truncated. Score / verdict are reliable; details may be partial. Try a different model or a longer-output provider for a richer breakdown.'));
  }
  if (v.summary) body.appendChild(el('div', { class: 'verdict-summary' }, v.summary));
  // Token usage line — pinned at grade-time so retrospective display (e.g.
  // after a Gist pull, or after the user switches active provider) always
  // shows what this particular grade actually consumed.
  if (v.usage && v.usage.totalTokens != null) {
    const u = v.usage;
    body.appendChild(el('div', { class: 'verdict-usage muted' },
      `🪙 ${v.provider || '?'} · ${v.model || '?'} · in ${u.inputTokens ?? '?'} + out ${u.outputTokens ?? '?'} = ${u.totalTokens} tokens`,
    ));
  } else if (v.provider === 'ollama') {
    body.appendChild(el('div', { class: 'verdict-usage muted' }, '🪙 Local model — no token accounting'));
  }
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
  // If the LLM thinks the answer is anything less than perfect, give the user
  // a one-click path to report a possibly over-specified reference solution.
  if (typeof v.score === 'number' && v.score < 100) {
    const reportLink = el('button', { type: 'button', class: 'verdict-report-link' },
      '🐛 Reference solution looks wrong? Report this mismatch');
    reportLink.addEventListener('click', () => {
      openFixReportModal(ex, { verdict: v, answer: getAnswer(ex.id)?.text || '' });
    });
    body.appendChild(reportLink);
  }
  container.appendChild(body);
}

// ---------- Tools drawer (over fullscreen answer editor) ----------

// We physically move the #view-tools DOM block into the drawer host on open
// and restore it on close. That preserves every event handler + every piece
// of internal Tools state (selected schema kind, search text, subtab choice)
// without refactoring renderToolsView() into a reusable component.
let _toolsDrawerOpen = false;
let _toolsOriginalParent = null;
let _toolsOriginalNext = null;

async function openToolsDrawer() {
  if (_toolsDrawerOpen) return;
  // At most one drawer at a time — opening Tools dismisses the Task drawer first.
  if (_taskDrawerOpen) closeTaskDrawer();
  const overlay = document.getElementById('tools-drawer-overlay');
  const host    = document.getElementById('tools-drawer-host');
  const view    = document.getElementById('view-tools');
  if (!overlay || !host || !view) return;

  _toolsOriginalParent = view.parentNode;
  _toolsOriginalNext   = view.nextSibling;

  view.hidden = false;
  view.classList.add('in-drawer');
  host.appendChild(view);

  // First-open: hydrate. Subsequent opens reuse the same DOM and state.
  if (!State.toolsLoaded) {
    try { await renderToolsView(); } catch (e) { console.warn('renderToolsView failed', e); }
    State.toolsLoaded = true;
  }

  overlay.hidden = false;
  _toolsDrawerOpen = true;
  // Capture-phase so we fire before the document-level Esc handler that
  // closes the fullscreen answer editor.
  document.addEventListener('keydown', _onToolsDrawerEsc, true);
  document.getElementById('tools-drawer-close').onclick = closeToolsDrawer;
  overlay.onclick = (e) => { if (e.target === overlay) closeToolsDrawer(); };
}

function closeToolsDrawer() {
  if (!_toolsDrawerOpen) return;
  const overlay = document.getElementById('tools-drawer-overlay');
  const view    = document.getElementById('view-tools');
  view.classList.remove('in-drawer');
  if (_toolsOriginalParent) {
    _toolsOriginalParent.insertBefore(view, _toolsOriginalNext || null);
  }
  // Only re-hide if the user is NOT actively in Tools mode (rare path).
  if (State.mode !== 'tools') view.hidden = true;
  _toolsOriginalParent = _toolsOriginalNext = null;
  overlay.hidden = true;
  _toolsDrawerOpen = false;
  document.removeEventListener('keydown', _onToolsDrawerEsc, true);
}

function _onToolsDrawerEsc(e) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  closeToolsDrawer();
}

// ---------- Task drawer (over fullscreen answer editor) ----------

// Mirrors the Tools drawer but the body is per-exercise so we re-render the
// host on each open instead of relocating a shared DOM block.
let _taskDrawerOpen = false;

function openTaskDrawer(ex) {
  if (_taskDrawerOpen) return;
  // At most one drawer at a time — opening Task dismisses the Tools drawer first.
  if (_toolsDrawerOpen) closeToolsDrawer();
  const overlay = document.getElementById('task-drawer-overlay');
  const host    = document.getElementById('task-drawer-host');
  const title   = document.getElementById('task-drawer-title');
  if (!overlay || !host || !title) return;

  const display = ex.title || ex.displayTitle || ex.fullTitle || 'Task';
  title.textContent = `📝 ${display} — ${ex.id}`;

  host.innerHTML = '';

  // Docs links — same row shape as the exercise card.
  const links = (ex.docsLinks && ex.docsLinks.length) ? ex.docsLinks
              : ex.docsLink ? [{ text: ex.docsLinkText || ex.docsLink, url: ex.docsLink }]
              : [];
  if (links.length) {
    const docs = el('div', { class: 'exercise-docs task-drawer-docs' });
    links.forEach((lnk, i) => {
      docs.appendChild(el('div', { class: 'exercise-docs-row' },
        el('span', { class: 'exercise-docs-icon' }, i === 0 ? '📖' : '↳'),
        el('a', { href: lnk.url, target: '_blank', rel: 'noopener' }, lnk.text),
      ));
    });
    host.appendChild(docs);
  }

  if (ex.task) {
    const taskMd = ex.task.replace(/^\s*\*\*Task:\*\*\s*\n+/, '');
    const task = el('div', { class: 'exercise-task task-drawer-task', html: renderMarkdown(taskMd) });
    task.querySelectorAll('blockquote').forEach(bq => {
      const first = bq.textContent.trim();
      if (first.startsWith('ℹ️') || first.startsWith('ℹ')) bq.classList.add('info-callout');
    });
    host.appendChild(task);
  }

  overlay.hidden = false;
  _taskDrawerOpen = true;
  document.addEventListener('keydown', _onTaskDrawerEsc, true);
  document.getElementById('task-drawer-close').onclick = closeTaskDrawer;
  overlay.onclick = (e) => { if (e.target === overlay) closeTaskDrawer(); };
}

function closeTaskDrawer() {
  if (!_taskDrawerOpen) return;
  const overlay = document.getElementById('task-drawer-overlay');
  overlay.hidden = true;
  _taskDrawerOpen = false;
  document.removeEventListener('keydown', _onTaskDrawerEsc, true);
}

function _onTaskDrawerEsc(e) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  closeTaskDrawer();
}

// ---------- Report a reference-solution problem ----------

const GH_REPO = 'xooooooooox/cka-exercises';

function truncate(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : (s || ''); }

// Strips the surrounding ```bash …``` fence (and any leading bold summary
// inserted by build-exercises.mjs when multiple <details> blocks were joined)
// so the report shows clean code the maintainer can diff against the source.
function extractReferenceCode(solutionMd) {
  if (!solutionMd) return '';
  const m = solutionMd.match(/```(?:bash|sh|yaml|yml)?\s*\n([\s\S]*?)```/);
  return m ? m[1].trimEnd() : solutionMd.trim();
}

// Issue-type catalog. Each option carries the templated bodies used to build
// the GitHub Issue, plus a GitHub label and an optional list of keywords used
// to auto-pre-select the type from a low-score LLM verdict's "missed" list.
// `whatsWrong: null` marks "Other" — it forces the user to put a note in the
// Additional Context field before they can submit.
const REPORT_TYPES = [
  {
    id: 'verification-bundled',
    label: 'Reference bundles verification commands with the actual answer',
    ghLabel: 'kind/verification-bundled',
    autoMissedKeywords: [
      'auth can-i', 'can-i', 'verify', 'verification', 'verifying',
      'kubectl get', 'kubectl describe', 'kubectl logs', 'check ',
    ],
    whatsWrong:
      "The reference solution's code-block includes verification commands " +
      "(e.g. `kubectl auth can-i`, `kubectl get`, `kubectl describe`) that " +
      "are not part of the task being asked. The LLM grader treats them as " +
      "required steps and penalises correct answers that omit them.",
    suggested:
      "Move verification commands out of the main solution code-block, or " +
      "split them with a `---` divider so the grader treats them as " +
      "supplementary. Keep only the commands that directly satisfy the task.",
  },
  {
    id: 'wrong-resource',
    label: 'Reference uses a wrong resource name / namespace / kind',
    ghLabel: 'kind/wrong-resource',
    autoMissedKeywords: [],
    whatsWrong:
      "The reference solution's resource details (name, namespace, kind, " +
      "label, etc.) don't match what the task asks for, so even a literally " +
      "correct answer is graded as incorrect.",
    suggested:
      "Align the reference resource name / namespace / kind with the task " +
      "statement.",
  },
  {
    id: 'outdated-flag',
    label: 'Reference uses an outdated or wrong kubectl flag / syntax',
    ghLabel: 'kind/outdated-flag',
    autoMissedKeywords: ['deprecated', 'unknown flag'],
    whatsWrong:
      "The reference uses a kubectl flag or syntax that's been deprecated, " +
      "renamed, or doesn't exist in the targeted k8s version.",
    suggested:
      "Replace with the current flag/syntax. Verify against " +
      "`kubectl <verb> -h` for the targeted version.",
  },
  {
    id: 'missing-step',
    label: 'Reference is incomplete (missing a required step)',
    ghLabel: 'kind/missing-step',
    autoMissedKeywords: [],
    whatsWrong:
      "The reference solution doesn't actually fulfil the task — at least " +
      "one required step is missing or stops short.",
    suggested: "Add the missing step(s) so the reference is end-to-end correct.",
  },
  {
    id: 'typo',
    label: 'Typo / formatting issue',
    ghLabel: 'kind/typo',
    autoMissedKeywords: [],
    whatsWrong:
      "There's a typo or formatting issue in the reference (broken code " +
      "fence, wrong indentation, wrong character, etc.).",
    suggested: "Apply a small text correction.",
  },
  {
    id: 'other',
    label: 'Other (describe below)',
    ghLabel: 'kind/other',
    autoMissedKeywords: [],
    whatsWrong: null,
    suggested: null,
  },
];

// Task-mode issue catalog. Same shape as REPORT_TYPES; routed via mode='task'
// to a separate label namespace (`task-fix,kind/...`) so the maintainer can
// triage task/docs issues separately from reference-solution mismatches.
const TASK_REPORT_TYPES = [
  {
    id: 'missing-docs-link',
    label: 'Task is missing a relevant kubernetes.io docs link',
    ghLabel: 'kind/missing-docs-link',
    whatsWrong:
      'The task references concepts or commands whose canonical kubernetes.io ' +
      'page is not linked from the `> 🔗` block.',
    suggested:
      "Add the kubernetes.io URL listed below under \"Suggested docs link\" " +
      "to the exercise's `> 🔗` lines.",
  },
  {
    id: 'incorrect-docs-link',
    label: 'An existing docs link points to the wrong kubernetes.io page',
    ghLabel: 'kind/incorrect-docs-link',
    whatsWrong:
      "A current breadcrumb on the task doesn't match the kubernetes.io page " +
      'it links to, or the link no longer matches the task.',
    suggested: 'Replace the offending link below with the correct breadcrumb + URL.',
  },
  {
    id: 'outdated-breadcrumb',
    label: "Docs link's breadcrumb text drifted from kubernetes.io",
    ghLabel: 'kind/outdated-breadcrumb',
    whatsWrong:
      "The breadcrumb label on the link is stale relative to kubernetes.io's " +
      'current navigation.',
    suggested: "Update the breadcrumb text to match the page's current title path.",
  },
  {
    id: 'unclear-task',
    label: 'Task wording is ambiguous or unclear',
    ghLabel: 'kind/unclear-task',
    whatsWrong:
      'The task statement is open to multiple correct interpretations, so the ' +
      'reference solution is hard to align with.',
    suggested:
      'Tighten the task wording (specify resource names, namespaces, expected ' +
      'output, etc.).',
  },
  {
    id: 'factual-error',
    label: 'Task contains a factual error about Kubernetes behaviour',
    ghLabel: 'kind/factual-error',
    whatsWrong:
      'The task asserts something that is wrong or out-of-date about Kubernetes ' +
      '(flag, default, behaviour, etc.).',
    suggested:
      'Correct the factual claim against the current k8s docs / `kubectl <verb> -h`.',
  },
  {
    id: 'typo',
    label: 'Typo / formatting issue in the task body',
    ghLabel: 'kind/typo-task',
    whatsWrong:
      'There is a typo or formatting issue in the task body or its docs-link block.',
    suggested: 'Apply a small text correction.',
  },
  {
    id: 'other',
    label: 'Other (describe below)',
    ghLabel: 'kind/other',
    whatsWrong: null,
    suggested: null,
  },
];

function getReportType(id, mode = 'solution') {
  const list = mode === 'task' ? TASK_REPORT_TYPES : REPORT_TYPES;
  return list.find(t => t.id === id) || list[list.length - 1];
}

function autoDetectType(ctx) {
  if (!ctx || !ctx.verdict || !Array.isArray(ctx.verdict.missed)) return null;
  const haystack = ctx.verdict.missed.join(' ').toLowerCase();
  for (const t of REPORT_TYPES) {
    if (t.autoMissedKeywords && t.autoMissedKeywords.some(k => haystack.includes(k))) {
      return t.id;
    }
  }
  return null;
}

function renderReportMarkdown(ex, draft, ctx, mode = 'solution') {
  const exerciseHash = `https://xooooooooox.github.io/cka-exercises/#/exercise/${ex.id}`;
  const sourceFile = ex.sourceFile || 'exercises/(unknown).md';
  const t = getReportType(draft.type, mode);
  const lines = [];
  lines.push('## Exercise');
  lines.push(`- **ID:** \`${ex.id}\``);
  lines.push(`- **Title:** ${ex.title || ex.displayTitle || ex.fullTitle || ''}`);
  lines.push(`- **Source file:** \`${sourceFile}\``);
  lines.push(`- **App link:** ${exerciseHash}`);
  lines.push(`- **Issue type:** ${t.label}`);
  lines.push('');
  if (t.whatsWrong) {
    lines.push('## What looks wrong');
    lines.push(t.whatsWrong);
    lines.push('');
    lines.push('## Suggested fix');
    lines.push(t.suggested);
    lines.push('');
  }
  if (draft.additional) {
    lines.push('## Additional context');
    lines.push(draft.additional);
    lines.push('');
  }
  if (mode === 'task') {
    // For doc-link-targeted issue types, surface the structured suggestion
    // up top so the maintainer doesn't have to scroll.
    if (draft.suggestedUrl) {
      lines.push('## Suggested docs link');
      lines.push(`- ${draft.suggestedUrl}`);
      lines.push('');
    }
    const links = Array.isArray(ex.docsLinks) ? ex.docsLinks : [];
    if (draft.existingLinkIdx != null && draft.existingLinkIdx !== ''
        && links[Number(draft.existingLinkIdx)]) {
      const pick = links[Number(draft.existingLinkIdx)];
      lines.push('## Link to change');
      lines.push(`- [${pick.text}](${pick.url})`);
      lines.push('');
    }
    if (ex.task) {
      lines.push('## Current task');
      lines.push(String(ex.task).replace(/^\s*\*\*Task:\*\*\s*\n+/, '').trim());
      lines.push('');
    }
    if (links.length) {
      lines.push('## Current docs links');
      for (const l of links) lines.push(`- [${l.text}](${l.url})`);
      lines.push('');
    }
  } else {
    const refCode = extractReferenceCode(ex.solution);
    lines.push('## Current reference solution');
    lines.push('```bash');
    lines.push(refCode);
    lines.push('```');
    lines.push('');
    if (ctx && ctx.includeContext && ctx.answer) {
      lines.push('## My answer');
      lines.push('```bash');
      lines.push(String(ctx.answer).trim());
      lines.push('```');
      lines.push('');
    }
    if (ctx && ctx.includeContext && ctx.verdict) {
      const v = ctx.verdict;
      lines.push('## LLM verdict');
      lines.push(`- Score: **${v.score} / 100**`);
      lines.push(`- Verdict: ${v.verdict || 'n/a'}`);
      if (v.summary) lines.push(`- Summary: ${v.summary}`);
      if (Array.isArray(v.passed) && v.passed.length) {
        lines.push('- Got right:');
        for (const s of v.passed) lines.push(`  - ${s}`);
      }
      if (Array.isArray(v.missed) && v.missed.length) {
        lines.push('- Missed (per grader):');
        for (const s of v.missed) lines.push(`  - ${s}`);
      }
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('*Reported via the cka-exercises web app.*');
  return lines.join('\n');
}

function buildIssueTitle(ex, mode = 'solution') {
  const tag = mode === 'task' ? 'Task / docs issue' : 'Reference solution mismatch';
  return `[${ex.id}] ${tag}: ${truncate(ex.title || ex.displayTitle || ex.fullTitle || '', 60)}`;
}

// Title + labels only — deliberately NO body. Long URL-encoded bodies fail two
// ways in the wild: GitHub's iOS app strips every query param after Universal
// Links interception, and GitHub's unauthenticated `?return_to=…` auth round
// trip 500s on heavily-encoded long return paths. The markdown body is sent
// to the clipboard separately so the user pastes it after landing on the form.
function buildIssueUrl(ex, draft, mode = 'solution') {
  const t = getReportType(draft.type, mode);
  const u = new URL(`https://github.com/${GH_REPO}/issues/new`);
  u.searchParams.set('title', buildIssueTitle(ex, mode));
  const topLabel = mode === 'task' ? 'task-fix' : 'answer-fix';
  u.searchParams.set('labels', `${topLabel},${t.ghLabel}`);
  return u.toString();
}

function openFixReportModal(ex, ctx = {}) {
  const overlay = document.getElementById('report-overlay');
  if (!overlay) return;
  const $ = (id) => overlay.querySelector('#' + id);
  const mode = ctx.mode === 'task' ? 'task' : 'solution';
  overlay.dataset.reportMode = mode;
  const types = mode === 'task' ? TASK_REPORT_TYPES : REPORT_TYPES;

  const exIdSpan = $('report-ex-id');
  const exTitle = $('report-ex-title');
  const exSource = $('report-ex-source');
  const currentSol = $('report-current-solution');
  const verdictBlock = $('report-verdict-block');
  const verdictBody = $('report-verdict-body');
  const headerH2 = $('report-title');
  const solutionRadioGroup = $('report-type-group');
  const taskRadioGroup = $('report-task-type-group');
  const taskCurrent = $('report-task-current');
  const taskBody = $('report-task-body');
  const docsList = $('report-docs-list');
  const suggestedUrlBlock = $('report-suggested-url-block');
  const suggestedUrl = $('report-suggested-url');
  const existingLinkPick = $('report-existing-link-pick');
  const addl = $('report-additional');
  const includeCtxBox = $('report-include-context');
  const statusEl = $('report-status');
  const saveBtn = $('report-save-draft');
  const copyBtn = $('report-copy-md');
  const copyTitleBtn = $('report-copy-title');
  const openBtn = $('report-open-issue');
  const cancelBtn = $('report-cancel');
  const closeBtn = $('report-close');
  const titlePreview = $('report-title-preview');

  // Swap radio groups based on mode; pick from the visible group only.
  solutionRadioGroup.hidden = (mode === 'task');
  taskRadioGroup.hidden = (mode !== 'task');
  const radios = (mode === 'task' ? taskRadioGroup : solutionRadioGroup).querySelectorAll('input[type="radio"]');

  // Header rename.
  headerH2.textContent = mode === 'task'
    ? '🐛 Report a task / docs problem'
    : '🐛 Report a reference-solution problem';

  exIdSpan.textContent = ex.id;
  exTitle.textContent = ex.title || ex.displayTitle || ex.fullTitle || '';
  exSource.textContent = ex.sourceFile || '(unknown)';

  // Mode-specific "what you're reporting against" panel.
  if (mode === 'task') {
    currentSol.textContent = '';
    verdictBlock.hidden = true;
    verdictBody.innerHTML = '';
    if (taskBody) {
      const taskText = String(ex.task || '')
        .replace(/^\s*\*\*Task:\*\*\s*\n+/, '')
        .trim();
      if (taskText) {
        taskBody.innerHTML = renderMarkdown(taskText);
      } else {
        // No `**Task:**` block — the H3 title IS the task (every chadmcrowell-
        // sourced "general" exercise). Show it inline as a blockquote so the
        // user has the same context they would for a Task-body exercise.
        // Build via el(...) to avoid HTML-injection on the title text.
        const titleText = ex.title || ex.displayTitle || ex.fullTitle || '';
        taskBody.innerHTML = '';
        taskBody.appendChild(el('p', { class: 'muted' },
          el('em', {}, "The H3 title is this exercise's task:")));
        taskBody.appendChild(el('blockquote', {}, titleText));
      }
    }
    if (docsList) {
      docsList.innerHTML = '';
      const links = Array.isArray(ex.docsLinks) ? ex.docsLinks : [];
      if (!links.length) {
        docsList.appendChild(el('li', { class: 'muted' }, '(no docs links on this exercise)'));
      } else {
        for (const l of links) {
          const li = el('li', {});
          li.appendChild(el('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.text));
          docsList.appendChild(li);
        }
      }
    }
    // Populate the existing-link picker so the user can point at which link.
    if (existingLinkPick) {
      existingLinkPick.innerHTML = '';
      existingLinkPick.appendChild(el('option', { value: '' }, '— pick the link to change —'));
      const links = Array.isArray(ex.docsLinks) ? ex.docsLinks : [];
      links.forEach((l, i) => {
        existingLinkPick.appendChild(el('option', { value: String(i) }, l.text));
      });
    }
  } else {
    currentSol.textContent = extractReferenceCode(ex.solution);
    if (ctx.verdict) {
      verdictBlock.hidden = false;
      const v = ctx.verdict;
      verdictBody.innerHTML = '';
      const fmt = (label, val) => {
        const row = el('div', {}, el('strong', {}, label + ': '), document.createTextNode(String(val)));
        verdictBody.appendChild(row);
      };
      fmt('Score', `${v.score} / 100`);
      fmt('Verdict', v.verdict || 'n/a');
      if (v.summary) fmt('Summary', v.summary);
      if (Array.isArray(v.missed) && v.missed.length) {
        verdictBody.appendChild(el('div', {}, el('strong', {}, 'Missed (per grader):')));
        const ul = el('ul', {});
        v.missed.forEach(s => ul.appendChild(el('li', {}, s)));
        verdictBody.appendChild(ul);
      }
    } else {
      verdictBlock.hidden = true;
      verdictBody.innerHTML = '';
    }
  }

  // Pre-select priority: saved draft → auto-detect from verdict → 'other'.
  const draft = (mode === 'task' ? getTaskFixDraft(ex.id) : getFixDraft(ex.id)) || {};
  const initialType = (draft.type && types.some(t => t.id === draft.type))
    ? draft.type
    : (mode === 'task' ? 'other' : (autoDetectType(ctx) || 'other'));
  radios.forEach(r => { r.checked = (r.value === initialType); });

  addl.value = draft.additional || '';
  includeCtxBox.checked = (draft.includeContext !== undefined) ? !!draft.includeContext : true;
  if (suggestedUrl) suggestedUrl.value = draft.suggestedUrl || '';
  if (existingLinkPick) existingLinkPick.value = (draft.existingLinkIdx != null) ? String(draft.existingLinkIdx) : '';
  statusEl.textContent = '';
  overlay.hidden = false;
  // Focus the picker so keyboard users can immediately Tab/arrow through it,
  // but don't force the textarea open on mobile.
  setTimeout(() => {
    const checked = (mode === 'task' ? taskRadioGroup : solutionRadioGroup)
      .querySelector('input[type="radio"]:checked');
    (checked || radios[0])?.focus();
  }, 30);

  // Show/hide the "suggested URL + existing-link picker" block based on type.
  const URL_TYPES = new Set(['missing-docs-link', 'incorrect-docs-link', 'outdated-breadcrumb']);
  const PICKER_TYPES = new Set(['incorrect-docs-link', 'outdated-breadcrumb']);
  const syncTaskSubBlocks = () => {
    if (mode !== 'task' || !suggestedUrlBlock) return;
    const checked = taskRadioGroup.querySelector('input[type="radio"]:checked');
    const tval = checked ? checked.value : 'other';
    suggestedUrlBlock.hidden = !URL_TYPES.has(tval);
    if (existingLinkPick) {
      existingLinkPick.hidden = !PICKER_TYPES.has(tval);
    }
  };
  syncTaskSubBlocks();

  const collect = () => {
    const checked = (mode === 'task' ? taskRadioGroup : solutionRadioGroup)
      .querySelector('input[type="radio"]:checked');
    const out = {
      type: checked ? checked.value : 'other',
      additional: addl.value.trim(),
      includeContext: includeCtxBox.checked,
    };
    if (mode === 'task') {
      out.suggestedUrl = suggestedUrl ? suggestedUrl.value.trim() : '';
      out.existingLinkIdx = (existingLinkPick && existingLinkPick.value !== '') ? existingLinkPick.value : null;
    }
    return out;
  };

  const buildCtx = () => ({
    verdict: ctx.verdict || null,
    answer: ctx.answer || '',
    includeContext: includeCtxBox.checked,
  });

  const requireSubmitFields = (d) => {
    if (getReportType(d.type, mode).whatsWrong === null && !d.additional) {
      statusEl.textContent = '✗ Add a short description for "Other" before submitting.';
      addl.focus();
      return false;
    }
    if (mode === 'task' && URL_TYPES.has(d.type) && !d.suggestedUrl) {
      statusEl.textContent = '✗ Paste the kubernetes.io URL you\'re suggesting before submitting.';
      suggestedUrl?.focus();
      return false;
    }
    return true;
  };

  // Keep the anchor's href in sync with the form so mobile browsers
  // navigate via the anchor's native default behaviour (no popup blocker).
  const syncHref = () => {
    openBtn.href = buildIssueUrl(ex, collect(), mode);
    titlePreview.value = buildIssueTitle(ex, mode);
  };
  const onTypeChange = () => { syncTaskSubBlocks(); syncHref(); };

  const cleanup = () => {
    overlay.hidden = true;
    delete overlay.dataset.reportMode;
    saveBtn.onclick = null;
    copyBtn.onclick = null;
    copyTitleBtn.onclick = null;
    openBtn.onclick = null;
    cancelBtn.onclick = null;
    closeBtn.onclick = null;
    document.removeEventListener('keydown', onEsc);
    overlay.onclick = null;
    radios.forEach(r => r.removeEventListener('change', onTypeChange));
    addl.removeEventListener('input', syncHref);
    includeCtxBox.removeEventListener('change', syncHref);
    suggestedUrl?.removeEventListener('input', syncHref);
    existingLinkPick?.removeEventListener('change', syncHref);
  };

  const onEsc = (e) => { if (e.key === 'Escape') cleanup(); };
  document.addEventListener('keydown', onEsc);
  overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };
  closeBtn.onclick = cleanup;
  cancelBtn.onclick = cleanup;

  // Initial href + live-sync on every relevant input change.
  radios.forEach(r => r.addEventListener('change', onTypeChange));
  addl.addEventListener('input', syncHref);
  includeCtxBox.addEventListener('change', syncHref);
  suggestedUrl?.addEventListener('input', syncHref);
  existingLinkPick?.addEventListener('change', syncHref);
  syncHref();

  const persistDraft = (d) => (mode === 'task' ? setTaskFixDraft(ex.id, d) : setFixDraft(ex.id, d));

  saveBtn.onclick = () => {
    const d = collect();
    persistDraft(d);
    statusEl.textContent = (d.type !== 'other' || d.additional)
      ? '✓ Draft saved locally.'
      : '✓ Draft cleared.';
  };

  copyBtn.onclick = async () => {
    const d = collect();
    if (!requireSubmitFields(d)) return;
    const md = renderReportMarkdown(ex, d, buildCtx(), mode);
    try {
      await navigator.clipboard.writeText(md);
      statusEl.textContent = '✓ Body copied — paste it into the issue description on GitHub.';
    } catch {
      statusEl.textContent = '✗ Clipboard blocked. Long-press the body block to copy manually.';
    }
  };

  copyTitleBtn.onclick = async () => {
    const d = collect();
    if (!requireSubmitFields(d)) return;
    try {
      await navigator.clipboard.writeText(buildIssueTitle(ex, mode));
      statusEl.textContent = '✓ Title copied — paste it into the issue title on GitHub.';
    } catch {
      statusEl.textContent = '✗ Clipboard blocked. Long-press the title field to copy manually.';
    }
  };

  // The anchor handles navigation natively. We validate, refresh href (belt +
  // suspenders), persist the draft, and fire-and-forget the markdown body to
  // the clipboard so the user can paste it on the GitHub side even if iOS
  // Universal Links sends them to the GH app's home screen.
  openBtn.onclick = (e) => {
    const d = collect();
    if (!requireSubmitFields(d)) { e.preventDefault(); return; }
    openBtn.href = buildIssueUrl(ex, d, mode);
    persistDraft(d);
    navigator.clipboard?.writeText(renderReportMarkdown(ex, d, buildCtx(), mode))
      .catch(() => {});
    statusEl.textContent = '✓ Body auto-copied to clipboard. Opening GitHub — paste it into the description. (Use 📋 Copy title for the title.)';
  };
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
  meta.appendChild(el('span', {}, `${ex.domain.title.split(',')[0]} · ${ex.section.kind === 'killersh' ? 'Killer.sh' : ex.section.kind === 'killercoda' ? 'KillerCoda' : `§${ex.section.number} ${ex.section.title}`}`));
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

  // Manual entry point for users who spot a problem with the task body or
  // its docs links (missing kubernetes.io link, wrong breadcrumb, etc.).
  // Mirrors the existing per-solution "🐛 Suggest a fix" affordance.
  // Rendered unconditionally — the chadmcrowell-sourced "general" exercises
  // (ca-1-001 through ~100 others) have no `**Task:**` block; the H3 title
  // IS the task. Gating this on `ex.task` would hide the button on exactly
  // the exercises the feature was designed for.
  const taskReportLink = el('button',
    { type: 'button', class: 'solution-report-link task-report-link',
      title: 'Suggest an additional docs link, a clearer task wording, or a typo fix' },
    '🐛 Suggest a fix for this task or docs');
  taskReportLink.addEventListener('click', () => openFixReportModal(ex, { mode: 'task' }));
  card.appendChild(taskReportLink);

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
    // Quiet manual entry point for users who notice a problem with the
    // reference solution without going through the LLM grader.
    const reportLink = el('button',
      { type: 'button', class: 'solution-report-link',
        title: 'Open a pre-filled GitHub issue if this reference solution looks wrong' },
      '🐛 Suggest a fix for this reference solution');
    reportLink.addEventListener('click', () => openFixReportModal(ex, {}));
    solDiv.appendChild(reportLink);
    if (toggle && card.classList.contains('solution-open')) {
      toggle.textContent = 'Hide solution';
      toggle.setAttribute('aria-expanded', 'true');
    }
  }

  return card;
}

// Signature of the inputs that actually change the rendered card list.
// When unchanged across mode switches, we can skip the expensive ~271-card
// re-render entirely (the previous main DOM is still in place; setMode just
// re-shows the hidden view).
let _browseSignature = null;
function filterSignature() {
  const f = State.filters || {};
  return JSON.stringify({
    d: f.domains ? [...f.domains].sort() : [],
    t: f.tags    ? [...f.tags].sort()    : [],
    s: f.search || '',
    b: !!f.onlyBookmarks,
    u: !!f.onlyUndone,
    r: !!f.revealSolutions,
    // If a build pulls in new exercises (extremely rare at runtime, but
    // happens via the 🔄 refresh path) the count changes → invalidate.
    n: State.allExercises ? State.allExercises.length : 0,
  });
}

function renderBrowse() {
  const sig = filterSignature();
  const main = document.getElementById('main');
  // Skip if the cached DOM is still in place AND the filter inputs haven't
  // moved since the last successful render. Worst case (Quiz → Browse with
  // identical filters): pure no-op, ~instant.
  if (_browseSignature === sig && main && main.children.length > 0) {
    return;
  }
  // Drop closures captured by previously-rendered answer-box hints. Each
  // card re-subscribes on mount (see renderAnswerBox → onLLMSettingsChange).
  clearLLMListeners();
  const visible = applyFilters();
  document.getElementById('filter-stats').textContent = `${visible.length} / ${State.allExercises.length} exercises`;
  renderSidebar(visible);
  renderSidebarProgress();
  main.innerHTML = '';
  if (visible.length === 0) {
    main.appendChild(el('div', { class: 'empty-state' }, 'No exercises match the current filters.'));
    _browseSignature = sig;
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
      const label = (ex.section.kind === 'killersh' || ex.section.kind === 'killercoda') ? '🎯 ' + ex.section.title : `§${ex.section.number} ${ex.section.title}`;
      main.appendChild(el('h3', { class: 'muted', style: { marginTop: '12px' } }, label));
      currentSection = ex.section.number;
    }
    main.appendChild(renderExerciseCard(ex, { openSolution: State.filters.revealSolutions }));
  }
  _browseSignature = sig;
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
    order: q.order || 'random',
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
    order: p.order || 'random',
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
  // Update both the top-header dot and the bottom-bar (mobile) dot.
  const dots = document.querySelectorAll('.mode-tab[data-mode="quiz"] .tab-dot');
  if (!dots.length) return;
  const active = State.quiz || storageGet(KEY.quizActive, null);
  dots.forEach(d => { d.hidden = !active; });
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
  // Restore last-used Order radio (cka:quiz:lastOrder)
  const savedOrder = storageGet(KEY.quizOrder, 'random');
  const orderInput = document.querySelector(`[name="quiz-order"][value="${savedOrder}"]`);
  if (orderInput) orderInput.checked = true;
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

// Uniform Fisher-Yates shuffle in place. Replaces the older biased
// Array.prototype.sort(() => Math.random() - 0.5) pattern.
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickQuizExercises(eligible, count, order) {
  // Sequential: strictly source order (ca-1-001, ca-1-002, …), no randomness.
  if (order === 'sequential') return eligible.slice(0, count);

  // All other modes start from a uniform random sample of N. We pick first,
  // then sort the sample by the requested key — otherwise a sorted-then-sliced
  // pipeline would give back all N from the first group (e.g. all 10 from
  // §1 cluster-architecture), which is not what "By section" means.
  const sample = shuffleInPlace([...eligible]).slice(0, count);
  if (order === 'random') return sample;

  if (order === 'tag') {
    const TAG_ORDER = ['general', 'cka-past-exam', 'killersh-a', 'killersh-b', 'killercoda'];
    const idx = new Map(TAG_ORDER.map((t, i) => [t, i]));
    // Stable sort by canonical tag order. Items with an unknown tag sink last.
    return sample
      .map((ex, i) => ({ ex, i, k: idx.get(ex.tag) ?? 999 }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .map(r => r.ex);
  }

  if (order === 'section') {
    // Domain order follows State.data.domains source order; then section.number.
    const domIdx = new Map(State.data.domains.map((d, i) => [d.key, i]));
    return sample
      .map((ex, i) => ({
        ex, i,
        d: domIdx.get(ex.domain.key) ?? 999,
        s: ex.section?.number ?? 999,
      }))
      .sort((a, b) => a.d - b.d || a.s - b.s || a.i - b.i)
      .map(r => r.ex);
  }

  return sample;
}

function startQuiz() {
  const eligible = getEligibleForQuiz();
  if (eligible.length === 0) return;
  // Count
  const countRadio = document.querySelector('[name="quiz-count"]:checked').value;
  let count;
  if (countRadio === 'all') count = eligible.length;
  else if (countRadio === 'custom') count = parseInt(document.getElementById('quiz-count-custom').value, 10);
  else count = parseInt(countRadio, 10);
  count = Math.min(Math.max(1, count || 10), eligible.length);
  // Order
  const order = document.querySelector('[name="quiz-order"]:checked')?.value || 'random';
  storageSet(KEY.quizOrder, order);
  const picked = pickQuizExercises(eligible, count, order);
  // Time limit
  const tmin = parseInt(document.querySelector('[name="quiz-time"]:checked').value, 10);
  const deadline = tmin > 0 ? Date.now() + tmin * 60 * 1000 : null;
  // Solutions
  const solutionsHidden = document.querySelector('[name="quiz-solutions"]:checked').value === 'hidden';

  State.quiz = {
    ids: picked.map(e => e.id),
    idx: 0,
    status: new Map(), // id -> 'got' | 'missed' | 'skipped'
    flagged: new Set(),
    revealed: new Set(),
    deadline,
    solutionsHidden,
    totalMinutes: tmin,
    startedAt: Date.now(),
    order,
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
  // Drop hint-update closures captured by the previous quiz card before it's
  // detached. The new card re-subscribes via renderAnswerBox.
  clearLLMListeners();
  card.innerHTML = '';
  const solutionOpen = !q.solutionsHidden || q.revealed.has(ex.id);
  // In "Always visible" mode the inline toggle still lets you collapse for self-test.
  // In "Hidden until I click Reveal" mode the dedicated Reveal button controls visibility;
  // hide the inline toggle until the user has clicked Reveal (then it becomes a collapse button).
  const showInlineToggle = !q.solutionsHidden || q.revealed.has(ex.id);
  card.appendChild(renderExerciseCard(ex, { openSolution: solutionOpen, inlineToggle: showInlineToggle, fromQuiz: true }));

  // Re-apply fullscreen if the user was in it before this nav. Cheap CM reuse
  // via upgradeToCodeMirror's cached promise; the editor re-focuses cleanly.
  if (_quizFullscreenSticky) {
    const box = card.querySelector('.answer-box');
    if (box) {
      box.classList.add('answer-fullscreen');
      document.body.classList.add('answer-fullscreen-active');
      const expandBtn = box.querySelector('.answer-expand');
      if (expandBtn) {
        expandBtn.textContent = '✕';
        expandBtn.title = 'Exit fullscreen (Esc)';
      }
    }
  }

  const flagBtn = document.getElementById('quiz-flag');
  flagBtn.textContent = q.flagged.has(ex.id) ? '🚩 Flagged' : '🚩 Flag';
  flagBtn.classList.toggle('active', q.flagged.has(ex.id));

  const revealBtn = document.getElementById('quiz-reveal');
  revealBtn.hidden = !q.solutionsHidden || q.revealed.has(ex.id);

  document.getElementById('quiz-prev').disabled = q.idx === 0;
  // Keep the nav drawer in sync if it's open (covers the keyboard-shortcut
  // flow where grading happens while the drawer is briefly visible).
  if (_quizNavOpen) renderQuizNavGrid();
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

// ---------- Quiz navigator drawer (📋 Questions) ----------

let _quizNavOpen = false;

function openQuizNav() {
  if (_quizNavOpen || !State.quiz) return;
  const overlay = document.getElementById('quiz-nav-overlay');
  if (!overlay) return;
  renderQuizNavGrid();
  overlay.hidden = false;
  _quizNavOpen = true;
  document.addEventListener('keydown', _onQuizNavEsc, true);
  document.getElementById('quiz-nav-close').onclick = closeQuizNav;
  overlay.onclick = (e) => { if (e.target === overlay) closeQuizNav(); };
}

function closeQuizNav() {
  if (!_quizNavOpen) return;
  document.getElementById('quiz-nav-overlay').hidden = true;
  _quizNavOpen = false;
  document.removeEventListener('keydown', _onQuizNavEsc, true);
}

function _onQuizNavEsc(e) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  closeQuizNav();
}

function renderQuizNavGrid() {
  const q = State.quiz;
  if (!q) return;
  // Summary line — counts by status + flagged total.
  const counts = { got: 0, partial: 0, missed: 0, skipped: 0, unanswered: 0, flagged: q.flagged.size };
  for (const id of q.ids) {
    const s = q.status.get(id);
    if (s === 'got') counts.got++;
    else if (s === 'partial') counts.partial++;
    else if (s === 'missed') counts.missed++;
    else if (s === 'skipped') counts.skipped++;
    else counts.unanswered++;
  }
  const summary = document.getElementById('quiz-nav-summary');
  if (summary) {
    summary.textContent =
      `✓ ${counts.got}  ◐ ${counts.partial}  ✗ ${counts.missed}  ↷ ${counts.skipped}  ` +
      `· ${counts.unanswered} unanswered  🚩 ${counts.flagged}`;
  }

  // Grid of numbered cells, one per question.
  const grid = document.getElementById('quiz-nav-grid');
  if (!grid) return;
  grid.replaceChildren();
  for (let i = 0; i < q.ids.length; i++) {
    const id = q.ids[i];
    const ex = State.byId.get(id);
    const status = q.status.get(id) || '';
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'qnav-cell' + (status ? ` qnav-cell--${status}` : '');
    if (i === q.idx) cell.classList.add('qnav-cell--current');
    const label = `${i + 1}. ${ex?.title || id} (${id})`;
    cell.title = label;
    cell.setAttribute('aria-label', label);
    cell.textContent = String(i + 1);
    if (q.flagged.has(id)) {
      const flag = document.createElement('span');
      flag.className = 'qnav-flag';
      flag.textContent = '🚩';
      cell.appendChild(flag);
    }
    cell.addEventListener('click', () => {
      State.quiz.idx = i;
      renderQuizCard();
      saveActiveQuiz();
      closeQuizNav();
    });
    grid.appendChild(cell);
  }
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
  if (['browse', 'quiz', 'docs', 'help', 'tools', 'nodes'].includes(mode)) return { mode, arg };
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
  if (mode === 'nodes') renderNodesView();
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

function renderHelpView(opts = {}) {
  // `opts.force` re-renders even if we've rendered once already — used by the
  // language toggle so EN ⇄ 中文 switches actually swap content.
  if (_helpRendered && !opts.force) return;
  const body = document.getElementById('help-body');
  const toc = document.getElementById('help-toc');
  if (!body || !toc) return;
  // (doc × lang) markdown pick. Both documents are bundled by build-exercises.mjs;
  // missing-file fallback returns empty string so the SPA hides the missing
  // toggle gracefully. Resolution chain:
  //   requested (doc, lang) → same-doc EN → webapp EN → empty.
  const lang = getHelpLang();
  const doc  = getHelpDoc();
  const helpEn = (State.data && State.data.helpGuide)   || '';
  const helpCn = (State.data && State.data.helpGuideCN) || '';
  const examEn = (State.data && State.data.examGuide)   || '';
  const examCn = (State.data && State.data.examGuideCN) || '';
  const cnForCurrentDoc = doc === 'exam' ? examCn : helpCn;
  const enForCurrentDoc = doc === 'exam' ? examEn : helpEn;
  const md = (lang === 'zh' && cnForCurrentDoc)
    ? cnForCurrentDoc
    : (enForCurrentDoc || helpEn);
  if (!md) {
    body.innerHTML = '<p class="muted">Help content not bundled — run <code>npm run build</code> to regenerate <code>exercises.json</code>.</p>';
    return;
  }
  body.innerHTML = renderMarkdown(md);

  // Two pill switchers above the rendered markdown:
  //   1. Document selector (📖 Webapp Guide | 🎯 Study Index)
  //   2. Language selector (EN | 中文)
  // Both are gated on the corresponding source being bundled so the SPA
  // degrades gracefully if a file is missing at build time.
  const hasExam = !!(examEn || examCn);
  const controls = el('div', { class: 'help-controls' });

  if (hasExam) {
    const docSwitch = el('div', { class: 'help-doc-switch', role: 'group', 'aria-label': 'Document' });
    const mkDocBtn = (code, label) => {
      const b = el('button', {
        type: 'button',
        class: 'help-doc-btn' + (doc === code ? ' active' : ''),
        'aria-pressed': String(doc === code),
      }, label);
      b.addEventListener('click', () => {
        if (doc === code) return;
        setHelpDoc(code);
        renderHelpView({ force: true });
        body.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
      return b;
    };
    docSwitch.appendChild(mkDocBtn('webapp', '📖 Webapp Guide'));
    docSwitch.appendChild(mkDocBtn('exam',   '🎯 Study Index'));
    controls.appendChild(docSwitch);
  }

  if (cnForCurrentDoc) {
    const langSwitch = el('div', { class: 'help-lang-switch', role: 'group', 'aria-label': 'Language' });
    const mkBtn = (code, label) => {
      const b = el('button', {
        type: 'button',
        class: 'help-lang-btn' + (lang === code ? ' active' : ''),
        'aria-pressed': String(lang === code),
      }, label);
      b.addEventListener('click', () => {
        if (lang === code) return;
        setHelpLang(code);
        renderHelpView({ force: true });
        body.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
      return b;
    };
    langSwitch.appendChild(mkBtn('en', 'EN'));
    langSwitch.appendChild(mkBtn('zh', '中文'));
    controls.appendChild(langSwitch);
  }

  if (controls.children.length) body.prepend(controls);

  // Rewrite repo-relative links → GitHub blob URLs (open in new tab).
  // Same-page anchors (#…) and absolute URLs (https://…, mailto:…) are left untouched.
  // Exception: cross-doc + cross-lang sibling links (WEBAPP_GUIDE{,_CN}.md /
  // EXAM_GUIDE{,_CN}.md) are intercepted to switch state in-app instead of
  // navigating to a path that 404s on Pages.
  const REPO_BLOB = 'https://github.com/xooooooooox/cka-exercises/blob/main/';
  const SELF_LINK_RE = /(^|\/)(WEBAPP_GUIDE_CN|WEBAPP_GUIDE|EXAM_GUIDE_CN|EXAM_GUIDE)\.md$/;
  const LINK_TO_STATE = {
    'WEBAPP_GUIDE.md':    { doc: 'webapp', lang: 'en' },
    'WEBAPP_GUIDE_CN.md': { doc: 'webapp', lang: 'zh' },
    'EXAM_GUIDE.md':      { doc: 'exam',   lang: 'en' },
    'EXAM_GUIDE_CN.md':   { doc: 'exam',   lang: 'zh' },
  };
  body.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    const m = href.match(SELF_LINK_RE);
    if (m) {
      const target = LINK_TO_STATE[m[2] + '.md'];
      a.setAttribute('href', '#help-' + target.doc + '-' + target.lang);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        setHelpDoc(target.doc);
        setHelpLang(target.lang);
        renderHelpView({ force: true });
        body.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
      return;
    }
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
let _toolsHandlersInstalled = false;
let _toolsManifestPromise = null;
const _toolsFetchPromises = new Map();   // minor → in-flight fetch promise

async function loadToolsManifest() {
  if (State.toolsManifest) return State.toolsManifest;
  if (_toolsManifestPromise) return _toolsManifestPromise;
  _toolsManifestPromise = (async () => {
    const resp = await fetch('tools-versions.json');
    if (!resp.ok) throw new Error(`tools-versions.json HTTP ${resp.status}`);
    State.toolsManifest = await resp.json();
    return State.toolsManifest;
  })();
  return _toolsManifestPromise;
}

async function loadToolsVersion(minor) {
  if (State.toolsByMinor.has(minor)) {
    State.tools = State.toolsByMinor.get(minor);
    State.toolsCurrentMinor = minor;
    return State.tools;
  }
  if (_toolsFetchPromises.has(minor)) return _toolsFetchPromises.get(minor);

  const manifest = await loadToolsManifest();
  const v = manifest.versions.find(x => x.minor === minor)
        || manifest.versions.find(x => x.minor === manifest.default)
        || manifest.versions[0];
  const p = (async () => {
    const resp = await fetch(v.file);
    if (!resp.ok) throw new Error(`${v.file} HTTP ${resp.status}`);
    const payload = await resp.json();
    State.toolsByMinor.set(v.minor, payload);
    State.tools = payload;
    State.toolsCurrentMinor = v.minor;
    return payload;
  })();
  _toolsFetchPromises.set(minor, p);
  try { return await p; }
  finally { _toolsFetchPromises.delete(minor); }
}

function updateToolsMetaLine() {
  const meta = document.getElementById('tools-meta');
  if (!meta) return;
  const minor = State.toolsCurrentMinor;
  const v = State.toolsManifest?.versions?.find(x => x.minor === minor);
  meta.textContent = v ? `kubectl ${v.kubectl}` : '';
}

function populateVersionSelect() {
  const sel = document.getElementById('tools-version-select');
  if (!sel) return;
  if (sel.options.length) return; // already populated
  for (const v of State.toolsManifest.versions) {
    const opt = document.createElement('option');
    opt.value = v.minor;
    opt.textContent = `v${v.minor}`;
    sel.appendChild(opt);
  }
  sel.value = State.toolsCurrentMinor;
}

async function renderToolsView() {
  const explainBody = document.getElementById('tools-explain-detail');
  const kubectlBody = document.getElementById('tools-kubectl-detail');
  if (!explainBody || !kubectlBody) return;

  // First-time arrival: load manifest, pick which version to display, fetch it.
  if (!State.tools) {
    explainBody.innerHTML = '<p class="muted">Loading…</p>';
    kubectlBody.innerHTML = '<p class="muted">Loading…</p>';
    try {
      await loadToolsManifest();
    } catch (e) {
      explainBody.innerHTML = `<p class="muted">Couldn't load <code>tools-versions.json</code>: ${e.message}. Run <code>npm run build:tools-bundle</code>.</p>`;
      return;
    }
    const saved = storageGet(KEY.toolsVersion, null);
    const valid = State.toolsManifest.versions.some(v => v.minor === saved);
    const targetMinor = valid ? saved : State.toolsManifest.default;
    try {
      await loadToolsVersion(targetMinor);
    } catch (e) {
      explainBody.innerHTML = `<p class="muted">Couldn't load tools bundle: ${e.message}.</p>`;
      return;
    }
  }

  // Re-renders inside the same Tools session: just re-show whichever sub-tab.
  if (_toolsRendered) {
    showToolsSubtab(State.toolsSubtab);
    populateVersionSelect();
    return;
  }

  // Reset the "Loading…" placeholders to their original empty-state copy.
  explainBody.innerHTML = '<p class="muted">Pick a kind on the left, then click any field to drill into its sub-schema (just like <code>kubectl explain pod.spec.containers</code>).</p>';
  kubectlBody.innerHTML = '<p class="muted">Pick a kubectl command on the left to see the same <code>kubectl &lt;cmd&gt; -h</code> output you\'d get in the exam terminal.</p>';

  populateVersionSelect();
  updateToolsMetaLine();

  renderExplainKindList();
  renderKubectlCommandList();

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

async function switchToolsVersion(minor) {
  storageSet(KEY.toolsVersion, minor);
  // Invalidate per-version caches
  _explainIndex = null;
  try {
    await loadToolsVersion(minor);
  } catch (e) {
    alert(`Couldn't load v${minor}: ${e.message}`);
    return;
  }
  // Re-render lists against the new payload. Detail panes get re-rendered
  // automatically if the saved kindRef / cmdPath still exists in this version.
  renderExplainKindList(document.getElementById('tools-explain-search')?.value || '');
  renderKubectlCommandList(document.getElementById('tools-kubectl-search')?.value || '');

  // Re-resolve the saved Explain selection against the new version's definitions
  if (State.toolsExplain.kindRef && State.tools.definitions[State.toolsExplain.kindRef]) {
    renderExplainDetail();
  } else {
    State.toolsExplain = { kindRef: null, path: [] };
    document.getElementById('tools-explain-detail').innerHTML = '<p class="muted">Pick a kind on the left, then click any field to drill into its sub-schema (just like <code>kubectl explain pod.spec.containers</code>).</p>';
  }
  if (State.toolsKubectl.cmdPath && State.tools.kubectl?.commands?.some(c => c.path === State.toolsKubectl.cmdPath)) {
    renderKubectlDetail();
  } else {
    State.toolsKubectl.cmdPath = null;
    document.getElementById('tools-kubectl-detail').innerHTML = '<p class="muted">Pick a kubectl command on the left to see the same <code>kubectl &lt;cmd&gt; -h</code> output you\'d get in the exam terminal.</p>';
  }
  updateToolsMetaLine();
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
  if (_toolsHandlersInstalled) return;
  _toolsHandlersInstalled = true;
  document.querySelectorAll('.tools-subtabs button[data-tools-tab]').forEach(b => {
    b.addEventListener('click', () => showToolsSubtab(b.dataset.toolsTab));
  });
  document.getElementById('tools-version-select')?.addEventListener('change', (e) => {
    switchToolsVersion(e.target.value);
  });
  const explainSearch = document.getElementById('tools-explain-search');
  explainSearch?.addEventListener('input', (e) => {
    renderExplainKindList(e.target.value.trim().toLowerCase());
  });
  // Enter → drill into the first matching path (ergonomic shortcut)
  explainSearch?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    document.querySelector('#tools-kind-list button')?.click();
  });
  document.getElementById('tools-kubectl-search')?.addEventListener('input', (e) => {
    renderKubectlCommandList(e.target.value.trim().toLowerCase());
  });
}

// --- Explain panel ---

// Flat index of every reachable schema node so the search box can match
// dotted paths like "pod.spec.affinity". Built lazily on first search and
// cached because State.tools is one-shot at runtime.
let _explainIndex = null;

function buildExplainIndex() {
  if (_explainIndex) return _explainIndex;
  const out = [];
  const MAX_DEPTH = 4;
  for (const root of State.tools.rootKinds) {
    walk(root.ref, [], root, new Set([root.ref]));
  }
  function walk(ref, path, root, seenRefs) {
    out.push({
      kindRef: root.ref,
      kindName: root.name,
      path: [...path],
      displayPath: [root.name, ...path].join('.'),
      // Only root entries (path.length === 0) carry shortNames so the search
      // loop can match queries like `csr` to the right kind without nested
      // fields false-matching.
      shortNames: path.length === 0 ? (root.shortNames || []) : [],
    });
    if (path.length >= MAX_DEPTH) return;
    const def = State.tools.definitions[ref];
    if (!def) return;
    for (const f of def.fields || []) {
      if (f.ref) {
        if (seenRefs.has(f.ref)) continue;
        walk(f.ref, [...path, f.name], root, new Set([...seenRefs, f.ref]));
      } else {
        // Primitive leaf (string, []string, int, …): emit a terminal entry so
        // `csr.spec.usages` and friends can be searched, not just drilled to.
        out.push({
          kindRef: root.ref,
          kindName: root.name,
          path: [...path, f.name],
          displayPath: [root.name, ...path, f.name].join('.'),
          shortNames: [],
        });
      }
    }
  }
  _explainIndex = out;
  return out;
}

function makeExplainRow(entry, compact) {
  const label = compact ? entry.kindName : entry.displayPath;
  const btn = el('button', {
    type: 'button',
    'data-kind-ref': entry.kindRef,
    'data-path': entry.path.join('.'),
    title: entry.displayPath,
  }, label);
  // Show kubectl-style short-name aliases (e.g. "po", "deploy", "csr") right
  // next to the kind label — only on top-level rows.
  if (compact && entry.shortNames && entry.shortNames.length) {
    btn.appendChild(el('small', { class: 'kind-shortnames' },
      ` (${entry.shortNames.join(', ')})`));
  }
  const sx = State.toolsExplain;
  if (sx.kindRef === entry.kindRef && (sx.path || []).join('.') === entry.path.join('.')) {
    btn.classList.add('active');
  }
  btn.addEventListener('click', () => {
    State.toolsExplain = { kindRef: entry.kindRef, path: entry.path };
    storageSet(KEY.toolsKind, entry.kindRef);
    storageSet(KEY.toolsPath, entry.path);
    const q = document.getElementById('tools-explain-search')?.value || '';
    renderExplainKindList(q);
    renderExplainDetail();
  });
  return btn;
}

function renderExplainKindList(query = '') {
  const list = document.getElementById('tools-kind-list');
  if (!list) return;
  list.innerHTML = '';

  // No query → show the top-level kinds (unchanged baseline UX) with their
  // kubectl short-name aliases rendered alongside.
  if (!query) {
    for (const k of State.tools.rootKinds) {
      list.appendChild(makeExplainRow({
        kindRef: k.ref, kindName: k.name, path: [], displayPath: k.name,
        shortNames: k.shortNames || [],
      }, /*compact*/ true));
    }
    return;
  }

  // Normalise: strip leading dots, lowercase, collapse spaces to dot.
  const q0 = query.toLowerCase().replace(/^\.+/, '').replace(/\s+/g, '.');
  if (!q0) {
    return renderExplainKindList('');
  }

  // Expand a leading kubectl short-name (csr, po, deploy, …) into the full kind
  // name so dotted queries like `csr.spec.usages` match the way the user thinks
  // — bare `csr` still hits via the existing shortHit branch below.
  const firstSeg = q0.split('.')[0];
  let q = q0;
  if (q0.includes('.')) {
    for (const root of State.tools.rootKinds) {
      if ((root.shortNames || []).includes(firstSeg)) {
        q = root.name.toLowerCase() + q0.slice(firstSeg.length);
        break;
      }
    }
  }

  const index = buildExplainIndex();
  const hits = [];
  const CAP = 80;
  for (const e of index) {
    const pathHit = e.displayPath.toLowerCase().includes(q);
    // Match against kubectl short-name aliases too — `csr` → CSR,
    // `cs` → CSR via prefix. Exact + prefix only (not substring), so `ep`
    // does not accidentally match `EndpointSlice` etc.
    const shortHit = (e.shortNames || []).some(s => s === q || s.startsWith(q));
    if (pathHit || shortHit) {
      hits.push(e);
      if (hits.length >= CAP) break;
    }
  }
  if (!hits.length) {
    list.appendChild(el('p', { class: 'muted' }, 'No matches.'));
    return;
  }
  // Shallower paths first — "affinity" surfaces Pod.spec.affinity ahead of
  // deeper occurrences like Deployment.spec.template.spec.affinity.
  hits.sort((a, b) => a.path.length - b.path.length || a.displayPath.localeCompare(b.displayPath));
  for (const h of hits) list.appendChild(makeExplainRow(h, /*compact*/ false));
}

// Header block extracted so both the object-detail and leaf-detail branches
// of renderExplainDetail can reuse it.
function renderExplainHeader(detail, rootKind, path) {
  const header = el('div', { class: 'explain-header' });
  header.appendChild(el('div', {}, el('strong', {}, 'KIND:     '), rootKind?.name || ''));
  if (rootKind?.version) header.appendChild(el('div', {}, el('strong', {}, 'VERSION:  '), `${rootKind.group ? rootKind.group + '/' : ''}${rootKind.version}`));
  if (path.length) header.appendChild(el('div', {}, el('strong', {}, 'FIELD:    '), [rootKind?.name, ...path].join('.')));
  detail.appendChild(header);
}

function renderExplainBreadcrumb(detail, rootKind, path) {
  if (!path.length) return;
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

function renderExplainDetail() {
  const detail = document.getElementById('tools-explain-detail');
  if (!detail) return;
  detail.innerHTML = '';
  const { kindRef, path } = State.toolsExplain;
  if (!kindRef) return;

  // Walk the path from the root kind to the current node. Capture leafField
  // when we land on a primitive (no `ref`) so we can render its own detail
  // view, mirroring `kubectl explain csr.spec.usages`.
  let cursorRef = kindRef;
  let leafField = null;
  for (const seg of path) {
    const def = State.tools.definitions[cursorRef];
    if (!def) break;
    const field = (def.fields || []).find(f => f.name === seg);
    if (!field) break;
    if (!field.ref) { leafField = field; break; }
    cursorRef = field.ref;
  }
  const rootKind = State.tools.rootKinds.find(k => k.ref === kindRef);

  // --- Leaf branch: primitive field. Render TYPE + DESCRIPTION only. ---
  if (leafField) {
    renderExplainHeader(detail, rootKind, path);
    renderExplainBreadcrumb(detail, rootKind, path);
    detail.appendChild(el('div', { class: 'explain-section' },
      el('strong', {}, 'TYPE:     '),
      `${leafField.type}${leafField.required ? ' -required-' : ''}`));
    if (leafField.description) {
      detail.appendChild(el('div', { class: 'explain-desc' },
        el('strong', {}, 'DESCRIPTION:\n     '),
        leafField.description));
    }
    return;
  }

  // --- Object branch: walked into a sub-schema. Render fields list. ---
  const def = State.tools.definitions[cursorRef];
  if (!def) {
    detail.appendChild(el('p', { class: 'muted' }, `Schema not bundled: ${cursorRef}`));
    return;
  }

  renderExplainHeader(detail, rootKind, path);
  renderExplainBreadcrumb(detail, rootKind, path);

  if (def.description) {
    detail.appendChild(el('div', { class: 'explain-desc' }, el('strong', {}, 'DESCRIPTION:\n     '), def.description));
  }

  const fields = def.fields || [];
  if (fields.length) {
    detail.appendChild(el('div', { class: 'explain-section' }, el('strong', {}, 'FIELDS:')));
    for (const f of fields) {
      const row = el('div', { class: 'field-row' });
      const head = el('div', { class: 'field-head' });
      const nameSpan = el('span', { class: 'field-name', role: 'button', tabindex: '0' }, f.name);
      const typeSpan = el('span', { class: 'field-type' }, ` <${f.type}>${f.required ? ' -required-' : ''}`);
      const isRef = !!f.ref;
      const drill = el('button', {
        type: 'button',
        class: 'field-drill',
        title: isRef ? 'Drill into this sub-schema' : 'Show the full description for this field',
      }, isRef ? '↳' : '↵');
      const onClick = () => navigateExplain([...path, f.name]);
      nameSpan.style.cursor = 'pointer';
      nameSpan.addEventListener('click', onClick);
      drill.addEventListener('click', onClick);
      head.append(nameSpan, typeSpan, drill);
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
    const isTop = depth === 0;
    const btn = el('button', {
      type: 'button',
      class: `cmd-row ${isTop ? 'cmd-top' : 'cmd-child'}`,
      'data-cmd-path': c.path,
      title: c.summary || '',
    });
    btn.style.setProperty('--cmd-depth', String(depth));
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

// ---------- Nodes view (read-only kubeadm filesystem snapshot) ----------

let _nodesRendered = false;
let _nodesHandlersInstalled = false;

async function loadNodesVersion(minor) {
  if (State.nodesByMinor.has(minor)) {
    State.nodes = State.nodesByMinor.get(minor);
    State.nodesCurrentMinor = minor;
    return State.nodes;
  }
  const manifest = await loadToolsManifest();
  const v = manifest.versions.find(x => x.minor === minor)
        || manifest.versions.find(x => x.minor === manifest.default)
        || manifest.versions[0];
  if (!v?.nodesFile) throw new Error(`No nodesFile registered for v${minor} in tools-versions.json`);
  const resp = await fetch(v.nodesFile);
  if (!resp.ok) throw new Error(`${v.nodesFile} HTTP ${resp.status}`);
  const payload = await resp.json();
  State.nodesByMinor.set(v.minor, payload);
  State.nodes = payload;
  State.nodesCurrentMinor = v.minor;
  return payload;
}

function populateNodesVersionSelect() {
  const sel = document.getElementById('nodes-version-select');
  if (!sel || sel.options.length) return;
  for (const v of State.toolsManifest.versions) {
    const opt = document.createElement('option');
    opt.value = v.minor;
    opt.textContent = `v${v.minor}`;
    sel.appendChild(opt);
  }
  sel.value = State.nodesCurrentMinor;
}

function updateNodesMetaLine() {
  const meta = document.getElementById('nodes-meta');
  if (!meta) return;
  const minor = State.nodesCurrentMinor;
  const v = State.toolsManifest?.versions?.find(x => x.minor === minor);
  meta.textContent = v ? `kubectl ${v.kubectl}` : '';
}

async function renderNodesView() {
  const detail = document.getElementById('nodes-detail');
  if (!detail) return;

  if (!State.nodes) {
    detail.innerHTML = '<p class="muted">Loading…</p>';
    try {
      await loadToolsManifest();
      const saved = storageGet(KEY.toolsVersion, null);
      const valid = State.toolsManifest.versions.some(v => v.minor === saved);
      const targetMinor = valid ? saved : State.toolsManifest.default;
      await loadNodesVersion(targetMinor);
    } catch (e) {
      detail.innerHTML = `<p class="muted">Couldn't load nodes bundle: ${e.message}. Run <code>npm run build:tools-bundle</code>.</p>`;
      return;
    }
  }

  if (_nodesRendered) {
    populateNodesVersionSelect();
    updateNodesMetaLine();
    return;
  }

  detail.innerHTML = '<p class="muted">Pick a file on the left to see its contents — exactly what you\'d <code>cat</code> on the node.</p>';

  populateNodesVersionSelect();
  updateNodesMetaLine();

  // Restore last role
  const lastRole = storageGet(KEY.nodesRole, 'controlplane');
  State.nodesRole = (lastRole === 'worker') ? 'worker' : 'controlplane';
  document.querySelectorAll('.nodes-subtabs button[data-nodes-role]').forEach(b =>
    b.classList.toggle('active', b.dataset.nodesRole === State.nodesRole));

  renderNodesTree('');

  // Restore last opened file
  const lastPath = storageGet(KEY.nodesPath, null);
  if (lastPath) renderNodesFile(lastPath);

  installNodesHandlers();
  _nodesRendered = true;
}

function getNodesActiveTree() {
  if (!State.nodes) return [];
  return State.nodesRole === 'worker' ? (State.nodes.worker?.tree || []) : (State.nodes.controlPlane?.tree || []);
}

// Walks the tree, calls visit(file) for each file node. Used by both the tree
// renderer (with a parent-collector callback) and search.
function walkNodesTree(nodes, visit) {
  for (const n of nodes) {
    if (n.type === 'file') visit(n);
    else if (n.children) walkNodesTree(n.children, visit);
  }
}

function renderNodesTree(query) {
  const root = document.getElementById('nodes-tree');
  if (!root) return;
  root.innerHTML = '';
  const tree = getNodesActiveTree();
  const q = (query || '').trim().toLowerCase();

  // For search: a file matches if its full path contains q. A directory is
  // shown only if any descendant file matches.
  function pathMatches(p) { return !q || p.toLowerCase().includes(q); }

  function renderNode(node, parentEl, depth) {
    if (node.type === 'dir') {
      // Skip dirs whose subtree has no matches in search mode
      if (q) {
        let any = false;
        walkNodesTree(node.children || [], f => { if (pathMatches(f.path)) any = true; });
        if (!any) return;
      }
      const det = document.createElement('details');
      // Auto-expand when searching so matches are visible.
      det.open = q ? true : (depth < 1);
      const sum = document.createElement('summary');
      sum.textContent = node.name + '/';
      sum.style.paddingLeft = `${depth * 14}px`;
      det.appendChild(sum);
      for (const child of node.children || []) renderNode(child, det, depth + 1);
      parentEl.appendChild(det);
    } else {
      if (!pathMatches(node.path)) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'file-row';
      btn.textContent = node.name;
      btn.title = node.path;
      btn.style.paddingLeft = `${depth * 14 + 22}px`;
      btn.dataset.nodesFilePath = node.path;
      if (node.path === storageGet(KEY.nodesPath, null)) btn.classList.add('active');
      btn.addEventListener('click', () => {
        storageSet(KEY.nodesPath, node.path);
        document.querySelectorAll('#nodes-tree .file-row.active').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderNodesFile(node.path);
      });
      parentEl.appendChild(btn);
    }
  }

  for (const n of tree) renderNode(n, root, 0);
  if (!root.children.length) {
    root.appendChild(el('p', { class: 'muted' }, q ? 'No matches.' : 'No files in this snapshot.'));
  }
}

function findNodesFile(tree, targetPath) {
  for (const n of tree) {
    if (n.type === 'file' && n.path === targetPath) return n;
    if (n.type === 'dir' && n.children) {
      const f = findNodesFile(n.children, targetPath);
      if (f) return f;
    }
  }
  return null;
}

function renderNodesFile(filePath) {
  const detail = document.getElementById('nodes-detail');
  if (!detail) return;
  const file = findNodesFile(getNodesActiveTree(), filePath);
  if (!file) {
    // Not in current role — maybe user clicked a CP file but switched to worker
    detail.innerHTML = `<p class="muted">File <code>${filePath}</code> not in this role's snapshot. Switch role or pick another file.</p>`;
    return;
  }
  detail.innerHTML = '';
  const head = el('div', { class: 'nodes-file-head' },
    el('span', { class: 'nodes-file-path' }, filePath),
  );
  const copyBtn = el('button', { type: 'button', class: 'nodes-file-copy', title: 'Copy file contents to clipboard' }, '📋 Copy');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(file.content || '');
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
    } catch { copyBtn.textContent = '✗ Failed'; }
  });
  head.appendChild(copyBtn);
  detail.appendChild(head);
  const pre = el('pre', { class: 'nodes-file-body' });
  pre.appendChild(el('code', {}, file.content || ''));
  detail.appendChild(pre);
}

function switchNodesRole(role) {
  const r = (role === 'worker') ? 'worker' : 'controlplane';
  State.nodesRole = r;
  storageSet(KEY.nodesRole, r);
  document.querySelectorAll('.nodes-subtabs button[data-nodes-role]').forEach(b =>
    b.classList.toggle('active', b.dataset.nodesRole === r));
  renderNodesTree(document.getElementById('nodes-search')?.value || '');
  // Try to restore last file in the new role's tree; otherwise show empty hint
  const lastPath = storageGet(KEY.nodesPath, null);
  if (lastPath && findNodesFile(getNodesActiveTree(), lastPath)) {
    renderNodesFile(lastPath);
  } else {
    document.getElementById('nodes-detail').innerHTML = '<p class="muted">Pick a file on the left to see its contents — exactly what you\'d <code>cat</code> on the node.</p>';
  }
}

async function switchNodesVersion(minor) {
  storageSet(KEY.toolsVersion, minor);  // shared with Tools tab
  try {
    await loadNodesVersion(minor);
  } catch (e) {
    alert(`Couldn't load nodes v${minor}: ${e.message}`);
    return;
  }
  renderNodesTree(document.getElementById('nodes-search')?.value || '');
  const lastPath = storageGet(KEY.nodesPath, null);
  if (lastPath && findNodesFile(getNodesActiveTree(), lastPath)) {
    renderNodesFile(lastPath);
  } else {
    document.getElementById('nodes-detail').innerHTML = '<p class="muted">Pick a file on the left to see its contents — exactly what you\'d <code>cat</code> on the node.</p>';
  }
  updateNodesMetaLine();
}

function installNodesHandlers() {
  if (_nodesHandlersInstalled) return;
  _nodesHandlersInstalled = true;
  document.querySelectorAll('.nodes-subtabs button[data-nodes-role]').forEach(b => {
    b.addEventListener('click', () => switchNodesRole(b.dataset.nodesRole));
  });
  document.getElementById('nodes-version-select')?.addEventListener('change', (e) => {
    switchNodesVersion(e.target.value);
  });
  document.getElementById('nodes-search')?.addEventListener('input', (e) => {
    renderNodesTree(e.target.value);
  });
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
    if (ev.key === '6') { ev.preventDefault(); setMode('nodes'); return; }

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

  // Esc exits any fullscreen answer editor.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const fs = document.querySelector('.answer-box.answer-fullscreen');
    if (!fs) return;
    fs.classList.remove('answer-fullscreen');
    document.body.classList.remove('answer-fullscreen-active');
    const btn = fs.querySelector('.answer-expand');
    if (btn) {
      btn.textContent = '⛶';
      btn.title = 'Expand to fullscreen — useful for long YAML manifests';
    }
  });

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
  installSyncDotIndicator();

  // Header 🤖 LLM quick-switch popover
  installLlmMenu();

  // Header 🔄 refresh + auto-detect "new content" banner
  installRefreshAffordances();

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
  document.getElementById('quiz-nav-toggle')?.addEventListener('click', openQuizNav);
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
