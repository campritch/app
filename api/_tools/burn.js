// Burn adapter: reads data/burn.csv (user drops an export from the Google Sheet here).
// Also supports user-uploaded CSV via /api/burn-upload -> /tmp fallback.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const committedPath = fileURLToPath(new URL('../../data/burn.csv', import.meta.url));
const tmpPath = '/tmp/burn-upload.csv';

export async function read() {
  let raw;
  let source;
  if (existsSync(tmpPath)) {
    raw = readFileSync(tmpPath, 'utf-8');
    source = 'uploaded';
  } else if (existsSync(committedPath)) {
    raw = readFileSync(committedPath, 'utf-8');
    source = 'committed';
  } else {
    return { error: 'No burn CSV found', hint: 'Upload via the UI or commit to data/burn.csv' };
  }

  const rows = parseCsv(raw);
  return {
    source,
    columns: rows[0] || [],
    row_count: Math.max(0, rows.length - 1),
    rows: rows.slice(1, 500), // cap at 500 data rows
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
