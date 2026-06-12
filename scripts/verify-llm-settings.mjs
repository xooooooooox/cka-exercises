#!/usr/bin/env node
// Verifies the per-provider LLM settings semantics from docs/app.js.
// Mirrors the v2 storage helpers + Save flow against an in-memory
// localStorage shim and asserts the contracts we depend on.

const ALL_PROVIDERS = ['anthropic', 'openai', 'deepseek', 'qwen', 'doubao', 'ollama'];

// ---- In-memory localStorage shim ----
const store = new Map();
const storage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
const KEY = { llmSettings: 'cka:llm:settings' };
const storageGet = (k, fb) => {
  try { const v = storage.getItem(k); return v == null ? fb : JSON.parse(v); }
  catch { return fb; }
};
const storageSet = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); } catch {} };

// ---- v2 helpers (copied verbatim from docs/app.js) ----
function emptyProviderSlot() {
  return { apiKey: '', model: '', baseUrl: '', models: [] };
}
function makeEmptyV2() {
  const providers = {};
  for (const p of ALL_PROVIDERS) providers[p] = emptyProviderSlot();
  return { schemaVersion: 2, active: 'anthropic', autoDoneThreshold: -1, providers };
}
function migrateLLM(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schemaVersion === 2 && raw.providers) {
    const out = { ...raw, providers: { ...raw.providers } };
    for (const p of ALL_PROVIDERS) if (!out.providers[p]) out.providers[p] = emptyProviderSlot();
    return out;
  }
  const p = raw.provider || 'anthropic';
  const v2 = makeEmptyV2();
  v2.active = p;
  v2.autoDoneThreshold = raw.autoDoneThreshold ?? -1;
  v2.providers[p] = { apiKey: raw.apiKey || '', model: raw.model || '', baseUrl: raw.baseUrl || '', models: [] };
  return v2;
}
function readLLMConfig() { return migrateLLM(storageGet(KEY.llmSettings, null)) || makeEmptyV2(); }
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
function getLLMSettings() {
  const v2 = readLLMConfig();
  const slot = v2.providers[v2.active] || emptyProviderSlot();
  return {
    provider: v2.active,
    apiKey:   slot.apiKey  || '',
    model:    slot.model   || '',
    baseUrl:  slot.baseUrl || '',
    autoDoneThreshold: v2.autoDoneThreshold ?? -1,
  };
}

// Mirror of the Settings Save handler — sets the slot AND activates.
function saveFromForm(provider, fields) {
  const v2 = readLLMConfig();
  v2.providers[provider] = {
    ...(v2.providers[provider] || emptyProviderSlot()),
    apiKey: fields.apiKey || '',
    model: fields.model || '',
    baseUrl: fields.baseUrl || '',
  };
  v2.active = provider;
  writeLLMConfig(v2);
}

// ---- Assertions ----
let failures = 0;
function expect(label, cond, detail = '') {
  const tag = cond ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`  ${tag}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

console.log('— Migration v1 → v2 —');
{
  store.clear();
  storageSet(KEY.llmSettings, { provider: 'deepseek', apiKey: 'sk-AAA', model: 'deepseek-chat' });
  const v2 = readLLMConfig();
  expect('schemaVersion is 2', v2.schemaVersion === 2);
  expect('active equals v1 provider', v2.active === 'deepseek');
  expect('deepseek slot retains apiKey', v2.providers.deepseek.apiKey === 'sk-AAA');
  expect('deepseek slot retains model', v2.providers.deepseek.model === 'deepseek-chat');
  expect('other providers have empty slots', v2.providers.openai.apiKey === '' && v2.providers.anthropic.apiKey === '');
  expect('getLLMSettings flat shows active provider', getLLMSettings().provider === 'deepseek');
}

console.log('\n— setProviderSlot does NOT change active —');
{
  store.clear();
  saveFromForm('deepseek', { apiKey: 'sk-AAA', model: 'deepseek-chat' });
  expect('after saving DeepSeek, active is deepseek', getLLMSettings().provider === 'deepseek');
  setProviderSlot('openai', { apiKey: 'sk-BBB', model: 'gpt-4o' });
  expect('after setProviderSlot(openai), active stays deepseek',
    getLLMSettings().provider === 'deepseek');
  expect('openai slot got the values', readLLMConfig().providers.openai.apiKey === 'sk-BBB');
}

console.log('\n— Save flow: switch active deterministically —');
{
  store.clear();
  // Start with OpenAI active (mirrors the rogue-script-seeded state)
  saveFromForm('openai', { apiKey: 'sk-BBB', model: 'gpt-4o' });
  expect('active is openai', getLLMSettings().provider === 'openai');
  // User switches radio to DeepSeek, fills form, saves
  saveFromForm('deepseek', { apiKey: 'sk-AAA', model: 'deepseek-chat' });
  // Re-read fresh (simulates reopening dialog)
  const fresh = readLLMConfig();
  expect('after Save, active is deepseek (no silent corruption)', fresh.active === 'deepseek');
  expect('deepseek slot has the new values', fresh.providers.deepseek.apiKey === 'sk-AAA');
  expect('openai slot is untouched', fresh.providers.openai.apiKey === 'sk-BBB');
  expect('getLLMSettings flat reads deepseek', getLLMSettings().provider === 'deepseek');
}

console.log('\n— setActiveProvider switches without touching slots —');
{
  store.clear();
  saveFromForm('deepseek', { apiKey: 'sk-AAA', model: 'deepseek-chat' });
  saveFromForm('openai',   { apiKey: 'sk-BBB', model: 'gpt-4o' });
  // Both slots populated; active is openai (last saved).
  expect('precondition: openai is active', getLLMSettings().provider === 'openai');
  setActiveProvider('deepseek');
  expect('after setActiveProvider, active is deepseek', getLLMSettings().provider === 'deepseek');
  expect('openai slot still intact', readLLMConfig().providers.openai.apiKey === 'sk-BBB');
  expect('deepseek slot still intact', readLLMConfig().providers.deepseek.apiKey === 'sk-AAA');
}

console.log('\n— Test (setProviderSlot models) preserves active even after Save —');
{
  store.clear();
  saveFromForm('openai', { apiKey: 'sk-BBB', model: 'gpt-4o' });
  // User opens settings (active=openai), clicks DeepSeek radio (no save yet),
  // enters key + model, clicks Test → setProviderSlot('deepseek', {models:[…]}),
  // then clicks Save → saveFromForm('deepseek', …)
  setProviderSlot('deepseek', { models: ['deepseek-chat', 'deepseek-reasoner'] });
  expect('Test alone does NOT change active', getLLMSettings().provider === 'openai');
  saveFromForm('deepseek', { apiKey: 'sk-AAA', model: 'deepseek-chat' });
  const fresh = readLLMConfig();
  expect('Save → active = deepseek', fresh.active === 'deepseek');
  expect('Save preserves the model list from Test', fresh.providers.deepseek.models.length === 2);
}

console.log(`\n${failures === 0 ? '\x1b[32mALL PASS\x1b[0m' : `\x1b[31m${failures} FAIL\x1b[0m`}`);
process.exit(failures === 0 ? 0 : 1);
