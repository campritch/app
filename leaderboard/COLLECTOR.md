# Response-Time Leaderboard — Collector Runbook

This is the **"cowork" job**: paste the prompt below into a Claude session (Claude
Code on the web, desktop, or a scheduled trigger) that has the **Gmail** and
**Slack** MCP connectors attached. Claude does the *fetching* via MCP; the math
lives in `leaderboard/compute.mjs` (deterministic, unit-tested). The result is
written to `response-leaderboard.data.js`, which the dashboard reads.

Run cadence: **every 3 days** (`cadenceDays`). On Claude Code web, set a scheduled
trigger on this repo with the prompt below.

---

## ✅ Before you start: connect the RIGHT Gmail

The leaderboard only makes sense against the mailbox that actually receives the
client threads. **Verify identity first** — run a `search_threads` for `in:sent`
and confirm the sender is **`cam@spotsnow.io`** (or that `partnership@spotsnow.io`
is an alias/delegate on it). If Sent shows `support@dropstation.io`, stop and
reconnect the Gmail connector with the correct Google account — the numbers will
be wrong otherwise.

---

## The prompt to paste

> **Task: refresh the ops response-time leaderboard data.**
>
> Roster (ops): cam@spotsnow.io, aiza@spotsnow.io, wally@spotsnow.io, eli@spotsnow.io.
> Window: last 60 days. Today is the run date.
>
> **1. Email (Gmail MCP).** Find qualifying threads and pull their messages:
> - `search_threads` with query:
>   `(cc:partnership@spotsnow.io OR to:partnership@spotsnow.io OR cc:cam@spotsnow.io OR to:cam@spotsnow.io) newer_than:60d`
>   — page through all results.
> - For each thread, `get_thread` (FULL_CONTENT) and read every message's
>   **From / To / Cc / Date**.
> - Normalize each thread to:
>   `{ id, subject, link, messages:[{ fromAddr, to:[…], cc:[…], dateMs }] }`
>   (`dateMs` = epoch millis; `link` = the Gmail thread URL).
> - Don't pre-filter — `compute.mjs` enforces the rule: keep a thread only if
>   **partnership@ or cam@** is on it **AND** ≥1 ops teammate is a participant
>   (this is what excludes Cam's unrelated company mail).
>
> **2. Slack (Slack MCP).** For each channel below, `slack_read_channel`
>   (paginate ~60 days): `#media-operations` (C09QQ09B0RY),
>   `#station-accounts` (C099JM7JCMV), `#brand-leads` (C09AGLK0KS5),
>   `#general` (C03CDCKCUUD). Normalize messages to:
>   `{ channel, ts, userId, text }` grouped by channel name.
>
> **3. Compute.** `import { build, DEFAULT_CFG } from './leaderboard/compute.mjs'`
>   and call `build({ slack, emailThreads }, { ...DEFAULT_CFG, nowMs: Date.now() })`.
>   (Update `DEFAULT_CFG.ops[*].slackId` if anyone's Slack ID changed; Eli =
>   U0B74UAGDFG.)
>
> **4. Write** the returned object to `response-leaderboard.data.js` as:
>   `window.LEADERBOARD_DATA = <the object>;` (keep the header comment).
>   Then enrich the human-readable fields the engine leaves blank:
>   `people[].role/color` from the roster, and `slow[].lastTouchBy / waitingOn`
>   and `clients[].where` from what you saw in the threads.
>
> **5. Commit** `response-leaderboard.data.js` on branch
>   `claude/response-time-leaderboard-AEyCk` with a one-line summary of the
>   headline numbers. Do not edit the HTML.

---

## What `build()` returns (the data contract)

```
{
  generatedAt, windowDays, cadenceDays,
  sources: { slack, email },                 // booleans — drive the status chips
  sla: { targetHours, warnHours, criticalHours, frustrationMaxHours },
  team: { avgHours, medianHours, slaHitRate, repliesAnalyzed, threadsAnalyzed, openSlow },
  people: [ { name, handle, role, color, avgHours, medianHours, replies,
              onTimeRate, fastest, slowest, trend } | { …, na:true, note } ],
  slow:   [ { source, client, channel, subject, link, lastTouchBy, waitingOn, gapHours } ],
  clients:[ { name, threads, open, where } ]
}
```

## Methodology (encoded in compute.mjs)
- **Response** = an ops message that directly follows a *different* person's
  message (Slack: same channel; Email: same thread). Gap is attributed to the
  responder. Gaps > `awayGapHours` (9h) are dropped as off-hours, not response time.
- **Open / overdue** (email) = a thread whose latest message is inbound and has
  been waiting ≥ `warnHours`. `overdueHours` feeds the **Customer Frustration
  Score** (`min(100, overdueHours / frustrationMaxHours × 100)`).
- **New teammates** with no qualifying replies render as `na:true` (Eli today) —
  shown, not penalized.

## Verify locally
```
node leaderboard/compute.mjs --selftest      # unit tests for the math
open response-leaderboard.html               # /leaderboard — reads the data file
```
