// Notion adapter: fetch page as markdown, create new page from markdown.
// Env: NOTION_API_KEY (internal integration token — must be invited to each page).

const BASE = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

function assertKey() {
  const k = process.env.NOTION_API_KEY;
  if (!k) throw new Error('NOTION_API_KEY not set');
  return k;
}

async function notionReq(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${assertKey()}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

function extractId(input) {
  if (!input) throw new Error('page_url_or_id required');
  // Strip hyphens — Notion IDs work either way, but extract the last 32-hex run
  const match = String(input).match(/([0-9a-f]{32})/i) || String(input).match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})/i);
  if (!match) throw new Error(`Could not extract Notion page ID from: ${input}`);
  return match[1].replace(/-/g, '');
}

export async function fetchPage({ page_url_or_id }) {
  const id = extractId(page_url_or_id);
  const page = await notionReq(`/pages/${id}`);
  const title = extractTitle(page);

  const markdown = await blocksToMarkdown(id, 0);
  return { id, title, url: page.url, markdown };
}

function extractTitle(page) {
  const props = page.properties || {};
  for (const v of Object.values(props)) {
    if (v?.type === 'title') return (v.title || []).map((t) => t.plain_text).join('');
  }
  return '(untitled)';
}

async function blocksToMarkdown(parentId, depth) {
  const out = [];
  let cursor;
  while (true) {
    const qs = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : '';
    const res = await notionReq(`/blocks/${parentId}/children${qs}`);
    for (const b of res.results || []) {
      out.push(await renderBlock(b, depth));
    }
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return out.filter(Boolean).join('\n\n');
}

async function renderBlock(block, depth) {
  const pad = '  '.repeat(depth);
  const rich = (r) => (r || []).map((t) => t.plain_text).join('');
  switch (block.type) {
    case 'paragraph': return pad + rich(block.paragraph.rich_text);
    case 'heading_1': return `# ${rich(block.heading_1.rich_text)}`;
    case 'heading_2': return `## ${rich(block.heading_2.rich_text)}`;
    case 'heading_3': return `### ${rich(block.heading_3.rich_text)}`;
    case 'bulleted_list_item': return `${pad}- ${rich(block.bulleted_list_item.rich_text)}`;
    case 'numbered_list_item': return `${pad}1. ${rich(block.numbered_list_item.rich_text)}`;
    case 'to_do': return `${pad}- [${block.to_do.checked ? 'x' : ' '}] ${rich(block.to_do.rich_text)}`;
    case 'toggle': return `${pad}- ${rich(block.toggle.rich_text)}`;
    case 'quote': return `> ${rich(block.quote.rich_text)}`;
    case 'callout': return `> ${rich(block.callout.rich_text)}`;
    case 'code': return '```' + (block.code.language || '') + '\n' + rich(block.code.rich_text) + '\n```';
    case 'divider': return '---';
    case 'child_page': return `[Sub-page: ${block.child_page.title}] (id: ${block.id})`;
    default: return null;
  }
}

// ── Create page from markdown ──────────────────────────────────────────

export async function createPage({ parent_page_id, title, markdown }) {
  if (!parent_page_id || !title || !markdown) throw new Error('parent_page_id, title, markdown required');
  const parentId = extractId(parent_page_id);
  const children = markdownToBlocks(markdown);

  const page = await notionReq('/pages', {
    method: 'POST',
    body: {
      parent: { page_id: parentId },
      properties: { title: { title: [{ text: { content: title.slice(0, 200) } }] } },
      children: children.slice(0, 100),
    },
  });

  // Append any overflow blocks beyond the 100-block create limit
  if (children.length > 100) {
    for (let i = 100; i < children.length; i += 100) {
      await notionReq(`/blocks/${page.id}/children`, {
        method: 'PATCH',
        body: { children: children.slice(i, i + 100) },
      });
    }
  }

  return { id: page.id, url: page.url, title };
}

function markdownToBlocks(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ object: 'block', type: 'code', code: { rich_text: textRuns(codeLines.join('\n')), language: lang || 'plain text' } });
      i += 1;
      continue;
    }
    if (/^###\s+/.test(line)) blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: textRuns(line.replace(/^###\s+/, '')) } });
    else if (/^##\s+/.test(line)) blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: textRuns(line.replace(/^##\s+/, '')) } });
    else if (/^#\s+/.test(line)) blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: textRuns(line.replace(/^#\s+/, '')) } });
    else if (/^\s*[-*]\s+/.test(line)) blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: textRuns(line.replace(/^\s*[-*]\s+/, '')) } });
    else if (/^\s*\d+\.\s+/.test(line)) blocks.push({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: textRuns(line.replace(/^\s*\d+\.\s+/, '')) } });
    else if (/^>\s?/.test(line)) blocks.push({ object: 'block', type: 'quote', quote: { rich_text: textRuns(line.replace(/^>\s?/, '')) } });
    else if (line.trim() === '---') blocks.push({ object: 'block', type: 'divider', divider: {} });
    else if (line.trim()) blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: textRuns(line) } });
    i += 1;
  }
  return blocks;
}

function textRuns(text) {
  // Notion caps rich_text content at 2000 chars per run — chunk long strings.
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) chunks.push(text.slice(i, i + 2000));
  return chunks.map((c) => ({ type: 'text', text: { content: c } }));
}

// ── AI Campaign Proposals hub ──────────────────────────────────────────
// The single source of truth the campaign-proposal-generator skill trains on.
// Two databases live under one hub page: "AI Proposals" (history) and
// "Training Library" (the brain). Both the web front-door and the skill
// find-or-create these, so whoever runs first initializes them.

export const HUB_PAGE_ID = (process.env.CAMPAIGN_PROPOSALS_HUB || '3a2bb6074fe3817cb2fdc003df546259').replace(/-/g, '');
const AI_PROPOSALS_TITLE = 'AI Proposals';
const TRAINING_LIBRARY_TITLE = 'Training Library';

const AI_PROPOSALS_PROPS = {
  Name: { title: {} },
  Brand: { rich_text: {} },
  Domain: { rich_text: {} },
  Mode: { select: { options: [{ name: 'General', color: 'blue' }, { name: 'Remnant', color: 'orange' }] } },
  Budget: { rich_text: {} },
  Status: { select: { options: [
    { name: 'Draft', color: 'gray' }, { name: 'Generated', color: 'green' },
    { name: 'Sent', color: 'blue' }, { name: 'Won', color: 'purple' }, { name: 'Lost', color: 'red' },
  ] } },
  Competitor: { rich_text: {} },
  Proposal: { url: {} },
  Job: { rich_text: {} },
  Created: { created_time: {} },
};

const TRAINING_LIBRARY_PROPS = {
  Name: { title: {} },
  Brand: { rich_text: {} },
  Category: { rich_text: {} },
  'Budget band': { select: { options: [
    { name: '<$10k', color: 'gray' }, { name: '$10-25k', color: 'blue' }, { name: '$25-60k', color: 'green' },
    { name: '$60-120k', color: 'orange' }, { name: '$120k+', color: 'purple' },
  ] } },
  Mode: { select: { options: [{ name: 'General', color: 'blue' }, { name: 'Remnant', color: 'orange' }, { name: 'Context', color: 'gray' }] } },
  Outcome: { select: { options: [
    { name: 'Won', color: 'green' }, { name: 'Lost', color: 'red' },
    { name: 'Pending', color: 'yellow' }, { name: 'Reference', color: 'gray' },
  ] } },
  'Source links': { rich_text: {} },
  Proposal: { url: {} },
  Added: { created_time: {} },
};

async function findChildDatabases(parentPageId) {
  const out = [];
  let cursor;
  while (true) {
    const qs = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : '';
    const res = await notionReq(`/blocks/${parentPageId}/children${qs}`);
    for (const b of res.results || []) {
      if (b.type === 'child_database') out.push({ id: b.id, title: b.child_database?.title || '' });
    }
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return out;
}

async function createDatabase(parentPageId, title, properties) {
  const db = await notionReq('/databases', {
    method: 'POST',
    body: {
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: title } }],
      properties,
    },
  });
  return db.id;
}

// Find-or-create both hub databases. Returns { aiProposals, trainingLibrary }.
export async function ensureHubDatabases({ hub } = {}) {
  const hubId = (hub || HUB_PAGE_ID).replace(/-/g, '');
  const existing = await findChildDatabases(hubId);
  const find = (t) => existing.find((d) => (d.title || '').trim().toLowerCase() === t.toLowerCase());
  let ai = find(AI_PROPOSALS_TITLE);
  let tl = find(TRAINING_LIBRARY_TITLE);
  const aiId = ai ? ai.id : await createDatabase(hubId, AI_PROPOSALS_TITLE, AI_PROPOSALS_PROPS);
  const tlId = tl ? tl.id : await createDatabase(hubId, TRAINING_LIBRARY_TITLE, TRAINING_LIBRARY_PROPS);
  return { hub: hubId, aiProposals: aiId, trainingLibrary: tlId };
}

function plain(rt) { return (rt || []).map((t) => t.plain_text ?? t.text?.content ?? '').join(''); }

function simplifyRow(page) {
  const p = page.properties || {};
  const val = (name) => {
    const v = p[name];
    if (!v) return '';
    switch (v.type) {
      case 'title': return plain(v.title);
      case 'rich_text': return plain(v.rich_text);
      case 'select': return v.select?.name || '';
      case 'url': return v.url || '';
      case 'created_time': return v.created_time || '';
      case 'date': return v.date?.start || '';
      default: return '';
    }
  };
  return { id: page.id, url: page.url, props: Object.fromEntries(Object.keys(p).map((k) => [k, val(k)])) };
}

async function queryRows(databaseId, { page_size = 100 } = {}) {
  const res = await notionReq(`/databases/${databaseId.replace(/-/g, '')}/query`, {
    method: 'POST',
    body: { page_size, sorts: [{ timestamp: 'created_time', direction: 'descending' }] },
  });
  return (res.results || []).map(simplifyRow);
}

export async function listProposals() {
  const { aiProposals } = await ensureHubDatabases();
  return { items: await queryRows(aiProposals) };
}

export async function listTraining() {
  const { trainingLibrary } = await ensureHubDatabases();
  return { items: await queryRows(trainingLibrary) };
}

// Create a Training Library entry (used by the web front-door). `body` becomes
// the page content — the readable context the skill trains on.
export async function addTraining({ name, brand, category, mode, outcome, source_links, proposal_url, body }) {
  if (!name) throw new Error('name required');
  const { trainingLibrary } = await ensureHubDatabases();
  const props = { Name: { title: [{ text: { content: String(name).slice(0, 200) } }] } };
  if (brand) props.Brand = { rich_text: textRuns(String(brand).slice(0, 2000)) };
  if (category) props.Category = { rich_text: textRuns(String(category).slice(0, 2000)) };
  if (mode) props.Mode = { select: { name: mode } };
  if (outcome) props.Outcome = { select: { name: outcome } };
  if (source_links) props['Source links'] = { rich_text: textRuns(String(source_links).slice(0, 2000)) };
  if (proposal_url) props.Proposal = { url: String(proposal_url).slice(0, 2000) };
  const children = body ? markdownToBlocks(String(body)) : [];
  const page = await notionReq('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: trainingLibrary.replace(/-/g, '') },
      properties: props,
      children: children.slice(0, 100),
    },
  });
  if (children.length > 100) {
    for (let i = 100; i < children.length; i += 100) {
      await notionReq(`/blocks/${page.id}/children`, { method: 'PATCH', body: { children: children.slice(i, i + 100) } });
    }
  }
  return { id: page.id, url: page.url };
}
