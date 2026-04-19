// BI adapter: reads the internal GTM snapshot committed to the repo (data/gtm-latest.json).
// Same file served by api/gtm-data.js and rendered at spotsnow.wiki/bi.html.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataPath = fileURLToPath(new URL('../../data/gtm-latest.json', import.meta.url));

export async function fetch() {
  try {
    const raw = readFileSync(dataPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: 'No BI snapshot committed yet', hint: 'Run your GTM MCP refresh to write data/gtm-latest.json' };
    }
    throw err;
  }
}
