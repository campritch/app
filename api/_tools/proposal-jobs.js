// Campaign-proposal job store.
// A "job" is the spec a team member fills in on /campaign-proposal: the brand,
// target market, budget, proposal type, and any competitor-displacement or
// budget-maximize flags. The web front-door saves it here; the Claude
// `campaign-proposal-generator` skill reads it back, runs the SpotsNow + Apollo
// intelligence, and writes the resulting Notion URL back onto the job.
//
// Stored in Vercel Blob: proposals/_index.json (manifest). Mirrors the kb.js
// pattern so the whole feature stays on infra the app already runs.

const MANIFEST_KEY = 'proposals/_index.json';

async function getBlobClient() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try { return await import('@vercel/blob'); } catch { return null; }
}

async function readJsonBlob(key) {
  const mod = await getBlobClient();
  if (!mod) return null;
  try {
    const r = await mod.get(key, { access: 'private' });
    if (!r || !r.stream) return null;
    return JSON.parse(await new Response(r.stream).text());
  } catch { return null; }
}

async function writeJsonBlob(key, data) {
  const mod = await getBlobClient();
  if (!mod) throw new Error('BLOB_READ_WRITE_TOKEN required');
  return await mod.put(key, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function newId() {
  return 'prop_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const PROPOSAL_TYPES = new Set(['general', 'remnant']);

function sanitizeJob(input = {}) {
  const type = PROPOSAL_TYPES.has(input.proposal_type) ? input.proposal_type : 'general';
  const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  return {
    brand_name: clip(input.brand_name, 200),
    brand_domain: clip(input.brand_domain, 200).replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    target_market: clip(input.target_market, 4000),
    budget: clip(input.budget, 100),
    proposal_type: type,
    campaign_url: clip(input.campaign_url, 500),
    competitor_displacement: !!input.competitor_displacement,
    competitor_brand: clip(input.competitor_brand, 200),
    competitor_domain: clip(input.competitor_domain, 200).replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    maximize_budget: !!input.maximize_budget,
    notes: clip(input.notes, 6000),
  };
}

export async function listManifest() {
  const m = await readJsonBlob(MANIFEST_KEY);
  return Array.isArray(m?.items) ? m.items : [];
}

export async function listJobs() {
  const items = await listManifest();
  return { count: items.length, items };
}

export async function getJob({ id }) {
  if (!id) throw new Error('id required');
  const items = await listManifest();
  const job = items.find((it) => it.id === id);
  if (!job) throw new Error(`proposal job ${id} not found`);
  return job;
}

export async function createJob({ job, created_by }) {
  const clean = sanitizeJob(job);
  if (!clean.brand_name) throw new Error('brand_name required');
  if (!clean.target_market && clean.proposal_type === 'general') {
    throw new Error('target_market required for a general proposal');
  }
  const item = {
    id: newId(),
    ...clean,
    status: 'queued',
    notion_url: '',
    email_status: '',
    created_by: (created_by || '').slice(0, 200),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const items = await listManifest();
  items.unshift(item);
  await writeJsonBlob(MANIFEST_KEY, { items, updated_at: new Date().toISOString() });
  return item;
}

// Used by the skill (or the UI) to record generation results back onto a job.
export async function updateJob({ id, patch }) {
  if (!id) throw new Error('id required');
  const items = await listManifest();
  const idx = items.findIndex((it) => it.id === id);
  if (idx < 0) throw new Error(`proposal job ${id} not found`);
  const allowed = ['status', 'notion_url', 'email_status', 'notes'];
  const p = patch || {};
  for (const k of allowed) {
    if (k in p) items[idx][k] = typeof p[k] === 'string' ? p[k].slice(0, 6000) : p[k];
  }
  items[idx].updated_at = new Date().toISOString();
  await writeJsonBlob(MANIFEST_KEY, { items, updated_at: new Date().toISOString() });
  return items[idx];
}

export async function deleteJob({ id }) {
  if (!id) throw new Error('id required');
  const items = await listManifest();
  const idx = items.findIndex((it) => it.id === id);
  if (idx < 0) return { deleted: false };
  items.splice(idx, 1);
  await writeJsonBlob(MANIFEST_KEY, { items, updated_at: new Date().toISOString() });
  return { deleted: true };
}
