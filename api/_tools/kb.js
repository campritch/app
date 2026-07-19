// Knowledge bank: persistent uploaded files (text, CSV, PDF text, images, etc.).
// Stored in Vercel Blob: kb/_index.json (manifest) + kb/{id} (file body).
// Mirrors the fathom transcript pattern: manifest is injected into the agent
// context so it knows what's available without a tool call; the agent only
// pulls a body when it actually needs to read.

const MANIFEST_KEY = 'kb/_index.json';

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
  if (!mod) return null;
  return await mod.put(key, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function writeBinaryBlob(key, buffer, mime) {
  const mod = await getBlobClient();
  if (!mod) throw new Error('BLOB_READ_WRITE_TOKEN required');
  return await mod.put(key, buffer, {
    access: 'private',
    contentType: mime || 'application/octet-stream',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function readBinaryBlob(key) {
  const mod = await getBlobClient();
  if (!mod) return null;
  try {
    const r = await mod.get(key, { access: 'private' });
    if (!r || !r.stream) return null;
    return new Uint8Array(await new Response(r.stream).arrayBuffer());
  } catch { return null; }
}

async function deleteBlob(key) {
  const mod = await getBlobClient();
  if (!mod) return;
  try {
    const { blobs } = await mod.list({ prefix: key, limit: 5 });
    const match = blobs.find((b) => b.pathname === key);
    if (match) await mod.del(match.url);
  } catch (err) {
    console.warn('kb deleteBlob failed', err);
  }
}

function classify(name, mime) {
  const n = (name || '').toLowerCase();
  if ((mime || '').startsWith('image/')) return 'image';
  if (n.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (n.endsWith('.csv') || mime === 'text/csv') return 'csv';
  if (n.endsWith('.md') || n.endsWith('.txt') || (mime || '').startsWith('text/')) return 'text';
  if (n.endsWith('.json') || mime === 'application/json') return 'json';
  return 'other';
}

function newId() {
  return 'kb_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export async function listManifest() {
  const m = await readJsonBlob(MANIFEST_KEY);
  return Array.isArray(m?.items) ? m.items : [];
}

export async function listKb() {
  const items = await listManifest();
  return { count: items.length, items };
}

export async function uploadKb({ name, mime, body_b64, notes }) {
  if (!name || !body_b64) throw new Error('name and body_b64 required');
  const buf = Buffer.from(body_b64, 'base64');
  const id = newId();
  const safeName = name.replace(/[^\w.\-]+/g, '_').slice(0, 200);
  const blobKey = `kb/${id}/${safeName}`;
  await writeBinaryBlob(blobKey, buf, mime);

  const type = classify(name, mime);
  const item = {
    id,
    name,
    type,
    mime: mime || 'application/octet-stream',
    bytes: buf.length,
    blob_key: blobKey,
    notes: notes || '',
    uploaded_at: new Date().toISOString(),
  };

  // For text-y types, store a preview inline so the agent can scan without a fetch
  if (['text', 'csv', 'json'].includes(type) && buf.length < 200_000) {
    item.preview = buf.toString('utf-8').slice(0, 6000);
  }

  const items = await listManifest();
  items.unshift(item);
  await writeJsonBlob(MANIFEST_KEY, { items, updated_at: new Date().toISOString() });
  return item;
}

export async function readKbItem({ id }) {
  if (!id) throw new Error('id required');
  const items = await listManifest();
  const item = items.find((it) => it.id === id);
  if (!item) throw new Error(`kb item ${id} not found`);
  const bytes = await readBinaryBlob(item.blob_key);
  if (!bytes) throw new Error(`kb item ${id} body missing`);
  // Text-like → return as text. Binary → return base64 with a description.
  if (['text', 'csv', 'json'].includes(item.type)) {
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      bytes: item.bytes,
      content: Buffer.from(bytes).toString('utf-8'),
    };
  }
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    mime: item.mime,
    bytes: item.bytes,
    note: 'Binary file. base64-encoded body returned for downstream use.',
    body_b64: Buffer.from(bytes).toString('base64'),
  };
}

export async function deleteKb({ id }) {
  if (!id) throw new Error('id required');
  const items = await listManifest();
  const idx = items.findIndex((it) => it.id === id);
  if (idx < 0) return { deleted: false };
  const item = items[idx];
  await deleteBlob(item.blob_key);
  items.splice(idx, 1);
  await writeJsonBlob(MANIFEST_KEY, { items, updated_at: new Date().toISOString() });
  return { deleted: true };
}

export async function clearKb() {
  const items = await listManifest();
  for (const it of items) await deleteBlob(it.blob_key);
  await writeJsonBlob(MANIFEST_KEY, { items: [], updated_at: new Date().toISOString() });
  return { deleted: items.length };
}

// Tool entry: lets the agent fetch a single item by id.
export async function tool_kb_get_item({ id }) {
  return await readKbItem({ id });
}
