// Unified GTM data endpoint.
//
// GET /api/gtm-data
//   → returns the cached Mixpanel snapshot from data/gtm-latest.json (fast path)
//
// GET /api/gtm-data?live=1&range=N  (N in 3,7,14,30,90)
//   → live JQL pull from Mixpanel for that window, plus pre/post launch windows
//
// Any response also includes `ahrefs` with top organic keywords for spotsnow.io
// when AHREFS_API_TOKEN is configured and the Ahrefs call succeeds.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 3967486;
const EVENTS = [
  'landing_page_view',
  'landing_demographics_generate_click',
  'create_account_success',
  'campaign_planner_send_request_click',
  'book_a_call_success'
];
const VALID_RANGES = [3, 7, 14, 30, 90];

const cachedDataPath = fileURLToPath(new URL('../data/gtm-latest.json', import.meta.url));

/* ---------- Mixpanel JQL (live refresh) ---------- */

function mixpanelAuth() {
  const u = process.env.MIXPANEL_SERVICE_ACCOUNT;
  const s = process.env.MIXPANEL_SERVICE_SECRET;
  if (!u || !s) throw new Error('Mixpanel service account env vars not set');
  return 'Basic ' + Buffer.from(`${u}:${s}`).toString('base64');
}

async function runJQL(script, params) {
  const body = new URLSearchParams({
    script,
    params: JSON.stringify(params)
  });
  const res = await fetch(`https://mixpanel.com/api/2.0/jql?project_id=${PROJECT_ID}`, {
    method: 'POST',
    headers: {
      Authorization: mixpanelAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: body.toString()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mixpanel JQL ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

const TOTALS_JQL = `
function main() {
  return Events({
    from_date: params.from_date,
    to_date: params.to_date,
    event_selectors: params.events.map(function(e) { return { event: e }; })
  })
  .groupBy(["name"], mixpanel.reducer.count_unique("distinct_id"));
}
`.trim();

const CHANNELS_JQL = `
function main() {
  var events = ["landing_page_view", "landing_demographics_generate_click"];
  return Events({
    from_date: params.from_date,
    to_date: params.to_date,
    event_selectors: events.map(function(e) { return { event: e }; })
  })
  .groupBy(
    ["name", function(e) { return e.properties.utm_source || "undefined"; }],
    mixpanel.reducer.count_unique("distinct_id")
  );
}
`.trim();

function totalsFromJQL(rows) {
  const out = {};
  EVENTS.forEach(e => { out[e] = 0; });
  for (const row of rows) {
    const name = row.key[0];
    if (name in out) out[name] = row.value;
  }
  return {
    visitors: out.landing_page_view,
    generates: out.landing_demographics_generate_click,
    signups: out.create_account_success,
    requests: out.campaign_planner_send_request_click,
    calls: out.book_a_call_success
  };
}

function relabelSource(raw) {
  const s = String(raw || '').trim();
  if (!s || s === 'undefined' || s === 'null' || s === '(not set)' || s === '$direct') return 'Direct / untagged';
  if (/^\d{15,}$/.test(s)) return `Meta ad set (${s.slice(0, 8)})`;
  const lower = s.toLowerCase();
  if (lower === 'reddit') return 'Reddit';
  if (lower === 'podnews.net' || lower === 'podnews') return 'Podnews';
  if (lower === 'ig' || lower === 'instagram') return 'Instagram (organic)';
  if (lower === 'fb' || lower === 'facebook') return 'Facebook (organic)';
  return s;
}

function channelsFromJQL(rows, topN = 8) {
  const bySource = new Map();
  for (const row of rows) {
    const [eventName, utmRaw] = row.key;
    const label = relabelSource(utmRaw);
    if (!bySource.has(label)) bySource.set(label, { name: label, visits: 0, generates: 0 });
    const entry = bySource.get(label);
    if (eventName === 'landing_page_view') entry.visits += row.value;
    else if (eventName === 'landing_demographics_generate_click') entry.generates += row.value;
  }
  return Array.from(bySource.values())
    .filter(c => c.visits > 0 || c.generates > 0)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, topN);
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchWindow(from_date, to_date) {
  const [totalsRows, channelsRows] = await Promise.all([
    runJQL(TOTALS_JQL, { from_date, to_date, events: EVENTS }),
    runJQL(CHANNELS_JQL, { from_date, to_date })
  ]);
  return {
    totals: totalsFromJQL(totalsRows),
    channels: channelsFromJQL(channelsRows)
  };
}

async function fetchLaunchWindow(from_date, to_date) {
  const rows = await runJQL(TOTALS_JQL, { from_date, to_date, events: EVENTS });
  return { from: from_date, to: to_date, ...totalsFromJQL(rows) };
}

async function livePull(range) {
  const from_date = isoDaysAgo(range - 1);
  const to_date = today();
  const [current, pre, post] = await Promise.all([
    fetchWindow(from_date, to_date),
    fetchLaunchWindow('2026-03-31', '2026-04-09'),
    fetchLaunchWindow('2026-04-10', '2026-04-19')
  ]);
  return {
    generated_at: new Date().toISOString(),
    source: `mixpanel:${PROJECT_ID}:live`,
    primary_metric: 'landing_demographics_generate_click',
    range,
    window: { from: from_date, to: to_date },
    totals: current.totals,
    channels: current.channels,
    launch_windows: { pre, post }
  };
}

/* ---------- Ahrefs (best-effort, non-blocking) ---------- */

async function fetchAhrefs(limit = 25) {
  const token = process.env.AHREFS_API_TOKEN;
  if (!token) return null;
  const params = new URLSearchParams({
    target: 'spotsnow.io',
    country: 'us',
    mode: 'subdomains',
    date: today(),
    volume_mode: 'monthly',
    select: 'keyword,volume,sum_traffic,best_position,url',
    order_by: 'best_position:asc',
    limit: String(limit)
  });
  try {
    const r = await fetch(`https://api.ahrefs.com/v3/site-explorer/organic-keywords?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (!r.ok) return { error: `Ahrefs ${r.status}` };
    const data = await r.json();
    const rows = (data.keywords || data.organic_keywords || data.data || []).map(k => ({
      keyword: k.keyword,
      volume: k.volume ?? 0,
      traffic: k.sum_traffic ?? k.traffic ?? 0,
      position: k.best_position ?? k.position ?? null
    })).filter(k => k.keyword);
    return {
      target: 'spotsnow.io',
      keyword_count: rows.length,
      keywords: rows
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

/* ---------- Cached snapshot ---------- */

function readCached() {
  const raw = readFileSync(cachedDataPath, 'utf-8');
  return JSON.parse(raw);
}

/* ---------- Handler ---------- */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET only' });
  }

  const live = req.query.live === '1' || req.query.live === 'true';
  const rangeParam = parseInt(req.query.range, 10);
  const range = VALID_RANGES.includes(rangeParam) ? rangeParam : 14;

  try {
    let payload;
    if (live) {
      payload = await livePull(range);
    } else {
      try {
        payload = readCached();
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          return res.status(404).json({ error: 'No GTM data cached yet', hint: 'Use ?live=1&range=N to pull fresh' });
        }
        throw err;
      }
    }

    // Ahrefs is best-effort: never let it fail the main response
    const ahrefs = await fetchAhrefs();
    if (ahrefs) payload.ahrefs = ahrefs;

    res.setHeader('Cache-Control', live ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(payload);
  } catch (err) {
    console.error('gtm-data error:', err);
    res.status(500).json({ error: 'gtm-data failed', detail: String(err.message || err) });
  }
}
