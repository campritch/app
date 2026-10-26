// Shared working state for the VC CRM (/raise): stages, statuses, follow-ups,
// notes, drafts, AI reads, synced LinkedIn connections, template edits.
// Stored in Vercel Blob at vc-crm/state.json so it survives devices/browsers
// and is shared by everyone with the workspace password. A daily backup
// snapshot (vc-crm/backup-YYYY-MM-DD.json) is written on first save each day.
// Auth: sn_vc cookie (same gate as the page itself).
import { verifySession, classifyEmail } from '../lib/auth.js';

const BLOB_KEY = 'vc-crm/state.json';

// Accept a SpotsNow-team Google session (sn_user, @spotsnow.io / @dropstation.io)
// or the shared workspace password (sn_vc) as a fallback.
async function authed(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookie = req.headers.cookie || '';
  const gm = cookie.match(/(?:^|; )sn_user=([^;]+)/);
  if (gm) { const s = await verifySession(gm[1], secret); if (s && ['ceo','team'].includes(classifyEmail(s.email))) return true; }
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

  // Quick stage histogram so we can eyeball whether a copy is healthy (a spread
  // across stages) or corrupted (everything in one stage).
  const stageSummary = (s) => {
    if (!s) return null;
    const funds = s.funds || {};
    const counts = {}; let withStage = 0, competitors = 0;
    for (const k in funds) {
      const fs = funds[k] || {};
      if (fs.stage) { counts[fs.stage] = (counts[fs.stage] || 0) + 1; withStage++; }
      if (fs.competitor) competitors++;
    }
    return { savedAt: s._savedAt || null, rev: s._rev || 0, restoredFrom: s._restoredFrom || undefined,
             fundsWithStage: withStage, competitors, extraFunds: (s.extraFunds || []).length, stageCounts: counts };
  };

  try {
    const q = req.query || {};

    // --- Recovery: list available backups ---
    if (req.method === 'GET' && q.backups) {
      const { list } = await import('@vercel/blob');
      const r = await list({ prefix: 'vc-crm/backup-' });
      return res.status(200).json({ backups: (r.blobs || []).map(b => ({ key: b.pathname, size: b.size, uploadedAt: b.uploadedAt })).sort((a, b) => a.key < b.key ? 1 : -1) });
    }
    // --- Recovery: stage summary of current cloud (?summary=1) or a backup (?summary=2026-10-24) ---
    if (req.method === 'GET' && q.summary) {
      const key = q.summary === '1' ? BLOB_KEY : ('vc-crm/backup-' + String(q.summary).replace(/^backup-/, '').replace(/\.json$/, '') + '.json');
      const s = await readBlob(key);
      return res.status(200).json({ key, found: !!s, summary: stageSummary(s) });
    }
    // --- Recovery: restore state.json from a dated backup, winning over any
    // client's local copy by jumping the revision far ahead (?restore=2026-10-24) ---
    if (req.method === 'GET' && q.restore) {
      const src = 'vc-crm/backup-' + String(q.restore).replace(/^backup-/, '').replace(/\.json$/, '') + '.json';
      const good = await readBlob(src);
      if (!good || !good.people) return res.status(400).json({ error: 'backup not found or invalid: ' + src });
      const cur = await readBlob(BLOB_KEY);
      good._rev = (Number(cur && cur._rev) || 0) + 1000000;   // out-rank any browser's dirty local copy
      good._savedAt = new Date().toISOString();
      good._restoredFrom = src;
      await writeBlob(BLOB_KEY, good);
      return res.status(200).json({ ok: true, restoredFrom: src, rev: good._rev, summary: stageSummary(good) });
    }

    if (req.method === 'GET') {
      const state = await readBlob(BLOB_KEY);
      return res.status(200).json({ state: state || null });
    }
    if (req.method === 'POST') {
      const { state } = req.body || {};
      if (!state || typeof state !== 'object' || !state.people) {
        return res.status(400).json({ error: 'state object required' });
      }
      // Stale-write guard: never let a client whose copy is BEHIND the cloud
      // overwrite it. This stops an out-of-date / corrupted tab from clobbering
      // newer (or freshly restored) data. A client that gets 409 should refetch.
      const cur = await readBlob(BLOB_KEY);
      if (cur && Number(state._rev || 0) < Number(cur._rev || 0)) {
        return res.status(409).json({ error: 'stale', rev: cur._rev });
      }
      state._rev = (Number(state._rev) || 0) + 1;
      state._savedAt = new Date().toISOString();
      // Daily backup = the FIRST good save of each day, left untouched after that,
      // so a bad write later in the same day can never poison the day's snapshot.
      const day = state._savedAt.slice(0, 10);
      const firstToday = !cur || cur._backupDay !== day;
      state._backupDay = day;
      await writeBlob(BLOB_KEY, state);
      if (firstToday) await writeBlob(`vc-crm/backup-${day}.json`, state).catch(() => {});
      return res.status(200).json({ ok: true, rev: state._rev, saved_at: state._savedAt, backedUp: firstToday });
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
