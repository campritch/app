# Last-minute remnant mode

A graded, priced bundle of **live** SpotsNow inventory. This is the old `remnant-proposals` flow.
Pricing is straightforward: show the live remnant rate straight from the MCP, with the rate-card CPM
alongside so the saving is visible. No markup, no added discount.

## Step 1 — Pull live inventory (MCP is the source of truth)

1. If a brand domain is given, write a one/two-line brand profile first (positioning, values,
   category). `web_fetch` the domain if unfamiliar.
2. Turn the audience into 3–4 short `descriptions` (demo + interests + geography + category).
3. `discover_ad_inventories` with `brandDomain` (if given), the `descriptions`, `limit` 30–40,
   `source: "AUDIENCE"`. Returns live `LAST_MINUTE_SPOTS` with `discountedCpm`, `originalCpm`,
   `discountPercentage`, `audienceSize`, `networkName`, date window, `isSpotRequested`, `bookingUrl`.
4. Second pass with `source: "WEBSITE"` (interest-tag match off the domain) plus a few different
   `descriptions`. Merge and de-dupe by `podcastId`.
5. A campaign link, if provided, seeds show names only — `resolve_entity_ids` them and check live
   availability. Never quote campaign-page prices; use live remnant prices.
6. If `discover_ad_inventories` returns "No approval received," retry once, then ask the user to
   approve and continue.

When exact-fit inventory is thin, take the top-ranked available spots even if imperfect and name the
tradeoff — a live near-fit beats a perfect unbookable show.

## Step 2 — Enrich & grade

For the top ~8–15 by match, pull `get_podcast_details` (basic + demographics + ad_context, batch up
to 10) and `get_podcast_advertising_brands` (`top_by_spend`, and `all_recent` on the top few to
screen for direct competitors already running). Grade with `fit-rubric.md`: category proof → demo →
brand-safety gate → inventory reality. Sort best to worst.

## Step 3 — Price & blend

Price per spot = live `discountedCpm`; show `originalCpm` in parentheses (e.g. `$25 (was $40)`). No
markup. Blended CPM is audience-weighted across the live shows; per-rotation reach = sum(audience);
impressions at a known flight budget = `budget / blendedCPM × 1000`. (Math + worked example in
fit-rubric.md.) Exclude any not-live show from totals.

## Step 4 — Deliver + Notion page

Lead with a one/two-line recommendation of the core bundle plus any reach extension, and flag timing
items (closing windows, requested spots, not-live shows).

Create the Notion page under the **AI Proposals** index (see SKILL Step 4). Title:
`SpotsNow × [Brand] · Get the Host-Read Remnant Advantage`. Use real newlines, never literal `\n`.
Structure:

```
--- (divider)
> **[Value prop: buy the environments [category] brands already win in, on remnant, up to 40% off.
> We find the openings, exclude competitors, hand you a vetted list.]**

## 01 · About SpotsNow
[Two short paragraphs: host-read remnant marketplace with an intelligence layer; we track where
every brand buys host-read across 59,000+ shows to build the target list and exclude competitors.]

## 02 · [Category] remnant bundle, graded for [Brand]
[One paragraph: brand positioning + why these shows + why remnant fits.]

| Impressions | Blended CPM | Track Record |
| --- | --- | --- |
| [~total at flight (reach per rotation)] | [$X blended remnant CPM] | [strongest category brands already on these shows + rationale; use <br><br> between paragraphs] |

[One paragraph explaining the ranking + column definitions.]

| Show | Type | Audience · F% · US% · core age | Remnant CPM (was) | Core buyers | Proof brand | Key consideration |
| --- | --- | --- | --- | --- | --- | --- |
[one row per show, best first]

Book the live spots: [Show](bookingUrl) · [Show](bookingUrl) · ...

> ✅ **First bundle we'd run:** [core picks + one reach extension + flight size].
> ⚠️ **Timing:** [closing windows, requested spots, any not-live show].

## 03 · Ways to use SpotsNow
- **Single-show test** · **Themed bundle** · **Sourced inventory** · **Always-on remnant**

## The next step: a 20-minute working call
[We pull current availability against [Brand]'s targets and price a first test bundle in the room.
If something isn't available, we go source it.]

--- (divider)
*SpotsNow · spotsnow.io · host-read remnant for podcast advertising*
```

Table rules: pipe-markdown with a `| --- |` separator row; no internal newlines in a cell (use
`<br><br>`); no pipe characters inside a cell. Callouts are `> ` blockquotes with a leading emoji.
When editing an existing page, re-fetch and make surgical edits — never blind-overwrite manual edits.

## Maximize-budget overlay

If the spec says "Maximize budget: yes" and the live bundle underfills the target, add a section
**"Sourced inventory — beyond the remnant board"**: named shows/moments that fit but aren't live
now, which we'd secure as the brand's sourcing partner. Mark each "not live (est. CPM)" and keep it
out of the live blended-CPM/impressions totals. State the gap plainly (e.g. "live bundle is ~$18k of
a $30k target; here's what we'd source to close it").
