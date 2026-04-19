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
