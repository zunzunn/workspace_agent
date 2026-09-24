/**
 * LLM client — provider-agnostic (Anthropic or OpenAI) with a deterministic
 * fallback. `isLLMConfigured()` is true when an API key is present in the env.
 * All callers must treat LLM failures as non-fatal and fall back to heuristics.
 */

const DEFAULT_MODEL = process.env.LLM_MODEL || '';
const TIMEOUT_MS = 15000;

function provider() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

function isLLMConfigured() {
  return !!provider();
}

function modelFor(prov) {
  if (DEFAULT_MODEL) return DEFAULT_MODEL;
  return prov === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini';
}

async function requestAnthropic(system, prompt, model) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content && data.content[0] ? data.content[0].text : '';
}

async function requestOpenAI(system, prompt, model) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices && data.choices[0] ? data.choices[0].message.content : '';
}

// Raw completion. Throws on any failure — callers decide how to fall back.
async function generate({ system, prompt }) {
  const prov = provider();
  if (!prov) throw new Error('LLM not configured');
  const model = modelFor(prov);
  const text = prov === 'anthropic'
    ? await requestAnthropic(system, prompt, model)
    : await requestOpenAI(system, prompt, model);
  return { provider: prov, model, text: (text || '').trim() };
}

// Extract a JSON object from model text (tolerates fences and prose).
function parseJsonOutput(text) {
  if (!text) return null;
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  try {
    return JSON.parse(t);
  } catch { /* fall through */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* give up */ }
  }
  return null;
}

// JSON completions for structured extraction; returns fallback when anything fails.
async function generateJson({ system, prompt, fallback }) {
  try {
    const res = await generate({
      system: system + '\nRespond ONLY with valid JSON. No markdown fences, no commentary.',
      prompt,
    });
    const parsed = parseJsonOutput(res.text);
    if (parsed && typeof parsed === 'object') return parsed;
    return fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  isLLMConfigured,
  provider,
  generate,
  generateJson,
  parseJsonOutput,
};