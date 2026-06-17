// Server-side proxy for the YouTube → Article tool.
//
// Replaces the old /api/config endpoint, which returned the raw
// ANTHROPIC_API_KEY to the browser and got scraped + abused (~$850 in one
// day). The key now stays on the server and never reaches the client.
//
// The model and a max_tokens ceiling are pinned here so a stray caller can't
// request an arbitrary (expensive) model or unbounded output through this
// endpoint. It forwards Anthropic's native response shape unchanged — SSE for
// streaming, JSON otherwise — so the existing browser parser keeps working.

const MODEL = 'claude-opus-4-6';
const MAX_TOKENS_CEILING = 4096;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  // Access gate. Falls back to STRATEGY_PASSWORD so it works with the password
  // you already have set; set YOUTUBE_PASSWORD to give this tool its own.
  // Checked before anything touches Claude, so a bad password costs $0.
  const expected = process.env.YOUTUBE_PASSWORD || process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'YOUTUBE_PASSWORD not configured' });

  const { messages, stream = false, max_tokens, password } = req.body || {};
  if (password !== expected) return res.status(401).json({ error: 'Unauthorized' });
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(Number(max_tokens) || MAX_TOKENS_CEILING, MAX_TOKENS_CEILING),
        stream: !!stream,
        messages,
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: { message: 'Upstream request failed: ' + e.message } });
  }

  // Propagate upstream errors as JSON so the browser's `!res.ok` path works.
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    let body;
    try { body = JSON.parse(text); } catch { body = { error: { message: text || 'Anthropic error' } }; }
    return res.status(upstream.status).json(body);
  }

  // Non-streaming: hand back the JSON as-is (data.content[0].text on the client).
  if (!stream) {
    const data = await upstream.json();
    return res.status(200).json(data);
  }

  // Streaming: pass Anthropic's SSE bytes straight through.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch {
    // client disconnect or upstream hiccup — nothing more to send
  }
  res.end();
}
