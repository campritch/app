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

// Docs: https://developers.fathom.ai/quickstart
// Pagination uses cursor + next_cursor. Transcript lives at /recordings/{id}/transcript.
// Meeting objects expose the recording id via recording.id (fallback to recording_id / id).

const PAGE_CAP = 20; // safety: max pages to walk on one listMeetings call

export async function listMeetings({ from_date, to_date, extra_exclude_patterns = [] }) {
  if (!from_date || !to_date) throw new Error('from_date and to_date required');

  const excludes = [...STANDUP_PATTERNS, ...extra_exclude_patterns.map((p) => new RegExp(p, 'i'))];
  const all = [];
  let cursor;
  let pages = 0;

  while (pages < PAGE_CAP) {
    const data = await fathomGet('/meetings', {
      created_after: `${from_date}T00:00:00Z`,
      created_before: `${to_date}T23:59:59Z`,
      cursor,
    });
    const items = Array.isArray(data) ? data : (data.items || data.meetings || data.results || []);
    all.push(...items);
    pages += 1;
    cursor = data.next_cursor;
    if (!cursor) break;
  }

  const filtered = all
    .map((m) => ({
      id: m.recording?.id || m.recording_id || m.id || m.meeting_id,
      title: m.title || m.meeting_title || '(untitled)',
      date: m.scheduled_start_time || m.created_at || m.recording_start_time || null,
      attendees: (m.calendar_invitees || m.invitees || m.attendees || []).map((a) => a.email || a.name).filter(Boolean),
      recorded_by: m.recorded_by?.email || m.recorded_by?.name || null,
      duration_minutes: m.duration || m.duration_minutes || null,
      share_url: m.url || m.share_url || null,
    }))
    .filter((m) => !excludes.some((re) => re.test(m.title)));

  return {
    count: filtered.length,
    excluded_count: all.length - filtered.length,
    pages_walked: pages,
    hit_page_cap: pages >= PAGE_CAP && !!cursor,
    meetings: filtered,
  };
}

export async function getTranscript({ meeting_id }) {
  if (!meeting_id) throw new Error('meeting_id required (use recording id from listMeetings)');

  const cached = await readBlob(`fathom/${meeting_id}.json`);
  if (cached) return { ...cached, source: 'cache' };

  const data = await fathomGet(`/recordings/${encodeURIComponent(meeting_id)}/transcript`);
  const transcript = normalizeTranscript(data);

  const record = {
    id: meeting_id,
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

// Pull transcripts for a specific list of meeting ids, cache each to Blob.
// Input: { meeting_ids: string[], titles?: Record<id,string> }
// Output: { ingested, cached_existing, errors }
export async function ingestMeetings({ meeting_ids = [], titles = {} }) {
  if (!Array.isArray(meeting_ids) || !meeting_ids.length) throw new Error('meeting_ids array required');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN required for ingest (nowhere to persist transcripts)');
  }

  let ingested = 0;
  let cached = 0;
  const errors = [];

  for (const id of meeting_ids) {
    if (!id) continue;
    try {
      const existing = await readBlob(`fathom/${id}.json`);
      if (existing?.transcript) { cached += 1; continue; }

      const resp = await fathomGet(`/recordings/${encodeURIComponent(id)}/transcript`);
      const transcript = normalizeTranscript(resp);

      if (!transcript) { errors.push({ id, title: titles[id] || null, error: 'empty transcript' }); continue; }

      await writeBlob(`fathom/${id}.json`, {
        id,
        title: titles[id] || null,
        transcript,
        fetched_at: new Date().toISOString(),
      });
      ingested += 1;
    } catch (err) {
      errors.push({ id, title: titles[id] || null, error: String(err?.message || err) });
    }
  }

  return { ingested, cached_existing: cached, errors, total: meeting_ids.length };
}

// Bulk ingest: walk /meetings?include_transcript=true and cache each to Blob.
// Resumable — accepts a cursor and returns next_cursor + done so the caller can chunk across requests.
// Input: { from_date, to_date, cursor?, max_pages?, extra_exclude_patterns? }
// Output: { ingested, cached_existing, excluded, errors, next_cursor, done, pages_walked }
export async function ingestRange({ from_date, to_date, cursor, max_pages = 5, extra_exclude_patterns = [] }) {
  if (!from_date || !to_date) throw new Error('from_date and to_date required');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN required for ingest (nowhere to persist transcripts)');
  }

  const excludes = [...STANDUP_PATTERNS, ...extra_exclude_patterns.map((p) => new RegExp(p, 'i'))];
  let pages = 0;
  let ingested = 0;
  let cached = 0;
  let excluded = 0;
  const errors = [];

  while (pages < max_pages) {
    const data = await fathomGet('/meetings', {
      created_after: `${from_date}T00:00:00Z`,
      created_before: `${to_date}T23:59:59Z`,
      include_transcript: 'true',
      cursor,
    });
    const items = Array.isArray(data) ? data : (data.items || data.meetings || data.results || []);
    pages += 1;

    for (const m of items) {
      const id = m.recording?.id || m.recording_id || m.id || m.meeting_id;
      const title = m.title || m.meeting_title || '(untitled)';
      if (!id) { errors.push({ title, error: 'no recording id' }); continue; }
      if (excludes.some((re) => re.test(title))) { excluded += 1; continue; }

      const existing = await readBlob(`fathom/${id}.json`);
      if (existing?.transcript) { cached += 1; continue; }

      try {
        let transcript = m.transcript != null ? normalizeTranscript(m) : '';
        // Fallback: pull separately if list response didn't bundle it
        if (!transcript) {
          const resp = await fathomGet(`/recordings/${encodeURIComponent(id)}/transcript`);
          transcript = normalizeTranscript(resp);
        }
        if (!transcript) { errors.push({ id, title, error: 'no transcript returned' }); continue; }

        await writeBlob(`fathom/${id}.json`, {
          id,
          title,
          date: m.scheduled_start_time || m.created_at || m.recording_start_time || null,
          attendees: (m.calendar_invitees || m.invitees || m.attendees || []).map((a) => a.email || a.name).filter(Boolean),
          recorded_by: m.recorded_by?.email || m.recorded_by?.name || null,
          transcript,
          fetched_at: new Date().toISOString(),
        });
        ingested += 1;
      } catch (err) {
        errors.push({ id, title, error: String(err?.message || err) });
      }
    }

    cursor = data.next_cursor;
    if (!cursor) break;
  }

  return {
    ingested,
    cached_existing: cached,
    excluded,
    errors,
    pages_walked: pages,
    next_cursor: cursor || null,
    done: !cursor,
  };
}

// Fathom transcript responses come in many shapes depending on endpoint:
//   - plain string
//   - { transcript: string }
//   - { transcript: [{ speaker: {name|display_name|username|email}, text, timestamp }] }
//   - { transcript: [{ speaker: "Cam", ... }] }
// Normalize to a single "Speaker: line" per utterance.
function normalizeTranscript(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  const payload = data.transcript != null ? data.transcript : data;
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    return payload.map((t) => {
      const sp = t.speaker;
      const name = typeof sp === 'string'
        ? sp
        : sp?.name || sp?.display_name || sp?.username || sp?.email || '';
      const text = t.text || t.content || '';
      return name ? `${name}: ${text}` : text;
    }).filter(Boolean).join('\n');
  }
  return data.text || '';
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
