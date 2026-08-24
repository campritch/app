// AI fit read for the VC CRM (/raise): given one fund's data, Claude writes a
// short honest brief on whether it's a real fit for the SpotsNow seed round,
// and proposes rubric dims when the fund is ungraded. Auth: sn_vc cookie.
import Anthropic from '@anthropic-ai/sdk';
import { verifySession } from '../lib/auth.js';

const MODEL = 'claude-sonnet-5';

const SYSTEM = `You grade venture funds for SpotsNow's seed raise and write short fit briefs.

THE PITCH: SpotsNow is the "Hotel Tonight for podcast advertising" - the marketplace where brands research, buy, and measure host-read campaigns across 59,000+ shows in minutes instead of weeks. $500K GMV processed, ~$15K/mo revenue at a 10-15% take rate, 800+ shows onboarded (more host-read listings than iHeart), first campaigns beating Meta/Google at 3.5x ROAS. TAM $35.5B (podcast + YouTube creator media). Moat: proprietary conversion data ("each campaign builds our brain"), already callable inside Claude. Team: 2x-exit founder ex-Thumbtack/Setter product + eng co-founder; backed by Brickyard and Hustle Fund. Raising seed toward $2M ARR.

FIVE THESIS SURFACES a fund can hit: (1) marketplaces/network effects, (2) creator economy/media, (3) adtech/measurement, (4) AI-native + data moats, (5) vertical SaaS for media businesses. Two or more = strong thesis fit.

RUBRIC DIMS (0-100): thesis (.30), stage (.25 - pre-seed/seed leads score high, growth low), check (.20 - $250K-$1.5M participate or $1M-$3M lead is ideal), portfolio (.15 - adjacent portfolio pattern, direct competitor = cap 40), geo (.10 - US high, Southeast highest, Europe lower).

RULES: Be honest - a weak fit gets called weak, with the reason. Never invent portfolio companies or facts not in the provided data; if the data is thin, say the read is low-confidence. Use any history/quotes provided (a prior pass, a re-approach angle) - that context matters most. American spelling. No em-dashes.

Return STRICT JSON only, no markdown fences:
{"brief": "3-5 sentences: is this fund actually worth Cam's time and why/why not, citing their thesis and any history", "dims": {"thesis":n,"stage":n,"check":n,"portfolio":n,"geo":n} or null, "one_liner": "under 12 words, the verdict"}
Set dims ONLY if the input had no dims and the data supports an estimate; else null.`;

async function authed(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|; )sn_vc=([^;]+)/);
  return m ? !!(await verifySession(m[1], secret)) : false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  if (!(await authed(req))) return res.status(401).json({ error: 'locked' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { fund } = req.body || {};
  if (!fund || !fund.name) return res.status(400).json({ error: 'fund required' });

  // Only pass through known fields, trimmed - the model needs signal, not bulk.
  const payload = {
    name: fund.name, site: fund.site, type: fund.type, region: fund.region,
    check_k: fund.check, sectors: fund.sectors, tier: fund.tier,
    about: (fund.looking || '').slice(0, 900),
    current_dims: fund.dims || null,
    people: (fund.people || []).slice(0, 5),
    history: (fund.ctx || []).slice(0, 14),
    paths: (fund.paths || []).slice(0, 6)
  };

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: 'Fund data:\n' + JSON.stringify(payload) }]
    });
    const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const jm = text.match(/\{[\s\S]*\}/);
    if (!jm) return res.status(502).json({ error: 'unparseable model output' });
    const out = JSON.parse(jm[0]);
    const dims = out.dims && typeof out.dims === 'object'
      && ['thesis','stage','check','portfolio','geo'].every(k => Number.isFinite(out.dims[k]))
      ? out.dims : null;
    return res.status(200).json({
      brief: String(out.brief || '').slice(0, 1200),
      one_liner: String(out.one_liner || '').slice(0, 120),
      dims: fund.dims ? null : dims
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 60 };
