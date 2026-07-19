# Training: ground the proposal in history before you build

A proposal is an argument shaped by the conversation that led to it. Two brands with the same budget
get very different proposals (a Walmart reads nothing like a SerpAPI). The way you learn the shape
for *this* brand is to read what we've done for brands like it, and what was actually said.

Pull in this order. Stop when you have enough signal — this is a read-time budget, not a
completeness contest.

## 1. Past proposals (style + structure + pricing shape)

- Search Notion for the **AI Proposals** index and the **Sales Proposals** workspace.
- Find the 2–4 most similar prior proposals: same category, similar budget band, same mode
  (general vs remnant). Read them.
- Extract: how tiers were framed, per-show rate ranges, which shows recur for this category, the
  objectives language, and the close. Mirror the patterns that worked; don't reinvent format.
- Known-good reference proposals (general mode): Rella `2fbbb6074fe380fc9f79c28c49ff9d17`,
  Xero Shoes `2cdbb6074fe38055ad53c9b2f4942b73`, Kane Footwear `32cbb6074fe3803a9060d64f812f5c23`,
  Matt Mahan `32cbb6074fe381f7bf09f4a581ec1bc1`.

## 2. The conversation (what was actually discussed)

- If the spec carries a "Correspondence & context" block, that is the primary source — read it
  closely and let it set the framing and constraints.
- If a call led to this, pull it from Fathom (`list_meetings` / `get_meeting_transcript`), excluding
  standups. If an email thread led to it, pull it from Superhuman / Gmail.
- The proposal must answer the real conversation: the strategy floated, the budget signal, the
  objection raised, the competitor named. If the client said "mirror the Quince strategy," the
  proposal should visibly do that (or explain why it pivoted — e.g. Quince now blocks the category,
  so we displace instead; see competitor-displacement.md).

## 3. The brand (positioning)

- If the brand is unfamiliar, `web_fetch` the domain. Get category, values, price point, and who
  they sell to before grading shows. A one or two line brand profile sharpens every downstream
  match.

## Say what you trained on

Before building, tell the user in one line what you anchored to, e.g.
"Anchoring to the Xero Shoes and Kane general proposals, and the July 9 Rebel discovery call."
If nothing comparable exists, say so and note this proposal becomes training for the next one.

## Note on the web-front-door corpus

Files uploaded on `spotsnow.wiki/campaign-proposal` (Training corpus tab) are stored server-side and
are not directly readable from here. Treat Notion (past proposals), Fathom (calls), and Superhuman /
Gmail (emails) as the live corpus you read via connectors. If the user wants a specific uploaded doc
considered, ask them to paste it or its key points into the chat.
