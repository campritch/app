# Apollo revenue → test-budget sizing

When the spec doesn't fix a budget, size it from the brand's economics so the proposal proposes a
spend the brand can actually justify. This is an internal input — never print the revenue figure on
the client-facing page.

## Pull

`apollo_organizations_enrich` with the brand `domain`. Read:
- **estimated annual revenue** (the primary driver)
- **headcount** (sanity check on stage/scale)
- **industry / keywords** (confirms category for grading)
- **funding** if present (well-funded early brands spend above their revenue band)

If Apollo returns nothing usable, fall back to a conservative band and label the number an estimate
to confirm with the brand.

## Map revenue → monthly podcast test budget

A first podcast campaign is a **test**, not the brand's whole media budget. Total marketing is
typically ~5–15% of revenue; podcast is a slice of that; a test is a slice of the slice. The goal is
a monthly number that funds a real **4–8 show** test (enough spread to find the 3–5 winners), not a
number that maxes the channel on day one. Use these bands as a starting point, then adjust for
funding, category CPMs, and anything said on the call:

| Est. annual revenue | Suggested monthly test | Shape |
|---|---|---|
| < $2M | $5–10k/mo | 3–5 small/mid shows, tight diversified test |
| $2M–$10M | $10–25k/mo | 5–8 shows, one Tier-1 ICP anchor + spread |
| $10M–$50M | $25–60k/mo | 8–12 shows, add upper-funnel reach on top of ICP |
| $50M–$250M | $60–120k/mo | premium reach + ICP depth, multi-tier |
| > $250M | $120k+/mo | full breadth; treat A/B/C as scale scenarios |

These are podcast **test** budgets, deliberately conservative. A well-funded seed/A brand with low
current revenue can support the next band up — funding overrides revenue for young brands.

## Show your work

Always surface the reasoning to the user before you lock tiers, e.g.:
"Apollo puts [Brand] around $8M revenue, ~40 staff → I'm sizing the test at ~$18k/mo (recommended
tier), which funds 6–7 shows. Say the word if you want it bigger or smaller."

Then build the tiers around that number (general mode) or use it as the flight budget for impression
math (remnant mode). The user's override always wins.
