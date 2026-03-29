import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const SYSTEM_PROMPT = `You are an advertising industry analyst specializing in podcast and YouTube advertising.
Your job is to produce a tight, scannable weekly briefing covering:
- Podcast ad market: deals, CPM trends, ad-tech, new formats, notable campaigns
- YouTube ad market: monetization changes, creator economy, brand safety, ad formats, notable campaigns
- Cross-platform trends that affect both

Format your output as a clean briefing with:
1. A short 2-3 sentence executive summary at the top
2. "PODCAST ADS" section with 4-6 bullet points, each with a bold headline and 1-2 sentence detail
3. "YOUTUBE ADS" section with 4-6 bullet points, same format
4. "WHAT TO WATCH" — 2-3 forward-looking signals or upcoming events

Keep every bullet punchy and actionable. Cite sources inline (publication name + date).`;

async function fetchAdNews() {
  console.log(`\n📡 Fetching advertising news for ${today}...\n`);

  const messages = [
    {
      role: "user",
      content: `Search for the most important podcast advertising and YouTube advertising news from the past 7 days (before ${today}).

Look for:
- Podcast ad spend data, new podcast ad networks or tools, major podcast ad deals or campaigns
- YouTube monetization updates, YouTube ad revenue news, creator fund changes, brand safety updates
- Industry reports from IAB, eMarketer, Spotify, YouTube/Google earnings commentary, Nielsen
- Notable brand campaigns, agency moves, or ad-tech launches affecting either platform

Then write a crisp weekly briefing based on what you find.`,
    },
  ];

  let response;

  try {
    response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      tools: [
        { type: "web_search_20260209", name: "web_search" },
        { type: "web_fetch_20260209", name: "web_fetch" },
      ],
      system: SYSTEM_PROMPT,
      messages,
    });
  } catch (err) {
    console.error("API error:", err.message);
    process.exit(1);
  }

  // Handle pause_turn (server-side tool loop hit its limit — resume)
  let maxContinuations = 5;
  while (response.stop_reason === "pause_turn" && maxContinuations-- > 0) {
    messages.push({ role: "assistant", content: response.content });
    response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      tools: [
        { type: "web_search_20260209", name: "web_search" },
        { type: "web_fetch_20260209", name: "web_fetch" },
      ],
      system: SYSTEM_PROMPT,
      messages,
    });
  }

  // Extract the final text output
  const textBlocks = response.content.filter((b) => b.type === "text");
  if (textBlocks.length === 0) {
    console.error("No text output returned.");
    process.exit(1);
  }

  const briefing = textBlocks.map((b) => b.text).join("\n\n");

  // Print to console
  console.log("═".repeat(60));
  console.log(`  WEEKLY AD NEWS BRIEFING — ${today}`);
  console.log("═".repeat(60));
  console.log(briefing);
  console.log("═".repeat(60));

  // Save to file
  const filename = `briefing-${new Date().toISOString().slice(0, 10)}.md`;
  const fileContent = `# Weekly Ad News Briefing\n_${today}_\n\n${briefing}\n`;
  writeFileSync(filename, fileContent);
  console.log(`\n✅ Saved to ${filename}\n`);
}

fetchAdNews();
