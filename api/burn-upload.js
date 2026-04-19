// Accepts a CSV upload and stashes it in /tmp so the burn tool can read it.
// Password-gated. /tmp persists for the warm function instance only; that's fine —
// if it evaporates, Cam just re-uploads on the next session.

import { writeFileSync } from 'node:fs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const password = req.headers['x-strategy-password'];
  if (password !== process.env.STRATEGY_PASSWORD) {
    return res.status(401).json({ error: 'bad password' });
  }

  // Expect text/csv body sent raw from the browser (simple + no multipart deps).
  let body = req.body;
  if (body == null) {
    body = await new Promise((resolve, reject) => {
      let chunks = '';
      req.on('data', (c) => { chunks += c; });
      req.on('end', () => resolve(chunks));
      req.on('error', reject);
    });
  }
  if (typeof body !== 'string') body = Buffer.isBuffer(body) ? body.toString('utf-8') : JSON.stringify(body);

  if (!body.trim()) return res.status(400).json({ error: 'empty body' });
  if (body.length > 2_000_000) return res.status(413).json({ error: 'CSV too large (>2MB)' });

  try {
    writeFileSync('/tmp/burn-upload.csv', body, 'utf-8');
    return res.status(200).json({ ok: true, bytes: body.length });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '3mb' } } };
