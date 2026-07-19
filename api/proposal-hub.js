// AI Campaign Proposals hub API.
// Reads/writes the Notion hub the campaign-proposal-generator skill trains on:
// the "AI Proposals" (history) and "Training Library" (brain) databases under
// one hub page. Password-gated via STRATEGY_PASSWORD, same as the other tools.
//
// Actions:
//   config        -> { ok, hub, aiProposals, trainingLibrary }
//   list_proposals-> { items }  (history rows)
//   list_training -> { items }  (training corpus rows)
//   add_training  -> create a Training Library entry { name, brand, category, mode, outcome, source_links, proposal_url, body }

import { ensureHubDatabases, listProposals, listTraining, addTraining, HUB_PAGE_ID } from './_tools/notion.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });
  if (!process.env.NOTION_API_KEY) return res.status(500).json({ error: 'NOTION_API_KEY not configured' });

  const { password, action, entry } = req.body || {};
  if (password !== expected) return res.status(401).json({ error: 'bad password' });

  try {
    if (action === 'config') {
      const ids = await ensureHubDatabases();
      return res.status(200).json({ ok: true, hub_url: `https://www.notion.so/${HUB_PAGE_ID}`, ...ids });
    }
    if (action === 'list_proposals') return res.status(200).json(await listProposals());
    if (action === 'list_training') return res.status(200).json(await listTraining());
    if (action === 'add_training') {
      if (!entry || !entry.name) return res.status(400).json({ error: 'entry.name required' });
      return res.status(200).json(await addTraining(entry));
    }
    return res.status(400).json({ error: 'action must be config | list_proposals | list_training | add_training' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 60 };
