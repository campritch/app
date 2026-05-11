# Strategy Agent — Setup

URL: **spotsnow.wiki/strategy**

## Env vars (Vercel → Settings → Environment Variables)

| Var | Required | Why |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | already set — powers Claude |
| `STRATEGY_PASSWORD` | yes | gates the whole page. Current value: `dropstationIntel` |
| `NOTION_API_KEY` | for Notion tools | Internal integration token. Create at notion.so/my-integrations. The integration must be **explicitly invited** to every page you want the agent to read/write (share menu → Connect to → your integration). |
| `HUBSPOT_ACCESS_TOKEN` | for HubSpot tools | Private app token. HubSpot → Settings → Integrations → Private apps. Scopes needed: `crm.objects.deals.read`, `crm.objects.contacts.read`. |
| `FATHOM_API_KEY` | for Fathom tools | Fathom → Settings → API. If your Fathom API lives at a non-default base, also set `FATHOM_API_BASE`. |
| `BLOB_READ_WRITE_TOKEN` | optional | Vercel Blob token. Without it, Fathom transcripts are re-fetched every session (works but expensive). With it, first pull caches to Blob, re-runs are free. Create via Vercel Storage → Blob. |

## What the agent can do

Tools available to Claude:

- `fathom_list_meetings(from_date, to_date)` — returns titles/dates/attendees, standups filtered out
- `fathom_get_transcript(meeting_id)` — full transcript, cached
- `fathom_list_cached_transcripts()` — see what's already pre-pulled
- `notion_fetch_page(url_or_id)` — page → markdown
- `notion_create_page(parent_page_id, title, markdown)` — writes the updated strategy doc
- `hubspot_deals`, `hubspot_contacts`, `hubspot_pipeline_overview` — pipeline health, stale-deal flagging
- `bi_fetch()` — the GTM snapshot from `data/gtm-latest.json`
- `read_burn_csv()` — the burn/finance CSV (upload via UI)

## Data flow

- Strategy, Notion links, Fathom date range, chat history → browser `localStorage` (nothing leaves your machine until you hit Send)
- Send → `/api/strategy-chat` (password-checked) → Claude with tools → each tool hits its upstream API → streams back via SSE
- Transcripts cache to Vercel Blob under `fathom/<meeting_id>.json`

## Upload the burn sheet

1. Export the Google Sheet as CSV
2. Drop into the "Burn CSV" box in the left panel
3. Stored in `/tmp` for the function warm period. Re-upload if Vercel cold-starts a new instance (rare).
4. For permanent storage, commit to `data/burn.csv`.

## Adding Notion docs for context

Paste URLs (one per line) into the "Notion links" textarea. The agent fetches on demand — not every turn — so listing ten links is cheap.
