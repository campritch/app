# General landscape mode

Best campaign across the whole podcast market, delivered as three tiered options (A/B/C). This is
the old `proposal-generator` flow, now driven by live SpotsNow MCP discovery instead of only a
campaign URL.

## Step 1 — Discover the best shows (SpotsNow MCP)

Work from live intelligence, not a static list:

1. Turn the target market into 3–4 short audience `descriptions` (demo + interests + geography +
   category) and call `find_podcasts_by_audience_description` and/or `discover_ad_inventories`
   (`source: "AUDIENCE"`, then a `"WEBSITE"` pass off the brand domain; merge and de-dupe by
   `podcastId`).
2. Use `get_reference_brand_prospect_shows` with a strong category-analog brand to surface shows
   that already convert for the category. `generate_campaign` can seed a coherent starting lineup.
3. If a SpotsNow campaign link is in the spec, use **Claude in Chrome** browser automation to read
   it as a *seed* only (navigate → `get_page_text`; do NOT `web_fetch` — the page is JS-rendered).
   Live MCP inventory + rates are the source of truth over the campaign page's suggested allocation.
4. Enrich the shortlist with `get_podcast_details` (basic + demographics + ad_context) and
   `get_podcast_advertising_brands` (`top_by_spend`) to grade category proof and demo (see
   fit-rubric.md).

## Step 2 — Fixed per-show monthly rates (never proportional)

This is a real ad buy. Each show has a **fixed monthly rate** based on its real CPM and episode
count. Rates do **not** scale with the overall budget — reducing budget means **dropping shows**,
not paying every kept show less.

Set each show's monthly rate by priority:
1. **User-provided override** (always anchor to a rate the user gives you).
2. **Estimated CPM × monthly impressions** from `get_podcast_details` ad_context, rounded to $10.
3. **Sanity-check premium shows** — these usually cost more than a % allocation implies. Confirm
   with the user before finalizing if any appear:
   - The Twenty Minute VC (20VC): $5K–$10K/ep, often $10K+/mo
   - Pivot: $5K–$10K/mo · Hard Fork / Masters of Scale / Decoder: $2K–$5K/mo
   - Any show with reach >300K/ep: verify directly

## Step 3 — Build tiers by inclusion, not discounting

For each of A/B/C, pick the **subset of shows** whose fixed rates sum to the target:
- **Every tier keeps the Tier-1 ICP shows** (highest demo match + most relevant category).
- **Bigger tiers add shows; smaller tiers cut the weakest fits first** (lowest relevance × highest
  cost). Never solve a smaller budget by shaving a kept show's rate.
- **Premium single shows live in the biggest tier only.**
- **Smaller tiers favor spread** (6–8 small/mid shows over 2 large ones) for test-and-scale signal.
- **±15% of target is fine**; flag anything over.

Tier math:
```
ad_spend      = sum(rate for included shows)
station_fee   = round(ad_spend × 0.15 / 10) × 10
monthly_total = ad_spend + station_fee
```

Show the user a quick summary (per tier: N shows, ad spend, all-up vs target, what each drops)
before writing Notion.

## Step 4 — Notion page

Create the proposal page (Sales Proposals workspace is fine), then log it in the hub and write a
Training Library entry back — see SKILL Step 4. Title:
`[Prefix] / [Brand] — General Campaign Proposal`. Use real newlines, never literal `\n`.

Template (fill the brackets):

```
---
This campaign is designed to run a strong initial test leveraging podcasts to unlock reach to
untapped audiences, create strong long-term ROAS, and build a new, highly effective channel for
[BRAND] to scale sales and grow awareness.
---
## **Campaign Objectives**
**Primary Goals:**
- Aim to hit breakeven by Month 2, and scale toward 2.5–5x ROAS over time
- Reach wider 'untapped' audiences to spread the message about [BRAND]
**Secondary Goals:**
- Implement audio pixel tracking to unlock full attribution (7x more visibility vs. untracked)
---
## **Campaign Strategy**
### Show Mix
- Three tiers of test scope across the recommended shows
- Tier-1 ICP coverage appears in all three options
- Larger tiers add upper-funnel reach on top of the smaller one
- Goal: find the 3–5 shows that become the brand's repeatable, high-ROI channel
### Pixel Tracking
- We implement audio pixel tracking on your site for delayed attribution — essential for proving
  impact over the buying cycle.
---
## **Timeline – 12 Weeks**
| Monthly Program | Ad type |
|---|---|
| Week 1-3 | Attribution set up / booking shows |
| Week 4 | 60-second Host Read Ad |
| Week 7 | 60-second Host Read Ad |
| Week 12 | Comprehensive campaign report |
---
## **Ad Creative**
- **Format:** 30–60 second embedded host-read mid-rolls
- **Style:** Conversational, personal, product endorsement
- **Focus:** Drive traffic to [BRAND] website
## **Proposed Budget Options**
[For each provided tier A/B/C: a one-line description of what it includes/drops, then a table:]
| Show | Monthly Reach | Monthly Cost | Genre |
|---|---|---|---|
| [Show] | [N,NNN] | $[X,XXX] | [Genre] |
| **Station Fee** | **-** | $[FEE] | - |
| **Monthly Total** | **[TOTAL_REACH]** | **$[TOTAL]** | - |
## **Performance & Reporting**
- Pixel tracking setup + support
- 12-week report: engagement, attribution, show-by-show performance
---
## **Next Steps**
1. Campaign Approval  2. Finalize Ad Creative  3. Pixel Setup & Launch

[View full campaign on SpotsNow]([CAMPAIGN_URL if provided])
---
## Recommended Shows
[For each show, a 2-column block: image left, details right —
**Show** | Genre / Impressions per ep / Demographic match / Why we chose it]
```

## Step 5 — Image rendering fix (run after page creation)

Notion renders external images at native pixel size, so small GCS thumbnails look inconsistent.
After creating the page, upload each show image into Notion's own S3 and set the format flags so it
fills its column. The full browser-console procedure (getUploadFileUrl → PUT → saveTransactions with
`block_page_width:true`, `block_full_width:false`, `block_width:1012`, `block_preserve_scale:true`,
`block_aspect_ratio:1.0`) is documented in the legacy `proposal-generator` skill under
"Step 6 — Fix image rendering." Replace tiny (100×100) artwork with iTunes Search API
`artworkUrl600`. Use the canvas-upload fallback for CORS-blocked hosts (libsyn, mzstatic).
