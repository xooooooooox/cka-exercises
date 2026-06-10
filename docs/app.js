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
    tags: new Set(['general', 'cka-zhenti', 'killersh-a', 'killersh-b']),
    search: '',
    onlyBookmarks: false,
    onlyUndone: false,
    revealSolutions: false,
  },
  quiz: null,                    // { ids, idx, status: Map<id, 'got'|'missed'|'skipped'>, flagged: Set, revealed: Set, deadline, solutionsHidden }
  quizTimerHandle: null,
};

// ---------- Storage ----------
const KEY = {
  done: 'cka:done',
  bookmark: 'cka:bookmark',
  theme: 'cka:theme',
  lastQuiz: 'cka:lastQuiz',
};
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
  'cka-zhenti': 'CKA 真题',
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
      tags: new Set(['general', 'cka-zhenti', 'killersh-a', 'killersh-b']),
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
    const summary = el('summary', {}, dom.title.replace(/ \(.+?\)/, ''), el('small', { class: 'muted' }, ` ${doneEx}/${totalEx}`));
    domEl.appendChild(summary);

    for (const sec of dom.sections) {
      const exs = bySec.get(sec.number);
      if (!exs) continue;
      const secEl = el('details', { class: 'tree-section', open: false });
      const secLabel = sec.kind === 'killersh' ? '🎯 ' + sec.title : `${sec.number}. ${sec.title}`;
      secEl.appendChild(el('summary', {}, secLabel, el('small', {}, ` ${exs.length}`)));
      for (const ex of exs) {
        const btn = el('button', {
          class: 'tree-exercise' + (isDone(ex.id) ? ' done' : '') + (isBookmark(ex.id) ? ' bookmarked' : ''),
          title: ex.title,
        }, ex.title);
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

function renderSidebarProgress() {
  const elProgress = document.getElementById('sidebar-progress');
  elProgress.innerHTML = '';
  let allTotal = 0, allDone = 0, allBookmark = 0;
  for (const dom of State.data.domains) {
    const total = dom.sections.reduce((s, sec) => s + sec.exercises.length, 0);
    const done = dom.sections.reduce((s, sec) => s + sec.exercises.filter(e => isDone(e.id)).length, 0);
    allTotal += total; allDone += done;
  }
  for (const ex of State.allExercises) if (isBookmark(ex.id)) allBookmark++;
  elProgress.appendChild(el('div', { class: 'progress-row' },
    'Done overall: ', el('strong', {}, `${allDone} / ${allTotal}`)));
  elProgress.appendChild(el('div', { class: 'progress-row' },
    'Bookmarked: ', el('strong', {}, `${allBookmark}`)));
}

function renderExerciseCard(ex, opts = {}) {
  const card = el('div', { class: 'exercise-card', id: 'card-' + ex.id });
  if (isDone(ex.id)) card.classList.add('done');
  if (State.filters.revealSolutions || opts.openSolution) card.classList.add('solution-open');

  // Header
  const tools = el('div', { class: 'exercise-tools' });
  const doneBtn = el('button', { type: 'button', title: 'Toggle done' }, isDone(ex.id) ? '✓ Done' : '☐ Done');
  doneBtn.addEventListener('click', () => {
    setDone(ex.id, !isDone(ex.id));
    if (isDone(ex.id)) card.classList.add('done'); else card.classList.remove('done');
    doneBtn.textContent = isDone(ex.id) ? '✓ Done' : '☐ Done';
    renderSidebarProgress();
    const sideBtn = document.querySelectorAll('.tree-exercise');
    sideBtn.forEach(b => { if (b.title === ex.title) b.classList.toggle('done', isDone(ex.id)); });
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
  meta.appendChild(tagPill(ex.tag));
  if (ex.points != null) meta.appendChild(el('span', { class: 'points-pill' }, `${ex.points} 分`));
  meta.appendChild(el('span', { class: 'id-pill' }, ex.id));
  meta.appendChild(el('span', {}, `${ex.domain.title.split(',')[0]} · ${ex.section.kind === 'killersh' ? 'Killer.sh' : `§${ex.section.number} ${ex.section.title}`}`));
  card.appendChild(meta);

  // Docs link
  if (ex.docsLink) {
    const docs = el('div', { class: 'exercise-docs' },
      el('a', { href: ex.docsLink, target: '_blank', rel: 'noopener' }, `📖 ${ex.docsLinkText || ex.docsLink}`));
    card.appendChild(docs);
  }

  // Task
  if (ex.task) {
    const task = el('div', { class: 'exercise-task', html: renderMarkdown(ex.task) });
    card.appendChild(task);
    attachCopyButtons(task);
  }

  // Solution toggle + body
  if (ex.solution) {
    const toggle = el('div', { class: 'solution-toggle', role: 'button' }, 'Show solution');
    toggle.addEventListener('click', () => {
      card.classList.toggle('solution-open');
      toggle.textContent = card.classList.contains('solution-open') ? 'Hide solution' : 'Show solution';
    });
    card.appendChild(toggle);
    const solHtml = renderMarkdown(ex.solution);
    const solDiv = el('div', { class: 'exercise-solution', html: solHtml });
    card.appendChild(solDiv);
    attachCopyButtons(solDiv);
    if (card.classList.contains('solution-open')) toggle.textContent = 'Hide solution';
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
    main.appendChild(renderExerciseCard(ex));
  }
}

// ---------- Quiz mode ----------
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
  };

  document.getElementById('quiz-setup').hidden = true;
  document.getElementById('quiz-active').hidden = false;
  document.getElementById('quiz-summary').hidden = true;
  document.getElementById('quiz-timer').hidden = !deadline;
  renderQuizCard();
  if (deadline) startQuizTimer();
}

function renderQuizCard() {
  const q = State.quiz;
  const ex = State.byId.get(q.ids[q.idx]);
  document.getElementById('quiz-progress-text').textContent = `Question ${q.idx + 1} / ${q.ids.length} — ${ex.id}`;
  document.getElementById('quiz-progress-bar').value = (q.idx + 1) / q.ids.length;

  const card = document.getElementById('quiz-card');
  card.innerHTML = '';
  card.appendChild(renderExerciseCard(ex, { openSolution: !q.solutionsHidden || q.revealed.has(ex.id) }));

  const flagBtn = document.getElementById('quiz-flag');
  flagBtn.textContent = q.flagged.has(ex.id) ? '🚩 Flagged' : '🚩 Flag';
  flagBtn.classList.toggle('active', q.flagged.has(ex.id));

  const revealBtn = document.getElementById('quiz-reveal');
  revealBtn.hidden = !q.solutionsHidden;

  document.getElementById('quiz-prev').disabled = q.idx === 0;
}

function quizNext() {
  if (State.quiz.idx < State.quiz.ids.length - 1) {
    State.quiz.idx++;
    renderQuizCard();
  } else {
    finishQuiz();
  }
}

function quizPrev() {
  if (State.quiz.idx > 0) {
    State.quiz.idx--;
    renderQuizCard();
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
}

function quizReveal() {
  const id = State.quiz.ids[State.quiz.idx];
  State.quiz.revealed.add(id);
  renderQuizCard();
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
    const a = el('a', { href: '#card-' + id, onclick: (e) => { e.preventDefault(); setMode('browse'); setTimeout(() => document.getElementById('card-' + id)?.scrollIntoView({ behavior: 'smooth' }), 50); } }, ex.title);
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

// ---------- Mode switching ----------
function setMode(mode) {
  State.mode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  document.getElementById('view-browse').classList.toggle('active', mode === 'browse');
  document.getElementById('view-quiz').classList.toggle('active', mode === 'quiz');
  document.getElementById('view-browse').hidden = mode !== 'browse';
  document.getElementById('view-quiz').hidden = mode !== 'quiz';
  if (mode === 'quiz' && !document.getElementById('quiz-domain-list').firstChild) {
    renderQuizSetup();
  }
  if (mode === 'browse') renderBrowse();
}

// ---------- Theme ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  storageSet(KEY.theme, theme);
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

  // Quiz controls
  document.getElementById('quiz-start-btn').addEventListener('click', startQuiz);
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
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
