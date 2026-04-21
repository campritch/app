// Persistent left-panel state: strategy, Notion links, supplementary data, date range.
// Stored in Vercel Blob at strategy/state.json so it survives across devices / browsers.
// Password-gated via STRATEGY_PASSWORD.
// GET  -> returns { strategy, notionLinks, supp, dateFrom, dateTo, updated_at }
// POST -> saves body as the new state

const BLOB_KEY = 'strategy/state.json';

export default async function handler(req, res) {
  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });

  const password = req.method === 'GET'
    ? (req.headers['x-strategy-password'] || req.query?.password)
    : (req.body?.password || req.headers['x-strategy-password']);
  if (password !== expected) return res.status(401).json({ error: 'bad password' });

  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });

  try {
    if (req.method === 'GET') {
      const state = await readBlob();
      return res.status(200).json(state || { strategy: '', notionLinks: '', supp: '', dateFrom: '', dateTo: '', updated_at: null });
    }
    if (req.method === 'POST') {
      const { strategy, notionLinks, supp, dateFrom, dateTo, conversations, currentConversationId } = req.body || {};
      const record = {
        strategy: strategy || '',
        notionLinks: notionLinks || '',
        supp: supp || '',
        dateFrom: dateFrom || '',
        dateTo: dateTo || '',
        conversations: Array.isArray(conversations) ? conversations : [],
        currentConversationId: currentConversationId || null,
        updated_at: new Date().toISOString(),
      };
      await writeBlob(record);
      return res.status(200).json({ ok: true, updated_at: record.updated_at });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET or POST only' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

async function readBlob() {
  const { get } = await import('@vercel/blob');
  const result = await get(BLOB_KEY, { access: 'private' });
  if (!result || !result.stream) return null;
  const text = await new Response(result.stream).text();
  try { return JSON.parse(text); } catch { return null; }
}

async function writeBlob(record) {
  const { put } = await import('@vercel/blob');
  return await put(BLOB_KEY, JSON.stringify(record), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export const config = { maxDuration: 30 };
