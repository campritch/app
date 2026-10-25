// AI fit read for the VC CRM (/raise): given one fund's data, the model writes a
// short honest brief on whether it's a real fit for the SpotsNow seed round,
// and proposes rubric dims when the fund is ungraded. Auth: sn_vc cookie.
// Provider: OpenAI when OPENAI_API_KEY is set, else Anthropic (ANTHROPIC_API_KEY).
import Anthropic from '@anthropic-ai/sdk';
import { verifySession, classifyEmail } from '../lib/auth.js';

const MODEL = 'claude-sonnet-5';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const OPENAI_DEEP_MODEL = process.env.OPENAI_DEEP_MODEL || 'gpt-4o';   // model used for the web-search "deep grade"

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

// Web-search-grounded call (OpenAI Responses API + web_search tool): the model
// googles the fund, reads the results, and reasons over them - for a
// high-conviction "deep" grade instead of a homepage read. JSON mode isn't
// available alongside the search tool, so we instruct JSON and the caller parses
// tolerantly (same extractor as the normal grade).
async function callLLMSearch({ system, user, maxTokens }) {
  const oaiKey = process.env.OPENAI_API_KEY;
  if (!oaiKey) throw new Error('OPENAI_API_KEY required for the deep (web) grade');
  LAST_PROVIDER = 'openai-search:' + OPENAI_DEEP_MODEL;
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + oaiKey },
    body: JSON.stringify({
      model: OPENAI_DEEP_MODEL,
      tools: [{ type: 'web_search_preview' }],
      instructions: system,
      input: user,
      max_output_tokens: maxTokens
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || ('OpenAI HTTP ' + r.status));
  if (typeof d.output_text === 'string' && d.output_text.trim()) return d.output_text;
  if (Array.isArray(d.output)) {
    return d.output
      .filter(o => o.type === 'message')
      .flatMap(o => (o.content || []).filter(c => typeof c.text === 'string').map(c => c.text))
      .join('\n');
  }
  return '';
}

const SYSTEM = `You grade venture funds for SpotsNow's $3M raise (ahead of a mid-2027 Series A) and write short, SPECIFIC fit briefs. Cam Pritchard is the founder/CEO.

NAMING: The company being raised is ALWAYS SpotsNow. "Station" (the founding engineer's earlier product, which scaled to ~150K users) may be referenced ONLY as prior-team credibility or prior contact - never as the company being raised today. If a fund's history mentions Station, treat it as "an earlier pitch from this team" and write your verdict entirely about SpotsNow.

WHAT SPOTSNOW IS: AppLovin for media creators (YouTube, streamers, podcasters) - the agentic platform where brands and AI agents plan, book, and optimize creator-led ad campaigns at scale, and creators get their unsold ad inventory sold. Running a creator-read ad takes 3-4 weeks of back-and-forth today; doing it agentically is what finally lets this channel scale. Supply-first: creators onboard to sell unsold inventory, then stay for the tooling.

TRACTION: 6.8X growth in the last 3 months. $1.1M GMV run rate, $18.8K/mo revenue. Of ~$32B in creator ad inventory, about half goes unsold because it's hard to buy. 950 sellable creators onboarded - more creator-read inventory than iHeartMedia - and SpotsNow owns none of it. 3.5x campaign ROAS (5.0x on top shows), including small brands with no agency. Brands powered: Walmart, TurboTax, Toyota, Liquid IV, super.com, Bolt.

MARKET & TEAM: ~$32B of creator ad inventory, roughly half of it unsold. Raising $3M ahead of a mid-2027 Series A ($1M circled, some already wired). Founder Cam Pritchard: ex-product leader at Thumbtack ($3B marketplace), two prior exits. Founding engineer built the Kelce brothers' New Heights fan club and scaled Station to 150K users. Backed by Hustle Fund and Brickyard.

MOAT / WHY THEY WIN: SpotsNow fixes the SUPPLY side first - making unsold creator inventory bookable in minutes - so agents and brands can buy inventory no one else can reach. Competitors focus on smarter buying; SpotsNow owns the supply plus the agentic workflow, and each campaign compounds its conversion data. Think AppLovin's performance ad network, but for human creators.

FIVE THESIS SURFACES a fund can hit: (1) marketplaces / network effects, (2) creator economy / media / entertainment (YouTube, streaming, podcasts), (3) adtech / performance marketing / ad measurement (AppLovin-style ad networks), (4) AI-native + agentic + data moats, (5) commerce / vertical SaaS for media businesses. Two or more = strong thesis fit. A pure enterprise-infra, biotech, climate, hardware, or fintech-only fund is a weak thesis fit and must score low - do NOT hand out generic "good fit" language to funds that don't actually touch these surfaces.

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

NOT AN INVESTOR: First decide whether this entity even IS a venture investor - a VC firm, micro-fund, angel, syndicate, accelerator, family office, or CVC that writes equity checks into startups. If instead it is a university, research lab or institute, government or public body, a nonprofit, a service/consulting/operating company, a bank/lender, or anything that does NOT make venture equity investments, it CANNOT be graded as a fund. In that case set "not_investor": true, set dims to null, and make the one_liner say what it actually is (e.g. 'University research lab, not an investor'). Do not hand it a fit score. When in doubt about a borderline case, say so in the brief and still grade it, but a clear non-investor (university, laboratory, research centre, ministry, operating company) is always not_investor:true.

RULES: Be honest and specific - a weak fit gets called weak WITH the concrete reason (their actual focus). Never invent facts; if unsure, hedge and lower the score. Vary the language - no boilerplate. American spelling. No em-dashes.

Return STRICT JSON only, no markdown fences:
{"not_investor": false, "dims": {"thesis":n,"stage":n,"check":n,"portfolio":n,"geo":n}, "one_liner": "under 12 words, the specific verdict", "brief": "2-4 tight sentences that concretely answer the four questions above (check range, category, actively investing, similar portfolio) grounded in THIS fund's real data, plus any provided history"}
Set not_investor:true (and dims:null) when the entity is not a venture investor at all. Otherwise return dims unless the fund is genuinely unidentifiable (then dims: null). Do NOT use double quotes or line breaks inside any string value (use single quotes if you must quote).`;

// Lead-vs-follow classifier. Reads the fund's own site copy plus a live web
// search of recent funding announcements to decide if they LEAD rounds.
const LEAD_SYSTEM = `You determine whether a venture investor LEADS rounds or only follows/participates, for a founder deciding who to prioritize. A LEAD writes the largest/anchor check, sets or negotiates the terms and price, usually takes a board seat, and is the investor named "led by" in funding announcements. A FOLLOW only participates in rounds someone else leads.

Use the fund's own website copy (provided below) PLUS a web search of their recent deals and portfolio. Look for explicit signals: "we lead", "lead investor", "we write the first check", "we take board seats", or being named as the lead in recent round announcements - versus "we participate", "we follow", "we co-invest", small participation checks, or always appearing alongside a named lead.

Pick ONE label:
- "lead": clearly leads rounds (at least at their core stage)
- "sometimes": leads some and follows others, or leads only at one stage and participates elsewhere
- "follow": only participates / follows, or explicitly does not lead
- "unknown": genuinely not enough signal to tell

Return STRICT JSON only, no markdown: {"lead":"lead|sometimes|follow|unknown","lead_note":"under 15 words - the concrete evidence (a quote or a named deal they led)"}. Do not use double quotes inside the note.`;

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

  const { fund, angle, deep } = req.body || {};
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

  // Lead check: classify lead vs follow from their site + a web search. A
  // separate, cheaper call than a full grade - just the one question.
  if (req.body.lead) {
    const leadPayload = {
      name: fund.name, site: fund.site, type: fund.type, region: fund.region,
      stage_focus: fund.tier || null, about: (fund.looking || '').slice(0, 600),
      website_text: websiteText || null
    };
    try {
      const txt = process.env.OPENAI_API_KEY
        ? await callLLMSearch({ system: LEAD_SYSTEM, maxTokens: 600,
            user: 'Investor:\n' + JSON.stringify(leadPayload) +
              '\n\nSearch the web for how ' + fund.name + ' actually invests - do they LEAD seed/early rounds or only follow? Base it on their site plus recent funding announcements. Return STRICT JSON only in the exact schema.' })
        : await callLLM({ system: LEAD_SYSTEM, maxTokens: 300,
            user: 'Investor:\n' + JSON.stringify(leadPayload) });
      let out = {};
      const jm = txt.match(/\{[\s\S]*\}/);
      if (jm) { try { out = JSON.parse(jm[0]); } catch { const lm = txt.match(/"lead"\s*:\s*"(\w+)"/); if (lm) out.lead = lm[1]; const nm = txt.match(/"lead_note"\s*:\s*"((?:[^"\\]|\\.)*)"/); if (nm) out.lead_note = nm[1]; } }
      const lead = ['lead', 'sometimes', 'follow', 'unknown'].includes(out.lead) ? out.lead : 'unknown';
      return res.status(200).json({ lead, lead_note: String(out.lead_note || '').slice(0, 120), provider: LAST_PROVIDER });
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
    const text = deep
      ? await callLLMSearch({ system: SYSTEM, maxTokens: 1400,
          user: 'Fund data (verify and ENRICH this with a live web search before grading):\n' + JSON.stringify(payload) +
            '\n\nSearch the web NOW for this specific fund and ground the grade in what you find:\n' +
            '- Their most recent investments (last ~12-24 months) and the stage of those deals.\n' +
            '- Typical check size, and whether they lead or follow.\n' +
            '- Whether they are ACTIVELY investing right now (a current/open fund or recent deals) vs fully deployed / between funds / winding down.\n' +
            '- Portfolio companies adjacent to SpotsNow (marketplaces, creator/media, adtech/measurement, AI-native/agentic, commerce) - name them.\n' +
            'Base every dim on what you actually found. In the brief, cite concrete portfolio companies and recent facts (with the year). If after searching you still cannot verify a fund, say so plainly and return dims:null rather than guessing. Return STRICT JSON only, in the exact schema specified - no citations markup, no markdown.' })
      : await callLLM({ system: SYSTEM, maxTokens: 1000,
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
    const notInvestor = out.not_investor === true || out.not_investor === 'true';
    const dims = (!notInvestor && out.dims && typeof out.dims === 'object'
      && ['thesis','stage','check','portfolio','geo'].every(k => Number.isFinite(out.dims[k])))
      ? out.dims : null;
    return res.status(200).json({
      brief: String(out.brief || '').slice(0, 1200),
      one_liner: String(out.one_liner || '').slice(0, 120),
      dims: dims,
      not_investor: notInvestor,
      provider: LAST_PROVIDER
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 120 };
