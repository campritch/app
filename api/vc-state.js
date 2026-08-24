// Shared working state for the VC CRM (/raise): stages, statuses, follow-ups,
// notes, drafts, AI reads, synced LinkedIn connections, template edits.
// Stored in Vercel Blob at vc-crm/state.json so it survives devices/browsers
// and is shared by everyone with the workspace password. A daily backup
// snapshot (vc-crm/backup-YYYY-MM-DD.json) is written on first save each day.
// Auth: sn_vc cookie (same gate as the page itself).
import { verifySession } from '../lib/auth.js';

const BLOB_KEY = 'vc-crm/state.json';

async function authed(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|; )sn_vc=([^;]+)/);
  return m ? !!(await verifySession(m[1], secret)) : false;
}

async function readBlob(key) {
  const { get } = await import('@vercel/blob');
  const result = await get(key, { access: 'private' });
  if (!result || !result.stream) return null;
  const text = await new Response(result.stream).text();
  try { return JSON.parse(text); } catch { return null; }
}

async function writeBlob(key, record) {
  const { put } = await import('@vercel/blob');
  return await put(key, JSON.stringify(record), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export default async function handler(req, res) {
  if (!(await authed(req))) return res.status(401).json({ error: 'locked' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });

  try {
    if (req.method === 'GET') {
      const state = await readBlob(BLOB_KEY);
      return res.status(200).json({ state: state || null });
    }
    if (req.method === 'POST') {
      const { state } = req.body || {};
      if (!state || typeof state !== 'object' || !state.people) {
        return res.status(400).json({ error: 'state object required' });
      }
      state._rev = (Number(state._rev) || 0) + 1;
      state._savedAt = new Date().toISOString();
      await writeBlob(BLOB_KEY, state);
      // One backup snapshot per day (idempotent overwrite of today's key).
      const day = state._savedAt.slice(0, 10);
      await writeBlob(`vc-crm/backup-${day}.json`, state).catch(() => {});
      return res.status(200).json({ ok: true, rev: state._rev, saved_at: state._savedAt });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET or POST only' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
  maxDuration: 30,
};
