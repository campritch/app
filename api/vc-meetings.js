// Pitch-meeting lookup for the VC CRM (/raise). Reuses the strategy center's
// Fathom transcript cache in Vercel Blob: search cached meetings by fund /
// person terms, or view one record (summary + transcript) for a warmth read.
// Auth: the sn_vc workspace cookie — no extra password prompt in the UI.
import { verifySession } from '../lib/auth.js';
import { listCachedDetailed, readCached } from './_tools/fathom.js';

async function authed(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|; )sn_vc=([^;]+)/);
  return m ? !!(await verifySession(m[1], secret)) : false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  if (!(await authed(req))) return res.status(401).json({ error: 'locked' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'transcript store not configured' });
  }

  const { action, terms, id } = req.body || {};
  try {
    if (action === 'search') {
      const list = (Array.isArray(terms) ? terms : []).map(t => String(t).trim().toLowerCase()).filter(t => t.length > 2);
      if (!list.length) return res.status(400).json({ error: 'terms required' });
      const { items } = await listCachedDetailed();
      const matches = (items || []).filter(it => {
        const hay = [it.title || '', JSON.stringify(it.attendees || [])].join(' ').toLowerCase();
        return list.some(t => hay.includes(t));
      }).slice(0, 20).map(it => ({ id: it.id, title: it.title, date: it.date, attendees: it.attendees }));
      return res.status(200).json({ total_cached: (items || []).length, matches });
    }
    if (action === 'view') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const record = await readCached(id);
      if (!record) return res.status(404).json({ error: 'not cached' });
      // Summary-level payload only; the full transcript stays server-side.
      return res.status(200).json({
        id: record.id, title: record.title, date: record.date,
        attendees: record.attendees || [],
        summary: record.summary || record.notes || null,
        transcript_chars: (record.transcript || '').length
      });
    }
    return res.status(400).json({ error: 'action must be search or view' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 30 };
