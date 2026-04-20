// Burn adapter: reads the uploaded burn CSV from Vercel Blob (persistent across function instances),
// with fallback to the committed data/burn.csv if no upload exists.
// Uploads are written via /api/burn-upload (which writes to Blob).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const committedPath = fileURLToPath(new URL('../../data/burn.csv', import.meta.url));
const BLOB_KEY = 'strategy/burn.csv';

export async function read() {
  let raw;
  let source;
  let uploaded_at = null;

  // 1. Try Blob (most recent upload)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
      const match = blobs.find((b) => b.pathname === BLOB_KEY);
      if (match) {
        const res = await fetch(match.url);
        if (res.ok) {
          raw = await res.text();
          source = 'blob';
          uploaded_at = match.uploadedAt || null;
        }
      }
    } catch (err) {
      console.warn('burn blob read failed', err);
    }
  }

  // 2. Fallback to committed CSV
  if (!raw && existsSync(committedPath)) {
    raw = readFileSync(committedPath, 'utf-8');
    source = 'committed';
  }

  if (!raw) return { error: 'No burn CSV found', hint: 'Upload via the Burn CSV box in the left panel, or commit to data/burn.csv' };

  const rows = parseCsv(raw);
  return {
    source,
    uploaded_at,
    columns: rows[0] || [],
    row_count: Math.max(0, rows.length - 1),
    rows: rows.slice(1, 500),
    truncated: rows.length - 1 > 500,
  };
}

// Minimal CSV parser supporting quoted fields with escaped quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}
