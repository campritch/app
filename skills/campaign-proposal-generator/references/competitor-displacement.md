# Competitor-displacement overlay

Some proposals are built not from "what fits the audience" but from "where did a competitor prove
the category and then step back." The canonical case: we started building Rebel to mirror Quince's
strategy, then learned Quince now blocks competitors on the shows it actively runs. So instead of
mirroring where Quince *is*, we build from the shows Quince has **stopped** running on — proven
category inventory that is now open to us.

Use this overlay whenever the spec includes a "Competitor displacement" line. It layers on top of
either mode (usually general).

## Step 1 — Find the churned shows

`get_brand_sponsored_shows` with the **competitor domain**:
- `mode: "recently_stopped"` (with `months` up to 24) → shows the competitor advertised on before
  the window but has no ads inside it. **These are the target list** — the environments they proved
  and left.
- `mode: "top_by_spend"` (or `all_recent`) → where the competitor *still* runs. Use this as context
  and to respect any "they're blocking us there" note — do not center the plan on shows the
  competitor actively dominates unless the user says the block has lifted.

## Step 2 — Qualify for our brand

The competitor leaving a show doesn't automatically make it right for us. For each churned show:
- `resolve_entity_ids` → `get_podcast_details` (demographics, ad_context) and
  `get_podcast_advertising_brands` — confirm demo fit for *our* brand and that the category still
  converts there (see fit-rubric.md).
- Check live availability: for remnant mode, is it on the board (`discover_ad_inventories`)? For
  general mode, price it at its fixed rate.
- Screen for a **direct competitor of ours** already running — that's a conflict; drop or flag it.

## Step 3 — Frame the argument

Lead the proposal with the displacement thesis, plainly:
"[Competitor] built and validated the category on these shows and has since pulled back. That leaves
proven, high-intent inventory open — we move [Brand] into it before someone else does."

In the show table, add a short note per show tying it to the competitor
("[Competitor] ran N host-reads here through [approx date]") so the proof is visible. Keep the rest
of the build (tiers/pricing for general, grading/blended CPM for remnant) exactly as in the mode
reference.

## Edge cases

- **Competitor churned from nothing usable:** widen `months` to 24; if still thin, tell the user
  displacement inventory is thin and fall back to a normal build for the mode.
- **Competitor domain ambiguous:** confirm the domain with the user (never guess).
- **Competitor still actively dominates the best-fit shows:** note it; propose the churned-show set
  plus a couple of category-adjacent alternatives rather than fighting for blocked inventory.
