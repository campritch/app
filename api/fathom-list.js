// List Fathom meetings in a date range — metadata only, no transcripts.
// Used by the strategy UI to show a selectable list before bulk ingest.
// Password-gated via STRATEGY_PASSWORD.

import { listMeetings } from './_tools/fathom.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });

  const { password, from_date, to_date, extra_exclude_patterns } = req.body || {};
  if (password !== expected) return res.status(401).json({ error: 'bad password' });
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' });

  try {
    const result = await listMeetings({ from_date, to_date, extra_exclude_patterns });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 60 };
