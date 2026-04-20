// Accepts a CSV upload and writes it to Vercel Blob at strategy/burn.csv.
// Password-gated. Previous version used /tmp which is per-instance; Blob is shared.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const password = req.headers['x-strategy-password'];
  if (password !== process.env.STRATEGY_PASSWORD) {
    return res.status(401).json({ error: 'bad password' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });
  }

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
    const { put } = await import('@vercel/blob');
    const result = await put('strategy/burn.csv', body, {
      access: 'public',
      contentType: 'text/csv',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.status(200).json({ ok: true, bytes: body.length, url: result.url });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '3mb' } } };
