# Fit rubric

How to grade a candidate show for a given brand or audience, and how to price and blend a bundle.
Used mainly by remnant mode, but the category-proof idea applies to general mode too.

## Grade in this order

### 1. Category proof (the strongest signal)

Ask: does this show already convert for endemic brands in the buyer's category? Pull
`get_podcast_advertising_brands` (`top_by_spend`) and look at the core buyers.

- A show that runs **repeat host-reads for a direct category-adjacent brand** (e.g. a better-for-you
  packaged food brand for a snack advertiser) is proven inventory. Name that brand as the "proof
  brand."
- Heavy repeat by one brand (high host-read count, e.g. 7+) is a strong "it converts here" signal.
- A buyer base that is all mass-reach (telecom, Amazon) or all off-category (rehab clinics, B2B
  software for the show's own profession) is weak proof, even with a big audience.
- No external buyers / only the host's own products = unproven; treat as a low-confidence test at best.

The presence of category-adjacent brands is **validation, not conflict**. A snack brand should be
encouraged, not scared off, by seeing other better-for-you food brands already winning on a show.
Only a **direct competitor** (same product category) is a conflict worth flagging.

### 2. Demo fit

From `get_podcast_details` demographics: F%, US%, core age band, and household income where
available. Score against the target audience. Note when a show is a scale play (large audience,
looser demo) vs a precision pod (small audience, tight demo). US-heavy matters for US brands; flag
shows below ~70% US.

### 3. Brand-safety / values gate (a hard filter, not a score)

Some shows are a **hard pass regardless of match or price**. The gate is about whether the brand's
message is safe and non-contradictory in that context. Examples of the reasoning, not an exhaustive
list:

- **Values contradiction:** a "better-for-you / clean / guilt-free" food brand on an explicitly
  **anti-diet** show is a landmine, because that audience is taught to reject exactly that framing.
- **Distressing or dark context:** a fun consumer brand next to graphic-gore true crime,
  addiction-and-recovery content, or trauma content is a context mismatch. Conversational or
  journalistic true crime is fine; graphic-gore is not.
- **Wrong buyer entirely:** a show whose audience is professionals (e.g. clinicians, not consumers)
  will not convert for a consumer product.

If a show trips the gate, exclude it or mark it a hard pass even if it is cheap and available. Say
why in one line.

### 4. Inventory reality

From the live inventory record: audience size, the date window (flag windows closing soon), and
`isSpotRequested` (someone else may take it). A perfect show that is not on the remnant board is not
bookable — mark it "Not live" and keep it out of totals.

## Output columns (remnant)

Rank best to worst. Use:
`Show | Type | Audience · F% · US% · core age | Remnant CPM (was) | Core buyers | Proof brand | Key consideration`.

- **Type:** the lane (e.g. the brand's endemic category vs a reach extension like true crime).
- **Core buyers:** count of distinct host-read direct-response brands tracked on the show.
- **Proof brand:** the strongest category analog already buying, or "Early mover" if the base is
  thin, or "none" if unproven.
- **Key consideration:** the one thing that matters — demo caveat, timing, values note, or why it is
  a conviction pod vs scale.

## Pricing and blending

Price per spot = `discountedCpm`, the live remnant rate. Show `originalCpm` in parentheses so the
saving reads. No markup or discount is applied — show the price we have.

Blended CPM (audience-weighted across the live shows):

```
blendedCPM = sum(audience_i × discountedCpm_i) / sum(audience_i)
```

Reach per full rotation (one host-read on each live show) = `sum(audience_i)`.
If a flight budget is known, total impressions ≈ `budget / blendedCPM × 1000`.

### Worked example (one host-read each)

| Show | Audience | CPM |
|---|---|---|
| A | 9,080 | $25 |
| B | 30,200 | $18 |
| C | 23,940 | $18 |
| D | 63,096 | $25 |
| E | 40,343 | $26 |
| F | 44,316 | $18 |
| G | 17,600 | $25 |

- Reach per rotation = 228,575
- Cost per rotation = sum(audience/1000 × CPM) = $5,065.53
- Blended CPM = 5,065.53 / 228,575 × 1000 = **$22.16**
- At a ~$30K flight: 30,000 / 22.16 × 1000 ≈ **1.35M impressions**
