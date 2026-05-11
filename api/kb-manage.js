// Manage the knowledge bank.
// Actions: list | view | delete | clear

import { listKb, readKbItem, deleteKb, clearKb } from './_tools/kb.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });

  const { password, action, id } = req.body || {};
  if (password !== expected) return res.status(401).json({ error: 'bad password' });

  try {
    if (action === 'list') return res.status(200).json(await listKb());
    if (action === 'view') {
      if (!id) return res.status(400).json({ error: 'id required' });
      return res.status(200).json(await readKbItem({ id }));
    }
    if (action === 'delete') {
      if (!id) return res.status(400).json({ error: 'id required' });
      return res.status(200).json(await deleteKb({ id }));
    }
    if (action === 'clear') return res.status(200).json(await clearKb());
    return res.status(400).json({ error: 'action must be list | view | delete | clear' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 30 };
