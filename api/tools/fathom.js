// Fathom adapter: list meetings, pull transcripts, cache in Vercel Blob.
// Env: FATHOM_API_KEY, FATHOM_API_BASE (default https://api.fathom.ai/external/v1), BLOB_READ_WRITE_TOKEN (optional).

const DEFAULT_BASE = process.env.FATHOM_API_BASE || 'https://api.fathom.ai/external/v1';
const STANDUP_PATTERNS = [/\bstand.?up\b/i, /\bdaily\b/i, /\bsync\b/i, /\b1\s*[:x\/]\s*1\b/i, /\b1on1\b/i];

function assertKey() {
  const k = process.env.FATHOM_API_KEY;
  if (!k) throw new Error('FATHOM_API_KEY not set');
  return k;
}

async function fathomGet(path, params) {
  const url = new URL(DEFAULT_BASE.replace(/\/+$/, '') + path);
  if (params) for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { 'X-Api-Key': assertKey(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fathom ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function listMeetings({ from_date, to_date, extra_exclude_patterns = [] }) {
  if (!from_date || !to_date) throw new Error('from_date and to_date required');

  const excludes = [...STANDUP_PATTERNS, ...extra_exclude_patterns.map((p) => new RegExp(p, 'i'))];

  // Fathom API uses ?created_after / ?created_before — adjust if your endpoint differs.
  const data = await fathomGet('/meetings', {
    created_after: `${from_date}T00:00:00Z`,
    created_before: `${to_date}T23:59:59Z`,
  });

  const items = Array.isArray(data) ? data : (data.items || data.meetings || data.results || []);
  const filtered = items
    .map((m) => ({
      id: m.id || m.meeting_id || m.share_url,
      title: m.title || m.meeting_title || '(untitled)',
      date: m.scheduled_start_time || m.created_at || m.start_time || null,
      attendees: (m.invitees || m.attendees || []).map((a) => a.email || a.name).filter(Boolean),
      duration_minutes: m.duration || m.duration_minutes || null,
      share_url: m.share_url || null,
    }))
    .filter((m) => !excludes.some((re) => re.test(m.title)));

  return { count: filtered.length, excluded_count: items.length - filtered.length, meetings: filtered };
}

export async function getTranscript({ meeting_id }) {
  if (!meeting_id) throw new Error('meeting_id required');

  const cached = await readBlob(`fathom/${meeting_id}.json`);
  if (cached) return { ...cached, source: 'cache' };

  const data = await fathomGet(`/meetings/${encodeURIComponent(meeting_id)}/transcript`);
  const transcript = typeof data === 'string' ? data : (data.transcript || data.text || JSON.stringify(data));
  const meta = await fathomGet(`/meetings/${encodeURIComponent(meeting_id)}`).catch(() => ({}));

  const record = {
    id: meeting_id,
    title: meta.title || meta.meeting_title || null,
    date: meta.scheduled_start_time || meta.created_at || null,
    attendees: (meta.invitees || meta.attendees || []).map((a) => a.email || a.name).filter(Boolean),
    transcript,
    fetched_at: new Date().toISOString(),
  };

  await writeBlob(`fathom/${meeting_id}.json`, record);
  return { ...record, source: 'fresh' };
}

export async function listCached() {
  const entries = await listBlob('fathom/');
  return { count: entries.length, transcripts: entries };
}

// ── Vercel Blob helpers (graceful fallback if BLOB_READ_WRITE_TOKEN not set) ─

async function getBlobClient() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    return await import('@vercel/blob');
  } catch {
    return null;
  }
}

async function readBlob(key) {
  const mod = await getBlobClient();
  if (!mod) return null;
  try {
    const { blobs } = await mod.list({ prefix: key, limit: 1 });
    const match = blobs.find((b) => b.pathname === key);
    if (!match) return null;
    const res = await fetch(match.url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function writeBlob(key, data) {
  const mod = await getBlobClient();
  if (!mod) return null;
  try {
    return await mod.put(key, JSON.stringify(data), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
  } catch (err) {
    console.warn('blob write failed', err);
    return null;
  }
}

async function listBlob(prefix) {
  const mod = await getBlobClient();
  if (!mod) return [];
  try {
    const { blobs } = await mod.list({ prefix });
    return blobs.map((b) => ({ key: b.pathname, size: b.size, uploaded_at: b.uploadedAt }));
  } catch {
    return [];
  }
}
