// One-shot Gemini probe. Password-gated. Pings each model in the cascade,
// returns which ones succeeded, which 429'd, which auth'd.
// Mostly diagnostic — safe to remove after the fallback is confirmed working.

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

export default async function handler(req, res) {
  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });
  const password = req.method === 'GET' ? req.query?.password : (req.body?.password);
  if (password !== expected) return res.status(401).json({ error: 'bad password' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured in this env' });

  const out = [];
  for (const model of MODELS) {
    const start = Date.now();
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK. Nothing else.' }] }],
          generationConfig: { maxOutputTokens: 50 },
        }),
      });
      const text = await r.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 200); }
      out.push({
        model,
        http: r.status,
        ok: r.ok,
        ms: Date.now() - start,
        reply: r.ok ? (parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '(no text)').slice(0, 60) : null,
        error: r.ok ? null : (parsed?.error?.message || String(parsed).slice(0, 200)),
      });
    } catch (err) {
      out.push({ model, http: null, ok: false, ms: Date.now() - start, error: String(err?.message || err).slice(0, 200) });
    }
  }
  return res.status(200).json({ key_len: process.env.GEMINI_API_KEY.length, results: out });
}

export const config = { maxDuration: 30 };
