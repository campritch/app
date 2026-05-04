// Tool registry for the strategy agent.
// Each tool: { name, description, input_schema, execute(input) }

import * as fathom from './fathom.js';
import * as notion from './notion.js';
import * as hubspot from './hubspot.js';
import * as bi from './bi.js';
import * as burn from './burn.js';
import * as web from './web.js';
import * as kb from './kb.js';

const TOOL_DEFS = [
  // ── Fathom ──────────────────────────────────────────────────────────────
  {
    name: 'fathom_list_meetings',
    description: 'List Fathom meetings in a date range, excluding standups/1:1s/daily-syncs automatically. Returns id, title, date, attendees, duration. Use this first to see what calls are available, then pull transcripts for the substantive ones.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'ISO date (YYYY-MM-DD), inclusive' },
        to_date: { type: 'string', description: 'ISO date (YYYY-MM-DD), inclusive' },
        extra_exclude_patterns: { type: 'array', items: { type: 'string' }, description: 'Extra case-insensitive regex patterns to exclude from titles. Defaults already filter standup|daily|sync|1:1|1on1.' },
      },
      required: ['from_date', 'to_date'],
    },
    execute: fathom.listMeetings,
  },
  {
    name: 'fathom_get_transcript',
    description: 'Fetch the full transcript of a single Fathom meeting by id. Cached — the first call hits the Fathom API, subsequent calls read from Vercel Blob so re-analysis is free. Use for meetings you need to actually read.',
    input_schema: {
      type: 'object',
      properties: {
        meeting_id: { type: 'string' },
      },
      required: ['meeting_id'],
    },
    execute: fathom.getTranscript,
  },
  {
    name: 'fathom_list_cached_transcripts',
    description: 'List every Fathom transcript already cached in Blob storage. Use at the start of analysis to see what history is pre-fetched (free to read) before spending on new pulls.',
    input_schema: { type: 'object', properties: {} },
    execute: fathom.listCached,
  },

  // ── Notion ──────────────────────────────────────────────────────────────
  {
    name: 'notion_fetch_page',
    description: 'Fetch a Notion page (and its children) as markdown. Accepts either a full Notion URL or a page ID. Use this when Cam has listed Notion links in his context.',
    input_schema: {
      type: 'object',
      properties: {
        page_url_or_id: { type: 'string' },
      },
      required: ['page_url_or_id'],
    },
    execute: notion.fetchPage,
  },
  {
    name: 'notion_create_page',
    description: 'Create a new Notion page under a parent page, with markdown body. Use when Cam asks you to write up an updated strategy doc. Returns the new page URL.',
    input_schema: {
      type: 'object',
      properties: {
        parent_page_id: { type: 'string', description: 'Notion page ID or URL for the parent page.' },
        title: { type: 'string' },
        markdown: { type: 'string', description: 'The full document body in markdown.' },
      },
      required: ['parent_page_id', 'title', 'markdown'],
    },
    execute: notion.createPage,
  },

  // ── HubSpot ─────────────────────────────────────────────────────────────
  {
    name: 'hubspot_deals',
    description: 'List HubSpot deals. Returns id, name, amount, stage, close_date, last_modified, owner. Use to see pipeline + closing activity. Watch for stale records (last_modified >30d with no closed stage) and flag them.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Default 50, max 100.' },
        stage: { type: 'string', description: 'Optional stage filter (internal name).' },
        modified_since: { type: 'string', description: 'ISO date — only deals modified after this.' },
      },
    },
    execute: hubspot.listDeals,
  },
  {
    name: 'hubspot_contacts',
    description: 'List HubSpot contacts. Returns id, email, name, company, lifecyclestage, last_modified. Use to check who is in the pipeline / recently engaged.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        search: { type: 'string', description: 'Free-text search across name/email/company.' },
      },
    },
    execute: hubspot.listContacts,
  },
  {
    name: 'hubspot_pipeline_overview',
    description: 'Summary of deal pipeline: count + total amount per stage, plus deals flagged as stale (no update >30d). Use for a quick health check.',
    input_schema: { type: 'object', properties: {} },
    execute: hubspot.pipelineOverview,
  },

  // ── BI / internal ──────────────────────────────────────────────────────
  {
    name: 'bi_fetch',
    description: 'Fetch the latest GTM / BI data (funnel, channel mix, launches, conversion) from the internal BI snapshot. Returns the full JSON. Use to ground claims about top-of-funnel, ad channels, and recent product launches.',
    input_schema: { type: 'object', properties: {} },
    execute: bi.fetch,
  },

  // ── Burn / finance ──────────────────────────────────────────────────────
  {
    name: 'read_burn_csv',
    description: 'Read the uploaded burn / finance CSV. Returns parsed rows. Use for monthly burn, runway, spend categories.',
    input_schema: { type: 'object', properties: {} },
    execute: burn.read,
  },

  // ── Knowledge bank ─────────────────────────────────────────────────────
  {
    name: 'kb_get_item',
    description: 'Read the full body of a single knowledge-bank item by id. The KB manifest (id, name, type, notes, preview) is already in your context — only call this when you actually need the full content. For text/csv/json items returns content as a string; for images and other binary returns base64 with mime + size so you can describe or hand off.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'KB item id (looks like kb_xxxxxxxx).' } },
      required: ['id'],
    },
    execute: kb.tool_kb_get_item,
  },

  // ── Web fetch ──────────────────────────────────────────────────────────
  {
    name: 'fetch_url',
    description: 'Fetch any public URL (pitch deck, landing page, competitor site, blog post, etc.) and return the main text content. Use when Cam references a link he wants you to read, or when you need to verify something on a public website.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL including https://' },
        max_chars: { type: 'number', description: 'Max characters of content to return. Default 40000.' },
      },
      required: ['url'],
    },
    execute: web.fetchUrl,
  },
];

export const tools = TOOL_DEFS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

const dispatch = Object.fromEntries(TOOL_DEFS.map((t) => [t.name, t.execute]));

export async function executeTool(name, input) {
  const fn = dispatch[name];
  if (!fn) throw new Error(`Unknown tool: ${name}`);
  return await fn(input || {});
}
