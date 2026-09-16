// AI fit read for the VC CRM (/raise): given one fund's data, the model writes a
// short honest brief on whether it's a real fit for the SpotsNow seed round,
// and proposes rubric dims when the fund is ungraded. Auth: sn_vc cookie.
// Provider: OpenAI when OPENAI_API_KEY is set, else Anthropic (ANTHROPIC_API_KEY).
import Anthropic from '@anthropic-ai/sdk';
import { verifySession, classifyEmail } from '../lib/auth.js';

const MODEL = 'claude-sonnet-5';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// One text-in / text-out call, routed to whichever provider is configured.
// Prefers OpenAI (JSON mode) so the CRM keeps working while Anthropic is capped.
let LAST_PROVIDER = null;   // which provider answered the most recent call
async function callLLM({ system, user, maxTokens }) {
  const oaiKey = process.env.OPENAI_API_KEY;
  if (oaiKey) {
    LAST_PROVIDER = 'openai:' + OPENAI_MODEL;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + oaiKey },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d.error && d.error.message) || ('OpenAI HTTP ' + r.status));
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
  }
  const anthKey = process.env.ANTHROPIC_API_KEY;
  if (!anthKey) throw new Error('No OPENAI_API_KEY or ANTHROPIC_API_KEY configured');
  LAST_PROVIDER = 'anthropic:' + MODEL;
  const client = new Anthropic({ apiKey: anthKey });
  const msg = await client.messages.create({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
  return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

const SYSTEM = `You grade venture funds for SpotsNow's $3M seed raise and write short, SPECIFIC fit briefs. Cam Pritchard is the founder/CEO.

NAMING (critical): The company is ALWAYS called SpotsNow. Do NOT use the word "Station" (or "Drop Station"/"station.page") ANYWHERE in your output - that was this team's earlier, now-pivoted product, not what you are grading. A fund's provided history may mention Station because this SAME team pitched them an earlier product; when it does, refer to it only as "prior contact with the team" or "an earlier pitch from this team" and write your verdict entirely about SpotsNow today. Never imply the company being raised is Station.

WHAT SPOTSNOW IS: The agentic backend for creator advertising - the marketplace where brands (or AI agents) research, buy, and measure host-read podcast + YouTube campaigns in ~60 seconds instead of weeks. It scores 59,000+ shows on ROAS history, builds a full media plan with CPMs and ROI forecast, and books with payment protection - already live inside Claude and ChatGPT. Supply side: shows onboard to sell unsold inventory (Hotel Tonight GTM), then stay for AI tools that double their margins.

TRACTION (Sept 2026): $18.8K/mo revenue run rate, $1.1M annual GMV run rate, 7.2X growth in 3 months, 801 shows onboarded (more sellable host-read shows than iHeart), 102M sellable impressions, 3.5x campaign ROAS (5.0x top show). Brands powered include Walmart (using SpotsNow for their supply-marketplace launch), Liquid IV, Bolt, Nanit, Cozy Earth, TurboTax, Toyota. First $14K signed for creator tooling. Pre-seed: $1.6M from Brickyard + Hustle Fund.

MARKET: TAM $35.5B (YouTube + influencer + podcast), SAM $5.4B, SOM $1.1B, initial target $102M ARR. U.S. podcast ads $2.4B (+25% YoY). Take rate 10-15%. Team: Campbell Pritchard (ex-product Thumbtack/Setter [Sequoia, acq.]/Sensibill, 2 exits, ex-podcaster, ex-ad-agency owner) + Abhishek Thory (founding eng; the team previously built a creator platform to 150K users, including creators like the Kelces - that earlier product is NOT what you are grading). Raising a $3M SEED to sprint to $3M ARR by mid-2027 (30% sales, 25% AI/infra, 25% marketing, 20% platform/R&D).

MOAT / WHY THEY WIN: Every competitor (Spotify, Gumball, Acast, CreatorX, Agentio) is building smarter buying intelligence. SpotsNow fixes the SUPPLY side first - making creator inventory bookable in minutes - so agents can actually buy inventory no one else can reach. Each campaign compounds their conversion data.

FIVE THESIS SURFACES a fund can hit: (1) marketplaces / network effects, (2) creator economy / media / entertainment, (3) adtech / ad measurement / martech, (4) AI-native + agentic + data moats, (5) commerce / vertical SaaS for media businesses. Two or more = strong thesis fit. A pure enterprise-infra, biotech, climate, hardware, or fintech-only fund is a weak thesis fit and must score low - do NOT hand out generic "good fit" language to funds that don't actually touch these surfaces.

PROFILE FIRST, THEN MATCH: Before scoring, build a quick internal profile of THIS fund from website_text (scraped live from their own site just now - treat it as current truth ABOVE your training memory) plus your own knowledge: (a) their stage focus, (b) typical check size, (c) whether they look ACTIVELY INVESTING right now (recent portfolio adds, a current/open fund, no 'fund fully deployed' or 'not currently investing' signals), and (d) one or two portfolio companies adjacent to SpotsNow. Only then score. When there is no website_text, use your best knowledge of the fund by name; if the fund is genuinely unidentifiable, say so and use null dims rather than inventing details.

ANSWER THESE FOUR QUESTIONS in the brief, concretely, for THIS fund:
1. CHECK: will they write in our range (a $1-3M lead, or $250K-$1.5M participation in a $3M seed)?
2. CATEGORY: are they actually interested in our category (the five surfaces below), or is it a stretch?
3. ACTIVE: do they look like they're actively investing now, or dormant / between funds? If you cannot tell, say so plainly rather than assuming yes.
4. PORTFOLIO: do they have portfolio companies similar to SpotsNow (marketplaces, creator/media, adtech, AI-commerce)? Name one if so.

RUBRIC DIMS (0-100), weights thesis .30 / stage .25 / check .20 / portfolio .15 / geo .10:
- thesis: how many of the five surfaces they hit, and how central creator/marketplace/adtech is to them.
- stage: pre-seed/seed leads = high; multistage that does seed = mid-high; growth/Series B+ only = low. If they look dormant or not currently deploying, lower this and say so.
- check: for a $3M seed, a $1-3M lead or $250K-$1.5M participation = high; sub-$100K or $10M+ only = low. If check size is unknown, infer from stage and say it's an estimate.
- portfolio: adjacency to marketplaces/creator/adtech/AI-commerce = high; a DIRECT competitor (podcast/creator ad marketplace, e.g. backers of Agentio/Spotify-ads/Acast) = cap 40 and say so.
- geo: US high (Southeast/Nashville highest given the team), Europe/Asia lower.

RULES: Be honest and specific - a weak fit gets called weak WITH the concrete reason (their actual focus). Never invent facts; if unsure, hedge and lower the score. Vary the language - no boilerplate. American spelling. No em-dashes.

Return STRICT JSON only, no markdown fences:
{"dims": {"thesis":n,"stage":n,"check":n,"portfolio":n,"geo":n}, "one_liner": "under 12 words, the specific verdict", "brief": "2-4 tight sentences that concretely answer the four questions above (check range, category, actively investing, similar portfolio) grounded in THIS fund's real data, plus any provided history"}
Always return dims unless the fund is genuinely unidentifiable (then dims: null). Do NOT use double quotes or line breaks inside any string value (use single quotes if you must quote).`;

async function fetchSiteText(site) {
  if (!site) return '';
  const url = /^https?:\/\//i.test(site) ? site : 'https://' + site;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 SpotsNow-fit-check' } });
    clearTimeout(t);
    if (!r.ok) return '';
    let html = await r.text();
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, 4000);
  } catch { return ''; }
}

async function authed(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookie = req.headers.cookie || '';
  const gm = cookie.match(/(?:^|; )sn_user=([^;]+)/);
  if (gm) { const s = await verifySession(gm[1], secret); if (s && ['ceo','team'].includes(classifyEmail(s.email))) return true; }
  const m = cookie.match(/(?:^|; )sn_vc=([^;]+)/);
  return m ? !!(await verifySession(m[1], secret)) : false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  if (!(await authed(req))) return res.status(401).json({ error: 'locked' });
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'No OPENAI_API_KEY or ANTHROPIC_API_KEY configured' });
  }

  const { fund, angle } = req.body || {};
  if (!fund || !fund.name) return res.status(400).json({ error: 'fund required' });

  // Ground the read: pull the fund's live website copy (fast, cheap). If there's
  // no site, the model uses its own knowledge of the fund by name.
  const websiteText = await fetchSiteText(fund.site);

  // Angle mode: one persuasive sentence connecting SpotsNow to THIS fund, for a
  // warm intro. Positive and specific - the reason a connector would make the intro.
  if (angle) {
    const anglePayload = {
      name: fund.name, site: fund.site, sectors: fund.sectors, region: fund.region,
      about: (fund.looking || '').slice(0, 900), history: (fund.ctx || []).slice(0, 10),
      website_text: websiteText || null
    };
    try {
      const t3 = await callLLM({ system: SYSTEM, maxTokens: 300,
        user: 'Fund data:\n' + JSON.stringify(anglePayload) +
          "\n\nWrite ONE warm, first-person sentence in Cam's voice that he can paste straight into an outreach email to THIS fund. It must make clear WHY SpotsNow is specifically relevant to them by tying a concrete SpotsNow strength to their actual thesis, portfolio, or a named bet - so it reads like Cam genuinely knows and wants this fund, not a mail-merge. Casual founder tone, confident, specific, no hype words, no buzzwords, no em-dashes, American spelling, use contractions. Use the fund's real name and start with 'Would love to include " + (fund.name || 'them') + " ...' or very similar. Example of the STYLE only (do not copy the content - adapt entirely to THIS fund): 'Would love to include Courtside in the round given our media presence in sports and the rise of athletes starting shows.' Return STRICT JSON only: {\"angle\":\"...\"}" });
      let a = '';
      const jm3 = t3.match(/\{[\s\S]*\}/);
      if (jm3) { try { a = JSON.parse(jm3[0]).angle || ''; } catch { const mm = t3.match(/"angle"\s*:\s*"((?:[^"\\]|\\.)*)"/); a = mm ? mm[1] : ''; } }
      if (!a) a = t3.trim();
      return res.status(200).json({ angle: String(a || '').replace(/^["']|["']$/g, '').slice(0, 240), provider: LAST_PROVIDER });
    } catch (err) {
      return res.status(500).json({ error: String(err?.message || err) });
    }
  }

  const payload = {
    name: fund.name, site: fund.site, type: fund.type, region: fund.region,
    check_k: fund.check, sectors: fund.sectors, tier: fund.tier,
    about: (fund.looking || '').slice(0, 900),
    current_dims: fund.dims || null,
    people: (fund.people || []).slice(0, 5),
    history: (fund.ctx || []).slice(0, 14),
    paths: (fund.paths || []).slice(0, 6),
    website_text: websiteText || null
  };

  try {
    const text = await callLLM({ system: SYSTEM, maxTokens: 1000,
      user: 'Fund data:\n' + JSON.stringify(payload) });
    const jm = text.match(/\{[\s\S]*\}/);
    if (!jm) return res.status(502).json({ error: 'unparseable model output' });
    let out;
    try {
      out = JSON.parse(jm[0]);
    } catch {
      // Model sometimes emits an unescaped quote/newline in the brief. Salvage
      // the fields by regex rather than failing the whole read.
      const dm = {};
      for (const k of ['thesis','stage','check','portfolio','geo']) {
        const mm = text.match(new RegExp('"' + k + '"\\s*:\\s*(\\d+(?:\\.\\d+)?)'));
        if (mm) dm[k] = Number(mm[1]);
      }
      const ol = text.match(/"one_liner"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const br = text.match(/"brief"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      out = { brief: br ? br[1] : '', one_liner: ol ? ol[1] : '',
              dims: Object.keys(dm).length === 5 ? dm : null };
      if (!out.brief && !out.dims && !out.one_liner) return res.status(502).json({ error: 'unparseable model output' });
    }
    const dims = out.dims && typeof out.dims === 'object'
      && ['thesis','stage','check','portfolio','geo'].every(k => Number.isFinite(out.dims[k]))
      ? out.dims : null;
    return res.status(200).json({
      brief: String(out.brief || '').slice(0, 1200),
      one_liner: String(out.one_liner || '').slice(0, 120),
      dims: dims,
      provider: LAST_PROVIDER
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 120 };
