// Manage the cached Fathom transcripts stored in Vercel Blob.
// Actions: list (metadata) | view (single transcript body) | delete (single) | clear (all) | rebuild (manifest)
// Password-gated via STRATEGY_PASSWORD.

import { listCachedDetailed, readCached, deleteCached, clearCached, rebuildManifest, enrichCached } from './_tools/fathom.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });

  const { password, action, id, enrichments } = req.body || {};
  if (password !== expected) return res.status(401).json({ error: 'bad password' });

  try {
    if (action === 'list') {
      return res.status(200).json(await listCachedDetailed());
    }
    if (action === 'rebuild') {
      return res.status(200).json(await rebuildManifest());
    }
    if (action === 'enrich') {
      return res.status(200).json(await enrichCached({ enrichments }));
    }
    if (action === 'view') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const record = await readCached(id);
      if (!record) return res.status(404).json({ error: 'not cached' });
      return res.status(200).json(record);
    }
    if (action === 'delete') {
      if (!id) return res.status(400).json({ error: 'id required' });
      return res.status(200).json(await deleteCached(id));
    }
    if (action === 'clear') {
      return res.status(200).json(await clearCached());
    }
    return res.status(400).json({ error: "action must be one of: list, view, delete, clear, rebuild" });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 60 };
