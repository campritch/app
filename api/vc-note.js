// Lightweight server-side note patcher for the VC CRM (/raise).
// Lets a small client (or an assistant syncing Granola summaries) set a fund's
// working note WITHOUT round-tripping the whole ~4.5MB state blob through
// Vercel's request-body limit. Reads vc-crm/state.json, applies a handful of
// note patches, writes it back with a bumped _rev. Never touches stage or any
// other field. Auth: the sn_vc workspace cookie (same gate as the page).
import { verifySession, classifyEmail } from '../lib/auth.js';

const BLOB_KEY = 'vc-crm/state.json';

async function authed(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookie = req.headers.cookie || '';
  const gm = cookie.match(/(?:^|; )sn_user=([^;]+)/);
  if (gm) { const s = await verifySession(gm[1], secret); if (s && ['ceo', 'team'].includes(classifyEmail(s.email))) return true; }
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
    access: 'private', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  if (!(await authed(req))) return res.status(401).json({ error: 'locked' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });

  const { patches, overwriteHuman } = req.body || {};
  if (!Array.isArray(patches) || !patches.length) return res.status(400).json({ error: 'patches array required' });

  try {
    const state = await readBlob(BLOB_KEY);
    if (!state || !state.people) return res.status(500).json({ error: 'state not found or invalid' });
    const funds = state.funds = state.funds || {};

    const applied = [], skipped = [];
    for (const p of patches) {
      const id = p && p.id;
      if (!id || typeof p.notes !== 'string') { skipped.push({ id, why: 'bad patch' }); continue; }
      const fs = funds[id] = funds[id] || {};
      const cur = (fs.notes || '').trim();
      // Never clobber a hand-written note unless explicitly told to.
      if (cur && fs.notesSource !== 'granola' && !overwriteHuman) { skipped.push({ id, why: 'has human note' }); continue; }
      fs.notes = p.notes;
      fs.notesSource = p.source || 'granola';
      fs.notesSyncedAt = Number(p.syncedAt) || Date.now();
      if (p.meeting) fs.notesMeeting = p.meeting; else delete fs.notesMeeting;
      applied.push(id);
    }

    state._rev = (Number(state._rev) || 0) + 1;
    state._savedAt = new Date().toISOString();
    const day = state._savedAt.slice(0, 10);
    const firstToday = state._backupDay !== day;
    state._backupDay = day;
    await writeBlob(BLOB_KEY, state);
    if (firstToday) await writeBlob(`vc-crm/backup-${day}.json`, state).catch(() => {});

    return res.status(200).json({ ok: true, applied, skipped, rev: state._rev });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } }, maxDuration: 30 };
