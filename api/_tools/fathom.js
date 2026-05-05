// Fathom adapter: list meetings, pull transcripts, cache in Vercel Blob.
// Env: FATHOM_API_KEY, FATHOM_API_BASE (default https://api.fathom.ai/external/v1), BLOB_READ_WRITE_TOKEN (optional).

const DEFAULT_BASE = process.env.FATHOM_API_BASE || 'https://api.fathom.ai/external/v1';
// Recurring-meeting noise we exclude by default. Matches plurals (standups, 1:1s, syncs)
// which the previous \b-anchored version missed.
const STANDUP_PATTERNS = [
  /\bstand.?ups?\b/i,
  /\bdailys?\b/i,
  /\bsyncs?\b/i,
  /\b1\s*[:x\/]\s*1s?\b/i,
  /\b1on1s?\b/i,
  /\bretros?\b/i,
  /\bretrospectives?\b/i,
  /\bcheck.?ins?\b/i,
  /\bweekly\s+(team|all\s*hands|status|meeting)\b/i,
];

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

const PAGE_CAP = 500; // 500 pages × Fathom's page size — covers multi-year history at 10/page

export async function listMeetings({ from_date, to_date, extra_exclude_patterns = [], include_standups = false }) {
  if (!from_date || !to_date) throw new Error('from_date and to_date required');

  const excludes = include_standups
    ? extra_exclude_patterns.map((p) => new RegExp(p, 'i'))
    : [...STANDUP_PATTERNS, ...extra_exclude_patterns.map((p) => new RegExp(p, 'i'))];
  const all = [];
  let cursor;
  let pages = 0;

  while (pages < PAGE_CAP) {
    const data = await fathomGet('/meetings', {
      created_after: `${from_date}T00:00:00Z`,
      created_before: `${to_date}T23:59:59Z`,
      cursor,
      limit: 100, // Fathom ignores unsupported params; safe to send
    });
    const items = Array.isArray(data) ? data : (data.items || data.meetings || data.results || []);
    all.push(...items);
    pages += 1;
    cursor = data.next_cursor;
    if (!cursor) break;
  }

  const mapped = all.map((m) => ({
    id: m.recording?.id || m.recording_id || m.id || m.meeting_id,
    title: m.title || m.meeting_title || '(untitled)',
    date: m.scheduled_start_time || m.created_at || m.recording_start_time || null,
    attendees: (m.calendar_invitees || m.invitees || m.attendees || []).map((a) => a.email || a.name).filter(Boolean),
    recorded_by: m.recorded_by?.email || m.recorded_by?.name || null,
    duration_minutes: m.duration || m.duration_minutes || null,
    share_url: m.url || m.share_url || null,
    is_standup: STANDUP_PATTERNS.some((re) => re.test(m.title || m.meeting_title || '')),
  }));
  const filtered = excludes.length
    ? mapped.filter((m) => !excludes.some((re) => re.test(m.title)))
    : mapped;

  return {
    count: filtered.length,
    excluded_count: mapped.length - filtered.length,
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

  await writeFathomRecord(meeting_id, record);
  return { ...record, source: 'fresh' };
}

export async function listCached() {
  const entries = await listBlob('fathom/');
  return { count: entries.length, transcripts: entries };
}

// ── Cache management: manifest-backed detailed listing + delete ────────
const MANIFEST_KEY = 'fathom/_index.json';

export async function listCachedDetailed() {
  const manifest = await readBlob(MANIFEST_KEY);
  if (manifest && Array.isArray(manifest.items)) {
    return { count: manifest.items.length, items: manifest.items, source: 'manifest' };
  }
  // Fallback / migration: rebuild manifest from existing cache entries
  return await rebuildManifest();
}

export async function rebuildManifest() {
  const mod = await getBlobClient();
  if (!mod) return { count: 0, items: [] };
  const { blobs } = await mod.list({ prefix: 'fathom/' });
  const items = [];
  for (const b of blobs) {
    if (b.pathname === MANIFEST_KEY) continue;
    const record = await readBlob(b.pathname);
    if (!record) continue;
    items.push({
      id: record.id || b.pathname.replace(/^fathom\//, '').replace(/\.json$/, ''),
      title: record.title || null,
      date: record.date || null,
      attendees: record.attendees || [],
      bytes: b.size,
      cached_at: record.fetched_at || b.uploadedAt,
    });
  }
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  await writeBlob(MANIFEST_KEY, { items, updated_at: new Date().toISOString() });
  return { count: items.length, items, source: 'rebuilt' };
}

export async function readCached(id) {
  if (!id) throw new Error('id required');
  return await readBlob(`fathom/${id}.json`);
}

export async function deleteCached(id) {
  if (!id) throw new Error('id required');
  const mod = await getBlobClient();
  if (!mod) throw new Error('BLOB_READ_WRITE_TOKEN required');
  const key = `fathom/${id}.json`;
  const { blobs } = await mod.list({ prefix: key, limit: 5 });
  const match = blobs.find((b) => b.pathname === key);
  if (match) await mod.del(match.url);
  await removeFromManifest(id);
  return { deleted: !!match };
}

// Patch the cache manifest with title/date/attendees for items that are
// missing them. Called by the UI after it has fresh meeting metadata to
// fold into older cached entries that pre-date title-tracking.
export async function enrichCached({ enrichments }) {
  if (!Array.isArray(enrichments) || !enrichments.length) return { enriched: 0 };
  const manifest = (await readBlob(MANIFEST_KEY)) || { items: [] };
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  let enriched = 0;
  for (const e of enrichments) {
    if (!e || !e.id) continue;
    const idx = items.findIndex((x) => String(x.id) === String(e.id));
    if (idx < 0) continue;
    const cur = items[idx];
    let changed = false;
    if (e.title && !cur.title) { cur.title = e.title; changed = true; }
    if (e.date && !cur.date) { cur.date = e.date; changed = true; }
    if (Array.isArray(e.attendees) && e.attendees.length && (!cur.attendees || !cur.attendees.length)) {
      cur.attendees = e.attendees;
      changed = true;
    }
    if (changed) {
      items[idx] = cur;
      enriched += 1;
      // Also patch the underlying transcript blob so future reads have it too
      try {
        const record = await readBlob(`fathom/${e.id}.json`);
        if (record) {
          if (e.title && !record.title) record.title = e.title;
          if (e.date && !record.date) record.date = e.date;
          if (Array.isArray(e.attendees) && e.attendees.length && !record.attendees) record.attendees = e.attendees;
          await writeBlob(`fathom/${e.id}.json`, record);
        }
      } catch (err) {
        console.warn('enrich transcript blob failed', e.id, err);
      }
    }
  }
  if (enriched) {
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    await writeBlob(MANIFEST_KEY, { items, updated_at: new Date().toISOString() });
  }
  return { enriched };
}

export async function clearCached() {
  const mod = await getBlobClient();
  if (!mod) throw new Error('BLOB_READ_WRITE_TOKEN required');
  const { blobs } = await mod.list({ prefix: 'fathom/' });
  const urls = blobs.map((b) => b.url);
  if (urls.length) await mod.del(urls);
  return { deleted: urls.length };
}

async function writeFathomRecord(id, record) {
  await writeBlob(`fathom/${id}.json`, record);
  const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
  await updateManifest({
    id,
    title: record.title || null,
    date: record.date || null,
    attendees: record.attendees || [],
    bytes,
    cached_at: record.fetched_at || new Date().toISOString(),
  });
}

async function updateManifest(entry) {
  const manifest = (await readBlob(MANIFEST_KEY)) || { items: [] };
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  const idx = items.findIndex((x) => x.id === entry.id);
  if (idx >= 0) items[idx] = entry;
  else items.push(entry);
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  await writeBlob(MANIFEST_KEY, { items, updated_at: new Date().toISOString() });
}

async function removeFromManifest(id) {
  const manifest = await readBlob(MANIFEST_KEY);
  if (!manifest || !Array.isArray(manifest.items)) return;
  const items = manifest.items.filter((x) => x.id !== id);
  await writeBlob(MANIFEST_KEY, { items, updated_at: new Date().toISOString() });
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

      const record = {
        id,
        title: titles[id] || null,
        transcript,
        fetched_at: new Date().toISOString(),
      };
      await writeFathomRecord(id, record);
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

        const record = {
          id,
          title,
          date: m.scheduled_start_time || m.created_at || m.recording_start_time || null,
          attendees: (m.calendar_invitees || m.invitees || m.attendees || []).map((a) => a.email || a.name).filter(Boolean),
          recorded_by: m.recorded_by?.email || m.recorded_by?.name || null,
          transcript,
          fetched_at: new Date().toISOString(),
        };
        await writeFathomRecord(id, record);
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
    const result = await mod.get(key, { access: 'private' });
    if (!result || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeBlob(key, data) {
  const mod = await getBlobClient();
  if (!mod) return null;
  try {
    return await mod.put(key, JSON.stringify(data), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
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
