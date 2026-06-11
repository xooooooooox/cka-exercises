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

Reply with exactly this JSON shape:
{
  "correct": true|false,
  "score": 0-100,
  "verdict": "correct" | "partial" | "incorrect",
  "summary": "one sentence verdict",
  "passed": ["bullet describing one thing the student got right"],
  "missed": ["bullet describing one requirement the student missed or did wrong"]
}`;
  }

  // ---------- Defaults per provider ----------

  const DEFAULTS = {
    anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-4-5' },
    openai:    { baseUrl: 'https://api.openai.com',    model: 'gpt-4o-mini' },
    deepseek:  { baseUrl: 'https://api.deepseek.com',  model: 'deepseek-chat' },
    ollama:    { baseUrl: 'http://localhost:11434',    model: 'llama3.1:8b' },
  };

  // ---------- Provider adapters ----------

  async function callAnthropic({ apiKey, baseUrl, model, system, user }) {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await safeText(res)}`);
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  async function callOpenAI({ apiKey, baseUrl, model, system, user }) {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await safeText(res)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async function callDeepSeek(opts) {
    // OpenAI-compatible. DeepSeek doesn't honor response_format JSON cleanly, so omit it.
    const { apiKey, baseUrl, model, system, user } = opts;
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await safeText(res)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async function callOllama({ baseUrl, model, system, user }) {
    const res = await fetch(`${baseUrl}/api/chat`, {
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
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await safeText(res)}`);
    const data = await res.json();
    return data.message?.content || '';
  }

  async function safeText(res) {
    try { const t = await res.text(); return t.slice(0, 200); } catch { return ''; }
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
    };

    let raw;
    switch (provider) {
      case 'anthropic': raw = await callAnthropic(args); break;
      case 'openai':    raw = await callOpenAI(args);    break;
      case 'deepseek':  raw = await callDeepSeek(args);  break;
      case 'ollama':    raw = await callOllama(args);    break;
      default: throw new Error(`Unhandled provider: ${provider}`);
    }

    return parseVerdict(raw);
  }

  function parseVerdict(raw) {
    if (!raw) throw new Error('Empty response from grader.');
    // Strip code fences if any
    let txt = raw.trim();
    if (txt.startsWith('```')) {
      txt = txt.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
    }
    // Some models wrap the JSON in prose. Grab the first {...} block.
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`Grader didn't return JSON. Raw: ${raw.slice(0, 200)}`);
    let obj;
    try { obj = JSON.parse(m[0]); }
    catch (e) { throw new Error(`JSON parse failed: ${e.message}. Raw: ${m[0].slice(0, 200)}`); }

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
      summary: typeof obj.summary === 'string' ? obj.summary : '',
      passed: Array.isArray(obj.passed) ? obj.passed.filter(s => typeof s === 'string') : [],
      missed: Array.isArray(obj.missed) ? obj.missed.filter(s => typeof s === 'string') : [],
      at: new Date().toISOString(),
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  window.LLM = { grade, DEFAULTS, SYSTEM_PROMPT };
})();
