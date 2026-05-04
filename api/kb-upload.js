// Knowledge bank file upload.
// Body: { password, name, mime, body_b64, notes }
// body_b64 is the file contents as base64. Limited by Vercel function body size,
// which is ~4.5MB by default; vercel.json bumps maxDuration but body is set per call.

import { uploadKb } from './_tools/kb.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });

  const { password, name, mime, body_b64, notes } = req.body || {};
  if (password !== expected) return res.status(401).json({ error: 'bad password' });
  if (!name || !body_b64) return res.status(400).json({ error: 'name and body_b64 required' });
  if (body_b64.length > 30_000_000) return res.status(413).json({ error: 'file too large (>~22MB raw)' });

  try {
    const item = await uploadKb({ name, mime, body_b64, notes });
    return res.status(200).json(item);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '32mb' } },
  maxDuration: 30,
};
