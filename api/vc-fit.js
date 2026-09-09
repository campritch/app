// AI fit read for the VC CRM (/raise): given one fund's data, Claude writes a
// short honest brief on whether it's a real fit for the SpotsNow seed round,
// and proposes rubric dims when the fund is ungraded. Auth: sn_vc cookie.
import Anthropic from '@anthropic-ai/sdk';
import { verifySession } from '../lib/auth.js';

const MODEL = 'claude-sonnet-5';

const SYSTEM = `You grade venture funds for SpotsNow's $3M seed raise and write short, SPECIFIC fit briefs. Cam Pritchard is the founder/CEO.

WHAT SPOTSNOW IS: The agentic backend for creator advertising - the marketplace where brands (or AI agents) research, buy, and measure host-read podcast + YouTube campaigns in ~60 seconds instead of weeks. It scores 59,000+ shows on ROAS history, builds a full media plan with CPMs and ROI forecast, and books with payment protection - already live inside Claude and ChatGPT. Supply side: shows onboard to sell unsold inventory (Hotel Tonight GTM), then stay for AI tools that double their margins.

TRACTION (Sept 2026): $18.8K/mo revenue run rate, $1.1M annual GMV run rate, 7.2X growth in 3 months, 801 shows onboarded (more sellable host-read shows than iHeart), 102M sellable impressions, 3.5x campaign ROAS (5.0x top show). Brands powered include Walmart (using SpotsNow for their supply-marketplace launch), Liquid IV, Bolt, Nanit, Cozy Earth, TurboTax, Toyota. First $14K signed for creator tooling. Pre-seed: $1.6M from Brickyard + Hustle Fund.

MARKET: TAM $35.5B (YouTube + influencer + podcast), SAM $5.4B, SOM $1.1B, initial target $102M ARR. U.S. podcast ads $2.4B (+25% YoY). Take rate 10-15%. Team: Campbell Pritchard (ex-product Thumbtack/Setter [Sequoia, acq.]/Sensibill, 2 exits, ex-podcaster, ex-ad-agency owner) + Abhishek Thory (founding eng, built Station/station.page to 150K users for creators like the Kelces). Raising a $3M SEED to sprint to $3M ARR by mid-2027 (30% sales, 25% AI/infra, 25% marketing, 20% platform/R&D).

MOAT / WHY THEY WIN: Every competitor (Spotify, Gumball, Acast, CreatorX, Agentio) is building smarter buying intelligence. SpotsNow fixes the SUPPLY side first - making creator inventory bookable in minutes - so agents can actually buy inventory no one else can reach. Each campaign compounds their conversion data.

FIVE THESIS SURFACES a fund can hit: (1) marketplaces / network effects, (2) creator economy / media / entertainment, (3) adtech / ad measurement / martech, (4) AI-native + agentic + data moats, (5) commerce / vertical SaaS for media businesses. Two or more = strong thesis fit. A pure enterprise-infra, biotech, climate, hardware, or fintech-only fund is a weak thesis fit and must score low - do NOT hand out generic "good fit" language to funds that don't actually touch these surfaces.

USE YOUR OWN KNOWLEDGE: You know most of these funds by name (their real thesis, stage, check size, notable portfolio, HQ). Ground the read in what you actually know about THIS fund - name a real portfolio company or their real focus when you can. If you genuinely don't recognize the fund and the row data is thin, say so and score conservatively (still return dims - a low-confidence estimate is fine; only use null if the fund is truly unidentifiable).

RUBRIC DIMS (0-100), weights thesis .30 / stage .25 / check .20 / portfolio .15 / geo .10:
- thesis: how many of the five surfaces they hit, and how central creator/marketplace/adtech is to them.
- stage: pre-seed/seed leads = high; multistage that does seed = mid-high; growth/Series B+ only = low.
- check: for a $3M seed, a $1-3M lead or $250K-$1.5M participation = high; sub-$100K or $10M+ only = low.
- portfolio: adjacency to marketplaces/creator/adtech/AI-commerce = high; a DIRECT competitor (podcast/creator ad marketplace, e.g. backers of Agentio/Spotify-ads/Acast) = cap 40 and say so.
- geo: US high (Southeast/Nashville highest given the team), Europe/Asia lower.

RULES: Be honest and specific - a weak fit gets called weak WITH the concrete reason (their actual focus). Never invent facts; if unsure, hedge. Vary the language - no boilerplate. American spelling. No em-dashes.

Return STRICT JSON only, no markdown fences:
{"brief": "2-4 sentences grounded in THIS fund's real thesis/portfolio and how it maps (or doesn't) to a specific SpotsNow surface, plus any provided history", "dims": {"thesis":n,"stage":n,"check":n,"portfolio":n,"geo":n}, "one_liner": "under 12 words, the specific verdict"}
Always return dims unless the fund is genuinely unidentifiable (then dims: null).`;

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
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: 'Fund data:\n' + JSON.stringify(payload) }]
    });
    const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const jm = text.match(/\{[\s\S]*\}/);
    if (!jm) return res.status(502).json({ error: 'unparseable model output', stop: msg.stop_reason, raw: text.slice(0, 400) });
    const out = JSON.parse(jm[0]);
    const dims = out.dims && typeof out.dims === 'object'
      && ['thesis','stage','check','portfolio','geo'].every(k => Number.isFinite(out.dims[k]))
      ? out.dims : null;
    return res.status(200).json({
      brief: String(out.brief || '').slice(0, 1200),
      one_liner: String(out.one_liner || '').slice(0, 120),
      dims: dims
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 60 };
