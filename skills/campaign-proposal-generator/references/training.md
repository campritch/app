# Training: ground the proposal in the hub before you build

A proposal is an argument shaped by the conversation that led to it. Two brands with the same budget
get very different proposals (a Walmart reads nothing like a SerpAPI). The way you learn the shape
for *this* brand is to read what we've done for brands like it, and what was actually said.

Everything lives in one Notion hub — **AI Campaign Proposals**, page
`3a2bb6074fe3817cb2fdc003df546259` — with two databases under it:

- **Training Library** — the brain. One entry per past deal: the finished proposal plus the context
  that produced it. Properties: Name, Brand, Category, Budget band (`<$10k` / `$10-25k` / `$25-60k`
  / `$60-120k` / `$120k+`), Mode (`General` / `Remnant` / `Context`), Outcome (`Won` / `Lost` /
  `Pending` / `Reference`), Source links, Proposal (URL), Added. The page **body** holds the readable
  context you train on.
- **AI Proposals** — the history. Properties: Name, Brand, Domain, Mode, Budget, Status (`Draft` /
  `Generated` / `Sent` / `Won` / `Lost`), Competitor, Proposal (URL), Job, Created.

**Ensure the hub exists first.** Fetch the hub page; find the two child databases by title. If one
is missing, create it with the schema above (the web front-door also creates them, so they usually
exist). Then pull in this order — stop when you have enough signal; this is a read-time budget, not a
completeness contest.

## 1. Training Library (the primary signal)

- Query the Training Library for the 2–4 entries most like this brand: same Category, similar Budget
  band, same Mode. Read their bodies.
- Extract: how tiers were framed, per-show rate ranges, which shows recur for this category, the
  objectives language, the close, and anything noted about what worked or lost. Mirror the patterns
  that worked; don't reinvent format.
- If the library is thin, fall back to the **Sales Proposals** workspace
  (`195bb6074fe38071b40fdcc56fe149aa`). Known-good reference proposals (general mode): Rella
  `2fbbb6074fe380fc9f79c28c49ff9d17`, Xero Shoes `2cdbb6074fe38055ad53c9b2f4942b73`, Kane Footwear
  `32cbb6074fe3803a9060d64f812f5c23`, Matt Mahan `32cbb6074fe381f7bf09f4a581ec1bc1`.

## Write back after every build (this is what makes it compound)

When the proposal is done, add a **Training Library** entry for it (Outcome `Pending`) with a body
that captures why it was shaped this way, and log a row in **AI Proposals**. The next run reads what
this one wrote. Update Outcome to `Won`/`Lost` later when you know.

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

## The web front-door writes to the same hub

Training added on `spotsnow.wiki/campaign-proposal` (Training Library tab) is written straight into
the Notion Training Library — the same database you read here. So anything the team adds there is
immediately part of your training corpus, no extra step. Fathom (calls) and Superhuman / Gmail
(emails) remain live sources you can pull via connectors when an entry links to them.
