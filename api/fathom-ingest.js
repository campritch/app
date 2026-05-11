// Bulk ingest Fathom transcripts into Vercel Blob.
// Resumable: client supplies cursor on each call, endpoint returns next_cursor + done.
// Password-gated via STRATEGY_PASSWORD.

import { ingestRange, ingestMeetings } from './_tools/fathom.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });

  const { password, from_date, to_date, cursor, max_pages, meeting_ids, titles } = req.body || {};
  if (password !== expected) return res.status(401).json({ error: 'bad password' });

  try {
    // Selective mode: specific meeting ids take priority over date range
    if (Array.isArray(meeting_ids) && meeting_ids.length) {
      const result = await ingestMeetings({ meeting_ids, titles: titles || {} });
      return res.status(200).json(result);
    }
    if (!from_date || !to_date) return res.status(400).json({ error: 'Either meeting_ids or from_date+to_date required' });
    const result = await ingestRange({ from_date, to_date, cursor, max_pages: max_pages || 5 });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 300 };
