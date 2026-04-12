import AnthropicSDK from "@anthropic-ai/sdk";

const STATION_API = "https://station-api-693004779323.northamerica-northeast2.run.app";

function extractCampaignId(url) {
  const match = url.match(/\/c\/([0-9a-f-]{36})/);
  if (match) return match[1];
  const uuidMatch = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  return uuidMatch ? uuidMatch[1] : null;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "SpotsNow-TalkingPoints/1.0" },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function fetchPageText(url) {
  if (!url.startsWith("http")) url = "https://" + url;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    let html = await res.text();
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
    html = html.replace(/<[^>]+>/g, " ");
    html = html.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    html = html.replace(/&#\d+;/g, " ").replace(/\s+/g, " ");
    return html.trim().slice(0, 15000);
  } catch {
    return "";
  }
}

const SYSTEM_PROMPT = `You write podcast ad talking points. Short, natural, ready to read aloud.

Tone: conversational, genuine. Like a friend recommending something — not a sales pitch.

Critical rules:
- CONCISE. Each bullet is 1-2 sentences max. A creator should be able to glance at a bullet and riff on it.
- Bullets are prompts to talk about, not scripts. Give the creator the *what*, they'll find the *how*.
- Use • for bullets
- Call to action: one tight paragraph with the URL/code. Ready to read verbatim.
- Don't say: short, specific, practical
- No filler, no corporate language, no "game-changer" or "revolutionary"`;

async function generateTalkingPoints(campaignData, brandText, productName) {
  const client = new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY });

  const brand = campaignData.brand || {};
  const reqs = campaignData.campaignRequirements || {};
  const age = reqs.ageTarget || {};
  const country = reqs.countryTarget || {};
  const audience = reqs.targetAudience || {};
  const aiSummary = (campaignData.details || {}).aiSummary || {};

  const productLine = productName
    ? `\nSpecific product/service to focus on: ${productName}`
    : "";

  const userPrompt = `Brand: ${brand.name || "Unknown"} (${brand.domain || ""})
${brand.description || ""}
${productLine}

Website content:
${(brandText || "").slice(0, 4000)}

Audience: ${(audience.descriptions || []).join(", ")}
Interests: ${(audience.interests || []).slice(0, 8).join(", ")}
Age: ${age.minAge || "?"}–${age.maxAge || "?"} | Gender: ${reqs.genderSplit || "Not specified"} | Country: ${country.countryCode || "US"}

Campaign context: ${aiSummary.reason || ""}

---

Return JSON with these keys. Keep it SHORT — a creator should scan this in 30 seconds.

- "brandName": brand name (clean, no "LLC" etc.)
- "introduction": 2-3 bullets (•). Each bullet = one talking prompt, 1 sentence. What is it, who is it for, what makes it different.
- "personalExperience": 2-3 bullets (•). Prompts for the creator to riff on. What to try, how it felt, why they'd recommend it.
- "callToAction": One short paragraph, ready to read word-for-word. Include URL and any discount code.
- "keyMessages": 2-3 bullets (•). Core things to hit. One sentence each.
- "doNotSay": 2-3 bullets (•). Specific things to avoid.
- "pronunciation": Phonetic guide for the brand name.

Return ONLY valid JSON.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  let text = message.content[0].text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(text);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { campaignUrl, fetchOnly, productName, audienceOverrides } = req.body || {};

  if (!campaignUrl) return res.status(400).json({ error: "campaignUrl is required" });

  const campaignId = extractCampaignId(campaignUrl);
  if (!campaignId) return res.status(400).json({ error: "Could not extract campaign ID from URL" });

  // Fetch campaign data
  let campaignData;
  try {
    const resp = await fetchJson(`${STATION_API}/advertising-campaign/${campaignId}`);
    if (!resp.success) return res.status(400).json({ error: "Campaign not found" });
    campaignData = resp.data;
  } catch (e) {
    return res.status(500).json({ error: `Failed to fetch campaign: ${e.message}` });
  }

  const brand = campaignData.brand || {};

  // If fetchOnly, return campaign metadata
  if (fetchOnly) {
    const reqs = campaignData.campaignRequirements || {};
    const age = reqs.ageTarget || {};
    const country = reqs.countryTarget || {};
    const audience = reqs.targetAudience || {};
    const aiSummary = (campaignData.details || {}).aiSummary || {};

    return res.status(200).json({
      brandName: brand.name || "",
      brandDomain: brand.domain || "",
      brandDescription: brand.description || "",
      brandLogoUrl: brand.logoUrl || "",
      ageMin: age.minAge,
      ageMax: age.maxAge,
      country: country.countryCode || "US",
      interests: audience.interests || [],
      audienceDescriptions: audience.descriptions || [],
      campaignSummary: aiSummary.reason || "",
      budget: campaignData.budget || "",
    });
  }

  // Apply audience overrides
  if (audienceOverrides) {
    const reqs = campaignData.campaignRequirements = campaignData.campaignRequirements || {};
    if (audienceOverrides.interests) {
      reqs.targetAudience = reqs.targetAudience || {};
      reqs.targetAudience.interests = audienceOverrides.interests.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (audienceOverrides.audienceDescriptions) {
      reqs.targetAudience = reqs.targetAudience || {};
      reqs.targetAudience.descriptions = audienceOverrides.audienceDescriptions.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (audienceOverrides.ageMin && audienceOverrides.ageMax) {
      reqs.ageTarget = { minAge: parseInt(audienceOverrides.ageMin), maxAge: parseInt(audienceOverrides.ageMax) };
    }
    if (audienceOverrides.country) {
      reqs.countryTarget = { countryCode: audienceOverrides.country };
    }
    if (audienceOverrides.genderSplit) {
      reqs.genderSplit = audienceOverrides.genderSplit;
    }
  }

  // Scrape brand website
  let brandText = "";
  if (brand.domain) {
    brandText = await fetchPageText(brand.domain);
  }

  // Generate talking points
  try {
    const result = await generateTalkingPoints(campaignData, brandText, productName || "");
    result.brandWebsite = brand.domain ? `https://${brand.domain}` : "";
    return res.status(200).json(result);
  } catch (e) {
    console.error("Generation error:", e);
    return res.status(500).json({ error: "Failed to generate talking points. Please try again." });
  }
}
