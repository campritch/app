#!/usr/bin/env python3
"""
Weekly Podcast & YouTube Advertising News Briefing
Run: python3 ad_news.py
Set ANTHROPIC_API_KEY in your environment first.
"""

import os
import sys
from datetime import datetime
import anthropic

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

today = datetime.now().strftime("%A, %B %d, %Y")

SYSTEM_PROMPT = """You are an advertising industry analyst specializing in podcast and YouTube advertising.
Your job is to produce a tight, scannable weekly briefing covering:
- Podcast ad market: deals, CPM trends, ad-tech, new formats, notable campaigns
- YouTube ad market: monetization changes, creator economy, brand safety, ad formats, notable campaigns
- Cross-platform trends that affect both

Format your output as a clean briefing with:
1. A short 2-3 sentence executive summary at the top
2. "PODCAST ADS" section with 4-6 bullet points, each with a bold headline and 1-2 sentence detail
3. "YOUTUBE ADS" section with 4-6 bullet points, same format
4. "WHAT TO WATCH" — 2-3 forward-looking signals or upcoming events

Keep every bullet punchy and actionable. Cite sources inline (publication name + date)."""

USER_PROMPT = f"""Search for the most important podcast advertising and YouTube advertising news from the past 7 days (before {today}).

Look for:
- Podcast ad spend data, new podcast ad networks or tools, major podcast ad deals or campaigns
- YouTube monetization updates, YouTube ad revenue news, creator fund changes, brand safety updates
- Industry reports from IAB, eMarketer, Spotify, YouTube/Google earnings commentary, Nielsen
- Notable brand campaigns, agency moves, or ad-tech launches affecting either platform

Then write a crisp weekly briefing based on what you find."""


def run():
    print(f"\n📡 Fetching advertising news for {today}...\n")

    messages = [{"role": "user", "content": USER_PROMPT}]

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        thinking={"type": "adaptive"},
        tools=[
            {"type": "web_search_20260209", "name": "web_search"},
            {"type": "web_fetch_20260209", "name": "web_fetch"},
        ],
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    # Handle pause_turn — server-side tool loop hit its iteration limit, resume
    max_continuations = 5
    while response.stop_reason == "pause_turn" and max_continuations > 0:
        max_continuations -= 1
        messages.append({"role": "assistant", "content": response.content})
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=4096,
            thinking={"type": "adaptive"},
            tools=[
                {"type": "web_search_20260209", "name": "web_search"},
                {"type": "web_fetch_20260209", "name": "web_fetch"},
            ],
            system=SYSTEM_PROMPT,
            messages=messages,
        )

    # Extract text
    text_blocks = [b.text for b in response.content if b.type == "text"]
    if not text_blocks:
        print("No text output returned.", file=sys.stderr)
        sys.exit(1)

    briefing = "\n\n".join(text_blocks)

    # Print to terminal
    border = "═" * 60
    print(border)
    print(f"  WEEKLY AD NEWS BRIEFING — {today}")
    print(border)
    print(briefing)
    print(border)

    # Save to markdown file
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"briefing-{date_str}.md"
    with open(filename, "w") as f:
        f.write(f"# Weekly Ad News Briefing\n_{today}_\n\n{briefing}\n")
    print(f"\n✅  Saved to {filename}\n")


if __name__ == "__main__":
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set.", file=sys.stderr)
        print("Run: export ANTHROPIC_API_KEY=your-key-here", file=sys.stderr)
        sys.exit(1)
    run()
