# SpotsNow VC Fit Grading Rubric

Standing rubric for grading investors in the VC CRM (`vc-crm.html`, /raise).
Source of truth: "SpotsNow - Deck.pdf" (17 slides, seed deck) + Cam's live
updates. Not published to the wiki (build.sh only ships .html).

Last updated: 2026-08-23.

## The pitch being graded against

- Positioning: "Hotel Tonight for Podcast Advertising." The front door to
  host-read / long-form creator media: research, buy, and measure campaigns
  across 59,000+ shows in minutes instead of weeks.
- Market: $32B of long-form media inventory, half unsold. TAM $35.5B
  (podcast + YouTube creator, long-form once demand infra unlocked),
  SAM $5.4B, SOM $1.1B. Road to $102M ARR (take rate + agent SaaS +
  enterprise AI connectors).
- Traction (Cam, 2026-08-23 — supersedes deck): **$500K cumulative GMV,
  ~$15K/mo revenue**, 10-15% take rate. 800+ shows onboarded (more host-read
  listings than iHeart at 750), 23 networks, 8.7M impressions bought.
  Case study: Tesbros, 3.5x campaign ROAS, 5.0x top show, beating Meta and
  Google on first campaign.
- Moat: proprietary transaction + performance data ("each campaign builds
  our brain"), the open labeled source of truth for what converts in
  creator media; already callable live inside Claude.
- Supply motion: land (sell unsold spots) → expand (booking tools) → stay
  (all-in-one media business software; first $14K tooling revenue).
- Team: Cam (product at Thumbtack / Setter - Sequoia-backed, acquired; 2x
  exits; ex boutique ad agency owner), Abhishek (station.page to 150K users,
  Kelce fan clubs, $3B marketplace CX). Backed by Brickyard + Hustle Fund.
- Raise: seed, sprinting to $2M ARR. Round variables (amount left, meeting
  weeks) live in the CRM's Templates tab.

## The five thesis surfaces

A fund fits if it invests in ANY of these; the best fits hit several:

1. Marketplaces / network effects (two-sided liquidity, take-rate models)
2. Creator economy / media (creators as businesses, attention shift to
   long-form audio + video)
3. Adtech / measurement (ad infrastructure, attribution, madtech)
4. AI-native software + proprietary data moats
5. Vertical SaaS for media businesses (the stay-motion software)

## Dimensions and weights

score = thesis*.30 + stage*.25 + check*.20 + portfolio*.15 + geo*.10

- **Thesis fit (30%)** — 90-100: two or more surfaces are core to the fund's
  stated thesis. 75-89: one surface core, another adjacent. 60-74: one
  surface adjacent / generalist with relevant pattern. <60: mismatch
  (e.g. healthcare-only, fintech-only, supply chain).
- **Stage fit (25%)** — 90-100: leads or writes pre-seed/seed now. 75-89:
  seed among other stages. 50-74: mostly A and later (relationship value).
  <50: growth-only.
- **Check size fit (20%)** — 85-100: $250K-$1.5M participation or $1M-$3M
  lead. 70-84: partially overlapping range. <70: too big/small for a seed.
- **Portfolio adjacency (15%)** — backed creator economy, audio, ad infra,
  marketplace, or media-workflow companies that prove pattern recognition
  without a direct competitive conflict. Direct competitor on the cap
  table = cap at 40 and flag.
- **Reachability (10%)** — warm path strength (connector/1st degree) and
  geography (Nashville/Southeast bonus, US > Europe for a US seed).

## Grade bands

A+ >= 90 · A >= 84 · A- >= 78 · B+ >= 72 · B >= 65 · C < 65

## Special cases

- Audio-owner strategics (SiriusXM, iHeart, Comcast, Sony): real synergy but
  neutrality-signal risk with networks; cap overall in the B range and note
  the risk in `why`.
- Growth-stage media funds (TCG, WndrCo): grade honestly low on stage but
  keep for Series A relationship building.
- Wrong-thesis local funds (Jumpstart, FINTOP, Dynamo): C on purpose -
  network nodes, "ask for intros, not a check."

## Grading new funds (master CSV process)

For each fund: identify thesis surfaces from its site/portfolio, set the
five dims with the anchors above, write `looking` (what they invest in),
`hook` (a personalized opener referencing their thesis/portfolio), and
`why` (one line on why SpotsNow fits them, usable in intro messages).
Verify check size and stage from public sources; when unsure, mark the
field '—' rather than guessing, and never fabricate portfolio claims.
