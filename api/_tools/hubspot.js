// HubSpot adapter: deals, contacts, pipeline overview.
// Env: HUBSPOT_PRIVATE_APP_TOKEN (private app token with crm.objects.deals.read + crm.objects.contacts.read).

const BASE = 'https://api.hubapi.com';

function assertToken() {
  const t = process.env.HUBSPOT_PRIVATE_APP_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
  if (!t) throw new Error('HUBSPOT_PRIVATE_APP_TOKEN not set');
  return t;
}

async function hubReq(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${assertToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const DEAL_PROPS = ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'hs_lastmodifieddate', 'hubspot_owner_id', 'hs_deal_stage_probability'];

export async function listDeals({ limit = 50, stage, modified_since } = {}) {
  limit = Math.min(limit || 50, 100);

  if (modified_since || stage) {
    const filters = [];
    if (modified_since) filters.push({ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: new Date(modified_since).getTime() });
    if (stage) filters.push({ propertyName: 'dealstage', operator: 'EQ', value: stage });
    const data = await hubReq('/crm/v3/objects/deals/search', {
      method: 'POST',
      body: {
        filterGroups: [{ filters }],
        properties: DEAL_PROPS,
        limit,
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      },
    });
    return { count: data.total, deals: (data.results || []).map(mapDeal) };
  }

  const qs = `?limit=${limit}&properties=${DEAL_PROPS.join(',')}`;
  const data = await hubReq(`/crm/v3/objects/deals${qs}`);
  return { count: data.results?.length || 0, deals: (data.results || []).map(mapDeal) };
}

function mapDeal(d) {
  const p = d.properties || {};
  const lastMod = p.hs_lastmodifieddate ? new Date(p.hs_lastmodifieddate) : null;
  const ageDays = lastMod ? Math.round((Date.now() - lastMod.getTime()) / 86400000) : null;
  return {
    id: d.id,
    name: p.dealname || '(unnamed)',
    amount: p.amount ? Number(p.amount) : null,
    stage: p.dealstage || null,
    pipeline: p.pipeline || null,
    close_date: p.closedate || null,
    last_modified: p.hs_lastmodifieddate || null,
    days_since_update: ageDays,
    owner_id: p.hubspot_owner_id || null,
    stale: ageDays != null && ageDays > 30,
  };
}

const CONTACT_PROPS = ['email', 'firstname', 'lastname', 'company', 'lifecyclestage', 'hs_lastmodifieddate'];

export async function listContacts({ limit = 25, search } = {}) {
  limit = Math.min(limit || 25, 100);
  if (search) {
    const data = await hubReq('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: { query: search, properties: CONTACT_PROPS, limit },
    });
    return { count: data.total, contacts: (data.results || []).map(mapContact) };
  }
  const qs = `?limit=${limit}&properties=${CONTACT_PROPS.join(',')}`;
  const data = await hubReq(`/crm/v3/objects/contacts${qs}`);
  return { count: data.results?.length || 0, contacts: (data.results || []).map(mapContact) };
}

function mapContact(c) {
  const p = c.properties || {};
  return {
    id: c.id,
    email: p.email || null,
    name: [p.firstname, p.lastname].filter(Boolean).join(' ') || null,
    company: p.company || null,
    lifecyclestage: p.lifecyclestage || null,
    last_modified: p.hs_lastmodifieddate || null,
  };
}

export async function pipelineOverview() {
  const data = await hubReq('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: {
      filterGroups: [],
      properties: DEAL_PROPS,
      limit: 100,
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    },
  });
  const deals = (data.results || []).map(mapDeal);
  const byStage = {};
  const stale = [];
  for (const d of deals) {
    const k = d.stage || 'unknown';
    byStage[k] ||= { count: 0, total_amount: 0 };
    byStage[k].count += 1;
    if (d.amount) byStage[k].total_amount += d.amount;
    if (d.stale && !/closed/i.test(k)) stale.push({ id: d.id, name: d.name, amount: d.amount, stage: d.stage, days_since_update: d.days_since_update });
  }
  return {
    total_deals_sampled: deals.length,
    by_stage: byStage,
    stale_deals: stale,
    caveat: 'Sampled top-100 by last_modified. Stale = no update in >30 days (and not closed). Flag these with Cam — they may be abandoned or just not updated.',
  };
}
