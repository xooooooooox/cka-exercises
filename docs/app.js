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
  appBuild: null,                // { version, generatedAt } once renderAppBuild() runs
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
  helpDoc:  'cka:help:doc',      // 'webapp' | 'exam' | 'changelog' — Help-tab document preference
  filters: 'cka:filters',        // Browse-mode filter bar (persists across sessions + sync)
  gistToken: 'cka:gist:token',
  gistId: 'cka:gist:id',
  syncMeta: 'cka:sync:meta',          // { lastPushAt, lastPullAt, lastTestAt, lastError?, lastSyncedGistUpdatedAt? }
  prePullBackup: 'cka:sync:prepull-backup', // { takenAt: ISO, payload: <collectExportable result> }
  autoSyncDisabled: 'cka:sync:autoDisabled', // user opt-out for the 30s debounced auto-push
  syncDirtyAt: 'cka:sync:dirtyAt',           // ISO — set on every sync-worthy mutation, cleared after successful push
  syncBeaconedAt: 'cka:sync:beaconedAt',     // ISO — set after beforeunload's beaconPush(); consumed once on next bootAutoSync to re-stamp baseline
  syncKeymeta: 'cka:sync:keymeta',           // per-key + per-id timestamps powering the merge engine; included in gist payload
  deviceId: 'cka:sync:deviceId',             // random UUID minted once on first auto-sync; excluded from payload (per-device)
};

// All providers we offer. Their slots get pre-created on first save so the
// Settings UI can show per-provider configured-state hints.
const ALL_PROVIDERS = ['anthropic', 'openai', 'deepseek', 'qwen', 'doubao', 'glm', 'ollama'];
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
let _autoSyncEditLogged = false;
function _logAutoSyncEditOnce(exId) {
  if (_autoSyncEditLogged) return;
  _autoSyncEditLogged = true;
  if (!isAutoSyncEnabled()) return;
  console.info(`[auto-sync] saw an edit on ${exId} via setAnswer — dirty flag set; next push in ~${AUTO_SYNC_DEBOUNCE_MS / 1000}s`);
}
function setAnswer(exerciseId, payload) {
  const stamped = Object.assign({}, payload || {}, { savedAt: new Date().toISOString() });
  storageSet(KEY.answerPrefix + exerciseId, stamped);
  _logAutoSyncEditOnce(exerciseId);
  markSyncDirty();
}

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
  const v = storageGet(KEY.helpDoc, null);
  if (v === 'exam' || v === 'changelog') return v;
  return 'webapp';
}
function setHelpDoc(doc) {
  storageSet(KEY.helpDoc, (doc === 'exam' || doc === 'changelog') ? doc : 'webapp');
}

function getFixDraft(id) { return storageGet(KEY.fixDraftPrefix + id, null); }
function setFixDraft(id, payload) {
  // Drop empty drafts entirely so they don't show in Backup. A draft is empty
  // when the user has neither flagged it for review nor entered any form
  // content — Quick Flag alone (payload.flagged: true with no type/additional)
  // is enough to keep the entry alive so it can appear in the queue.
  const empty = !payload
    || (!payload.flagged
        && !payload.additional
        && (!payload.type || payload.type === 'other'));
  const k = KEY.fixDraftPrefix + id;
  if (empty) {
    try { localStorage.removeItem(k); } catch {}
    stampSingleton(k);
  } else {
    storageSet(k, { ...payload, savedAt: new Date().toISOString() });
    stampSingleton(k);
  }
  // Trigger the 30s auto-push debounce. Without this, queueing a 🐞 flag /
  // saving a draft / removing a queue entry would only ride along on the
  // next unrelated sync-worthy edit (Done / Bookmark / Answer / quiz state).
  markSyncDirty();
}

// Quick Flag: one-click "this exercise needs attention" with no form. Stores
// a lightweight stub in cka:fix-draft:<id> (solution side) or
// cka:task-fix-draft:<id> (task side) so it shows up in the queue alongside
// fully-written drafts. The 🐞 button on the card pops a small menu where the
// user picks the scope — Solution / Task / Both — then this helper writes the
// corresponding stub(s).
function isFlagged(id, mode) {
  if (mode === 'task') return !!(getTaskFixDraft(id)?.flagged);
  return !!(getFixDraft(id)?.flagged);
}
function setFlaggedMode(id, mode, on) {
  // Routes through setFixDraft / setTaskFixDraft so empty-prune + stamp +
  // markSyncDirty all happen consistently.
  if (mode === 'task') {
    const cur = getTaskFixDraft(id) || {};
    setTaskFixDraft(id, { ...cur, flagged: !!on });
  } else {
    const cur = getFixDraft(id) || {};
    setFixDraft(id, { ...cur, flagged: !!on });
  }
}
// Legacy single-flag toggle: cycles the solution slot only. Kept for any
// callers that still expect the no-mode signature.
function toggleFlagForReview(id) {
  setFlaggedMode(id, 'solution', !isFlagged(id, 'solution'));
}
// "What scope is this exercise flagged at right now?" — drives the 🐞 button's
// active class + the menu's ✓ marks.
function flaggedScope(id) {
  const sol = isFlagged(id, 'solution');
  const tsk = isFlagged(id, 'task');
  if (sol && tsk) return 'both';
  if (sol) return 'solution';
  if (tsk) return 'task';
  return 'none';
}

// Apply visual state to a 🐞 button based on current flagged scope. Used by
// the card's flag button + the answer-box fullscreen flag button.
function applyFlagBtnState(btn, exId) {
  const scope = flaggedScope(exId);
  btn.classList.remove('flag-solution', 'flag-task', 'flag-both', 'active');
  if (scope === 'none') {
    btn.title = 'Mark this exercise for follow-up (Solution / Task / Both)';
  } else {
    btn.classList.add('active');
    btn.classList.add(`flag-${scope}`);
    const label = scope === 'both' ? 'Solution + Task' : (scope === 'solution' ? 'Solution' : 'Task');
    btn.title = `Flagged for follow-up (${label}) — click to change scope`;
  }
}

// Floating menu anchored to a 🐞 button. Options: Solution / Task / Both /
// Unflag all. ✓ marks reflect current state. Selecting a row toggles the
// corresponding flag(s); the menu stays open so the user can adjust further,
// closing on outside click or Esc.
let _activeFlagMenu = null;
function openFlagMenu(anchorBtn, ex) {
  // Close any previously open instance so we only ever have one floating.
  if (_activeFlagMenu) { try { _activeFlagMenu.remove(); } catch {} _activeFlagMenu = null; }

  const menu = el('div', { class: 'flag-menu' });
  const refreshIndicators = () => {
    const scope = flaggedScope(ex.id);
    menu.querySelectorAll('[data-scope]').forEach(r => {
      const matches = r.dataset.scope === scope || (r.dataset.scope === 'solution' && scope === 'solution')
        || (r.dataset.scope === 'task' && scope === 'task')
        || (r.dataset.scope === 'both' && scope === 'both');
      r.classList.toggle('selected', matches);
    });
    applyFlagBtnState(anchorBtn, ex.id);
    refreshIssuesQueueCount();
    renderIssuesQueue();
  };

  const makeRow = (label, scope, action) => {
    const row = el('button', { type: 'button', class: 'flag-menu-row', 'data-scope': scope }, label);
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      action();
      refreshIndicators();
    });
    return row;
  };

  // Pure-text labels. Previous icon set was 🔧 / 📝 / 🔧📝 / 🗑 — the
  // first two collided with the fullscreen label-row's 🔧 Tools drawer /
  // 📝 Task drawer buttons (clicking 🐞 from fullscreen showed
  // "🔧 Solution issue" right after the user used 🔧 to open Tools, plain
  // confusing). Stripped all icons — the row text plus the existing ✓
  // selected indicator + hover highlight carry the affordance.
  // Radio + click-to-deselect semantics. Clicking a row makes that scope
  // exclusive (any other scope bits get cleared). Clicking the row whose
  // scope is already the current selection clears everything — which is
  // also what Unflag all does, but matches the user's expectation that
  // "second click on the same row turns it off". Previous implementation
  // flipped each row's bit independently; from "Both" + click "Task issue"
  // that meant "Solution issue" got left selected (only task bit toggled
  // off), completely against the user's "pick a side" mental model.
  menu.appendChild(makeRow('Solution issue', 'solution', () => {
    if (flaggedScope(ex.id) === 'solution') {
      setFlaggedMode(ex.id, 'solution', false);
    } else {
      setFlaggedMode(ex.id, 'solution', true);
      setFlaggedMode(ex.id, 'task', false);
    }
  }));
  menu.appendChild(makeRow('Task issue', 'task', () => {
    if (flaggedScope(ex.id) === 'task') {
      setFlaggedMode(ex.id, 'task', false);
    } else {
      setFlaggedMode(ex.id, 'task', true);
      setFlaggedMode(ex.id, 'solution', false);
    }
  }));
  menu.appendChild(makeRow('Both', 'both', () => {
    if (flaggedScope(ex.id) === 'both') {
      setFlaggedMode(ex.id, 'solution', false);
      setFlaggedMode(ex.id, 'task', false);
    } else {
      setFlaggedMode(ex.id, 'solution', true);
      setFlaggedMode(ex.id, 'task', true);
    }
  }));
  menu.appendChild(el('div', { class: 'flag-menu-sep' }));
  const unflagRow = el('button', { type: 'button', class: 'flag-menu-row flag-menu-clear' }, 'Unflag all');
  unflagRow.addEventListener('click', (e) => {
    e.stopPropagation();
    setFlaggedMode(ex.id, 'solution', false);
    setFlaggedMode(ex.id, 'task', false);
    refreshIndicators();
  });
  menu.appendChild(unflagRow);

  // Right-align the menu's right edge with the anchor's right edge — for a
  // 🐞 button in a card's top-right action row this means the menu drops
  // DOWN-LEFT of the button (standard "top-right action menu" pattern à la
  // GitHub / VS Code). Mirrors the position+measure+show pattern that
  // installSidebarTooltip uses; measuring AFTER setting position:fixed is
  // load-bearing — a default-flow .flag-menu's getBoundingClientRect()
  // reports width ≈ viewport (because it's display:block under body), which
  // would drive `left = rect.right - menuW` into a huge negative → clamped
  // to 8 → menu nailed to viewport's left edge. That was the actual root
  // cause of the misplaced menu the user kept hitting.
  document.body.appendChild(menu);
  const rect = anchorBtn.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    console.warn('openFlagMenu: anchor button has zero bounding rect (display:none or detached?) — aborting menu open', anchorBtn);
    try { menu.remove(); } catch {}
    return;
  }
  // Stage 1: take the menu out of normal flow + hide it so it measures
  // its real intrinsic size (capped by CSS min-width: 180px) without
  // flashing at (0,0) first.
  menu.style.position = 'fixed';
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';
  const menuRect = menu.getBoundingClientRect();
  const menuW = menuRect.width || 200;
  const menuH = menuRect.height || 0;
  // Stage 2: compute the real position from accurate dimensions.
  let left = rect.right - menuW;
  left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
  let top = rect.bottom + 6;
  if (top + menuH > window.innerHeight - 8 && rect.top - menuH - 6 > 8) {
    top = rect.top - menuH - 6;
  }
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  menu.style.visibility = '';

  refreshIndicators();
  _activeFlagMenu = menu;

  const close = () => {
    if (_activeFlagMenu === menu) _activeFlagMenu = null;
    try { menu.remove(); } catch {}
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey);
  };
  const onDocClick = (e) => {
    if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
    close();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  // Capture phase so we beat the document-level click-dismiss handlers
  // registered by sync-menu / llm-menu / issues-menu without those handlers
  // closing us prematurely.
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
  }, 0);
}
function getTaskFixDraft(id) { return storageGet(KEY.taskFixDraftPrefix + id, null); }
function setTaskFixDraft(id, payload) {
  // Same emptiness rule as setFixDraft — Quick Flag (`{flagged:true}` with
  // no other content) keeps the entry alive so it shows up in the queue.
  const empty = !payload
    || (!payload.flagged
        && !payload.additional && !payload.suggestedUrl
        && (payload.existingLinkIdx == null || payload.existingLinkIdx === '')
        && (!payload.type || payload.type === 'other'));
  const k = KEY.taskFixDraftPrefix + id;
  if (empty) {
    try { localStorage.removeItem(k); } catch {}
    // Stamp a tombstone time so the merge engine doesn't resurrect a stale
    // remote copy after we delete locally.
    stampSingleton(k);
  } else {
    storageSet(k, { ...payload, savedAt: new Date().toISOString() });
    stampSingleton(k);
  }
  markSyncDirty();
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

// Flat list of every queued issue draft (answer-fix + task-fix), each entry
// tagged with its mode so the queue UI can route Edit / Open correctly.
function collectAllIssueDrafts() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    let mode = null, exId = null;
    if (k.startsWith(KEY.fixDraftPrefix)) {
      mode = 'solution'; exId = k.slice(KEY.fixDraftPrefix.length);
    } else if (k.startsWith(KEY.taskFixDraftPrefix)) {
      mode = 'task'; exId = k.slice(KEY.taskFixDraftPrefix.length);
    } else {
      continue;
    }
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(k)); } catch {}
    if (!draft) continue;
    items.push({ key: k, mode, exId, draft });
  }
  // Newest first so the user sees what they just queued at the top.
  items.sort((a, b) => (b.draft.savedAt || '').localeCompare(a.draft.savedAt || ''));
  return items;
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
  stampCollectionItem(KEY.done, id, v);
  markSyncDirty();
}
function setBookmark(id, v) {
  const m = storageGet(KEY.bookmark, {}); if (v) m[id] = true; else delete m[id]; storageSet(KEY.bookmark, m);
  stampCollectionItem(KEY.bookmark, id, v);
  markSyncDirty();
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

// Per-source markdown cache. Browse / Quiz / Docs / Help / Tools all parse the
// SAME static markdown strings repeatedly — every search keystroke used to
// re-parse every visible card's task + solution from scratch (~200+ marked.parse
// calls per keystroke for common queries). Map keyed on the markdown source
// keeps insertion order; when full we drop the oldest entry. Bounded so it
// doesn't grow unbounded under streaming verdict markdown or other dynamic use.
const _markdownCache = new Map();
const MARKDOWN_CACHE_MAX = 1000;

function renderMarkdown(md) {
  if (!md) return '';
  if (_markdownCache.has(md)) return _markdownCache.get(md);
  // marked v12 — safe defaults; we don't have user-supplied HTML to worry about.
  const html = marked.parse(md, { gfm: true, breaks: false });
  if (_markdownCache.size >= MARKDOWN_CACHE_MAX) {
    _markdownCache.delete(_markdownCache.keys().next().value);
  }
  _markdownCache.set(md, html);
  return html;
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
  // 200 ms trailing debounce. Without this every keystroke triggered the full
  // renderBrowse() pipeline (sidebar tree rebuild + main panel clear + marked.parse
  // per visible card), which on a query matching 100+ exercises blocked the main
  // thread long enough that even Backspace felt unresponsive.
  let _searchDebounceTimer = null;
  const SEARCH_DEBOUNCE_MS = 200;
  search.addEventListener('input', () => {
    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => {
      _searchDebounceTimer = null;
      State.filters.search = search.value;
      saveFilters();
      renderBrowse();
    }, SEARCH_DEBOUNCE_MS);
  });

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
    const domEl = el('details', { class: 'tree-domain', open: true, 'data-domain': dom.key });
    domEl.appendChild(el('summary', {},
      el('span', { class: 'label' }, dom.title.replace(/ \(.+?\)/, '')),
      el('small', { class: 'muted' }, `${doneEx}/${totalEx}`),
    ));

    for (const sec of dom.sections) {
      const exs = bySec.get(sec.number);
      if (!exs) continue;
      const secEl = el('details', { class: 'tree-section', open: false });
      const secLabel = sec.kind === 'killersh' ? '🎯 ' + sec.title : `${sec.number}. ${sec.title}`;
      // data-full-title drives the custom hover tooltip (installSidebarTooltip).
      secEl.appendChild(el('summary', { 'data-full-title': secLabel },
        el('span', { class: 'label' }, secLabel),
        el('small', {}, `${exs.length}`),
      ));
      for (const ex of exs) {
        const btn = el('button', {
          class: 'tree-exercise' + (isDone(ex.id) ? ' done' : '') + (isBookmark(ex.id) ? ' bookmarked' : ''),
          // Native title= would race + double-display against the custom tooltip;
          // aria-label keeps screen-reader announcement intact.
          'aria-label': ex.title,
          'data-full-title': ex.title,
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

// ---------- Browse sidebar hover tooltip ----------
//
// The sidebar tree (domain → section → exercise) keeps each label single-line
// with ellipsis truncation. Long titles (especially chadmcrowell-sourced
// "general" exercises where the H3 IS the task body, 150–280 chars) are
// invisible past the cut. This singleton fixed-position tooltip surfaces the
// full title on hover / focus for any element marked with data-full-title.
let _sidebarTooltipEl = null;
function ensureSidebarTooltip() {
  if (_sidebarTooltipEl) return _sidebarTooltipEl;
  _sidebarTooltipEl = el('div', { class: 'sidebar-tooltip', role: 'tooltip', 'aria-hidden': 'true' });
  document.body.appendChild(_sidebarTooltipEl);
  return _sidebarTooltipEl;
}
function installSidebarTooltip() {
  const tree = document.getElementById('sidebar-tree');
  if (!tree) return;
  const show = (target) => {
    const text = target.dataset.fullTitle;
    if (!text) return;
    const tip = ensureSidebarTooltip();
    tip.textContent = text;
    tip.setAttribute('aria-hidden', 'false');
    const r = target.getBoundingClientRect();
    // Render off-screen first to measure tooltip size, then position correctly.
    tip.style.visibility = 'hidden';
    tip.classList.add('sidebar-tooltip--visible');
    const tr = tip.getBoundingClientRect();
    const margin = 8;
    let left = r.right + 8;
    let top  = r.top;
    if (left + tr.width > window.innerWidth - margin) {
      // Right overflow → flip to left side.
      left = Math.max(margin, r.left - tr.width - 8);
    }
    if (top + tr.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - margin - tr.height);
    }
    if (top < margin) top = margin;
    tip.style.left = `${left}px`;
    tip.style.top  = `${top}px`;
    tip.style.visibility = 'visible';
  };
  const hide = () => {
    if (!_sidebarTooltipEl) return;
    _sidebarTooltipEl.classList.remove('sidebar-tooltip--visible');
    _sidebarTooltipEl.setAttribute('aria-hidden', 'true');
  };
  // Event delegation — any [data-full-title] inside the tree (section summary
  // or exercise button) triggers the tooltip.
  tree.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-full-title]');
    if (target) show(target);
  });
  tree.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-full-title]');
    if (target) hide();
  });
  tree.addEventListener('focusin', (e) => {
    const target = e.target.closest('[data-full-title]');
    if (target) show(target);
  });
  tree.addEventListener('focusout', hide);
  document.getElementById('sidebar')?.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  // Touch support: long-press (600ms) on a [data-full-title] entry shows the
  // tooltip. Touch devices have no hover, so without this iPhone / iPad
  // users can't see the full title of a clipped row at all.
  let lpTimer = null;
  let lpTarget = null;
  const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } lpTarget = null; };
  tree.addEventListener('touchstart', (e) => {
    const target = e.target.closest('[data-full-title]');
    if (!target) return;
    lpTarget = target;
    lpTimer = setTimeout(() => { lpTimer = null; if (lpTarget) show(lpTarget); }, 600);
  }, { passive: true });
  tree.addEventListener('touchmove', clearLp, { passive: true });
  tree.addEventListener('touchend', () => { clearLp(); setTimeout(hide, 1500); }, { passive: true });
  tree.addEventListener('touchcancel', () => { clearLp(); hide(); }, { passive: true });
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
  glm:       ['glm-4-plus', 'glm-4-flash', 'glm-4-air', 'glm-4-0520', 'glm-4-flashx'],
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
  const saveAndUse = document.getElementById('settings-save-and-use');
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
      // Badge content is now driven entirely by CSS — `::before` paints
      // "★ Active" on `.provider-card.active .provider-badge`. The earlier
      // JS-driven textContent ("★ active" / "✓") was duplicating that
      // pill, producing "★ Active ★ active" on the active row. Clear it
      // and let CSS own the rendering.
      const badge = card.querySelector('.provider-badge');
      if (badge) badge.textContent = '';
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
    refreshSaveAndUseVisibility();
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
    if (r.checked) {
      loadSlotIntoForm(r.value);
      refreshSaveAndUseVisibility();
    }
  }));

  // Persist the form into the selected provider's slot — NOTHING ELSE.
  // Switching the active provider is a separate intent (use the ⚡ Use
  // button on a row, or the secondary `⚡ Save & use` action below).
  // Decoupling these two actions fixes the previous "Save also silently
  // hijacks active" UX that confused users staring at a Selected ≠ Active
  // situation.
  function persistCurrentForm() {
    const provider = currentProvider();
    const v2 = readLLMConfig();
    v2.providers[provider] = {
      ...(v2.providers[provider] || emptyProviderSlot()),
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
      // Don't drop persisted .models on save — Test refreshes them.
    };
    v2.autoDoneThreshold = parseInt(autoDoneSelect.value, 10);
    writeLLMConfig(v2);
    return provider;
  }

  function activateProvider(provider) {
    const v2 = readLLMConfig();
    v2.active = provider;
    writeLLMConfig(v2);
    providerInputs.forEach(r => { r.checked = (r.value === provider); });
    loadSlotIntoForm(provider);
    refreshProviderBadges();
    refreshSaveAndUseVisibility();
    emitLLMSettingsChange();
    if (State.mode === 'browse') renderBrowse();
  }

  save?.addEventListener('click', () => {
    const provider = persistCurrentForm();
    refreshProviderBadges();
    refreshSaveAndUseVisibility();
    status.textContent = `✓ Saved ${provider}`;
    setTimeout(() => { status.textContent = ''; }, 1800);
    emitLLMSettingsChange();
    if (State.mode === 'browse') renderBrowse();
  });

  // Secondary action — Save + activate in one click. Only visible when
  // the form's provider is NOT the current active one (otherwise this
  // collapses to plain Save and has no extra value).
  saveAndUse?.addEventListener('click', () => {
    const provider = persistCurrentForm();
    activateProvider(provider);
    status.textContent = `⚡ Saved ${provider} and made it active`;
    setTimeout(() => { status.textContent = ''; }, 1800);
  });

  // Per-row ⚡ Use button — switch active without touching the form.
  // Wires once (provider list is static HTML); each card decides via CSS
  // whether to show its button based on .configured + :not(.active).
  document.querySelectorAll('.provider-card .use-active-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();   // don't bubble to the <label> (would toggle radio)
      const target = btn.dataset.use;
      if (!target) return;
      activateProvider(target);
      status.textContent = `⚡ ${target} is now active`;
      setTimeout(() => { status.textContent = ''; }, 1800);
    });
  });

  function refreshSaveAndUseVisibility() {
    if (!saveAndUse) return;
    const v2 = readLLMConfig();
    saveAndUse.hidden = (currentProvider() === v2.active);
  }

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
// Keys that must never leave the device. Used by collectExportable AND
// mergePayload so a key marked per-device is invisible to the sync engine
// in both directions.
function isPerDeviceKey(k) {
  return k === KEY.gistToken
      || k === KEY.syncMeta
      || k === KEY.prePullBackup
      || k === KEY.syncDirtyAt
      || k === KEY.autoSyncDisabled
      || k === KEY.syncBeaconedAt
      || k === KEY.deviceId;
}

// For older local state that pre-dates the keymeta side-table, synthesize
// timestamps so the first push carries a usable merge baseline. Items get
// "now" — close enough to make first push idempotent. After that, every
// future write goes through stampCollectionItem / stampSingleton and the
// timestamps are real.
function synthesizeKeymetaForLocalState() {
  const km = loadKeymeta();
  const now = new Date().toISOString();
  let dirty = false;

  for (const colKey of [KEY.done, KEY.bookmark]) {
    const col = storageGet(colKey, {}) || {};
    if (!km[colKey]) { km[colKey] = { items: {} }; dirty = true; }
    if (!km[colKey].items) { km[colKey].items = {}; dirty = true; }
    for (const id of Object.keys(col)) {
      if (!km[colKey].items[id]) { km[colKey].items[id] = { v: true, t: now }; dirty = true; }
    }
  }

  for (const singletonKey of [KEY.quizActive, KEY.quizSnapshots]) {
    const v = storageGet(singletonKey, undefined);
    if (v !== undefined && v !== null && !km[singletonKey]) {
      km[singletonKey] = { t: now };
      dirty = true;
    }
  }

  if (dirty) saveKeymeta(km);
}

function collectExportable() {
  synthesizeKeymetaForLocalState();
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('cka:')) continue;
    if (isPerDeviceKey(k)) continue;
    // NOTE: cka:sync:keymeta IS included — the merge engine on the receiving
    // device needs the per-key + per-id timestamps to reconcile correctly.
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
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    meta: { lastPushDeviceId: getDeviceId() },
    data,
  };
}

// Preserve any locally-saved LLM apiKey when an incoming (always-scrubbed)
// payload arrives. Works for both v1 (top-level apiKey) and v2 (per-provider
// providers[*].apiKey) shapes. Mutates `incoming` in place.
function preserveLocalLLMKeys(incoming) {
  const existing = storageGet(KEY.llmSettings, {}) || {};
  if (incoming.providers && existing.providers) {
    for (const [pk, slot] of Object.entries(incoming.providers)) {
      if (slot && !slot.apiKey && existing.providers[pk]?.apiKey) {
        incoming.providers[pk] = { ...slot, apiKey: existing.providers[pk].apiKey };
      }
    }
  } else if (!incoming.apiKey && existing.apiKey) {
    incoming.apiKey = existing.apiKey;
  }
  return incoming;
}

// v1 → v2 upgrade: synthesize keymeta using the payload's exportedAt as the
// timestamp for every entry. Coarse but enough for first-pull merge to make
// "remote was written before this device's edits" judgements correctly.
function upgradeV1ToV2(payload) {
  const t = payload.exportedAt || new Date().toISOString();
  const data = { ...payload.data };
  const keymeta = { ...(data[KEY.syncKeymeta] || {}) };
  for (const colKey of [KEY.done, KEY.bookmark]) {
    const col = data[colKey];
    if (col && typeof col === 'object') {
      if (!keymeta[colKey]) keymeta[colKey] = { items: {} };
      if (!keymeta[colKey].items) keymeta[colKey].items = {};
      for (const id of Object.keys(col)) {
        if (!keymeta[colKey].items[id]) keymeta[colKey].items[id] = { v: !!col[id], t };
      }
    }
  }
  for (const singletonKey of [KEY.quizActive, KEY.quizSnapshots]) {
    if (singletonKey in data && !keymeta[singletonKey]) {
      keymeta[singletonKey] = { t };
    }
  }
  data[KEY.syncKeymeta] = keymeta;
  return { schemaVersion: 2, exportedAt: t, meta: payload.meta || {}, data };
}

function pickNewer(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return ((b.t || '') > (a.t || '')) ? b : a;
}

// Per-key + per-id merge. Replaces the old integral-overwrite importPayload
// on every code path EXCEPT the undo-Pull restoreFromBackup (which still
// needs to faithfully wipe what Pull added).
//
// Rules:
//   - Collection (cka:done, cka:bookmark): for each id seen on either side,
//     pick the keymeta entry with the later `t`. If winner.v is true, the
//     id ends up in the collection; if false (tombstone), it gets removed.
//   - Per-exercise (cka:answer:*): take whichever side has the later
//     `savedAt`. If local has no savedAt (legacy), adopt remote unconditionally.
//   - Singleton with keymeta (quizActive, quizSnapshots): take whichever
//     side's keymeta.t is later.
//   - Other singleton without keymeta on either side: if local doesn't have
//     the key, adopt remote; otherwise leave local alone (UI prefs:
//     this-device-wins is the right default).
//   - cka:llm:settings: route through preserveLocalLLMKeys before any storage write.
function mergePayload(payload, opts) {
  if (!payload || (payload.schemaVersion !== 1 && payload.schemaVersion !== 2) || !payload.data) {
    throw new Error('Unrecognized backup format (schemaVersion mismatch).');
  }
  const remoteV2 = (payload.schemaVersion === 2) ? payload : upgradeV1ToV2(payload);
  const remoteData = remoteV2.data;
  const remoteKeymeta = remoteData[KEY.syncKeymeta] || {};
  const localKeymeta = loadKeymeta();
  const mergedKeymeta = { ...localKeymeta };

  for (const [k, vRemote] of Object.entries(remoteData)) {
    if (!k.startsWith('cka:')) continue;
    if (isPerDeviceKey(k)) continue;
    if (k === KEY.syncKeymeta) continue; // handled at the end

    // ---- Collection: cka:done / cka:bookmark
    if (k === KEY.done || k === KEY.bookmark) {
      const local = storageGet(k, {}) || {};
      const lItems = (localKeymeta[k] || {}).items || {};
      const rItems = (remoteKeymeta[k] || {}).items || {};
      const mergedCol = { ...local };
      const mergedItems = { ...lItems };
      const ids = new Set([
        ...Object.keys(lItems),
        ...Object.keys(rItems),
        ...Object.keys(local || {}),
        ...Object.keys(vRemote || {}),
      ]);
      for (const id of ids) {
        // Fall back: if a side has the id in the collection but no keymeta
        // (legacy v1 payload pre-upgrade), synthesize an entry at the
        // payload's exportedAt time so the comparison is meaningful.
        const lEntry = lItems[id] || (local[id] ? { v: true, t: remoteV2.exportedAt } : null);
        const rEntry = rItems[id] || ((vRemote && vRemote[id]) ? { v: true, t: remoteV2.exportedAt } : null);
        const winner = pickNewer(lEntry, rEntry);
        if (!winner) continue;
        mergedItems[id] = winner;
        if (winner.v) mergedCol[id] = true;
        else delete mergedCol[id];
      }
      storageSet(k, mergedCol);
      mergedKeymeta[k] = { items: mergedItems };
      continue;
    }

    // ---- Per-exercise: cka:answer:*
    if (k.startsWith(KEY.answerPrefix)) {
      const local = storageGet(k, null);
      if (!local) { storageSet(k, vRemote); continue; }
      const lSaved = local.savedAt || '';
      const rSaved = (vRemote && vRemote.savedAt) || '';
      if (rSaved && rSaved > lSaved) storageSet(k, vRemote);
      continue;
    }

    // ---- Singleton with keymeta
    if (k === KEY.quizActive || k === KEY.quizSnapshots) {
      const lTime = (localKeymeta[k] || {}).t || '';
      const rTime = (remoteKeymeta[k] || {}).t || remoteV2.exportedAt || '';
      if (!lTime || rTime > lTime) {
        storageSet(k, vRemote);
        mergedKeymeta[k] = { t: rTime };
        if (k === KEY.quizActive) {
          try { refreshQuizTabDot(); } catch {}
        }
      }
      continue;
    }

    // ---- LLM settings: special API key preservation. Same tombstone
    //      invariant as the generic singleton branch — only adopt remote on a
    //      cold device (no local keymeta) or when remote is strictly newer.
    if (k === KEY.llmSettings && vRemote && typeof vRemote === 'object') {
      const lTime = (localKeymeta[k] || {}).t || '';
      const rTime = (remoteKeymeta[k] || {}).t || remoteV2.exportedAt || '';
      if (!lTime || (rTime && rTime > lTime)) {
        storageSet(k, preserveLocalLLMKeys({ ...vRemote }));
        mergedKeymeta[k] = { t: rTime || remoteV2.exportedAt };
      }
      continue;
    }

    // ---- All other singletons (theme, filters, docsLastUrl, fix-drafts,
    //      UI nav…). Invariants:
    //        - localKeymeta[k] presence  = local has SEEN this key (now or
    //          previously). Combined with localStorage absence, that's a
    //          tombstone (the user deleted it locally at time lTime).
    //        - rTime is the remote's last-write timestamp for this key.
    //
    //      Adopt remote ONLY when local has never seen the key (so we
    //      cold-adopt) OR when remote.t is STRICTLY newer than local's last
    //      activity time. Otherwise keep local — including the deleted case,
    //      which is the bug commit 03a591b missed: removed queue drafts kept
    //      reappearing because the second branch was greedy about resurrecting
    //      remote whenever the local value was gone.
    const lTime = (localKeymeta[k] || {}).t || '';
    const rTime = (remoteKeymeta[k] || {}).t || '';
    const remoteHas = vRemote !== undefined && vRemote !== null;
    if (!lTime && remoteHas) {
      // Cold-adopt: local has no record of this key at all.
      storageSet(k, vRemote);
      if (rTime) mergedKeymeta[k] = { t: rTime };
    } else if (remoteHas && rTime && rTime > lTime) {
      // Remote write is strictly newer than local's last activity (including
      // deletion). Adopt — overrides our tombstone too, which is correct:
      // another device re-added the entry after our delete.
      storageSet(k, vRemote);
      mergedKeymeta[k] = { t: rTime };
    }
    // else: keep local state — this includes tombstones (no resurrection).
  }

  saveKeymeta(mergedKeymeta);
}

// Integral overwrite — used ONLY by the undo-Pull restore path. Faithfully
// puts the pre-Pull snapshot back, including removing keys the Pull added.
function restoreFromBackup(payload) {
  if (!payload || (payload.schemaVersion !== 1 && payload.schemaVersion !== 2) || !payload.data) {
    throw new Error('Unrecognized backup format (schemaVersion mismatch).');
  }
  for (const [k, v] of Object.entries(payload.data)) {
    if (!k.startsWith('cka:')) continue;
    if (isPerDeviceKey(k)) continue;
    if (k === KEY.llmSettings && v && typeof v === 'object') preserveLocalLLMKeys(v);
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
      backupBeforePull();
      withSyncDirtySuppressed(() => mergePayload(payload, { source: 'import' }));
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
//
// `lastSyncedGistUpdatedAt` is stamped on the success path of every push +
// pull so the next push's pre-flight has a fresh baseline to compare against.
// Lives in cka:sync:meta (same per-device key as lastPushAt/lastPullAt) so it
// never round-trips through the gist itself (excluded via isPerDeviceKey()).
function stampSyncedRemote(updatedAt) {
  if (!updatedAt) return;
  const m = storageGet(KEY.syncMeta, {}) || {};
  m.lastSyncedGistUpdatedAt = updatedAt;
  storageSet(KEY.syncMeta, m);
}

async function doGistPush(opts) {
  if (!window.GistSync) throw new Error('sync.js failed to load');
  const token = getGistToken();
  if (!token) throw new Error('Need a GitHub PAT first');
  let id = getGistId();
  // Conflict pre-flight: when there's a remote AND a baseline AND the remote
  // is newer, automatically pull → merge → push. The merge engine handles
  // both single-device baseline drift (this device's own beacon-push) and
  // real cross-device concurrent edits — local pending changes never get
  // lost. No confirm() dialog on any code path.
  if (id) {
    const baseline = (storageGet(KEY.syncMeta, {}) || {}).lastSyncedGistUpdatedAt;
    if (baseline) {
      try {
        const remote = await window.GistSync.getGistMeta(token, id);
        if (remote.updated_at && remote.updated_at > baseline) {
          const remotePayload = await window.GistSync.readGist(token, id);
          withSyncDirtySuppressed(() => mergePayload(remotePayload, { source: 'auto-merge' }));
          stampSyncedRemote(remote.updated_at);
        }
      } catch (e) {
        // Pre-flight failed (network, auth, etc) — fall through to the real
        // push which will surface the same error with the same UI.
      }
    }
  }
  const payload = collectExportable();
  if (id) {
    const res = await window.GistSync.updateGist(token, id, payload);
    stampSyncedRemote(res?.updated_at);
  } else {
    const res = await window.GistSync.createGist(token, payload);
    id = res.id;
    setGistId(id);
    stampSyncedRemote(res?.updated_at);
  }
  return id;
}

async function doGistPull() {
  if (!window.GistSync) throw new Error('sync.js failed to load');
  const token = getGistToken();
  const id = getGistId();
  if (!token || !id) throw new Error('Need both PAT and Gist ID');
  const payload = await window.GistSync.readGist(token, id);
  // Stamp baseline so a subsequent push's conflict pre-flight knows we just
  // saw the remote at this revision. Cheap second GET to avoid duplicating
  // updated_at parsing inside the truncation handler in readGist.
  try {
    const meta = await window.GistSync.getGistMeta(token, id);
    stampSyncedRemote(meta?.updated_at);
  } catch {} // baseline stamping is best-effort
  return payload;
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

  async function _run(op, doFn, opts) {
    if (inFlight) throw new Error(`A ${inFlight.op} is already in progress`);
    const origin = (opts && opts.origin === 'auto') ? 'auto' : 'manual';
    inFlight = { op, origin, startedAt: new Date().toISOString() };
    notify();
    try {
      const r = await doFn(opts);
      const meta = loadMeta();
      const key = `last${op[0].toUpperCase()}${op.slice(1)}At`;
      meta[key] = new Date().toISOString();
      // Track the origin so the popover can distinguish auto vs manual on
      // the "Last push" line. Only meaningful for push (pull / test stay
      // manual-only today).
      if (op === 'push') meta.lastPushOrigin = origin;
      meta.lastError = null;
      saveMeta(meta);
      inFlight = null;
      notify();
      return r;
    } catch (e) {
      const meta = loadMeta();
      meta.lastError = {
        op,
        origin,
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
    runPush: (opts) => _run('push', doGistPush, opts),
    runPull: () => _run('pull', doGistPull),
    runTest: () => _run('test', doGistTest),
  };
})();

// ---------- Auto-sync (debounced 30s) ----------
//
// Fires Sync.runPush() ~30s after the last write to a "sync-worthy" key. UI
// prefs (theme, filters, tools subtab) don't trigger auto-sync. Skips silently
// when no gist is configured, when the user has opted out, when offline, or
// when another sync op is in flight. On page-close, attempts a best-effort
// flush via fetch(..., {keepalive:true}) so a fresh edit isn't lost.
const AUTO_SYNC_DEBOUNCE_MS = 30_000;
let _autoSyncTimer = null;
// Set by installSyncMenu() — opens the ☁ Sync popover from anywhere in the
// SPA without depending on a synthetic click on sync-toggle (unreliable on
// mobile Safari). Stays null until installSyncMenu has run at boot.
let _openSyncMenuExternal = null;

// Tiny pub/sub for auto-sync state transitions. The ☁ status dot + the
// popover diagnostic line both subscribe so they can show "pending" /
// "armed (next push in 22s)" without polling.
const AUTO_SYNC_LISTENERS = new Set();
function onAutoSyncStateChange(fn) { AUTO_SYNC_LISTENERS.add(fn); return () => AUTO_SYNC_LISTENERS.delete(fn); }
function notifyAutoSyncState() {
  for (const fn of AUTO_SYNC_LISTENERS) {
    try { fn(); } catch (e) { console.error('auto-sync listener threw', e); }
  }
}

function isAutoSyncEnabled() {
  if (!window.GistSync) return false;
  if (storageGet(KEY.autoSyncDisabled, false)) return false;
  return !!(getGistToken() && getGistId());
}

// Diagnostic snapshot of why auto-sync is in its current state. Powers the
// popover top line so the user can SEE without DevTools why a push isn't
// firing. `dirtyAt` is the ISO of the last edit that armed the timer; the
// renderer derives "next push in Xs" from `AUTO_SYNC_DEBOUNCE_MS - elapsed`.
function getAutoSyncStatus() {
  const hasPat = !!getGistToken();
  const hasId  = !!getGistId();
  const optedOut = !!storageGet(KEY.autoSyncDisabled, false);
  const dirtyAt  = storageGet(KEY.syncDirtyAt, null);
  const meta     = storageGet(KEY.syncMeta, {}) || {};
  const lastError = meta.lastError && meta.lastError.op === 'push' ? meta.lastError : null;
  let reasonDisabled = null;
  if (!window.GistSync) reasonDisabled = 'syncjs-missing';
  else if (!hasPat) reasonDisabled = 'no-pat';
  else if (!hasId)  reasonDisabled = 'no-gist-id';
  else if (optedOut) reasonDisabled = 'opted-out';
  return {
    enabled: reasonDisabled == null,
    reasonDisabled,
    armed: _autoSyncTimer != null,
    dirtyAt,
    lastPushOrigin: meta.lastPushOrigin || null,
    lastError,
  };
}

// One-shot DevTools breadcrumb so a user wondering "why isn't auto-sync
// firing?" has SOMETHING to find without going to the Settings tab. Only
// fires once per session to avoid log spam on every edit.
let _autoSyncSkipLogged = false;
function _logAutoSyncSkipOnce() {
  if (_autoSyncSkipLogged) return;
  _autoSyncSkipLogged = true;
  const s = getAutoSyncStatus();
  const why = s.reasonDisabled === 'syncjs-missing' ? 'sync.js failed to load'
            : s.reasonDisabled === 'opted-out'      ? 'user opted out via Settings → Sync'
            : s.reasonDisabled === 'no-pat'         ? 'GitHub PAT missing'
            : s.reasonDisabled === 'no-gist-id'     ? 'Gist ID missing — run a manual ⬆ Push first to create one'
            : 'unknown';
  console.info('[auto-sync] dirty edit ignored — auto-sync disabled:', why);
}

// Random per-device id, minted once on first sync-enabled boot. Lives only
// in localStorage (excluded from payload via the cka:sync:deviceId prefix
// skip). Surfaces in payload.meta.lastPushDeviceId for cross-device logs.
function getDeviceId() {
  let id = storageGet(KEY.deviceId, null);
  if (id) return id;
  id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  storageSet(KEY.deviceId, id);
  return id;
}

// ---------- Sync keymeta — per-key + per-id timestamps for merge ----------
//
// `cka:sync:keymeta` shape:
//   {
//     "cka:done":     { items: { exId: { v: bool, t: ISO } } },
//     "cka:bookmark": { items: { exId: { v: bool, t: ISO } } },
//     "cka:quiz:active":    { t: ISO },
//     "cka:quiz:snapshots": { t: ISO },
//     ...
//   }
// Collection types (done/bookmark) track each id's last set/unset time so a
// merge can union the live set + remove tombstoned ids correctly. Singletons
// (active quiz, snapshots) just need the last-write time. Per-exercise answers
// (`cka:answer:*`) already carry `savedAt` inside their value — no keymeta
// needed for them.
function loadKeymeta() { return storageGet(KEY.syncKeymeta, {}) || {}; }
function saveKeymeta(km) { storageSet(KEY.syncKeymeta, km); }

function stampCollectionItem(collectionKey, itemId, value) {
  const km = loadKeymeta();
  if (!km[collectionKey]) km[collectionKey] = { items: {} };
  if (!km[collectionKey].items) km[collectionKey].items = {};
  km[collectionKey].items[itemId] = { v: !!value, t: new Date().toISOString() };
  saveKeymeta(km);
}

function stampSingleton(key) {
  const km = loadKeymeta();
  km[key] = { t: new Date().toISOString() };
  saveKeymeta(km);
}

// Mutations driven by the merge engine (pull, auto-merge) must not re-arm the
// auto-sync timer — otherwise pull-merge-push would loop forever.
let _suppressDirty = false;
function withSyncDirtySuppressed(fn) {
  const prev = _suppressDirty;
  _suppressDirty = true;
  try { return fn(); } finally { _suppressDirty = prev; }
}

function markSyncDirty() {
  if (_suppressDirty) return;
  if (!isAutoSyncEnabled()) {
    _logAutoSyncSkipOnce();
    return;
  }
  storageSet(KEY.syncDirtyAt, new Date().toISOString());
  scheduleAutoSync();
}

function scheduleAutoSync() {
  if (_autoSyncTimer) clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(runAutoSync, AUTO_SYNC_DEBOUNCE_MS);
  notifyAutoSyncState();
}

async function runAutoSync() {
  _autoSyncTimer = null;
  if (!isAutoSyncEnabled()) return;
  if (!navigator.onLine) {
    window.addEventListener('online', scheduleAutoSync, { once: true });
    return;
  }
  if (Sync.getState().inFlight) {
    // Reschedule after the current op clears. Don't loop tightly.
    scheduleAutoSync();
    return;
  }
  try {
    await Sync.runPush({ origin: 'auto' });
    try { localStorage.removeItem(KEY.syncDirtyAt); } catch {}
  } catch (e) {
    // The Sync IIFE has already stamped lastError → the popover renders it.
    // We don't auto-retry tightly; the next markSyncDirty() re-arms the timer.
    console.warn('[auto-sync] push failed:', e.message);
  } finally {
    notifyAutoSyncState();
  }
}

// Dirty flags older than this on boot or visibility-restore are discarded
// rather than replayed — they almost certainly came from a long-dead session
// and pushing them now would surprise the user with state from days ago.
const SYNC_DIRTY_TTL_MS = 60 * 60 * 1000;

function bootAutoSync() {
  // If last session's beforeunload fired a beacon push, the gist's updated_at
  // advanced server-side but we never read the response. Refresh the local
  // baseline from the actual current gist state so the next push's pre-flight
  // doesn't mistake our own beacon push for "someone else updated the gist".
  if (isAutoSyncEnabled() && storageGet(KEY.syncBeaconedAt, null)) {
    const token = getGistToken(); const id = getGistId();
    if (token && id) {
      window.GistSync.getGistMeta?.(token, id).then(meta => {
        if (meta?.updated_at) stampSyncedRemote(meta.updated_at);
        try { localStorage.removeItem(KEY.syncBeaconedAt); } catch {}
      }).catch(() => {/* try again on next boot */});
    }
  }

  // Replay a pending dirty flag from a previous session — but only if it's
  // recent enough to plausibly represent live work. Anything older than
  // SYNC_DIRTY_TTL_MS is the residue of a long-closed tab and gets dropped.
  if (isAutoSyncEnabled()) {
    const dirtyIso = storageGet(KEY.syncDirtyAt, null);
    if (dirtyIso) {
      const age = Date.now() - Date.parse(dirtyIso);
      if (age < SYNC_DIRTY_TTL_MS) {
        scheduleAutoSync();
      } else {
        try { localStorage.removeItem(KEY.syncDirtyAt); } catch {}
        console.info('[auto-sync] discarded stale dirty flag (older than 1h)');
      }
    }
  }

  // Best-effort flush on page close. keepalive:true lets the request survive
  // the document teardown that an inflight regular fetch wouldn't. After a
  // successful enqueue we record `syncBeaconedAt` so bootAutoSync on the next
  // session can refresh the baseline, and clear the dirty flag so a duplicate
  // push doesn't fire on the next boot.
  window.addEventListener('beforeunload', () => {
    if (!isAutoSyncEnabled()) return;
    if (!_autoSyncTimer && !storageGet(KEY.syncDirtyAt, null)) return;
    try {
      const ok = window.GistSync.beaconPush?.(getGistToken(), getGistId(), collectExportable());
      if (ok) {
        try { localStorage.setItem(KEY.syncBeaconedAt, JSON.stringify(new Date().toISOString())); } catch {}
        try { localStorage.removeItem(KEY.syncDirtyAt); } catch {}
      }
    } catch {}
  });

  // Background-tab safety net. Chrome throttles setTimeout in background
  // tabs to as little as 1/minute, so a 30s debounce can sleep arbitrarily
  // long. When the tab returns to foreground, flush immediately if the
  // dirty flag is already past its window, otherwise schedule the remainder.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!isAutoSyncEnabled()) return;
    // Idle-tab auto-pull: also check whether another device pushed updates
    // while we were in the background. Independent of dirty state — this
    // is the path that catches the "client B left the tab open all night
    // while client A studied on another device" scenario. Throttled in
    // maybeAutoPull itself so flicking visibility doesn't hammer GitHub.
    maybeAutoPull();
    const dirtyIso = storageGet(KEY.syncDirtyAt, null);
    if (!dirtyIso) return;
    const elapsed = Date.now() - Date.parse(dirtyIso);
    if (_autoSyncTimer) { clearTimeout(_autoSyncTimer); _autoSyncTimer = null; }
    if (elapsed >= SYNC_DIRTY_TTL_MS) {
      // Same TTL as boot — discard rather than push state from a long-idle tab.
      try { localStorage.removeItem(KEY.syncDirtyAt); } catch {}
      return;
    }
    if (elapsed >= AUTO_SYNC_DEBOUNCE_MS) {
      runAutoSync();
    } else {
      _autoSyncTimer = setTimeout(runAutoSync, AUTO_SYNC_DEBOUNCE_MS - elapsed);
      notifyAutoSyncState();
    }
  });

  // Initial head-check on boot. Async; doesn't block init. Covers the
  // "user reopened the SPA after another device pushed" case.
  maybeAutoPull();
}

// Head-check whether the gist advanced beyond our baseline and pull-merge
// if so. Independent of the dirty-flag-driven push path — that path only
// fires when this device has edits, leaving idle-tab clients (no local
// edits) blind to changes from other devices. doGistPush already does a
// pre-flight pull-merge before push (commit 3d482ed), so we skip the
// head-check entirely when a push is armed/pending; otherwise it's
// redundant network.
async function maybeAutoPull() {
  if (!isAutoSyncEnabled()) return;
  if (!navigator.onLine) return;
  if (Sync.getState().inFlight) return;
  if (_autoSyncTimer || storageGet(KEY.syncDirtyAt, null)) return;

  const token = getGistToken();
  const id = getGistId();
  if (!token || !id) return;

  // Session-scoped throttle: ≤ 1 head-check per 5 min per tab. Stops
  // visibility-flick from hammering the API; cross-tab is naturally
  // independent (each tab has its own sessionStorage).
  const lastIso = sessionStorage.getItem('cka:sync:lastPollAt');
  const last = lastIso ? Date.parse(lastIso) : 0;
  if (Date.now() - last < 5 * 60 * 1000) return;
  try { sessionStorage.setItem('cka:sync:lastPollAt', new Date().toISOString()); } catch {}

  let meta;
  try {
    meta = await window.GistSync.getGistMeta(token, id);
  } catch (e) {
    console.warn('[auto-pull] head-check failed:', e.message);
    return;
  }
  if (!meta?.updated_at) return;
  const baseline = (storageGet(KEY.syncMeta, {}) || {}).lastSyncedGistUpdatedAt;
  if (baseline && meta.updated_at <= baseline) return;

  try {
    const remotePayload = await Sync.runPull({ origin: 'auto-poll' });
    if (!remotePayload) return;
    // mergePayload handles cross-device concurrent edits — set union for
    // done/bookmark, take-newer for answers, tombstone-aware for queue
    // drafts. Mutations inside withSyncDirtySuppressed so the merge
    // doesn't re-arm the auto-push timer.
    // doGistPull already stamps lastSyncedGistUpdatedAt internally;
    // mergePayload applies the remote payload to local state.
    withSyncDirtySuppressed(() => mergePayload(remotePayload, { source: 'auto-pull' }));
    notifyAutoSyncState();
    // Reload so already-mounted surfaces pick up the merged state. Cards
    // under iteration A's incremental render are built once at the
    // initial Browse paint; the LLM verdict slot reads saved.verdict at
    // that single moment via renderVerdict(...) inside renderAnswerBox.
    // Done/Bookmark classes on cards + sidebar tree have the same
    // mount-time-only binding. Without a reload, an auto-pull would
    // silently land verdict (and other merged state) into localStorage
    // but the UI wouldn't show it — exactly the symptom the user saw
    // ("answer text synced but check result didn't"). The answer text
    // looked synced only because CodeMirror lazy-inits on focus and
    // reads localStorage at that moment, masking the larger issue.
    // Mirrors manual ⬇ Pull's 500 ms reload (line 2166); toast survives
    // the reload via the same sessionStorage handoff used by the header
    // 🔄 button's manualRefresh path.
    try {
      sessionStorage.setItem('cka:refresh-toast', JSON.stringify({
        msg: '✨ Synced changes from another device',
        kind: 'ok',
        at: Date.now(),
      }));
    } catch {}
    setTimeout(() => { location.reload(); }, 500);
  } catch (e) {
    console.warn('[auto-pull] pull failed:', e.message);
  }
}

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
    `  ${c.answers} saved answers\nContinue?\n\n` +
    `(Your current local state is snapshotted to a pre-pull backup — you can Restore it from Settings → Sync.)`
  );
}

// Pre-pull backup — taken just before mergePayload() folds the gist into localStorage.
// Reuses collectExportable() so the format matches the gist exactly. Lives
// under cka:sync:prepull-backup (skipped from gist round-trip — see export/import).
function backupBeforePull() {
  try {
    storageSet(KEY.prePullBackup, {
      takenAt: new Date().toISOString(),
      payload: collectExportable(),
    });
  } catch (e) {
    console.warn('[sync] pre-pull backup failed (continuing with pull):', e.message);
  }
}

function getPrePullBackup()  { return storageGet(KEY.prePullBackup, null); }
function clearPrePullBackup() { try { localStorage.removeItem(KEY.prePullBackup); } catch {} }

function restoreFromPrePull() {
  const backup = getPrePullBackup();
  if (!backup || !backup.payload) {
    alert('No pre-pull backup available.');
    return;
  }
  if (!confirm(
    `Restore your local state to the snapshot taken ${humanTimeAgo(backup.takenAt)}?\n\n` +
    `This overwrites the data that the Pull replaced. (The page will reload.)`
  )) return;
  try {
    restoreFromBackup(backup.payload);
    clearPrePullBackup();
    setTimeout(() => location.reload(), 300);
  } catch (e) {
    alert(`Restore failed: ${e.message}`);
  }
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
    if (meta.lastPushAt) {
      const tag = meta.lastPushOrigin === 'auto' ? ' (auto)' : '';
      lines.push(`⬆ Last push${tag}: ${humanTimeAgo(meta.lastPushAt)}`);
    }
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

  // ↩ Restore pre-pull backup — shown only when a backup exists.
  const restoreBtn = document.getElementById('sync-restore-prepull');
  function refreshRestoreBtn() {
    if (!restoreBtn) return;
    const backup = getPrePullBackup();
    if (!backup) { restoreBtn.hidden = true; return; }
    restoreBtn.hidden = false;
    restoreBtn.textContent = `↩ Restore pre-pull backup (taken ${humanTimeAgo(backup.takenAt)})`;
  }
  refreshRestoreBtn();
  restoreBtn?.addEventListener('click', () => restoreFromPrePull());
  // Refresh the label whenever a sync op completes (after a Pull, a new backup
  // exists; after the user clicks Push the existing backup stays untouched).
  Sync.subscribe(refreshRestoreBtn);

  // Auto-sync toggle — checkbox is "Auto-push enabled?". Storage key is the
  // INVERSE (cka:sync:autoDisabled) so the default value `null/false`
  // corresponds to "enabled" without any migration.
  const autoToggle = document.getElementById('sync-auto-toggle');
  if (autoToggle) {
    autoToggle.checked = !storageGet(KEY.autoSyncDisabled, false);
    autoToggle.addEventListener('change', () => {
      storageSet(KEY.autoSyncDisabled, !autoToggle.checked);
      // Re-arm the timer when the user opts BACK in and there's a pending
      // dirty flag from before; tear down the timer when they opt out.
      _autoSyncSkipLogged = false;  // reset the once-only DevTools breadcrumb
      if (!autoToggle.checked && _autoSyncTimer) {
        clearTimeout(_autoSyncTimer);
        _autoSyncTimer = null;
      } else if (autoToggle.checked && isAutoSyncEnabled() && storageGet(KEY.syncDirtyAt, null)) {
        scheduleAutoSync();
      }
      notifyAutoSyncState();
    });
  }

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
      backupBeforePull();
      withSyncDirtySuppressed(() => mergePayload(payload, { source: 'pull' }));
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

    status.replaceChildren();

    // Always-rendered diagnostic top line — answers "is auto-sync working?"
    const diagLine = renderAutoSyncDiagLine(inFlight);
    if (diagLine) status.appendChild(diagLine);

    if (!hasToken) {
      const d = document.createElement('div');
      d.textContent = 'Configure a GitHub PAT in Settings first';
      status.appendChild(d);
      return;
    }
    if (inFlight) {
      // Diagnostic line already covered the auto/manual flavour; show a brief
      // op label below for symmetry with the existing "Last X" surfaces.
      const d = document.createElement('div');
      d.textContent = `⏳ ${inFlight.op[0].toUpperCase()}${inFlight.op.slice(1)}ing…`;
      status.appendChild(d);
      return;
    }
    const lines = [];
    if (meta.lastError) {
      lines.push(`✗ Last ${meta.lastError.op} failed (${humanTimeAgo(meta.lastError.at)}): ${meta.lastError.message}`);
    }
    if (meta.lastPushAt) {
      const tag = meta.lastPushOrigin === 'auto' ? ' (auto)' : '';
      lines.push(`⬆ Last push${tag}: ${humanTimeAgo(meta.lastPushAt)}`);
    }
    if (meta.lastPullAt) lines.push(`⬇ Last pull: ${humanTimeAgo(meta.lastPullAt)}`);
    if (meta.lastTestAt) lines.push(`✓ Last test: ${humanTimeAgo(meta.lastTestAt)}`);
    if (!lines.length && !diagLine) {
      const d = document.createElement('div');
      d.textContent = 'Ready';
      status.appendChild(d);
      return;
    }
    for (const l of lines) {
      const d = document.createElement('div');
      d.textContent = l;
      status.appendChild(d);
    }
  }

  function renderAutoSyncDiagLine(inFlight) {
    const s = getAutoSyncStatus();
    let text;
    if (s.reasonDisabled === 'syncjs-missing') {
      text = '⚠ Auto-push unavailable — sync.js failed to load';
    } else if (s.reasonDisabled === 'no-pat') {
      text = '⚙️ Auto-push: needs a GitHub PAT — set in Settings → Sync';
    } else if (s.reasonDisabled === 'no-gist-id') {
      text = '⚙️ Auto-push: needs a Gist ID — run a manual ⬆ Push first to create one';
    } else if (s.reasonDisabled === 'opted-out') {
      text = '🔄 Auto-push: off — enable in Settings → Sync';
    } else if (inFlight && inFlight.op === 'push' && inFlight.origin === 'auto') {
      const secs = ((Date.now() - Date.parse(inFlight.startedAt)) / 1000).toFixed(1);
      text = `🔄 Auto-pushing… (${secs}s)`;
    } else if (s.armed && s.dirtyAt) {
      const dirtyElapsed = Math.max(0, (Date.now() - Date.parse(s.dirtyAt)) / 1000);
      const remaining = Math.max(0, AUTO_SYNC_DEBOUNCE_MS - dirtyElapsed * 1000);
      const secs = Math.ceil(remaining / 1000);
      const editAgo = dirtyElapsed < 1 ? 'just now' : `${Math.round(dirtyElapsed)}s ago`;
      text = secs > 0
        ? `🔄 Auto-push: on · next push in ~${secs}s (last edit ${editAgo})`
        : '🔄 Auto-push: about to fire…';
    } else if (s.dirtyAt) {
      // Dirty flag set but no armed timer — this is the unusual case where
      // beforeunload / visibilitychange left a flag without re-arming.
      const dirtyElapsed = Math.max(0, (Date.now() - Date.parse(s.dirtyAt)) / 1000);
      text = `🔄 Auto-push: on · waiting to fire (last edit ${Math.round(dirtyElapsed)}s ago)`;
    } else {
      // Idle. If we just pushed within the last 30s, mention it so the user
      // doesn't think nothing happened.
      const meta = storageGet(KEY.syncMeta, {}) || {};
      const lastPush = meta.lastPushAt;
      const recentPush = lastPush && (Date.now() - Date.parse(lastPush)) < 30_000;
      if (recentPush) {
        text = `✓ Auto-pushed ${humanTimeAgo(lastPush)} (caught last edit)`;
      } else {
        text = '🔄 Auto-push: on · idle';
      }
    }
    const d = document.createElement('div');
    d.textContent = text;
    d.className = 'sync-diag-line';
    return d;
  }

  let unsubscribe = null;
  let unsubscribeAuto = null;
  let tickInterval = null;
  function rerenderFromCurrent() { renderStatus(Sync.getState()); }
  function openMenu() {
    renderHeader();
    unsubscribe = Sync.subscribe(renderStatus);
    // Also subscribe to auto-sync state transitions so the diagnostic line
    // refreshes immediately when the timer arms/disarms (not just at the
    // 1s tick).
    unsubscribeAuto = onAutoSyncStateChange(rerenderFromCurrent);
    // Tick the countdown each second while the popover is open.
    tickInterval = setInterval(rerenderFromCurrent, 1000);
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    // The user is now looking at the error — clear the "unread" flag so the
    // ☁ icon's red dot turns off.
    Sync.acknowledgeError();
  }
  function closeMenu() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (unsubscribeAuto) { unsubscribeAuto(); unsubscribeAuto = null; }
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  // Expose to the module scope so callers outside the popover (e.g. the quiz
  // fullscreen quizbar's ☁ button) can open it directly without going through
  // sync-toggle.click() — that synthetic-click indirection turned out to be
  // unreliable on mobile Safari.
  _openSyncMenuExternal = openMenu;

  // No stopPropagation: clicks on this toggle must bubble to document so the
  // OTHER header popovers' click-outside dismiss handlers can fire and close
  // themselves. Our own document handler (right below) early-returns when
  // target is inside toggle/menu, so this popover never accidentally
  // self-closes from its own toggle click.
  toggle.addEventListener('click', () => {
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
      backupBeforePull();
      withSyncDirtySuppressed(() => mergePayload(payload, { source: 'pull' }));
      setTimeout(() => location.reload(), 500);
    } catch {}
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

  // No stopPropagation — see installSyncMenu's matching toggle handler for
  // the rationale (lets sibling popovers' click-outside handlers close them).
  toggle.addEventListener('click', () => {
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

  function render(stateMaybe) {
    // Called by Sync.subscribe with {inFlight, meta} AND by
    // onAutoSyncStateChange() with no args — re-read fresh state in the
    // second case so both paths share one renderer.
    const { inFlight, meta } = stateMaybe || Sync.getState();
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
    // Pending state — the 30s debounce timer is armed waiting to auto-push.
    // Loses to in-flight + error (handled above) but wins over the "ok"
    // green-window so the user sees the right "next thing happening" cue.
    if (_autoSyncTimer != null) {
      dot.classList.add('sync-dot--pending');
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
  // Also re-render on every auto-sync state transition so the pending dot
  // appears the instant the user makes an edit.
  onAutoSyncStateChange(() => render());
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

  // Periodic head-check every 5 min while the tab is foregrounded. Without
  // this an idle tab never learns about new deploys until the user manually
  // hits the 🔄 button or closes/reopens the SPA. Skips when document.hidden
  // so background tabs don't burn fetches (Chrome throttles background
  // setInterval to ~1/minute anyway, but an explicit skip is free).
  setInterval(() => {
    if (document.hidden) return;
    maybeCheckForUpdate();
  }, 5 * 60 * 1000);

  // visibilitychange — catches "user tabbed away, came back hours later".
  // Subject to the same 60s throttle as the interval so flicking visibility
  // doesn't hammer Pages.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    maybeCheckForUpdate();
  });
}

// Throttled wrapper around checkForUpdate — at most one head-check per 60s
// per tab regardless of trigger (periodic interval, visibilitychange, SW
// controllerchange). sessionStorage so each tab has its own counter and a
// tab close wipes it.
function maybeCheckForUpdate() {
  const lastIso = sessionStorage.getItem('cka:update:lastCheckAt');
  const last = lastIso ? Date.parse(lastIso) : 0;
  if (Date.now() - last < 60 * 1000) return;
  try { sessionStorage.setItem('cka:update:lastCheckAt', new Date().toISOString()); } catch {}
  checkForUpdate();
}

// Floating back-to-top button. Visible when:
//   - State.mode === 'browse' (always hidden in other modes), AND
//   - the user has actually scrolled down past a small threshold
//     (~150px, roughly half an exercise card). At the top of the page
//     the button is hidden — no need to offer "back to top" when you're
//     already there, and it would otherwise overlap the first card's
//     Check button on phone widths.
//
// Listening on BOTH window scroll AND #main scroll: on desktop the
// scroll container is #main (style.css:494 sets overflow-y: auto +
// max-height: calc(100vh - 110px)); on iOS Safari the body can become
// the scroller during address-bar collapse/expand. We avoid picking
// one and use Math.max of both scrollTops.
//
// rAF-throttled. setMode also calls syncBackToTopVisibility directly,
// so switching INTO Browse mid-scroll surfaces the button immediately
// without waiting for the next scroll event.
//
// Click target: scrolls BOTH #main and window — covers either scroller.
// Floating back-to-top button. Visibility is driven by polling the
// ACTUAL scrollTop position rather than scroll events — iOS Safari
// emits phantom scroll events from address-bar dance / scroll anchoring
// even when the user is stationary, which was foiling every event-based
// idle-timeout we tried. By polling the position itself, phantom events
// that don't move the cursor don't reset the idle timer, and the
// button correctly hides ~2s after the user actually stops moving.
const _BACK_TO_TOP_THRESHOLD = 150;
const _BACK_TO_TOP_IDLE_MS = 2000;
let _backToTopLastTop = -1;
let _backToTopLastChangeAt = 0;
let _backToTopPollTimer = null;
function installBackToTop() {
  const btn = document.getElementById('scroll-top-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  // Scroll listener triggers immediate evaluation + starts the poll if
  // the button became visible. The poll then runs at 200ms ticks ONLY
  // while the button is visible — once hidden it stops itself, so
  // there's zero ongoing cost when the user is parked and reading.
  // Phantom iOS scroll events that don't move scrollTop are no-ops in
  // the evaluator and don't restart the poll.
  document.getElementById('main')?.addEventListener('scroll', onBackToTopScroll, { passive: true });
  evaluateBackToTop();
}

function onBackToTopScroll() {
  evaluateBackToTop();
  startBackToTopPoll();
}

function startBackToTopPoll() {
  if (_backToTopPollTimer) return;
  _backToTopPollTimer = setInterval(() => {
    evaluateBackToTop();
    // Self-stop once the button is hidden — nothing to track until
    // the next real scroll event re-arms us.
    const btn = document.getElementById('scroll-top-btn');
    if (btn && btn.hidden) {
      clearInterval(_backToTopPollTimer);
      _backToTopPollTimer = null;
    }
  }, 200);
}

function evaluateBackToTop() {
  const btn = document.getElementById('scroll-top-btn');
  const main = document.getElementById('main');
  if (!btn || !main) return;
  const top = main.scrollTop;
  if (top !== _backToTopLastTop) {
    _backToTopLastTop = top;
    _backToTopLastChangeAt = Date.now();
  }
  const inBrowse = State.mode === 'browse';
  const pastThreshold = top >= _BACK_TO_TOP_THRESHOLD;
  const recentlyChanged = (Date.now() - _backToTopLastChangeAt) < _BACK_TO_TOP_IDLE_MS;
  btn.hidden = !(inBrowse && pastThreshold && recentlyChanged);
}

function syncBackToTopVisibility() {
  // Mode-change / explicit-call entry point. Re-runs the same evaluator
  // — which checks State.mode along with scroll position and idle time.
  evaluateBackToTop();
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
    const hereMeta = State.appBuild || State.data || {};
    const here = State.data?.generatedAt || '';
    const r = await fetch('version.json?_rev=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('version.json: HTTP ' + r.status);
    const v = await r.json();
    // Toast labels use composeBuildLabel so they match the header chip's
    // version format (vX.Y.Z / vX.Y.Z+dev.N) and the Refresh banner's
    // version-delta render. "New content (built <date>)" is gone — users
    // care about the version they're moving between, not the build time.
    const hereLabel = composeBuildLabel(hereMeta);
    if (v?.generatedAt && v.generatedAt !== here) {
      const thereLabel = composeBuildLabel(v);
      // Two-stage feedback: a brief in-page toast acknowledges the click
      // (the user sees ~1.2s of "Updating…" before reload tears the DOM),
      // then a sessionStorage handoff makes the NEW page bootup pop a
      // confirmation toast — that's the one the user actually has time to
      // read. The previous 700ms single-toast-then-reload was too short
      // for the version delta to register before location.replace blew it
      // away.
      showRefreshToast(`✨ Updating to ${thereLabel}…`, 'ok');
      try {
        sessionStorage.setItem('cka:refresh-toast', JSON.stringify({
          msg: `✓ Updated from ${hereLabel} to ${thereLabel}`,
          kind: 'ok',
          at: Date.now(),
        }));
      } catch {}
      // Two parallel waits both have to complete before reload:
      //   - minimum 1.2s so the user can read the toast
      //   - SW activation if a new SW is waiting (iOS PWA standalone
      //     skipWaiting() from inside install() does NOT reliably
      //     activate; explicit postMessage from the page is required,
      //     and the OLD SW keeps serving the stale shell otherwise)
      const minDelay = new Promise((r) => setTimeout(r, 1200));
      const swActivation = (async () => {
        try {
          if (!('serviceWorker' in navigator)) return;
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg) return;
          await reg.update().catch(() => {});
          if (!reg.waiting) return;
          const activated = new Promise((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
          });
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          await Promise.race([activated, new Promise((r) => setTimeout(r, 2000))]);
        } catch {}
      })();
      await Promise.all([minDelay, swActivation]);
      const u = new URL(location.href);
      u.searchParams.set('_rev', String(Date.now()));
      location.replace(u.toString());
    } else {
      showRefreshToast(`✓ Already on ${hereLabel}`, 'ok');
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
      // Version delta — show both sides as their full composed labels
      // (e.g. "v0.1.0+dev.2 → v0.1.1") so users see when they're moving
      // between dev builds or crossing a release boundary.
      const vSlot = document.getElementById('update-banner-versions');
      if (vSlot) {
        const here = composeBuildLabel(State.appBuild || State.data);
        const there = composeBuildLabel(v);
        if (here && there && here !== there) {
          vSlot.innerHTML = `<strong>${here}</strong> → <strong>${there}</strong>`;
        } else if (there) {
          vSlot.innerHTML = `<strong>${there}</strong>`;
        } else {
          vSlot.textContent = '';
        }
      }
    }
  } catch {
    // Offline / CORS / fetch blocked — silently ignore.
  }
}

// Compose the version label shown in the header chip and used by the
// Refresh banner's "current → new" delta. Format:
//   release build (HEAD on vX.Y.Z tag, channel === 'release')
//     →  "vX.Y.Z"
//   dev build (any other deploy)
//     →  "vX.Y.Z+dev.N"   (N = commits since the last release tag)
//   dev build, no tag yet (pre-first-release state)
//     →  "vX.Y.Z+dev"     (no counter — no tag baseline to count from)
function composeBuildLabel(meta) {
  const version = (meta && meta.version) || '0.0.0';
  const channel = (meta && meta.channel) || 'dev';
  const ahead = (meta && meta.commitsAhead | 0) || 0;
  if (channel === 'release') return `v${version}`;
  if (ahead > 0) return `v${version}+dev.${ahead}`;
  return `v${version}+dev`;
}

// Populate the always-visible header version chip from the bundled
// version.json. State.data carries { version, channel, commitsAhead,
// gitSha, generatedAt } — see scripts/build-exercises.mjs. Clicking the
// chip jumps to Help → Changelog. Dev builds (commits ahead of the
// last release tag) wear a slightly different colour to signal
// "you're on an unreleased build" without being alarming.
function renderAppBuild() {
  const btn = document.getElementById('app-build');
  if (!btn) return;
  const meta = {
    version: State.data?.version || '0.0.0',
    channel: State.data?.channel || 'dev',
    commitsAhead: State.data?.commitsAhead | 0,
    gitSha: State.data?.gitSha || '',
    generatedAt: State.data?.generatedAt,
  };
  State.appBuild = meta;
  btn.textContent = composeBuildLabel(meta);
  btn.classList.toggle('app-build-chip--dev', meta.channel !== 'release');
  const built = meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : 'unknown';
  btn.title = meta.channel === 'release'
    ? `Release v${meta.version} · built ${built}${meta.gitSha ? ' · ' + meta.gitSha : ''} · click for changelog`
    : `Dev build · ${meta.commitsAhead || '?'} commit(s) ahead of v${meta.version}${meta.gitSha ? ' · ' + meta.gitSha : ''} · built ${built} · click for changelog`;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    // Use the existing Help-mode → Changelog tab as the canonical
    // version-history surface — no new dialog needed.
    setHelpDoc('changelog');
    setMode('help');
  });
}

// ---------- Auto-grading UI (textarea + Check + verdict) ----------

// CodeMirror 6 — lazy-loaded on first answer-box focus, cached for reuse.
// Specifiers go through the <script type="importmap"> block in index.html;
// the browser resolves every @codemirror/* (and transitive @lezer/*) to
// exactly one URL, guaranteeing one module instance per package. That's the
// architectural fix for the bash-highlighting "monochrome editor" bug —
// three prior attempts on esm.sh's ?deps= cascade silently produced two
// @lezer/highlight instances, which made tag-identity instanceof checks fail
// inside StreamLanguage. With JSPM-served importmap resolution, those
// instances merge correctly.
let _cmPromise = null;
function loadCodeMirror() {
  if (_cmPromise) return _cmPromise;
  _cmPromise = (async () => {
    const [view, state, basic, langYaml, commands, language, legacyShell] = await Promise.all([
      import('@codemirror/view'),
      import('@codemirror/state'),
      import('codemirror'),
      import('@codemirror/lang-yaml'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
      import('@codemirror/legacy-modes/mode/shell'),
    ]);
    return {
      EditorView: view.EditorView,
      EditorState: state.EditorState,
      Prec: state.Prec,
      basicSetup: basic.basicSetup,
      yaml: langYaml.yaml,
      keymap: view.keymap,
      indentWithTab: commands.indentWithTab,
      StreamLanguage: language.StreamLanguage,
      shell: legacyShell.shell,
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
  // Same hidden-until-fullscreen pattern — surfaces the reference solution
  // (which would otherwise be covered by the fullscreen answer-box).
  const solBtn = el('button', {
    type: 'button',
    class: 'answer-solution-btn',
    title: 'Show the reference solution without closing fullscreen',
    'aria-label': 'Open solution drawer',
  }, '💡');
  labelRow.appendChild(solBtn);
  solBtn.addEventListener('click', () => { openSolutionDrawer(ex); });
  // Same hidden-until-fullscreen pattern — gives the user a way to flag the
  // exercise (Solution / Task / Both) without exiting fullscreen.
  const flagDrawerBtn = el('button', {
    type: 'button',
    class: 'answer-flag-btn btn-flag-toggle',
    'aria-label': 'Mark this exercise for follow-up',
  }, '🐞');
  applyFlagBtnState(flagDrawerBtn, ex.id);
  labelRow.appendChild(flagDrawerBtn);
  flagDrawerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openFlagMenu(flagDrawerBtn, ex);
  });
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
        const { EditorView, EditorState, Prec, basicSetup, StreamLanguage, shell,
                indentWithTab, keymap } = cm;
        const update = EditorView.updateListener.of(u => {
          if (u.docChanged) persistDebounced();
        });
        // CKA answers are predominantly bash (kubectl + openssl + heredocs).
        // Shell highlighting handles those tokens correctly; YAML inside a
        // <<EOF heredoc renders as plain text (acceptable — nested parsing
        // is a separate, larger project). The importmap in index.html
        // guarantees one @lezer/highlight instance so tags actually match.
        const shellLang = StreamLanguage.define(shell);
        const state = EditorState.create({
          doc: ta.value,
          extensions: [
            basicSetup,
            // Prec.highest beats basicSetup's defaultKeymap binding for Tab,
            // which otherwise lets the key fall through to the browser's
            // focus-shift default.
            Prec.highest(keymap.of([indentWithTab])),
            shellLang,
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
        // Reflect the new status on the grade-row highlight immediately so
        // the user sees which bucket Check put them in (answers the
        // "Partial 80/100, which button?" question — already marked, tap
        // Next or override).
        syncQuizGradeButtons();
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
    // Reveal needs special handling: clicking the real #quiz-reveal marks
    // q.revealed.add(ex.id) and re-renders the card, but the solution lands
    // BELOW the fullscreen overlay where the user can't see it. So we also
    // pop the solution drawer (z-index 1010 > fullscreen's 1000).
    const revealProxy = el('button', { type: 'button' }, '👁 Reveal');
    revealProxy.addEventListener('click', () => {
      document.getElementById('quiz-reveal')?.click();
      openSolutionDrawer(ex);
    });
    // Tiny ☁ sync indicator at the right end of the quizbar — clicking opens
    // the header sync popover so the user can confirm auto-push state without
    // exiting fullscreen.
    const syncDot = el('button', {
      type: 'button',
      class: 'quizbar-sync-dot',
      title: 'Show sync status (auto-push, last push)',
      'aria-label': 'Show sync status',
    }, '☁');
    syncDot.addEventListener('click', (e) => {
      // Open the popover directly via the closure exposed by installSyncMenu,
      // not via sync-toggle.click() — the synthetic-click indirection turned
      // out to be unreliable on mobile Safari (touch→click conversion timing
      // collides with the document-level click-outside handler). stopPropagation
      // still keeps the user's original click from reaching that handler.
      e.stopPropagation();
      _openSyncMenuExternal?.();
    });
    // Two sub-rows so the layout matches the regular Quiz controls
    // (grade row prominent + utility row underneath). The previous
    // single flex-wrap row mixed grade buttons into the middle of
    // navigation buttons on phone widths, breaking the visual rhythm
    // the user saw in non-fullscreen mode.
    const quizbar = el('div', { class: 'answer-fullscreen-quizbar' },
      el('div', { class: 'qbar-grade-row' },
        proxy('quiz-grade-got',     '✓ Got it',  'grade-got'),
        proxy('quiz-grade-partial', '◐ Partial', 'grade-partial'),
        proxy('quiz-grade-miss',    '✗ Missed',  'grade-miss'),
      ),
      el('div', { class: 'qbar-util-row' },
        proxy('quiz-nav-toggle', '📋 Questions'),
        proxy('quiz-prev',       '← Prev'),
        proxy('quiz-flag',       '🚩 Flag'),
        revealProxy,
        proxy('quiz-skip',       '↷ Skip'),
        proxy('quiz-next',       'Next →'),
        syncDot,
      ),
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
  // At most one drawer at a time.
  if (_taskDrawerOpen)     closeTaskDrawer();
  if (_solutionDrawerOpen) closeSolutionDrawer();
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
  // At most one drawer at a time.
  if (_toolsDrawerOpen)    closeToolsDrawer();
  if (_solutionDrawerOpen) closeSolutionDrawer();
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

// ---------- Solution drawer (mirrors the Task drawer) ----------
//
// The inline solution `<div class="exercise-solution">` lives BELOW the
// answer-box in the card DOM. When the answer-box enters fullscreen
// (z-index 1000) the solution gets covered. This drawer at z-index 1010
// (see #solution-drawer-overlay rule) surfaces the rendered solution
// above the fullscreen overlay. Reveal in the quiz-mode quizbar also
// opens this drawer so 👁 Reveal actually shows the solution.

let _solutionDrawerOpen = false;

function openSolutionDrawer(ex) {
  if (_solutionDrawerOpen) return;
  if (_toolsDrawerOpen) closeToolsDrawer();
  if (_taskDrawerOpen)  closeTaskDrawer();
  const overlay = document.getElementById('solution-drawer-overlay');
  const host    = document.getElementById('solution-drawer-host');
  const title   = document.getElementById('solution-drawer-title');
  if (!overlay || !host || !title) return;

  const display = ex.displayTitle || ex.fullTitle || ex.title || 'Solution';
  title.textContent = `💡 ${display} — ${ex.id}`;
  host.innerHTML = '';

  // Respect the quiz's reveal contract: pre-reveal in hidden-solutions mode,
  // show a Reveal-first placeholder instead of leaking the answer.
  const q = State.quiz;
  const isQuizHidden = State.mode === 'quiz' && q && q.solutionsHidden
                       && !q.revealed.has(ex.id);
  if (isQuizHidden) {
    const wrap = el('div', { class: 'solution-drawer-locked' });
    wrap.appendChild(el('p', {}, '👁 Solution is hidden by this quiz session.'));
    const revealBtn = el('button', { type: 'button', class: 'primary' }, '👁 Reveal & show');
    revealBtn.addEventListener('click', () => {
      document.getElementById('quiz-reveal')?.click();
      closeSolutionDrawer();
      // Re-open after the reveal-driven renderQuizCard finishes.
      setTimeout(() => {
        const fresh = State.byId.get(ex.id);
        if (fresh) openSolutionDrawer(fresh);
      }, 50);
    });
    wrap.appendChild(revealBtn);
    host.appendChild(wrap);
  } else if (ex.solution) {
    const sol = el('div', { class: 'exercise-solution', html: renderMarkdown(ex.solution) });
    host.appendChild(sol);
    attachCopyButtons(sol);
  } else {
    host.appendChild(el('p', { class: 'solution-drawer-locked' }, 'No reference solution recorded for this exercise.'));
  }

  overlay.hidden = false;
  _solutionDrawerOpen = true;
  document.addEventListener('keydown', _onSolutionDrawerEsc, true);
  document.getElementById('solution-drawer-close').onclick = closeSolutionDrawer;
  overlay.onclick = (e) => { if (e.target === overlay) closeSolutionDrawer(); };
}

function closeSolutionDrawer() {
  if (!_solutionDrawerOpen) return;
  document.getElementById('solution-drawer-overlay').hidden = true;
  _solutionDrawerOpen = false;
  document.removeEventListener('keydown', _onSolutionDrawerEsc, true);
}

function _onSolutionDrawerEsc(e) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  closeSolutionDrawer();
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
// Labels are subject-less ("Reference" is in the modal header) so each
// option reads as the FAULT itself: "Bundles ...", "Wrong ...", etc.
// Order = autoDetectType priority (first match wins) — over-prescriptive
// sits between verification-bundled and wrong-resource because it's the
// same flavour as verification-bundled ("reference adds stuff not in task")
// but for parameter values rather than verification commands.
const REPORT_TYPES = [
  {
    id: 'verification-bundled',
    label: 'Bundles verification commands not asked by the task',
    ghLabel: 'kind/verification-bundled',
    autoMissedKeywords: [
      'auth can-i', 'can-i', 'verify', 'verification', 'verifying',
      'kubectl get', 'kubectl describe', 'kubectl logs', 'check ',
      'verification step', 'verify with', 'extra command',
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
    id: 'over-prescriptive',
    label: "Includes details the task didn't specify",
    ghLabel: 'kind/over-prescriptive',
    // Keyword-based detection here is unreliable — typical verdict phrasing
    // ("omitted the --cluster flag") overlaps with missing-step. We bias
    // selection via the score+missed.length heuristic in autoDetectType
    // instead. Keep keywords empty.
    autoMissedKeywords: [],
    whatsWrong:
      "The task leaves a detail open (e.g. cluster name, namespace, flag " +
      "value, resource name choice) — but the reference solution picks a " +
      "specific value anyway. The LLM grader treats that picked value as " +
      "required and penalises legitimate answers that omit it or pick " +
      "something else.",
    suggested:
      "Drop the over-specified detail from the reference, or move it to a " +
      "comment / `> ℹ️` note so the grader treats it as illustrative. " +
      "Alternatively, tighten the task body to pin the detail down.",
  },
  {
    id: 'wrong-resource',
    label: 'Wrong resource name / namespace / kind',
    ghLabel: 'kind/wrong-resource',
    autoMissedKeywords: [
      'wrong namespace', 'wrong resource', 'wrong kind',
      "name doesn't match", 'name does not match',
      'expected namespace', 'expected name', 'expected resource',
      'should be in namespace', 'should be named', 'kind should be',
    ],
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
    label: 'Outdated kubectl flag / syntax',
    ghLabel: 'kind/outdated-flag',
    autoMissedKeywords: [
      'deprecated', 'unknown flag',
      'removed in v1', 'no longer supported', 'no such flag',
      'invalid flag', 'unknown command',
    ],
    whatsWrong:
      "The reference uses a kubectl flag or syntax that's been deprecated, " +
      "renamed, or doesn't exist in the targeted k8s version.",
    suggested:
      "Replace with the current flag/syntax. Verify against " +
      "`kubectl <verb> -h` for the targeted version.",
  },
  {
    id: 'missing-step',
    label: 'Missing a required step',
    ghLabel: 'kind/missing-step',
    autoMissedKeywords: [
      'missing step', 'incomplete', 'stops short',
      'did not apply', 'did not create',
      "didn't apply", "didn't create",
      'not applied', 'not created',
    ],
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
// Labels symmetric with REPORT_TYPES — subject-less ("Task ..." is in the
// modal header), each option leads with the fault. whatsWrong / suggested
// keep their "Task ..." subject because those are the full descriptions
// shown in the inline help block + the GitHub issue body.
const TASK_REPORT_TYPES = [
  {
    id: 'missing-docs-link',
    label: 'Missing a relevant docs link',
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
    label: 'Docs link points to the wrong page',
    ghLabel: 'kind/incorrect-docs-link',
    whatsWrong:
      "A current breadcrumb on the task doesn't match the kubernetes.io page " +
      'it links to, or the link no longer matches the task.',
    suggested: 'Replace the offending link below with the correct breadcrumb + URL.',
  },
  {
    id: 'outdated-breadcrumb',
    label: 'Docs-link breadcrumb is stale',
    ghLabel: 'kind/outdated-breadcrumb',
    whatsWrong:
      "The breadcrumb label on the link is stale relative to kubernetes.io's " +
      'current navigation.',
    suggested: "Update the breadcrumb text to match the page's current title path.",
  },
  {
    id: 'unclear-task',
    label: 'Wording is ambiguous or unclear',
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
    label: 'Factual error about Kubernetes',
    ghLabel: 'kind/factual-error',
    whatsWrong:
      'The task asserts something that is wrong or out-of-date about Kubernetes ' +
      '(flag, default, behaviour, etc.).',
    suggested:
      'Correct the factual claim against the current k8s docs / `kubectl <verb> -h`.',
  },
  {
    id: 'typo',
    label: 'Typo / formatting in the task body',
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
  const v = ctx.verdict;
  const haystack = v.missed.join(' ').toLowerCase();

  // Score-based heuristic for over-prescriptive: a high verdict score
  // with a small `missed` list typically means "you basically got it,
  // just didn't replicate a detail the reference picked." Keyword
  // matching would mis-bucket this as missing-step (verdicts often say
  // "omitted the --cluster flag"). Score signal is the cleaner cue.
  if (
    typeof v.score === 'number'
    && v.score >= 85
    && v.missed.length > 0
    && v.missed.length <= 2
  ) {
    return 'over-prescriptive';
  }

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

// Conventional-commits style: `type(scope): description`. Maintainer
// triage benefits from seeing the kind directly in the title (email
// notifications, issue lists, Slack alerts) instead of having to open
// the issue to read its labels. Falls back to `other` if draft.type is
// missing (e.g. flag-only entry Open'd straight from the queue) —
// matches the buildIssueUrl label fallback path.
function buildIssueTitle(ex, draft, mode = 'solution') {
  const kind = (draft && draft.type) ? draft.type : 'other';
  const tag = mode === 'task' ? `task-fix(${kind})` : `solution-fix(${kind})`;
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
  u.searchParams.set('title', buildIssueTitle(ex, draft, mode));
  const topLabel = mode === 'task' ? 'task-fix' : 'answer-fix';
  u.searchParams.set('labels', `${topLabel},${t.ghLabel}`);
  return u.toString();
}

// Build radio rows from a REPORT_TYPES / TASK_REPORT_TYPES catalogue and
// inject them into the given `<div role="radiogroup">` container. Replaces
// the previously-hardcoded <label> rows in docs/index.html so the JS
// catalogue is the single source of truth for the picker.
function renderReportRadioRows(groupEl, types, name) {
  if (!groupEl) return;
  groupEl.innerHTML = '';
  for (const t of types) {
    groupEl.appendChild(
      el('label', {},
        el('input', { type: 'radio', name, value: t.id }),
        ' ' + t.label
      )
    );
  }
}

// Render an inline help block describing the currently-selected issue
// type. Pulls whatsWrong + suggested from REPORT_TYPES / TASK_REPORT_TYPES
// (the same fields rendered into the GitHub issue body) so the picker
// affordance and the eventual GitHub issue stay in lock-step. The `other`
// type has whatsWrong=null; show a generic fallback for that case.
function renderReportTypeHelp(helpEl, type) {
  if (!helpEl) return;
  helpEl.innerHTML = '';
  if (!type) {
    helpEl.hidden = true;
    return;
  }
  helpEl.hidden = false;
  if (!type.whatsWrong && !type.suggested) {
    helpEl.appendChild(el('p', { class: 'report-type-help-body muted' },
      "Pick this if none of the above fits. Describe what's wrong in the " +
      "Additional context box — it's required for this type."));
    return;
  }
  if (type.whatsWrong) {
    helpEl.appendChild(el('div', { class: 'report-type-help-row' },
      el('strong', {}, "What this means: "),
      type.whatsWrong));
  }
  if (type.suggested) {
    helpEl.appendChild(el('div', { class: 'report-type-help-row' },
      el('strong', {}, "Suggested fix: "),
      type.suggested));
  }
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
  const existingLinkBlock = $('report-existing-link-block');
  const suggestedUrl = $('report-suggested-url');
  const existingLinkPick = $('report-existing-link-pick');
  const addl = $('report-additional');
  const addlState = $('report-additional-state');
  const includeCtxBox = $('report-include-context');
  const statusEl = $('report-status');
  const saveBtn = $('report-save-draft');
  const copyBtn = $('report-copy-md');
  const copyTitleBtn = $('report-copy-title');
  const openBtn = $('report-open-issue');
  const cancelBtn = $('report-cancel');
  const closeBtn = $('report-close');
  const titlePreview = $('report-title-preview');

  // Render radio rows from REPORT_TYPES / TASK_REPORT_TYPES (single source
  // of truth). The HTML used to hardcode the same <label> rows and they
  // drifted out of sync — the first solution-mode label even had inline
  // <code>auth can-i</code> that broke the row layout on phone widths.
  // Generated rows track REPORT_TYPES.label exactly, so adding / renaming
  // types only touches the JS catalogue.
  renderReportRadioRows(solutionRadioGroup, REPORT_TYPES, 'report-type');
  renderReportRadioRows(taskRadioGroup, TASK_REPORT_TYPES, 'report-task-type');

  // Inline help blocks (one per mode) — pick up references for the
  // selection-change handler below.
  const solutionHelpEl = $('report-type-help');
  const taskHelpEl = $('report-task-type-help');

  // Swap radio groups based on mode; pick from the visible group only.
  solutionRadioGroup.hidden = (mode === 'task');
  taskRadioGroup.hidden = (mode !== 'task');
  if (solutionHelpEl) solutionHelpEl.hidden = (mode === 'task');
  if (taskHelpEl) taskHelpEl.hidden = (mode !== 'task');
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
    if (mode !== 'task') return;
    const checked = taskRadioGroup.querySelector('input[type="radio"]:checked');
    const tval = checked ? checked.value : 'other';
    // Toggle the WRAPPER blocks so label + input/select hide together.
    // The CSS rule on .report-suggested-url-block / .report-existing-link-block
    // uses :not([hidden]) so the hidden attribute actually wins over the
    // block's `display: flex` (without :not it tied on specificity and the
    // flex rule won, leaving Suggested URL / Existing-link fields stuck
    // visible for non-docs-link types — bug user reported).
    if (suggestedUrlBlock) suggestedUrlBlock.hidden = !URL_TYPES.has(tval);
    if (existingLinkBlock) existingLinkBlock.hidden = !PICKER_TYPES.has(tval);
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
    titlePreview.value = buildIssueTitle(ex, collect(), mode);
  };
  // Refresh the inline "What this means / Suggested fix" block under the
  // radio group whenever the selection changes. Pulls whatsWrong +
  // suggested from the same REPORT_TYPES / TASK_REPORT_TYPES entry that
  // drives the GitHub issue body — so the in-modal preview and the
  // submitted issue stay in sync without a second template.
  const syncTypeHelp = () => {
    const helpEl = mode === 'task' ? taskHelpEl : solutionHelpEl;
    if (!helpEl) return;
    const checked = (mode === 'task' ? taskRadioGroup : solutionRadioGroup)
      .querySelector('input[type="radio"]:checked');
    const t = checked ? getReportType(checked.value, mode) : null;
    renderReportTypeHelp(helpEl, t);
  };
  // Swap the Additional-context label between "(optional)" and
  // "* required" based on whether the selected type's whatsWrong is null
  // (which is exactly the `other` row for both solution and task modes,
  // matching the requireSubmitFields check). Also retunes the textarea's
  // placeholder so a user who just landed on `other` sees a clearer
  // prompt than the default "Anything else …".
  const syncAdditionalContextState = () => {
    const checked = (mode === 'task' ? taskRadioGroup : solutionRadioGroup)
      .querySelector('input[type="radio"]:checked');
    const t = checked ? getReportType(checked.value, mode) : null;
    const isRequired = !!(t && t.whatsWrong === null);
    // Order matters: update textarea attrs FIRST (they're keyed off `addl`,
    // which is independent of the state span). If the state span is missing
    // for any reason — stale SW cache served an older index.html, an
    // extension stripped IDs, etc. — the textarea's placeholder + aria-
    // required still tell the user this field is required for 'Other'.
    // Earlier version returned early when addlState was null, leaving the
    // textarea unchanged and the user mystified about the required state.
    if (isRequired) {
      if (addl) {
        addl.setAttribute('aria-required', 'true');
        addl.placeholder = "Describe what's wrong — at least a short sentence so the maintainer can act on it.";
      }
      if (addlState) {
        addlState.textContent = '* required';
        addlState.classList.add('is-required');
        addlState.classList.remove('muted');
      } else {
        console.warn('[report-modal] #report-additional-state span missing — cannot show inline required indicator. textarea placeholder + aria-required are still active.');
      }
    } else {
      if (addl) {
        addl.removeAttribute('aria-required');
        addl.placeholder = 'Anything else the maintainer should know — exact line, observed behaviour, your k8s version, etc.';
      }
      if (addlState) {
        addlState.textContent = '(optional)';
        addlState.classList.remove('is-required');
        addlState.classList.add('muted');
      }
    }
  };
  const onTypeChange = () => { syncTaskSubBlocks(); syncTypeHelp(); syncAdditionalContextState(); syncHref(); };
  // Initial paint — render the help block + Additional-context state for
  // whatever radio was just pre-selected (auto-detect / saved draft /
  // 'other' fallback).
  syncTypeHelp();
  syncAdditionalContextState();

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
    // Refresh the header 🐛 badge + popover (if open) so an edit / save /
    // submit made from the modal is reflected immediately.
    refreshIssuesQueueCount();
    renderIssuesQueue();
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

  saveBtn.title = 'Save this report to the queue (Settings → 🐛 Issues). Open it on GitHub whenever you\'re ready.';
  saveBtn.onclick = () => {
    const d = collect();
    persistDraft(d);
    statusEl.textContent = (d.type !== 'other' || d.additional)
      ? '✓ Saved to queue — see all queued reports in Settings → 🐛 Issues.'
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
      await navigator.clipboard.writeText(buildIssueTitle(ex, d, mode));
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
    // Stamp submittedAt so the queue moves this entry to the "Already opened"
    // group — same status the queue's 🚀 Open button writes.
    persistDraft({ ...d, submittedAt: new Date().toISOString() });
    navigator.clipboard?.writeText(renderReportMarkdown(ex, d, buildCtx(), mode))
      .catch(() => {});
    statusEl.textContent = '✓ Body auto-copied to clipboard. Opening GitHub — paste it into the description. (Use 📋 Copy title for the title.)';
  };
}

// ---------- Issue queue ----------
//
// A flat view over every cka:fix-draft:* + cka:task-fix-draft:* entry,
// rendered into the header 🐛 popover (#issues-menu-body).
//
// Items split into two groups: "To submit" (no submittedAt) and "Already
// opened" (submittedAt was stamped when the user clicked 🚀 Open). Submitted
// items don't disappear — they stay in the list so the user can ↻ Re-open or
// 🗑 Remove them. Flag-only items (toggled via 🐞 on a card, no form) render
// as lightweight cards with a "Write report" CTA.

function isQueueSubmitted(item) { return !!(item.draft?.submittedAt); }
function isQueueFlagOnly(item) {
  const d = item.draft;
  return !!(d?.flagged && !d.additional && (!d.type || d.type === 'other'));
}

// Mark a draft as submitted by writing submittedAt. The draft stays in the
// queue but renders in the "Already opened" group. Bumps the synced
// timestamp so other devices see the same state after the next pull.
function markDraftSubmitted(item) {
  const next = { ...item.draft, submittedAt: new Date().toISOString() };
  if (item.mode === 'task') setTaskFixDraft(item.exId, next);
  else setFixDraft(item.exId, next);
}

function unmarkDraftSubmitted(item) {
  const next = { ...item.draft };
  delete next.submittedAt;
  if (item.mode === 'task') setTaskFixDraft(item.exId, next);
  else setFixDraft(item.exId, next);
}

// Update the header 🐛 N badge after any queue mutation. Sole surface now —
// the Settings → Issues tab has been retired; the header popover is the
// single entry point.
function refreshIssuesQueueCount() {
  const n = collectAllIssueDrafts().length;
  const headerBadge = document.getElementById('issues-count');
  if (headerBadge) {
    headerBadge.textContent = n > 0 ? String(n) : '';
    headerBadge.hidden = n === 0;
  }
}

// Build a single queue-item element. Wired buttons trigger queue re-renders
// + count refresh via the supplied `onChange` callback so the caller can
// re-render whichever surface they're on.
function buildIssueItem(item, ex, onChange) {
  const flagOnly = isQueueFlagOnly(item);
  const submitted = isQueueSubmitted(item);
  const modeLabel = item.mode === 'task' ? 'task-fix' : 'answer-fix';
  const scopeWord = item.mode === 'task' ? 'task' : 'solution';
  const titleText = ex ? ex.displayTitle : `(exercise no longer in corpus: ${item.exId})`;
  // PROGRESS_SHORT_LABEL gives "Cluster Arch" / "Scheduling" / etc. ex.domain
  // is the full domain object {key,title,weight,sections,...}, not a string —
  // template-interpolating it as `${domain}` used to yield "[object Object]"
  // in the meta line. Pre-bdd9c1a that was masked because the Map-vs-object
  // bug left ex=null; once ex resolved properly, the [object Object] leak
  // became visible.
  const domain = ex
    ? (PROGRESS_SHORT_LABEL[ex.domain?.key] || ex.domain?.key || '')
    : '';
  const t = item.draft.type ? getReportType(item.draft.type, item.mode) : null;
  const kindLabel = flagOnly ? '🐞 Flagged — no details yet' : (t?.label || item.draft.type || '—');
  const savedRel  = item.draft.savedAt ? humanTimeAgo(item.draft.savedAt) : 'just now';

  const li = document.createElement('li');
  li.className = 'issues-queue-item' + (submitted ? ' issues-queue-item--submitted' : '') + (flagOnly ? ' issues-queue-item--flagonly' : '');
  // Scope marker for the CSS attribute-selector left-border rule. Both
  // flag-only and fully-filled drafts get this so the visual scope cue is
  // consistent across "to submit" / "already opened" states.
  li.dataset.mode = item.mode;

  const head = document.createElement('div');
  head.className = 'issues-queue-item-head';
  const tag = document.createElement('span');
  // Use the scope-colored tag class for both flag-only and full drafts so
  // task entries are always blue + solution entries always red. The legacy
  // `issues-queue-tag-flag` (uniform red) made Both-scope flags
  // indistinguishable — same icon, same text, same color.
  tag.className = `issues-queue-tag issues-queue-tag-${item.mode === 'task' ? 'task' : 'solution'}`;
  tag.textContent = flagOnly ? `🐞 FLAGGED · ${scopeWord}` : modeLabel;
  const title = document.createElement('span');
  title.className = 'issues-queue-title';
  title.textContent = titleText;
  head.appendChild(tag);
  head.appendChild(title);
  li.appendChild(head);

  const meta = document.createElement('div');
  meta.className = 'issues-queue-meta';
  const timeLabel = submitted
    ? `opened ${humanTimeAgo(item.draft.submittedAt)}`
    : `queued ${savedRel}`;
  meta.textContent = [kindLabel, domain && `· ${domain}`, `· ${timeLabel}`].filter(Boolean).join(' ');
  li.appendChild(meta);

  if (item.draft.additional) {
    const preview = document.createElement('div');
    preview.className = 'issues-queue-preview muted';
    const snippet = String(item.draft.additional).trim().replace(/\s+/g, ' ').slice(0, 140);
    preview.textContent = snippet.length === 140 ? snippet + '…' : snippet;
    li.appendChild(preview);
  }

  const actions = document.createElement('div');
  actions.className = 'issues-queue-item-actions';

  // Edit (re-opens modal with draft loaded). For flag-only, label changes
  // to "Write report" so the CTA is obvious.
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.textContent = flagOnly ? '📝 Write report' : '✏ Edit';
  editBtn.title = flagOnly ? 'Open the modal to fill in this flagged exercise' : 'Reopen the report modal with this draft loaded';
  editBtn.disabled = !ex;
  editBtn.addEventListener('click', () => {
    if (!ex) return;
    // Hide whichever overlay surface we're being viewed from so the modal
    // isn't visually buried.
    document.getElementById('settings-overlay')?.setAttribute('hidden', '');
    document.getElementById('issues-menu')?.setAttribute('hidden', '');
    // Pull the latest answer + verdict from localStorage so the modal
    // mirrors what the verdict-card's "Suggest a fix" link does. Without
    // this the queue's entry point opened with an empty ctx — verdict
    // panel hidden, issue body missing answer/verdict context — even
    // when the user had Checked between flagging and opening the report.
    // task mode skips the injection (entry A doesn't pass it either, and
    // the modal hides verdictBlock unconditionally for task scope).
    let ctx;
    if (item.mode === 'task') {
      ctx = { mode: 'task' };
    } else {
      ctx = {};
      const saved = getAnswer(ex.id);
      if (saved) {
        if (saved.text) ctx.answer = saved.text;
        if (saved.verdict) ctx.verdict = saved.verdict;
      }
    }
    openFixReportModal(ex, ctx);
  });

  // Open (for unsubmitted) → stamp submittedAt then navigate. Re-open (for
  // submitted) → clear submittedAt then navigate.
  const openBtn = document.createElement('a');
  openBtn.className = 'issues-queue-open';
  openBtn.target = '_blank';
  openBtn.rel = 'noopener';
  openBtn.textContent = submitted ? '↻ Re-open' : '🚀 Open';
  openBtn.title = submitted
    ? 'Move back to To-submit and open the GitHub issue form again'
    : 'Open this report on github.com/issues/new — marks as Submitted in the queue';
  // Flag-only items have no kind chosen → buildIssueUrl would label them as
  // "other" by default, which is OK but the maintainer's auto-PR routes off
  // kind. Best UX: ask the user to Write report first. Disable Open.
  if (!ex || flagOnly) {
    openBtn.removeAttribute('href');
    openBtn.classList.add('disabled');
    if (flagOnly) openBtn.title = 'Click 📝 Write report first — Open is disabled until a kind is picked';
  } else {
    openBtn.href = buildIssueUrl(ex, item.draft, item.mode);
  }
  openBtn.addEventListener('click', (e) => {
    if (openBtn.classList.contains('disabled')) { e.preventDefault(); return; }
    if (submitted) unmarkDraftSubmitted(item);
    else markDraftSubmitted(item);
    // Let the browser navigate; refresh count + list when the user comes back.
    setTimeout(onChange, 0);
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '🗑 Remove';
  removeBtn.title = 'Delete this draft from the queue (does NOT close any GitHub issue)';
  removeBtn.addEventListener('click', () => {
    if (!confirm(`Remove this queued report?\n\n${titleText}`)) return;
    try { localStorage.removeItem(item.key); } catch {}
    stampSingleton(item.key);  // stamp the removal so other devices won't resurrect it
    markSyncDirty();
    onChange();
  });

  actions.appendChild(editBtn);
  actions.appendChild(openBtn);
  actions.appendChild(removeBtn);
  li.appendChild(actions);
  return li;
}

// Build a group section (To submit / Already opened) with a collapsible header.
function buildIssueGroup(label, items, options, onChange) {
  const wrap = document.createElement('section');
  wrap.className = 'issues-queue-group';
  const head = document.createElement('div');
  head.className = 'issues-queue-group-head';
  head.textContent = `${label} (${items.length})`;
  if (options?.collapsible) {
    head.classList.add('collapsible');
    head.dataset.collapsed = options.startCollapsed ? '1' : '0';
    head.addEventListener('click', () => {
      const collapsed = head.dataset.collapsed === '1' ? '0' : '1';
      head.dataset.collapsed = collapsed;
      list.hidden = collapsed === '1';
    });
  }
  wrap.appendChild(head);
  const list = document.createElement('ul');
  list.className = 'issues-queue-list';
  if (options?.collapsible && options.startCollapsed) list.hidden = true;
  // State.byId is a Map — must use .get(), not bracket notation. Previous
  // `byIdMap[item.exId]` always returned undefined, which made
  // `editBtn.disabled = !ex` true and the openBtn's `if (!ex || flagOnly)`
  // also bail out. The user reported "only Remove is clickable" because
  // both 📝 Write report and 🚀 Open were stuck disabled regardless of the
  // exercise's actual presence in the corpus.
  for (const item of items) {
    list.appendChild(buildIssueItem(item, State.byId.get(item.exId) || null, onChange));
  }
  wrap.appendChild(list);
  return wrap;
}

// Render queue into either the Settings panel or the header popover body.
// Same DOM shape, different containers.
function renderIssuesQueueInto(container) {
  refreshIssuesQueueCount();
  if (!container) return;
  container.innerHTML = '';

  const items = collectAllIssueDrafts();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'muted issues-queue-empty';
    empty.textContent = 'No saved reports yet. Use the 🐞 button on any exercise to flag it for follow-up, or 🐛 Suggest a fix to file a detailed draft.';
    container.appendChild(empty);
    return;
  }

  const toSubmit = items.filter(it => !isQueueSubmitted(it));
  const submitted = items.filter(it => isQueueSubmitted(it));

  const onChange = () => renderIssuesQueueInto(container);

  if (toSubmit.length) container.appendChild(buildIssueGroup('To submit', toSubmit, { collapsible: false }, onChange));
  if (submitted.length) container.appendChild(buildIssueGroup('Already opened', submitted, { collapsible: true, startCollapsed: true }, onChange));
}

// Convenience wrapper — re-renders the header popover body if it's open.
// Called by the report-modal cleanup hook + queue-mutation paths so the
// open popover reflects fresh state without callers having to chase
// element references.
function renderIssuesQueue() {
  const headerBody = document.getElementById('issues-menu-body');
  if (headerBody && !document.getElementById('issues-menu')?.hidden) {
    renderIssuesQueueInto(headerBody);
  }
}

// Bulk-open every UNSUBMITTED queued report. Spreads window.open() calls so
// popup blockers don't reject the burst. Marks each item as submitted just
// before opening so they immediately move to "Already opened" on next render.
function openAllUnsubmittedIssues() {
  const items = collectAllIssueDrafts().filter(it => !isQueueSubmitted(it) && !isQueueFlagOnly(it));
  // State.byId is a Map — must use .get(). Bracket access was the same
  // regression that broke the per-item buttons; here it silently filtered
  // EVERY item out (byIdMap[exId] always undefined → openable.length === 0
  // → early return), so "🚀 Open all unsubmitted" was effectively a no-op.
  const openable = items.filter(it => State.byId.get(it.exId));
  if (!openable.length) return;
  if (openable.length > 3 && !confirm(
    `Open ${openable.length} GitHub issue tabs?\n\n` +
    `Your browser may ask you to allow popups the first time.`
  )) return;
  openable.forEach((it, idx) => {
    const url = buildIssueUrl(State.byId.get(it.exId), it.draft, it.mode);
    setTimeout(() => {
      markDraftSubmitted(it);
      try { window.open(url, '_blank', 'noopener'); } catch {}
      // Re-render at the end so all surfaces see the latest state.
      if (idx === openable.length - 1) setTimeout(renderIssuesQueue, 50);
    }, idx * 150);
  });
}

function installIssuesQueueOpenAll() {
  const headerBtn = document.getElementById('issues-menu-open-all');
  headerBtn?.addEventListener('click', openAllUnsubmittedIssues);
}

// Header 🐛 popover — mirrors installSyncMenu's pattern.
function installIssuesMenu() {
  const toggle = document.getElementById('issues-toggle');
  const menu = document.getElementById('issues-menu');
  if (!toggle || !menu) return;

  function openMenu() {
    renderIssuesQueueInto(document.getElementById('issues-menu-body'));
    refreshIssuesQueueCount();
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  // No stopPropagation — see installSyncMenu's matching toggle handler for
  // the rationale (lets sibling popovers' click-outside handlers close them).
  toggle.addEventListener('click', () => {
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
  // data-action lets syncCardStateClasses find these buttons when external
  // events (Quiz "Got it", cross-tab sync) change the underlying state
  // without rerendering the whole card.
  const doneBtn = el('button', { type: 'button', title: 'Toggle done', 'data-action': 'done' }, isDone(ex.id) ? '✓ Done' : '☐ Done');
  doneBtn.addEventListener('click', () => {
    setDone(ex.id, !isDone(ex.id));
    if (isDone(ex.id)) card.classList.add('done'); else card.classList.remove('done');
    doneBtn.textContent = isDone(ex.id) ? '✓ Done' : '☐ Done';
    renderSidebarProgress();
    document
      .querySelectorAll(`.tree-exercise[data-id="${ex.id}"]`)
      .forEach(b => b.classList.toggle('done', isDone(ex.id)));
  });
  const bmBtn = el('button', { type: 'button', title: 'Toggle bookmark', 'data-action': 'bookmark' }, isBookmark(ex.id) ? '⭐' : '☆');
  bmBtn.addEventListener('click', () => {
    setBookmark(ex.id, !isBookmark(ex.id));
    bmBtn.textContent = isBookmark(ex.id) ? '⭐' : '☆';
    renderSidebarProgress();
  });
  // 🐞 Quick Flag — opens a small scope-picker menu (Solution / Task / Both)
  // so the user can indicate which side of the exercise has a problem. The
  // 🐞 ladybug is used (not 🚩) to stay visually distinct from the in-quiz
  // 🚩 Flag button (mark-question-for-review — separate concept).
  const flagBtn = el('button', {
    type: 'button',
    class: 'btn-flag-toggle',
  }, '🐞');
  applyFlagBtnState(flagBtn, ex.id);
  flagBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openFlagMenu(flagBtn, ex);
  });
  tools.append(doneBtn, bmBtn, flagBtn);

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

// Browse mode incremental rendering. The OLD strategy was: every filter
// change → main.innerHTML = '' → recreate every visible card. That's 50-200ms
// of DOM work per keystroke + destroys CodeMirror instances + drops answer
// drafts. NEW strategy: build all 271 cards once on first entry, then on
// every filter change only flip card.hidden = true/false. ~1ms instead of
// 200ms. CodeMirror + draft state preserved across filter changes.
//
// _browseDom caches the mounted DOM; _browseLastReveal tracks the only
// filter whose change still requires a full rebuild (the "Reveal solutions"
// toggle wires three intertwined per-card UI bits — text, aria-expanded,
// class — that are awkward to flip in place; an infrequent toggle so a
// rebuild is acceptable).
let _browseDom = null;     // { main, cards: Map<id,el>, sectionHeaders: Map<key,el>, domainHeaders: Map<key,el> }
let _browseLastReveal = null;
let _browseBuiltCount = 0; // tracks State.allExercises.length used at build time, to invalidate on 🔄 refresh adding/removing exercises
let _sidebarFiltersSignature = null;  // null → first render forces a full sidebar build

// Signature over the inputs that change the SET of sidebar entries (or
// their order). Excludes done / bookmark state — those are reflected via
// class toggles in syncSidebarStateClasses() without a full rebuild.
function sidebarFiltersSignature() {
  const f = State.filters;
  return JSON.stringify([
    [...f.domains].sort(),
    [...f.tags].sort(),
    f.search || '',
    !!f.onlyBookmarks,
    !!f.onlyUndone,
    !!f.revealSolutions,
  ]);
}

// Cheap pass over the existing sidebar tree to refresh done / bookmark
// class on each entry button and recompute the per-domain done-count
// shown in the <details><summary> header. Runs in O(visible) — a few
// hundred class-list mutations max.
function syncSidebarStateClasses() {
  const tree = document.getElementById('sidebar-tree');
  if (!tree) return;
  const buttons = tree.querySelectorAll('.tree-exercise[data-id]');
  for (const btn of buttons) {
    const id = btn.dataset.id;
    btn.classList.toggle('done', isDone(id));
    btn.classList.toggle('bookmarked', isBookmark(id));
  }
  // Each tree-domain summary shows ${done}/${total} for the FULL domain
  // (not just currently-visible entries — matches renderSidebar's choice).
  // tree-domain elements carry data-domain to make the lookup direct.
  for (const dom of State.data.domains) {
    const domEl = tree.querySelector(`.tree-domain[data-domain="${dom.key}"]`);
    if (!domEl) continue;
    const summary = domEl.querySelector(':scope > summary > small.muted');
    if (!summary) continue;
    const total = dom.sections.reduce((s, sec) => s + sec.exercises.length, 0);
    const done = dom.sections.reduce(
      (s, sec) => s + sec.exercises.filter(e => isDone(e.id)).length, 0);
    summary.textContent = `${done}/${total}`;
  }
}

function buildBrowseDom() {
  if (_browseDom) return _browseDom;
  const main = document.getElementById('main');
  main.innerHTML = '';
  const cards = new Map();
  const sectionHeaders = new Map();
  const domainHeaders = new Map();
  let currentDomain = null, currentSection = null;
  for (const ex of State.allExercises) {
    if (ex.domain.key !== currentDomain) {
      const h2 = el('h2', {}, `${ex.domain.title} (${ex.domain.weight})`);
      main.appendChild(h2);
      domainHeaders.set(ex.domain.key, h2);
      currentDomain = ex.domain.key;
      currentSection = null;
    }
    const secKey = ex.domain.key + '::' + ex.section.number;
    if (secKey !== currentSection) {
      const label = (ex.section.kind === 'killersh' || ex.section.kind === 'killercoda')
        ? '🎯 ' + ex.section.title
        : `§${ex.section.number} ${ex.section.title}`;
      const h3 = el('h3', { class: 'muted', style: { marginTop: '12px' } }, label);
      main.appendChild(h3);
      sectionHeaders.set(secKey, h3);
      currentSection = secKey;
    }
    const card = renderExerciseCard(ex, { openSolution: State.filters.revealSolutions });
    main.appendChild(card);
    cards.set(ex.id, card);
  }
  _browseDom = { main, cards, sectionHeaders, domainHeaders };
  _browseBuiltCount = State.allExercises.length;
  return _browseDom;
}

// Sync card visual state (Done class, Done button text, Bookmark button text,
// Flag button border) from current localStorage state. Needed because the
// card is no longer destroyed/recreated on filter change — when external
// writers (Quiz "Got it" → setDone, cross-tab → storage event) touch the
// underlying state, the mounted card's visual representation can lag. Run on
// every applyBrowseFilter so visuals never drift more than one filter
// keystroke away from truth.
function syncCardStateClasses(cardEl, ex) {
  const done = isDone(ex.id);
  cardEl.classList.toggle('done', done);
  const doneBtn = cardEl.querySelector('button[data-action="done"]');
  if (doneBtn) doneBtn.textContent = done ? '✓ Done' : '☐ Done';
  const bmBtn = cardEl.querySelector('button[data-action="bookmark"]');
  if (bmBtn) bmBtn.textContent = isBookmark(ex.id) ? '⭐' : '☆';
  const flagBtn = cardEl.querySelector('.btn-flag-toggle');
  if (flagBtn) applyFlagBtnState(flagBtn, ex.id);
}

function applyBrowseFilter() {
  const dom = buildBrowseDom();
  const visible = applyFilters();
  const visibleIds = new Set(visible.map(ex => ex.id));
  const visibleSections = new Set();
  const visibleDomains = new Set();
  for (const ex of State.allExercises) {
    const cardEl = dom.cards.get(ex.id);
    if (!cardEl) continue;
    syncCardStateClasses(cardEl, ex);
    const show = visibleIds.has(ex.id);
    cardEl.hidden = !show;
    if (show) {
      visibleSections.add(ex.domain.key + '::' + ex.section.number);
      visibleDomains.add(ex.domain.key);
    }
  }
  for (const [key, h3] of dom.sectionHeaders) h3.hidden = !visibleSections.has(key);
  for (const [key, h2] of dom.domainHeaders) h2.hidden = !visibleDomains.has(key);
  return visible.length;
}

function renderBrowse() {
  // revealSolutions changes the openSolution state baked into every card at
  // construction time; flipping it cheaply on mounted cards would require
  // updating the toggle button text + aria-expanded + .solution-open class
  // in lockstep, which is fragile. So when (and only when) that one filter
  // flips we invalidate the cache and rebuild.
  const currentReveal = State.filters.revealSolutions;
  if (_browseDom && _browseLastReveal !== currentReveal) {
    _browseDom.main.innerHTML = '';
    _browseDom = null;
    clearLLMListeners();
  }
  _browseLastReveal = currentReveal;

  // 🔄 Refresh path can swap State.allExercises. Cheap fingerprint check
  // here invalidates the built DOM when the corpus changes.
  if (_browseDom && State.allExercises.length !== _browseBuiltCount) {
    _browseDom.main.innerHTML = '';
    _browseDom = null;
    clearLLMListeners();
  }

  buildBrowseDom();
  const visibleCount = applyBrowseFilter();
  document.getElementById('filter-stats').textContent =
    `${visibleCount} / ${State.allExercises.length} exercises`;

  // Sidebar — only re-mount the full tree when the structural filters
  // (domain checkboxes, tag checkboxes, search string, only-bookmarks,
  // only-undone, reveal-solutions) actually changed. On a mode switch
  // back from Quiz / Docs / Help / Tools / Nodes the signature is
  // unchanged → run the cheap class-sync path instead. Avoids the
  // 50-150 ms desktop-Chrome reflow that came with rebuilding 271
  // <button>s inside the 280 px sidebar column on every render.
  const sig = sidebarFiltersSignature();
  if (sig !== _sidebarFiltersSignature) {
    renderSidebar(applyFilters());
    _sidebarFiltersSignature = sig;
  } else {
    syncSidebarStateClasses();
  }
  renderSidebarProgress();

  // Empty-state element is a sibling of the cards — toggle visibility, don't
  // detach/reattach.
  let emptyState = document.getElementById('browse-empty-state');
  if (visibleCount === 0) {
    if (!emptyState) {
      emptyState = el('div', { id: 'browse-empty-state', class: 'empty-state' },
        'No exercises match the current filters.');
      _browseDom.main.appendChild(emptyState);
    }
    emptyState.hidden = false;
  } else if (emptyState) {
    emptyState.hidden = true;
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
    stampSingleton(KEY.quizActive);
    markSyncDirty();
  } catch (e) {
    // localStorage quota etc — silently drop. User-visible feedback would be noise.
  }
}

function clearActiveQuiz() {
  storageSet(KEY.quizActive, null);
  refreshQuizTabDot();
  stampSingleton(KEY.quizActive);
  markSyncDirty();
}

// Direct localStorage → snapshots-list promotion. `KEY.quizActive` is
// already a serialiseQuiz() output, schema-identical to a snapshots
// entry — we just stamp a name + id and prepend it. Used by the
// "Snapshot & start new" path so the user doesn't have to first
// Resume → Save snapshot before starting a new session.
function promoteActiveToSnapshot() {
  const payload = storageGet(KEY.quizActive, null);
  if (!payload) return false;
  payload.name = `In-progress — ${new Date().toLocaleString()}`.slice(0, 80);
  payload.id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const list = getSnapshots();
  list.unshift(payload);
  try { setSnapshots(list); }
  catch (e) {
    alert(`Couldn't save snapshot: ${e.message}`);
    return false;
  }
  return true;
}

// 3-button confirmation when ▶ Start quiz is pressed while a session
// is already in progress. Replaces a native confirm() that only
// offered Cancel / OK (= discard) and forced users to a 5-step
// detour through Resume → Save snapshot if they wanted to preserve
// the in-progress session.
function openStartNewQuizConfirm(saved) {
  const overlay = document.getElementById('quiz-confirm-start-overlay');
  if (!overlay) return;
  const answered = (saved.status || []).length;
  const total = (saved.ids || []).length;
  document.getElementById('quiz-confirm-start-progress').textContent =
    `Current session: ${answered} / ${total} answered.`;
  overlay.hidden = false;

  const close = () => {
    overlay.hidden = true;
    snapshotBtn.onclick = null;
    discardBtn.onclick = null;
    cancelBtn.onclick = null;
    closeBtn.onclick = null;
  };
  const snapshotBtn = document.getElementById('quiz-confirm-start-snapshot');
  const discardBtn  = document.getElementById('quiz-confirm-start-discard');
  const cancelBtn   = document.getElementById('quiz-confirm-start-cancel');
  const closeBtn    = document.getElementById('quiz-confirm-start-close');
  snapshotBtn.onclick = () => {
    if (!promoteActiveToSnapshot()) return;
    clearActiveQuiz();
    close();
    startQuiz();
  };
  discardBtn.onclick = () => {
    clearActiveQuiz();
    close();
    startQuiz();
  };
  cancelBtn.onclick = close;
  closeBtn.onclick  = close;
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
  stampSingleton(KEY.quizSnapshots);
  markSyncDirty();
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

// Quiz mode landing page. Shows resume / snapshots first (if any), then the
// primary "▶ Start a new quiz" CTA + two quick-start preset buttons. Users no
// longer get the dense 9-fieldset configure form on entry — that lives one
// click away behind ▶ Start a new quiz.
function showQuizHome() {
  document.getElementById('quiz-home').hidden = false;
  document.getElementById('quiz-setup').hidden = true;
  document.getElementById('quiz-active').hidden = true;
  const sum = document.getElementById('quiz-summary'); if (sum) sum.hidden = true;
  renderQuizResumePanel(document.getElementById('quiz-home-resume'));
  renderQuizHomeProficiency();
}

// Per-domain proficiency strip on the Quiz landing page. Mirrors the
// sidebar's prog-row / prog-bar layout but renders inside #quiz-home so the
// user sees per-domain done % before deciding which preset to fire. Top-2
// domains (by lowest pct, pct < 100) get a 💡 weak hint and a `weak` class
// so the drill-weak-spots CTA's target is obvious.
function renderQuizHomeProficiency() {
  const container = document.getElementById('quiz-home-proficiency');
  if (!container || !State.data) return;
  container.innerHTML = '';
  const rows = State.data.domains.map(dom => {
    const total = dom.sections.reduce((s, sec) => s + sec.exercises.length, 0);
    const done = dom.sections.reduce((s, sec) => s + sec.exercises.filter(e => isDone(e.id)).length, 0);
    const pct = total ? (done / total) * 100 : 0;
    return { dom, total, done, pct };
  });
  const weakKeys = new Set(
    rows.filter(r => r.pct < 100).sort((a, b) => a.pct - b.pct).slice(0, 2).map(r => r.dom.key)
  );
  container.appendChild(el('div', { class: 'quiz-prof-title muted' }, 'Per-domain progress'));
  for (const { dom, total, done, pct } of rows) {
    const isWeak = weakKeys.has(dom.key);
    const row = el('div', { class: 'quiz-prof-row' + (done === total ? ' complete' : '') + (isWeak ? ' weak' : '') });
    row.appendChild(el('div', { class: 'quiz-prof-label' },
      el('span', { class: 'quiz-prof-name' }, PROGRESS_SHORT_LABEL[dom.key] || dom.key),
      el('span', { class: 'quiz-prof-weight muted' }, dom.weight),
      el('span', { class: 'quiz-prof-count' }, `${done} / ${total} · ${Math.round(pct)}%`),
      isWeak ? el('span', { class: 'quiz-prof-weak-tag', title: 'Drill weak spots targets this domain' }, '💡 weak') : null,
    ));
    const bar = el('div', { class: 'prog-bar' });
    bar.appendChild(el('div', { class: 'prog-bar-fill', style: { width: `${pct}%` } }));
    row.appendChild(bar);
    container.appendChild(row);
  }
  container.hidden = false;
}

// Open the full configure form (used by the "▶ Start a new quiz" CTA on home).
function showQuizSetup() {
  document.getElementById('quiz-home').hidden = true;
  document.getElementById('quiz-setup').hidden = false;
  document.getElementById('quiz-active').hidden = true;
  const sum = document.getElementById('quiz-summary'); if (sum) sum.hidden = true;
  // Recompute eligible count in case Done / Bookmark changed since the last
  // time the form was visible (could affect Only-bookmarked / Only-undone).
  try { updateQuizEligibleCount(); } catch {}
}

function renderQuizResumePanel(container) {
  // Caller can pass an explicit container (the Quiz landing page uses
  // #quiz-home-resume). Default — kept for callers that pre-date the
  // landing-page split — is the legacy #quiz-resume-panel slot inside
  // the setup screen.
  const panel = container || document.getElementById('quiz-home-resume') || document.getElementById('quiz-resume-panel');
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
  // The snapshot is now the source of truth; clear the active slot and exit to
  // the landing page so the snapshot we just saved is immediately visible.
  clearInterval(State.quizTimerHandle);
  State.quiz = null;
  clearActiveQuiz();
  document.getElementById('quiz-timer').hidden = true;
  document.getElementById('quiz-summary').hidden = true;
  showQuizHome();
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

// Form entry point — used by the #quiz-start-btn click handler. Reads
// all the quiz configuration radios/checkboxes and hands the resulting
// config object to startQuizFromConfig.
function startQuiz() {
  const filters = gatherQuizFilters();
  // Count
  const countRadio = document.querySelector('[name="quiz-count"]:checked').value;
  let count;
  if (countRadio === 'all') count = Number.MAX_SAFE_INTEGER;  // clamped inside startQuizFromConfig
  else if (countRadio === 'custom') count = parseInt(document.getElementById('quiz-count-custom').value, 10);
  else count = parseInt(countRadio, 10);
  const order = document.querySelector('[name="quiz-order"]:checked')?.value || 'random';
  const tmin = parseInt(document.querySelector('[name="quiz-time"]:checked').value, 10);
  const solutions = document.querySelector('[name="quiz-solutions"]:checked').value === 'hidden' ? 'hidden' : 'visible';
  startQuizFromConfig({ ...filters, count, order, time: tmin, solutions });
}

// Config-driven start path. Used by the form handler above AND by the
// quick-start presets (10 random / 17-mock / drill weak). Quick-starts
// no longer round-trip through hidden form inputs, which had a habit of
// confusing button.click() dispatch on desktop Chrome.
//
// cfg: { domains:Set<string>, tags:Set<string>, onlyBookmarks:bool,
//        onlyUndone:bool, count:number, order:'random'|'sequential',
//        time:number (minutes; 0 = no limit),
//        solutions:'hidden'|'visible' }
function startQuizFromConfig(cfg) {
  const eligible = State.allExercises.filter(ex => {
    if (!cfg.domains.has(ex.domain.key)) return false;
    if (!cfg.tags.has(ex.tag)) return false;
    if (cfg.onlyBookmarks && !isBookmark(ex.id)) return false;
    if (cfg.onlyUndone && isDone(ex.id)) return false;
    return true;
  });
  if (eligible.length === 0) {
    alert("No eligible exercises matched these filters.");
    return;
  }
  const count = Math.min(Math.max(1, cfg.count || 10), eligible.length);
  const order = cfg.order || 'random';
  storageSet(KEY.quizOrder, order);
  const picked = pickQuizExercises(eligible, count, order);
  const tmin = cfg.time | 0;
  const deadline = tmin > 0 ? Date.now() + tmin * 60 * 1000 : null;
  const solutionsHidden = cfg.solutions === 'hidden';

  State.quiz = {
    ids: picked.map(e => e.id),
    idx: 0,
    status: new Map(),
    flagged: new Set(),
    revealed: new Set(),
    deadline,
    solutionsHidden,
    totalMinutes: tmin,
    startedAt: Date.now(),
    order,
  };

  document.getElementById('quiz-home').hidden = true;
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
  // Refresh the grade-row highlight so the current quiz status is always
  // visible after a (re-)render.
  syncQuizGradeButtons();
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

// Highlight the Got it / Partial / Missed button that matches the current
// question's status, so the user can tell at a glance which bucket they
// landed in after LLM Check (which writes one of got/partial/missed
// internally via line 3237). Without this the user sees a "Partial 80/100"
// verdict but no indication that the quiz already recorded it — the bug
// behind "which button do I click for Partial?".
function syncQuizGradeButtons() {
  // Toggle .is-current on BOTH the regular Quiz controls (one button
  // per id) AND any fullscreen quizbar proxies (same class, no id).
  // Selector covers both surfaces.
  const allGrade = document.querySelectorAll(
    '#quiz-grade-got, #quiz-grade-partial, #quiz-grade-miss, ' +
    '.answer-fullscreen-quizbar .grade-got, .answer-fullscreen-quizbar .grade-partial, .answer-fullscreen-quizbar .grade-miss'
  );
  allGrade.forEach(b => b.classList.remove('is-current'));
  const q = State.quiz;
  if (!q) return;
  const exId = q.ids[q.idx];
  const s = q.status.get(exId);   // 'got' | 'partial' | 'missed' | 'skipped' | undefined
  if (!s || s === 'skipped') return;
  const cls = s === 'got' ? 'grade-got' : s === 'partial' ? 'grade-partial' : 'grade-miss';
  // Original button is by id; proxies share the class
  document.getElementById('quiz-grade-' + (s === 'got' ? 'got' : s === 'partial' ? 'partial' : 'miss'))?.classList.add('is-current');
  document.querySelectorAll(`.answer-fullscreen-quizbar .${cls}`).forEach(b => b.classList.add('is-current'));
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
      el('span', { class: `status-${verdict}` }, verdict === 'got' ? '✓' : verdict === 'partial' ? '◐' : verdict === 'missed' ? '✗' : '↷'),
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
    // Make sure the setup form is populated once so the user sees the same
    // filters when they hit "▶ Start a new quiz". Lazy first-time init.
    if (!document.getElementById('quiz-domain-list').firstChild) renderQuizSetup();
    // If there's an active in-memory quiz, the active view is already shown
    // by the renderQuizCard flow; otherwise land on the home screen.
    if (!State.quiz) showQuizHome();
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
  // Back-to-top button visibility is purely mode-driven (shown in Browse,
  // hidden everywhere else).
  syncBackToTopVisibility();
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
  const changelogEn = (State.data && State.data.changelog) || '';
  // Changelog is English-only — no CN counterpart, so the language switcher
  // is hidden when the user is viewing it. Same fallback chain otherwise:
  // selected-doc CN if available + lang=zh, else selected-doc EN, else
  // webapp EN as the universal default.
  const cnForCurrentDoc = doc === 'exam' ? examCn : doc === 'changelog' ? '' : helpCn;
  const enForCurrentDoc = doc === 'exam' ? examEn : doc === 'changelog' ? changelogEn : helpEn;
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
  const hasChangelog = !!changelogEn;
  const controls = el('div', { class: 'help-controls' });

  if (hasExam || hasChangelog) {
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
    if (hasExam) docSwitch.appendChild(mkDocBtn('exam', '🎯 Study Index'));
    if (hasChangelog) docSwitch.appendChild(mkDocBtn('changelog', '📜 Changelog'));
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
  const SELF_LINK_RE = /(^|\/)(WEBAPP_GUIDE_CN|WEBAPP_GUIDE|EXAM_GUIDE_CN|EXAM_GUIDE|CHANGELOG)\.md$/;
  const LINK_TO_STATE = {
    'WEBAPP_GUIDE.md':    { doc: 'webapp',    lang: 'en' },
    'WEBAPP_GUIDE_CN.md': { doc: 'webapp',    lang: 'zh' },
    'EXAM_GUIDE.md':      { doc: 'exam',      lang: 'en' },
    'EXAM_GUIDE_CN.md':   { doc: 'exam',      lang: 'zh' },
    'CHANGELOG.md':       { doc: 'changelog', lang: 'en' },
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

  // Build a TRUE nested <ul>: each h2 <li> contains its own child <ul> with
  // the h3 entries that follow it. That lets CSS draw a single continuous
  // border-left across all child entries (the previous flat structure gave
  // every h3 its own disconnected 1-px line, which looked fragmented).
  // Emoji from the original heading text is kept — it's a visual landmark
  // the user reads as part of section identity; stripping it left the TOC
  // looking like plain monochrome outline. A previous attempt also had a
  // regex without `^` anchor that accidentally cut '&' out of headings
  // like "Backup & restore (local file)" — gone now too.
  const rootUl = document.createElement('ul');
  let currentH2Li = null;
  let currentSubUl = null;
  items.forEach(it => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#help-section-${it.id}`;
    a.textContent = it.text;
    a.dataset.target = it.id;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(it.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    li.appendChild(a);
    if (it.level === 2) {
      currentH2Li = li;
      currentSubUl = null;
      rootUl.appendChild(li);
    } else {
      if (currentH2Li && !currentSubUl) {
        currentSubUl = document.createElement('ul');
        currentH2Li.appendChild(currentSubUl);
      }
      (currentSubUl || rootUl).appendChild(li);
    }
  });
  toc.innerHTML = '';
  toc.appendChild(rootUl);

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
  State.toolsSubtab = (lastTab === 'kubectl' || lastTab === 'api-resources') ? lastTab : 'explain';
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

const TOOLS_SUBTABS = new Set(['explain', 'kubectl', 'api-resources']);
function showToolsSubtab(name) {
  const sub = TOOLS_SUBTABS.has(name) ? name : 'explain';
  State.toolsSubtab = sub;
  storageSet(KEY.toolsSubtab, sub);
  document.querySelectorAll('.tools-subtabs button[data-tools-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.toolsTab === sub));
  document.getElementById('tools-explain').hidden       = sub !== 'explain';
  document.getElementById('tools-kubectl').hidden       = sub !== 'kubectl';
  document.getElementById('tools-api-resources').hidden = sub !== 'api-resources';
  // Each subtab opens in list-view (mobile master-detail). Item-click +
  // renderXxxDetail re-set the class for the newly-active subtab if a
  // selection exists.
  ['tools-explain', 'tools-kubectl'].forEach(id =>
    document.getElementById(id)?.classList.remove('tools-detail-active'));
  if (sub === 'explain' && State.toolsExplain.kindRef) renderExplainDetail();
  if (sub === 'kubectl' && State.toolsKubectl.cmdPath) renderKubectlDetail();
  if (sub === 'api-resources') renderApiResourcesTable();
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
  // 📑 api-resources filter — debounced so typing isn't laggy. Filter
  // syntax: plain text matches any column; prefix tokens narrow further
  // (namespaced:true|false, verb:<name>, group:<name>).
  let _arDebounce = null;
  document.getElementById('tools-api-resources-search')?.addEventListener('input', () => {
    clearTimeout(_arDebounce);
    _arDebounce = setTimeout(renderApiResourcesTable, 60);
  });
}

// 📑 api-resources panel — flat lookup table mirroring `kubectl
// api-resources -o wide`. Data comes from State.tools.apiResources (built
// by scripts/build-kubectl-tools.mjs from INCLUDED_KINDS + OpenAPI GVK).
function renderApiResourcesTable() {
  const tbody   = document.querySelector('#tools-api-resources-table tbody');
  const countEl = document.getElementById('tools-api-resources-count');
  if (!tbody || !State.tools?.apiResources) return;
  const q = (document.getElementById('tools-api-resources-search')?.value || '').trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const all = State.tools.apiResources;
  const rows = all.filter(r => {
    const hay = `${r.plural} ${r.kind} ${r.apiVersion} ${(r.shortNames || []).join(',')} ${(r.verbs || []).join(',')} ${r.group || ''}`.toLowerCase();
    return tokens.every(t => {
      if (t.startsWith('namespaced:')) return String(r.namespaced) === t.slice(11);
      if (t.startsWith('verb:'))       return (r.verbs || []).includes(t.slice(5));
      if (t.startsWith('group:'))      return (r.group || '').toLowerCase() === t.slice(6);
      return hay.includes(t);
    });
  });
  tbody.innerHTML = '';
  for (const r of rows) {
    // data-label attrs power the mobile stacked-card layout — CSS ::before
    // pseudo-elements read attr(data-label) so each cell shows its column
    // name inline at narrow viewports without a separate <thead>.
    const tr = el('tr', { 'data-kind': r.kind, title: `Click to open ${r.kind} in 📘 Explain` },
      el('td', { 'data-label': 'NAME' }, r.plural),
      el('td', { 'data-label': 'SHORTNAMES', class: 'api-resources-cell--shortnames' }, (r.shortNames || []).join(', ') || '—'),
      el('td', { 'data-label': 'APIVERSION' }, r.apiVersion),
      el('td', { 'data-label': 'NAMESPACED', class: r.namespaced ? 'api-resources-cell--ns-true' : 'api-resources-cell--ns-false' }, String(r.namespaced)),
      el('td', { 'data-label': 'KIND' }, r.kind),
      el('td', { 'data-label': 'VERBS', class: 'api-resources-cell--verbs' }, (r.verbs || []).join(', ')),
    );
    tr.addEventListener('click', () => {
      const root = State.tools.rootKinds?.find(rk => rk.name === r.kind);
      if (!root) return;
      State.toolsExplain = { kindRef: root.ref, path: [] };
      storageSet(KEY.toolsKind, root.ref);
      storageSet(KEY.toolsPath, []);
      showToolsSubtab('explain');
      renderExplainKindList(document.getElementById('tools-explain-search')?.value || '');
      renderExplainDetail();
    });
    tbody.appendChild(tr);
  }
  if (countEl) {
    countEl.textContent = rows.length === all.length ? `${all.length} resources` : `${rows.length} / ${all.length}`;
  }
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
    // On mobile / in-drawer this triggers the master-detail swap — list
    // hides, detail fills the panel. No-op on desktop.
    document.getElementById('tools-explain')?.classList.add('tools-detail-active');
    renderExplainDetail();
  });
  return btn;
}

// Small "← Back" button prepended to a Tools detail pane when in mobile or
// in-drawer master-detail mode. Hidden by CSS on desktop. Clicking removes
// the detail-active class on the parent panel and refocuses the search
// input so the user can immediately type to find their next lookup.
function backToToolsListButton(panelId) {
  const btn = el('button', {
    type: 'button',
    class: 'tools-back-to-list',
    title: 'Back to the list',
  }, '← Back');
  btn.addEventListener('click', () => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.remove('tools-detail-active');
    panel.querySelector('input[type="search"]')?.focus();
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
  // Mobile / in-drawer: prepend a back button + ensure the detail-active
  // class is set (covers the restored-from-localStorage cold-start path
  // where the click handler never ran).
  detail.appendChild(backToToolsListButton('tools-explain'));
  document.getElementById('tools-explain')?.classList.add('tools-detail-active');

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
    // In-detail filter: substring match against field name + type + description.
    // Especially useful for deep objects like Pod.spec where the field list is
    // long and finding e.g. "affinity" by scroll on mobile is painful.
    const filterInput = el('input', {
      type: 'search',
      class: 'tools-detail-filter',
      placeholder: '🔎 Filter fields (name, type, description)',
      autocomplete: 'off',
    });
    detail.appendChild(filterInput);
    const rows = [];
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
      const haystack = `${f.name} ${f.type || ''} ${f.description || ''}`.toLowerCase();
      row.dataset.search = haystack;
      detail.appendChild(row);
      rows.push(row);
    }
    filterInput.addEventListener('input', () => {
      const q = filterInput.value.trim().toLowerCase();
      for (const r of rows) r.style.display = (!q || r.dataset.search.includes(q)) ? '' : 'none';
    });
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
      // Mobile / in-drawer master-detail swap; no-op on desktop.
      document.getElementById('tools-kubectl')?.classList.add('tools-detail-active');
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
  // Mobile / in-drawer master-detail: back button + ensure detail-active.
  detail.appendChild(backToToolsListButton('tools-kubectl'));
  document.getElementById('tools-kubectl')?.classList.add('tools-detail-active');
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

  // In-detail filter: substring match per help-text line. Useful for finding
  // a flag like --image inside a long kubectl run -h output without scrolling.
  const filterInput = el('input', {
    type: 'search',
    class: 'tools-detail-filter',
    placeholder: '🔎 Filter lines (e.g. --image, hostNetwork)',
    autocomplete: 'off',
  });
  detail.appendChild(filterInput);

  // Render the help text as one <div> per line so the filter can show/hide
  // individual lines. The container preserves indentation + monospace via
  // .kubectl-help styling; each line wraps inside its own div.
  const lines = (cmd.rawHelp || '').split('\n');
  const helpBox = el('div', { class: 'kubectl-help' });
  const lineNodes = [];
  for (const raw of lines) {
    const line = el('div', { class: 'kubectl-help-line' }, raw || ' ');
    line.dataset.search = raw.toLowerCase();
    helpBox.appendChild(line);
    lineNodes.push(line);
  }
  detail.appendChild(helpBox);

  filterInput.addEventListener('input', () => {
    const q = filterInput.value.trim().toLowerCase();
    for (const ln of lineNodes) ln.style.display = (!q || ln.dataset.search.includes(q)) ? '' : 'none';
  });
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
  const view = document.getElementById('view-nodes');
  if (!detail) return;
  const file = findNodesFile(getNodesActiveTree(), filePath);
  if (!file) {
    // Not in current role — maybe user clicked a CP file but switched to worker
    detail.innerHTML = `<p class="muted">File <code>${filePath}</code> not in this role's snapshot. Switch role or pick another file.</p>`;
    return;
  }
  detail.innerHTML = '';
  // Mobile master-detail: clicking a file shifts the view into detail-only.
  view?.classList.add('nodes-detail-active');

  // ← Back button — only shown on mobile via CSS. Restores the tree-only view
  // and refocuses the tree search input (mirror of Tools' tools-back-to-list).
  const backBtn = el('button', {
    type: 'button',
    class: 'nodes-back-to-tree',
    title: 'Back to the file tree',
  }, '← Back');
  backBtn.addEventListener('click', () => {
    view?.classList.remove('nodes-detail-active');
    document.getElementById('nodes-search')?.focus();
  });
  detail.appendChild(backBtn);

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

  // In-file filter: grep within the open file by line. Useful for finding a
  // specific flag in a kube-apiserver static pod manifest etc. Mirrors the
  // Tools detail filter pattern. Copy still copies the full file (unfiltered).
  const filterInput = el('input', {
    type: 'search',
    class: 'tools-detail-filter',
    placeholder: '🔎 Filter lines (e.g. --etcd-servers, audit-log)',
    autocomplete: 'off',
  });
  detail.appendChild(filterInput);

  // Render file content as per-line wrappers so the filter can show/hide
  // individual lines while preserving indentation + monospace layout.
  const body = el('div', { class: 'nodes-file-body' });
  const lineNodes = [];
  const lines = (file.content || '').split('\n');
  for (const raw of lines) {
    const line = el('div', { class: 'nodes-file-line' }, raw || ' ');
    line.dataset.search = raw.toLowerCase();
    body.appendChild(line);
    lineNodes.push(line);
  }
  detail.appendChild(body);

  filterInput.addEventListener('input', () => {
    const q = filterInput.value.trim().toLowerCase();
    for (const ln of lineNodes) ln.style.display = (!q || ln.dataset.search.includes(q)) ? '' : 'none';
  });
}

function switchNodesRole(role) {
  const r = (role === 'worker') ? 'worker' : 'controlplane';
  State.nodesRole = r;
  storageSet(KEY.nodesRole, r);
  document.querySelectorAll('.nodes-subtabs button[data-nodes-role]').forEach(b =>
    b.classList.toggle('active', b.dataset.nodesRole === r));
  // Role switch resets to tree-view on mobile so the user re-picks a file.
  document.getElementById('view-nodes')?.classList.remove('nodes-detail-active');
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

  // Header version chip — populated from State.data.version (baked in by
  // scripts/build-exercises.mjs from package.json). Always-visible
  // "vX.Y.Z" pill in the header right, click jumps to Help → Changelog.
  renderAppBuild();

  // Pop a post-reload toast if manualRefresh stashed one before
  // location.replace(). The pre-reload toast only had ~1.2s of screen
  // time before the DOM was torn down; this is the message the user
  // actually has time to read (3s auto-dismiss). Stamp guards against
  // showing stale toasts from earlier sessions (tab restore, manual
  // history navigation, etc).
  try {
    const raw = sessionStorage.getItem('cka:refresh-toast');
    if (raw) {
      sessionStorage.removeItem('cka:refresh-toast');
      const payload = JSON.parse(raw);
      if (payload && payload.msg && Date.now() - (payload.at || 0) < 30000) {
        showRefreshToast(payload.msg, payload.kind || 'ok');
      }
    }
  } catch {}

  // Theme
  const savedTheme = storageGet(KEY.theme, null) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // Mode tabs. The "repeat-tap active Browse to scroll to top" gesture
  // was tried and dropped — too easy to misfire when the user just
  // wanted to confirm they were in browse mode (or accidentally
  // re-tapped). Back-to-top now lives only in the floating ↑ button
  // (installBackToTop), which is discoverable and intent-gated.
  document.querySelectorAll('.mode-tab').forEach(t =>
    t.addEventListener('click', () => setMode(t.dataset.mode))
  );

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

  // Debounced auto-push 30s after the last sync-worthy edit. Replays a
  // pending dirty flag from a previous session + hooks beforeunload.
  bootAutoSync();

  // Header 🐛 Issues popover + bulk-open buttons in both surfaces.
  installIssuesMenu();
  installIssuesQueueOpenAll();
  refreshIssuesQueueCount();

  // Custom hover tooltip on Browse sidebar section + exercise rows
  // (full title visible without expanding the sidebar's 280px column).
  installSidebarTooltip();

  // Header 🤖 LLM quick-switch popover
  installLlmMenu();

  // Header 🔄 refresh + auto-detect "new content" banner
  installRefreshAffordances();

  // Floating back-to-top button — surfaces in Browse mode after the
  // user has scrolled past ~600px. Lets phone users escape a deep
  // scroll position (e.g. exercise #150 of 271) without hunting up
  // through the Outline modal.
  installBackToTop();

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
      openStartNewQuizConfirm(saved);
      return;
    }
    startQuiz();
  });
  document.getElementById('quiz-snapshot')?.addEventListener('click', saveAsSnapshot);
  document.getElementById('quiz-next').addEventListener('click', quizNext);
  document.getElementById('quiz-prev').addEventListener('click', quizPrev);
  document.getElementById('quiz-grade-got').addEventListener('click', () => quizGrade('got'));
  document.getElementById('quiz-grade-partial').addEventListener('click', () => quizGrade('partial'));
  document.getElementById('quiz-grade-miss').addEventListener('click', () => quizGrade('missed'));
  document.getElementById('quiz-skip').addEventListener('click', quizSkip);
  document.getElementById('quiz-flag').addEventListener('click', quizFlag);
  document.getElementById('quiz-reveal').addEventListener('click', quizReveal);
  document.getElementById('quiz-nav-toggle')?.addEventListener('click', openQuizNav);
  document.getElementById('quiz-finish').addEventListener('click', () => {
    if (confirm('End this quiz session and see your summary?')) finishQuiz();
  });
  document.getElementById('quiz-restart').addEventListener('click', () => {
    // After finishing a quiz, return to the landing page so the user decides
    // again whether to customise or just quick-start another round.
    document.getElementById('quiz-summary').hidden = true;
    showQuizHome();
  });

  // Quiz home → Setup
  document.getElementById('quiz-home-start-new')?.addEventListener('click', () => {
    updateQuizEligibleCount();
    showQuizSetup();
  });

  // Setup → Quiz home
  document.getElementById('quiz-setup-back-to-home')?.addEventListener('click', () => {
    showQuizHome();
  });

  // Quick-start presets — build the quiz config in memory and hand it to
  // startQuizFromConfig directly. We no longer round-trip through hidden
  // form inputs: that had a habit of dropping clicks on desktop Chrome
  // (drill weak in particular) and added a hidden race window between
  // setting cb.checked = ... and quiz-start-btn.click() reading it back.
  const ALL_TAGS = ['general', 'cka-past-exam', 'killersh-a', 'killersh-b', 'killercoda'];
  function quickStartWithCount(count) {
    if (!State.data) return;
    startQuizFromConfig({
      domains: new Set(State.data.domains.map(d => d.key)),
      tags: new Set(ALL_TAGS),
      onlyBookmarks: false,
      onlyUndone: false,
      count,
      order: 'random',
      time: 0,
      solutions: 'hidden',
    });
  }
  document.getElementById('quiz-home-quick-10')?.addEventListener('click', () => quickStartWithCount(10));
  document.getElementById('quiz-home-quick-mock')?.addEventListener('click', () => quickStartWithCount(17));

  // Drill weak spots — narrow the corpus to the 1-2 domains with the
  // lowest done %, restrict to not-yet-done, draw 10 random.
  function quickStartWeakSpots() {
    if (!State.data) return;
    const rows = State.data.domains.map(dom => {
      const total = dom.sections.reduce((s, sec) => s + sec.exercises.length, 0);
      const done = dom.sections.reduce((s, sec) => s + sec.exercises.filter(e => isDone(e.id)).length, 0);
      return { key: dom.key, pct: total ? (done / total) * 100 : 0 };
    });
    const weak = rows.filter(r => r.pct < 100).sort((a, b) => a.pct - b.pct).slice(0, 2);
    if (weak.length === 0) {
      alert("All domains are 100% done 🎉 — try '🎲 10 random' or '🎯 17-question mock' for review practice.");
      return;
    }
    startQuizFromConfig({
      domains: new Set(weak.map(w => w.key)),
      tags: new Set(ALL_TAGS),
      onlyBookmarks: false,
      onlyUndone: true,
      count: 10,
      order: 'random',
      time: 0,
      solutions: 'hidden',
    });
  }
  document.getElementById('quiz-home-quick-weak')?.addEventListener('click', quickStartWeakSpots);

  // Service worker — offline support for iOS PWA standalone (cold-start
  // when offline would otherwise produce a white screen). Skip on
  // localhost so `npm run serve` development isn't pinned to stale cache.
  if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.gen.js').catch(() => {});
    });
    // New SW activated → a fresh build is reachable. Don't silently
    // reload — the user might be mid-edit or mid-task. Instead, route
    // through the same banner the periodic head-check uses, so they
    // get an explicit Refresh / ✕ choice. (controllerchange fires at
    // most once per SW version transition, no throttle needed.)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      checkForUpdate();
    });
  }

  // Install hint — dismissable one-time banner on iOS / Android browsers
  // where the user could "Add to Home Screen" but hasn't yet. Suppressed
  // in standalone mode (already installed) and after dismissal.
  installInstallHint();
}

function installInstallHint() {
  const banner = document.getElementById('install-hint');
  if (!banner) return;
  const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                       || window.navigator.standalone === true;
  if (isStandalone) return;
  if (localStorage.getItem('cka:install:dismissed') === 'true') return;
  const ua = navigator.userAgent || '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const textEl = banner.querySelector('.install-hint-text');
  if (textEl) {
    textEl.textContent = isIos
      ? '📱 Install: Safari Share → "Add to Home Screen"'
      : '📱 Install: open browser menu → "Add to Home screen"';
  }
  setTimeout(() => { banner.hidden = false; }, 8000);
  const dismiss = document.getElementById('install-hint-dismiss');
  dismiss?.addEventListener('click', () => {
    banner.hidden = true;
    try { localStorage.setItem('cka:install:dismissed', 'true'); } catch {}
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
