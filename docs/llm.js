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
    // 智谱 GLM — Zhipu BigModel (OpenAI-compatible, /v4 path)
    glm: {
      baseUrl: 'https://open.bigmodel.cn/api/paas',
      model: 'glm-4-plus',
      chatPath: '/v4/chat/completions',
      modelsPath: '/v4/models',
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

  function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }

  // Shared SSE reader. Consumes `data: …` frames from a streaming HTTP response
  // and hands the payload string to `onData`. Splits on \n, strips the prefix,
  // skips empty/keep-alive lines. Anthropic-style `event: …` lines are
  // ignored — the JSON payload on the following `data:` line is self-describing.
  async function readSSE(res, onData) {
    if (!res.body) throw new Error('Streaming response had no body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          if (line.startsWith('data: ')) onData(line.slice(6).trim());
          else if (line.startsWith('data:')) onData(line.slice(5).trim());
          // `event: ...`, comments (`:`), and blank lines: skipped
        }
      }
      buf += decoder.decode();
      if (buf.startsWith('data: ')) onData(buf.slice(6).trim());
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  // Ollama's chat stream is NDJSON, not SSE — one JSON object per line.
  async function readNDJSON(res, onEvent) {
    if (!res.body) throw new Error('Streaming response had no body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const evt = safeJSON(line);
          if (evt) onEvent(evt);
        }
      }
      const tail = buf.trim();
      if (tail) {
        const evt = safeJSON(tail);
        if (evt) onEvent(evt);
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  // Streaming wrappers do NOT pass through withTimeout — stream reads can
  // legitimately exceed the 60s wall we use for non-streaming calls. The
  // caller is expected to enforce an overall ceiling via AbortController.

  async function callAnthropic({ apiKey, baseUrl, model, system, user, chatPath, onProgress, signal }) {
    const res = await fetch(`${baseUrl}${chatPath}`, {
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
        stream: true,
        messages: [{ role: 'user', content: user }],
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await safeText(res)}`);
    let text = '';
    let inputTokens = null, outputTokens = null;
    await readSSE(res, (data) => {
      const evt = safeJSON(data);
      if (!evt) return;
      if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
        const t = evt.delta.text || '';
        if (t) { text += t; onProgress && onProgress(t, text); }
      } else if (evt.type === 'message_start') {
        inputTokens = evt.message?.usage?.input_tokens ?? inputTokens;
      } else if (evt.type === 'message_delta') {
        outputTokens = evt.usage?.output_tokens ?? outputTokens;
      }
    });
    const totalTokens = (inputTokens != null && outputTokens != null) ? (inputTokens + outputTokens) : null;
    return { text, usage: { inputTokens, outputTokens, totalTokens } };
  }

  // Shared OpenAI-compatible streaming chat completion (used by OpenAI, DeepSeek, Qwen, Doubao).
  // `withJsonMode` toggles response_format — only OpenAI is known to honor it reliably.
  // OpenAI gets `stream_options: { include_usage: true }` to surface usage in the
  // final frame; DeepSeek/Qwen/Doubao return usage in their last frame either way.
  async function callOpenAICompat({ apiKey, baseUrl, model, system, user, chatPath, withJsonMode, provider, onProgress, signal }) {
    const body = {
      model,
      max_tokens: 1500,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (provider === 'openai') body.stream_options = { include_usage: true };
    if (withJsonMode) body.response_format = { type: 'json_object' };
    const res = await fetch(`${baseUrl}${chatPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await safeText(res)}`);
    let text = '';
    let usageRaw = null;
    await readSSE(res, (data) => {
      if (!data || data === '[DONE]') return;
      const evt = safeJSON(data);
      if (!evt) return;
      const delta = evt.choices?.[0]?.delta?.content;
      if (delta) { text += delta; onProgress && onProgress(delta, text); }
      if (evt.usage) usageRaw = evt.usage;
    });
    return { text, usage: pickUsage({ usage: usageRaw }, provider || 'openai') };
  }

  async function callOllama({ baseUrl, model, system, user, chatPath, onProgress, signal }) {
    const res = await fetch(`${baseUrl}${chatPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        format: 'json',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await safeText(res)}`);
    let text = '';
    let promptEval = null, evalCount = null;
    await readNDJSON(res, (evt) => {
      const t = evt.message?.content || '';
      if (t) { text += t; onProgress && onProgress(t, text); }
      if (evt.done) {
        promptEval = evt.prompt_eval_count ?? promptEval;
        evalCount = evt.eval_count ?? evalCount;
      }
    });
    const totalTokens = (promptEval != null && evalCount != null) ? (promptEval + evalCount) : null;
    return { text, usage: { inputTokens: promptEval, outputTokens: evalCount, totalTokens } };
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
   *   @param {string}      opts.task        The exercise task text (markdown)
   *   @param {string}      opts.solution    The canonical solution (markdown)
   *   @param {string}      opts.answer      The student's typed answer
   *   @param {object}      opts.settings    Settings record (provider/apiKey/model/baseUrl)
   *   @param {AbortSignal} [opts.signal]    Cancel the in-flight stream
   *   @param {function}    [opts.onProgress] (deltaText, totalSoFar) — fires per streamed chunk
   * @returns {Promise<object>}              Normalized verdict
   */
  async function grade(opts) {
    const { task, solution, answer, settings, signal, onProgress } = opts;
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
      onProgress,
      signal,
    };

    let result;
    switch (provider) {
      case 'anthropic': result = await callAnthropic(args); break;
      case 'openai':    result = await callOpenAICompat({ ...args, withJsonMode: true, provider: 'openai' }); break;
      case 'deepseek':  result = await callOpenAICompat({ ...args, provider: 'deepseek' }); break;
      case 'qwen':      result = await callOpenAICompat({ ...args, provider: 'qwen' });     break;
      case 'doubao':    result = await callOpenAICompat({ ...args, provider: 'doubao' });   break;
      case 'glm':       result = await callOpenAICompat({ ...args, provider: 'glm' });      break;
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
        // OpenAI-compatible providers (uses /v1/models or /v3/models or /v4/models)
        case 'openai':
        case 'deepseek':
        case 'qwen':
        case 'doubao':
        case 'glm': {
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
