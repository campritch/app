import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataPath = fileURLToPath(new URL('../data/gtm-latest.json', import.meta.url));

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const raw = readFileSync(dataPath, 'utf-8');
    const data = JSON.parse(raw);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      res.status(404).json({
        error: 'No GTM data cached yet',
        hint: 'Run the MCP refresh flow to write data/gtm-latest.json'
      });
      return;
    }
    res.status(500).json({ error: 'Failed to read GTM data', detail: String(err) });
  }
}
