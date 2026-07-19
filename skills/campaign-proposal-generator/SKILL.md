---
name: campaign-proposal-generator
description: >
  The unified SpotsNow / Station advertiser campaign-proposal engine. Turns a brand + target
  market into a finished Notion proposal, grounded in every past proposal, transcript, and email
  it has been trained on. Handles two modes: a GENERAL LANDSCAPE proposal (best campaign across
  the whole podcast market, tiered A/B/C) and a LAST-MINUTE REMNANT proposal (a graded, priced
  bundle of live SpotsNow inventory). Sizes spend from the brand's Apollo-estimated revenue,
  supports COMPETITOR-DISPLACEMENT plans (build from shows a competitor has stopped advertising
  on), and can source beyond SpotsNow inventory when a bundle underfills the budget. Logs every
  proposal in a Notion hub (Training Library + AI Proposals databases) it trains on and compounds,
  and drafts a confirmation email with a Superhuman link.
  Use whenever the user wants to create, generate, or build an advertiser campaign proposal or a
  last-minute / remnant spot bundle, or pastes a run spec from spotsnow.wiki/campaign-proposal
  ("Run the campaign-proposal-generator skill with this spec…"). Triggers on "make a proposal for
  [brand]", "build a campaign for [brand]", "find last-minute spots for [brand]", or "build a plan
  from the shows [competitor] stopped running on".
  This supersedes and unifies proposal-generator (general) and remnant-proposals (remnant); prefer
  it over either for advertiser proposals. Do NOT use for network/agency agent proposals
  (network-proposal-builder) or post-campaign reports (campaign-report-generator).
---

# Campaign Proposal Generator

One engine for SpotsNow advertiser proposals. It replaces the two older skills:

- **General landscape** = the old `proposal-generator` flow (whole-market best campaign, tiered).
- **Last-minute remnant** = the old `remnant-proposals` flow (live inventory, graded bundle).

What it adds on top: it is **trained on the full proposal history**, sizes spend from **Apollo**
revenue, runs a **competitor-displacement** mode, can **source beyond SpotsNow** when a bundle
underfills, indexes every output in a Notion **AI Proposals** page, and drafts the **confirmation
email** with a **Superhuman** link.

The two most important ideas: (1) a proposal is not a show list, it is an argument shaped by the
conversation that led to it — so **read the context first**. (2) fit is proven by **who already
converts on a show**, not by the show's topic — so **grade on advertiser proof**.

---

## Step 0 — Get the spec

You are invoked one of two ways:

**A. From the web front-door** (`spotsnow.wiki/campaign-proposal`). The user pastes a block that
starts `Run the campaign-proposal-generator skill with this spec:` and contains every field
(Job id, Mode, Brand, Target market, Target budget, Competitor displacement, Maximize budget,
campaign link, Correspondence & context). Use it verbatim — do not re-ask for what's already there.
Keep the `Job:` id; you'll hand it back at the end for write-back.

**B. From chat** ("make a proposal for Rebel", "find last-minute spots for MASA"). Collect the
minimum: **brand (name + domain)**, **mode** (general vs remnant — ask if unclear), **target
market**, and any **budget** or **competitor** angle. Domain is required for Apollo + SpotsNow;
if it is not obvious, ask — never guess a brand domain.

If SpotsNow / Apollo / Notion / Superhuman tools are not loaded, load them with `tool_search`
(SpotsNow and Apollo especially).

---

## Step 1 — Train on the hub (always do this first)

Everything lives in one Notion hub: **AI Campaign Proposals** (page id
`3a2bb6074fe3817cb2fdc003df546259`), which holds two databases — **Training Library** (the brain)
and **AI Proposals** (the history). Read `references/training.md` for the full method.

First, **ensure the hub exists**: fetch the hub page and find the two databases under it. If either
is missing, create it (the web front-door creates them too, so usually they're already there — the
exact schema is in `references/training.md`). Then pull, in priority order, stopping when you have
enough signal:

1. **Training Library** — query it for the 2–4 entries most like this brand: same category, similar
   budget band, same mode. Read them. These are the paired records (past proposal + the context that
   produced it) and are the single best signal for how to shape this one.
2. **The conversation** — if a transcript or email thread led to this, read it (Fathom for calls,
   Superhuman/Gmail for email; or the "Correspondence & context" block in the spec). The proposal
   must reflect what was actually discussed: the strategy, the constraints, the objection.
3. **Wider past proposals** — if the Training Library is thin, fall back to the Sales Proposals
   workspace and the reference examples in `references/general-mode.md` / `references/remnant-mode.md`.
4. **The brand** — if unfamiliar, `web_fetch` the domain for positioning before you grade.

Name, in one line to the user, which Training Library entries and calls you're anchoring to. If the
library is empty, say so, lean on the templates, and note this proposal will seed it.

---

## Step 2 — Size the spend from Apollo (if budget not fixed)

If the spec gives a budget, use it. If not, size it. Enrich the brand with
`apollo_organizations_enrich` (by domain) → read estimated **annual revenue** and **headcount**,
then map to a sensible podcast **test** budget. The full mapping and worked examples are in
`references/apollo-sizing.md`. Rule of thumb: a first podcast test is a small slice of total
marketing spend, which is itself a fraction of revenue — land on a monthly figure that supports a
real 4–8 show test, and always show the user the reasoning ("~$X revenue → ~$Y/mo test") so they
can override. Never publish an Apollo revenue figure to the client-facing page; it's an internal
sizing input only.

---

## Step 3 — Build the proposal (branch on mode)

### Mode: GENERAL LANDSCAPE
Best campaign across the whole market, delivered as tiered options. Follow
`references/general-mode.md`. Core mechanics: discover best-fit shows with the SpotsNow MCP
(`find_podcasts_by_audience_description`, `discover_ad_inventories`, `get_reference_brand_prospect_shows`,
`generate_campaign`); set a **fixed per-show monthly rate** (never proportionally discount by
tier); build tiers A/B/C by **including/excluding shows**, not by cutting rates; add a **15%
Station fee**; keep Tier-1 ICP shows in every tier.

### Mode: LAST-MINUTE REMNANT
A graded, priced bundle of **live** SpotsNow inventory. Follow `references/remnant-mode.md` and the
grading/pricing rubric in `references/fit-rubric.md`. Core mechanics: pull live `LAST_MINUTE_SPOTS`
via `discover_ad_inventories` (source AUDIENCE, then a WEBSITE pass; merge/de-dupe); enrich the
shortlist (`get_podcast_details`, `get_podcast_advertising_brands`); grade on **category proof →
demo → brand-safety gate → inventory reality**; price at the live `discountedCpm` (show
`originalCpm` in parentheses); compute an audience-weighted **blended CPM**.

### Overlay: COMPETITOR DISPLACEMENT
When the spec names a competitor to displace (e.g. Rebel displacing Quince), the target list is the
shows the competitor **abandoned** — proven category inventory that is now open. Follow
`references/competitor-displacement.md`. Mechanics: `get_brand_sponsored_shows(competitorDomain,
mode:"recently_stopped", months: up to 24)` for churned shows, and `mode:"top_by_spend"` for where
they still run (context, and to respect any "they're blocking us here" note). Resolve those shows,
confirm live availability/fit for our brand, and build the plan around them. Frame it as: "the
environments [competitor] proved out and has now stepped back from."

### Overlay: MAXIMIZE BUDGET (source beyond SpotsNow)
If "Maximize budget: yes" and the assembled bundle's spend falls short of the target, add a clearly
labeled **"Sourced inventory — beyond the remnant board"** section: named shows or moments that fit
the brief but aren't live on SpotsNow right now, which we'd go secure as the brand's sourcing
partner. Mark them "not live (est. CPM)" and keep them out of the live blended-CPM/impressions
totals. Never pad the live bundle with unavailable inventory silently.

---

## Step 4 — Publish to Notion + log in the hub

Write the proposal, log it in the history, and write it back into the training brain. All three land
in the one hub.

1. **Create the proposal page.** Put the full proposal somewhere sensible — under the Sales
   Proposals workspace (`195bb6074fe38071b40fdcc56fe149aa`) is fine, matching where past proposals
   live. Title: `[Prefix] / [Brand] — [Mode] Campaign Proposal` (Prefix defaults to Station). Body
   follows the mode's template in the references. Use **real newlines**, never literal `\n`. For
   general mode, run the image-fix pass from `references/general-mode.md` so artwork fills columns.
2. **Log a row in the AI Proposals database** (under the hub): set Name (`[Brand] — [Mode]`), Brand,
   Domain, Mode (General/Remnant), Budget, Status = `Generated`, Competitor (if displacement),
   Proposal = the page URL. This is the running history the web front-door shows.
3. **Write a Training Library entry back** (under the hub) so the system compounds: Name, Brand,
   Category, Budget band, Mode, Outcome = `Pending`, Source links (the call/email you used), Proposal
   = the page URL, and a page body that captures *why this proposal was shaped this way* — the
   context, the strategy, what you kept or cut. That body is what the next run trains on.

---

## Step 5 — Draft the confirmation email (Superhuman)

Draft the advertiser-facing email that tells them how to confirm and what happens next. Use
`create_or_update_draft` (Superhuman) — or Gmail `create_draft` if Superhuman isn't linked. Keep it
short, in Cam's voice (plain, direct, no em dashes, American spelling): one line on the shape of the
proposal, the Notion link, the single next action to confirm, and an offer of a 20-minute working
call. Surface the **Superhuman link** to the draft so Cam can open, review, and send it. Do **not**
auto-send.

---

## Step 6 — Hand back

Report to the user:
- Brand, mode, and the budget you landed on (with the Apollo reasoning if you sized it).
- The Training Library entries / calls you trained on.
- Show count and headline numbers (tier totals for general; blended CPM + reach for remnant).
- The **Notion proposal link** and the **Superhuman email draft link**.
- Confirm you logged it: a row in **AI Proposals** and a new **Training Library** entry (so the web
  front-door history and the brain both stay current automatically).

---

## Constants

| Constant | Value |
|---|---|
| AI Campaign Proposals hub page | `3a2bb6074fe3817cb2fdc003df546259` |
| Hub databases | "Training Library" (brain) + "AI Proposals" (history), under the hub page |
| Sales Proposals parent page | `195bb6074fe38071b40fdcc56fe149aa` (where the full proposal pages live) |
| Station fee (general mode) | 15% of ad spend |
| Remnant price shown | live `discountedCpm`, with `originalCpm` in parentheses, no markup |
| Default prefix | Station |
| Round costs to | nearest $10 |
| Voice | plain, direct, confident; no em dashes; American spelling; let numbers + proof brands carry it |

## Reference files
- `references/training.md` — how to train on past proposals, transcripts, emails before building.
- `references/apollo-sizing.md` — revenue → test-budget mapping, worked examples.
- `references/general-mode.md` — whole-market tiered proposal: discovery, fixed rates, tiers, Notion template + image fix.
- `references/remnant-mode.md` — live-inventory bundle: discovery, delivery, Notion "Host-Read Remnant Advantage" template.
- `references/fit-rubric.md` — grading order, brand-safety gates, blended-CPM math.
- `references/competitor-displacement.md` — building a plan from a competitor's churned shows.

## Edge cases
- **Brand domain not obvious:** ask; never guess. SpotsNow + Apollo both key on the bare domain.
- **Apollo returns nothing / thin:** fall back to a conservative test band and say the number is an estimate to confirm.
- **`discover_ad_inventories` approval fails silently ("No approval received"):** retry once, then ask the user to approve, then continue.
- **Thin exact-fit inventory (remnant):** take the closest live options and name the tradeoff; a live near-fit beats a perfect unbookable show.
- **Competitor has not churned from anything usable:** widen the window to 24 months, then fall back to a normal general/remnant build and tell the user displacement inventory was thin.
- **Values / brand-safety conflict:** hard-pass the show even if cheap and available; say why in one line (see fit-rubric).
- **No comparable past proposal yet:** say so, lean on the templates, and note this one becomes training for the next.
- **Direct competitor already running on a candidate show:** flag it — a category conflict can block the buy. Category-adjacent brands are validation, not conflict.
