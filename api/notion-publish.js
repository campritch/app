// Publish an assistant response (markdown) as a new Notion page.
// Password-gated via STRATEGY_PASSWORD.
// Body: { password, parent_page_id, title, markdown }

import { createPage } from './_tools/notion.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });
  if (!process.env.NOTION_API_KEY) return res.status(500).json({ error: 'NOTION_API_KEY not configured' });

  const { password, parent_page_id, title, markdown } = req.body || {};
  if (password !== expected) return res.status(401).json({ error: 'bad password' });
  if (!parent_page_id) return res.status(400).json({ error: 'parent_page_id required (Notion page URL or ID)' });
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!markdown || !markdown.trim()) return res.status(400).json({ error: 'markdown body required' });

  try {
    const result = await createPage({ parent_page_id, title, markdown });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 60 };
