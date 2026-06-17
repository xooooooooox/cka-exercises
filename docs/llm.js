// LLM-as-judge grading for CKA practice exercises.
// Four providers: Anthropic, OpenAI, DeepSeek (OpenAI-compatible), Ollama (local).
// Exposes a single global: window.LLM with .grade(opts), .DEFAULTS, .systemPrompt.

(function () {
  'use strict';

  const SYSTEM_PROMPT = `You are a strict but fair CKA (Certified Kubernetes Administrator) practice grader.
Accept ANY valid approach (kubectl imperative, declarative YAML manifest, helm, kustomize) that accomplishes the task. Don't dock points for a kubectl flag variation or for an alternative path that produces the same cluster state. The reference solution is one valid example, not the only correct answer.
Reply with valid JSON only — no prose, no markdown fence.`;

  function buildUserPrompt({ task, solution, answer }) {
    return `## Task

${task || '(no task body)'}

## Reference solution (one valid example — NOT the only correct answer)

${solution || '(no solution body)'}

## Student's answer

${answer}

Reply with exactly this JSON shape — keep "summary" to ONE sentence and at most THREE items in "passed" and "missed":
{
  "correct": true|false,
  "score": 0-100,
  "verdict": "correct" | "partial" | "incorrect",
  "summary": "one sentence verdict",
  "passed": ["≤ 3 short bullets describing what the student got right"],
  "missed": ["≤ 3 short bullets describing what the student missed or did wrong"]
}`;
  }

  // ---------- Defaults per provider ----------

  const DEFAULTS = {
    anthropic: {
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-haiku-4-5',
      chatPath: '/v1/messages',
      modelsPath: '/v1/models?limit=100',
    },
    openai: {
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o-mini',
      chatPath: '/v1/chat/completions',
      modelsPath: '/v1/models',
    },
    deepseek: {
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      chatPath: '/v1/chat/completions',
      modelsPath: '/v1/models',
    },
    // 千问 — Alibaba DashScope (OpenAI-compatible mode)
    qwen: {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
      model: 'qwen-plus',
      chatPath: '/v1/chat/completions',
      modelsPath: '/v1/models',
    },
    // 豆包 — ByteDance Volcengine ARK (OpenAI-compatible, /v3 path)
    doubao: {
      baseUrl: 'https://ark.cn-beijing.volces.com/api',
      model: 'doubao-1-5-pro-256k',
      chatPath: '/v3/chat/completions',
      modelsPath: '/v3/models',
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1:8b',
      chatPath: '/api/chat',
      modelsPath: '/api/tags',
    },
  };

  // ---------- Provider adapters ----------

  // Normalise provider-specific usage fields to a common shape:
  //   { inputTokens, outputTokens, totalTokens }   (null when missing)
  // Anthropic returns `usage.input_tokens` / `usage.output_tokens`.
  // OpenAI / DeepSeek / Qwen / Doubao return `usage.prompt_tokens` /
  // `usage.completion_tokens` / `usage.total_tokens`.
  // Ollama omits usage altogether — caller passes a null-shape placeholder.
  function pickUsage(data, provider) {
    const u = (data && data.usage) || {};
    if (provider === 'anthropic') {
      const i = u.input_tokens ?? null;
      const o = u.output_tokens ?? null;
      return { inputTokens: i, outputTokens: o, totalTokens: (i != null && o != null) ? (i + o) : null };
    }
    const i = u.prompt_tokens ?? null;
    const o = u.completion_tokens ?? null;
    const t = u.total_tokens ?? ((i != null && o != null) ? (i + o) : null);
    return { inputTokens: i, outputTokens: o, totalTokens: t };
  }

  async function callAnthropic({ apiKey, baseUrl, model, system, user, chatPath }) {
    const res = await withTimeout(fetch(`${baseUrl}${chatPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    }), 60000, 'Anthropic chat');
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await safeText(res)}`);
    const data = await res.json();
    return { text: data.content?.[0]?.text || '', usage: pickUsage(data, 'anthropic') };
  }

  // Shared OpenAI-compatible chat completion (used by OpenAI, DeepSeek, Qwen, Doubao).
  // `withJsonMode` toggles response_format — only OpenAI is known to honor it reliably.
  async function callOpenAICompat({ apiKey, baseUrl, model, system, user, chatPath, withJsonMode, provider }) {
    const body = {
      model,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (withJsonMode) body.response_format = { type: 'json_object' };
    const res = await withTimeout(fetch(`${baseUrl}${chatPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }), 60000, 'chat completion');
    if (!res.ok) throw new Error(`${res.status}: ${await safeText(res)}`);
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content || '', usage: pickUsage(data, provider || 'openai') };
  }

  async function callOllama({ baseUrl, model, system, user, chatPath }) {
    const res = await withTimeout(fetch(`${baseUrl}${chatPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    }), 60000, 'Ollama chat');
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await safeText(res)}`);
    const data = await res.json();
    // Ollama doesn't return token usage — leave nulls so the UI can show a
    // "Local model — no token accounting" fallback.
    return { text: data.message?.content || '', usage: { inputTokens: null, outputTokens: null, totalTokens: null } };
  }

  async function safeText(res) {
    try { const t = await res.text(); return t.slice(0, 200); } catch { return ''; }
  }

  // Wrap a fetch (or any promise) in a hard timeout. Real CORS preflight
  // failures sometimes leave the request hanging indefinitely; this catches
  // that case and surfaces a clear error instead of an infinite spinner.
  function withTimeout(promise, ms = 15000, label = 'request') {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(
        `${label} timed out after ${ms / 1000}s — likely CORS-blocked or provider unreachable from a browser`
      )), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // Convert a low-level network/CORS TypeError into a user-readable message
  function explainNetworkError(e, provider) {
    if (e && e.name === 'TypeError') {
      return new Error(`${provider} unreachable from browser (likely CORS-blocked). Try Anthropic / OpenAI / DeepSeek / Ollama, or use a CORS proxy.`);
    }
    return e;
  }

  // ---------- Main entry ----------

  /**
   * Grade a student's answer using the configured LLM.
   *
   * @param {object} opts
   *   @param {string} opts.task       The exercise task text (markdown)
   *   @param {string} opts.solution   The canonical solution (markdown)
   *   @param {string} opts.answer     The student's typed answer
   *   @param {object} opts.settings   Settings record (provider/apiKey/model/baseUrl)
   * @returns {Promise<object>}        Normalized verdict
   */
  async function grade(opts) {
    const { task, solution, answer, settings } = opts;
    if (!answer || !answer.trim()) {
      throw new Error('Empty answer — type something before grading.');
    }
    if (!settings || !settings.provider) {
      throw new Error('No LLM provider configured. Open ⚙️ Settings.');
    }
    const provider = settings.provider;
    const def = DEFAULTS[provider];
    if (!def) throw new Error(`Unknown provider: ${provider}`);
    if (provider !== 'ollama' && !settings.apiKey) {
      throw new Error(`Missing ${provider} API key. Open ⚙️ Settings.`);
    }

    const base = settings.baseUrl || def.baseUrl;
    const model = settings.model || def.model;
    const args = {
      apiKey: settings.apiKey,
      baseUrl: base,
      model,
      system: SYSTEM_PROMPT,
      user: buildUserPrompt({ task, solution, answer }),
      chatPath: def.chatPath,
    };

    let result;
    switch (provider) {
      case 'anthropic': result = await callAnthropic(args); break;
      case 'openai':    result = await callOpenAICompat({ ...args, withJsonMode: true, provider: 'openai' }); break;
      case 'deepseek':  result = await callOpenAICompat({ ...args, provider: 'deepseek' }); break;
      case 'qwen':      result = await callOpenAICompat({ ...args, provider: 'qwen' });     break;
      case 'doubao':    result = await callOpenAICompat({ ...args, provider: 'doubao' });   break;
      case 'ollama':    result = await callOllama(args); break;
      default: throw new Error(`Unhandled provider: ${provider}`);
    }

    const verdict = parseVerdict(result.text);
    // Pin the provider/model used at grade-time on the verdict itself so
    // retrospective display (e.g. after Gist pull) shows the right thing
    // even when the active provider has since changed.
    verdict.usage = result.usage || { inputTokens: null, outputTokens: null, totalTokens: null };
    verdict.provider = provider;
    verdict.model = model;
    return verdict;
  }

  // Salvage a partial verdict from a response that was cut off (typically by
  // hitting max_tokens mid-output). Walk forward tracking brace/bracket depth
  // and string state, find the last comma at top level, snip there, and
  // synthesise a closing `}`. Returns the parsed object on success or null.
  function tryRepairTruncated(txt) {
    const start = txt.indexOf('{');
    if (start < 0) return null;
    const body = txt.slice(start);

    let depth = 0;
    let inString = false;
    let escaped = false;
    let lastTopLevelComma = -1;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\' && inString) { escaped = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      else if (c === ',' && depth === 1) lastTopLevelComma = i;
    }

    if (lastTopLevelComma <= 0) return null;
    const candidate = body.slice(0, lastTopLevelComma) + '}';
    try { return JSON.parse(candidate); } catch { return null; }
  }

  function parseVerdict(raw) {
    if (!raw) throw new Error('Empty response from grader.');
    // Strip code fences if any
    let txt = raw.trim();
    if (txt.startsWith('```')) {
      txt = txt.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
    }
    // Some models wrap the JSON in prose. Try the strict first-{}-block path,
    // then fall back to a salvage-the-truncated-prefix walk.
    let obj = null;
    let truncated = false;
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      try { obj = JSON.parse(m[0]); } catch {}
    }
    if (!obj) {
      const repaired = tryRepairTruncated(txt);
      if (repaired) { obj = repaired; truncated = true; }
    }
    if (!obj) {
      throw new Error(
        `Grader didn't return JSON. The response was likely truncated — try a different model or shorten the answer. Raw (first 800 chars):\n${raw.slice(0, 800)}`
      );
    }

    // Normalize / fill defaults
    const score = clamp(Number(obj.score) || 0, 0, 100);
    const verdict = ['correct', 'partial', 'incorrect'].includes(obj.verdict)
      ? obj.verdict
      : (score >= 90 ? 'correct' : score >= 50 ? 'partial' : 'incorrect');
    const correct = typeof obj.correct === 'boolean' ? obj.correct : verdict === 'correct';
    return {
      correct,
      score,
      verdict,
      summary: typeof obj.summary === 'string' && obj.summary
        ? obj.summary
        : (truncated ? '(grader response was truncated — only score/verdict recovered)' : ''),
      passed: Array.isArray(obj.passed) ? obj.passed.filter(s => typeof s === 'string') : [],
      missed: Array.isArray(obj.missed) ? obj.missed.filter(s => typeof s === 'string') : [],
      truncated,
      at: new Date().toISOString(),
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---------- Provider list-models ----------

  async function listModels({ provider, apiKey, baseUrl }) {
    const def = DEFAULTS[provider];
    if (!def) throw new Error(`Unknown provider: ${provider}`);
    const base = baseUrl || def.baseUrl;

    try {
      switch (provider) {
        case 'anthropic': {
          if (!apiKey) throw new Error('Anthropic API key required');
          const res = await withTimeout(fetch(`${base}${def.modelsPath}`, {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
          }), 15000, 'Anthropic /models');
          if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await safeText(res)}`);
          const data = await res.json();
          return (data.data || []).map(m => m.id);
        }
        // OpenAI-compatible providers (uses /v1/models or /v3/models)
        case 'openai':
        case 'deepseek':
        case 'qwen':
        case 'doubao': {
          if (!apiKey) throw new Error(`${provider} API key required`);
          const res = await withTimeout(fetch(`${base}${def.modelsPath}`, {
            headers: { 'authorization': `Bearer ${apiKey}` },
          }), 15000, `${provider} /models`);
          if (!res.ok) throw new Error(`${provider} ${res.status}: ${await safeText(res)}`);
          const data = await res.json();
          let ids = (data.data || []).map(m => m.id);
          if (provider === 'openai') {
            // Filter the noisy catalog down to chat-capable models
            ids = ids
              .filter(id => /^(gpt-|o1|o3|o4|chatgpt-)/i.test(id))
              .filter(id => !/(embedding|whisper|dall-e|tts|moderation|audio|realtime|search)/i.test(id));
          } else if (provider === 'qwen') {
            // DashScope returns ~100 entries; trim embeddings / image / audio / tool-call alternates
            ids = ids
              .filter(id => /^qwen/i.test(id))
              .filter(id => !/(embedding|reranker|image|audio|tts|vl-|ocr-)/i.test(id));
          }
          return ids.sort();
        }
        case 'ollama': {
          const res = await withTimeout(fetch(`${base}${def.modelsPath}`), 8000, 'Ollama /api/tags');
          if (!res.ok) throw new Error(`Ollama ${res.status} — is it running on ${base}?`);
          const data = await res.json();
          return (data.models || []).map(m => m.name);
        }
        default:
          throw new Error(`Unhandled provider: ${provider}`);
      }
    } catch (e) {
      throw explainNetworkError(e, provider);
    }
  }

  // ---------- Connection test ----------
  // Validates URL + auth + (for Ollama) model presence. Returns the live model list
  // alongside the verdict so the UI can repopulate its dropdown in one round-trip.

  async function testConnection({ provider, apiKey, model, baseUrl }) {
    const def = DEFAULTS[provider];
    if (!def) throw new Error(`Unknown provider: ${provider}`);
    const t0 = performance.now();
    let models = [];
    try {
      models = await listModels({ provider, apiKey, baseUrl });
    } catch (e) {
      const latencyMs = performance.now() - t0;
      return { ok: false, message: e.message || String(e), latencyMs, models: [] };
    }
    const latencyMs = performance.now() - t0;

    // If user picked a specific model, verify it appears in the live list
    if (model && models.length && !models.includes(model)) {
      // Soft warning: still report ok=true since the model id might be valid but
      // unlisted (e.g. preview models, fine-tunes not surfaced by /models).
      return {
        ok: true,
        message: `Connected — '${model}' not in catalog but may still work`,
        latencyMs,
        models,
        warn: true,
      };
    }

    const msg = models.length
      ? `Connected to ${provider}`
      : `Connected to ${provider} (no models returned)`;
    return { ok: true, message: msg, latencyMs, models };
  }

  window.LLM = { grade, DEFAULTS, SYSTEM_PROMPT, listModels, testConnection, parseVerdict, tryRepairTruncated };
})();
