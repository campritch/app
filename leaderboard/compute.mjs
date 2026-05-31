/* ============================================================
   compute.mjs — Response-Time Leaderboard engine (pure, no network)
   ------------------------------------------------------------
   Turns normalized Gmail threads + Slack messages into the
   window.LEADERBOARD_DATA object the dashboard renders.

   It is deliberately framework-free and side-effect-free so it can be:
     • imported by a Claude collector session (see COLLECTOR.md), or
     • run standalone for a self-test:  node leaderboard/compute.mjs --selftest

   The Claude session does the *fetching* (Gmail/Slack MCP). This file does
   the *math*, so the numbers are deterministic and reviewable.
   ============================================================ */

// ---------- config defaults ----------
export const DEFAULT_CFG = {
  // Ops roster. Match on email (Gmail) or Slack user id.
  ops: [
    { name: "Cam Pritchard", handle: "cam@spotsnow.io",   slackId: "U03C1MTSR55", role: "Founder / Ops",   color: "#ff6b6b" },
    { name: "Aiza",          handle: "aiza@spotsnow.io",  slackId: "U095TRKA220", role: "Account / Media", color: "#4f6ef7" },
    { name: "Wally",         handle: "wally@spotsnow.io", slackId: "U09UVJ43W06", role: "Brand / Supply",  color: "#18b368" },
    { name: "Eli McConkey",  handle: "eli@spotsnow.io",   slackId: "U0B74UAGDFG", role: "Ops",             color: "#9a5ad6" }
  ],
  // A Gmail thread qualifies only if one of these is on it (cc/to/from)...
  qualifyAddrs: ["partnership@spotsnow.io", "cam@spotsnow.io"],
  // ...AND at least one ops teammate is a participant (enforced in code).
  sla: { targetHours: 4, warnHours: 12, criticalHours: 24, frustrationMaxHours: 48 },
  // Gaps longer than this are treated as "away / off-hours", not response time.
  awayGapHours: 9,
  windowDays: 60,
  cadenceDays: 3,
  // keyword -> client bucket, for the per-client view + slow-item tagging
  clients: {
    Super:   ["super.com", "super ", "super/", "super credit", "super rx"],
    Amp:     ["amp", "ampfit", "energybits", "dave asprey", "human upgrade"],
    Rella:   ["rella", "getrella"],
    Bolster: ["bolster"]
  }
};

// ---------- small stats helpers ----------
const round = (n, d = 2) => { const p = 10 ** d; return Math.round(n * p) / p; };
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const hours = (aMs, bMs) => Math.abs(bMs - aMs) / 36e5;

function clientOf(text, clients) {
  const t = (text || "").toLowerCase();
  for (const [name, kws] of Object.entries(clients)) {
    if (kws.some(k => t.includes(k))) return name;
  }
  return null;
}

// =====================================================================
// SLACK: adjacency model.
//   messages: [{ channel, ts (seconds, number/string), userId, text }]
//   A "reply" = a message whose author differs from the previous message in
//   the same channel; the gap is attributed to the responder. Away gaps skipped.
// =====================================================================
export function gapsFromSlack(messagesByChannel, cfg = DEFAULT_CFG) {
  const opsIds = new Set(cfg.ops.map(o => o.slackId));
  const gaps = [];
  for (const [channel, msgs] of Object.entries(messagesByChannel)) {
    const sorted = [...msgs]
      .map(m => ({ ...m, ms: Number(String(m.ts).split(".")[0]) * 1000 }))
      .sort((a, b) => a.ms - b.ms);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      if (!cur.userId || cur.userId === prev.userId) continue;     // same author / system
      if (!opsIds.has(cur.userId)) continue;                       // only score ops responders
      const g = hours(prev.ms, cur.ms);
      if (g > cfg.awayGapHours) continue;                          // off-hours, not a response
      gaps.push({
        source: "slack", channel, responderId: cur.userId, gapHours: g,
        ms: cur.ms, prevText: prev.text || "", text: cur.text || "",
        client: clientOf(`${prev.text} ${cur.text}`, cfg.clients)
      });
    }
  }
  return gaps;
}

// =====================================================================
// EMAIL: thread model.
//   threads: [{ id, subject, link, messages:[{ fromAddr, to:[], cc:[], dateMs }] }]
//   Qualify -> first-ops-reply latency per inbound; open = last msg inbound & stale.
// =====================================================================
export function fromEmail(threads, cfg = DEFAULT_CFG) {
  const opsAddrs = new Set(cfg.ops.map(o => o.handle.toLowerCase()));
  const qualify = cfg.qualifyAddrs.map(a => a.toLowerCase());
  const isOps = a => opsAddrs.has((a || "").toLowerCase());
  const gaps = [], open = [];

  for (const th of threads) {
    const msgs = [...th.messages].sort((a, b) => a.dateMs - b.dateMs);
    const everyone = new Set();
    for (const m of msgs) [m.fromAddr, ...(m.to || []), ...(m.cc || [])]
      .forEach(a => a && everyone.add(a.toLowerCase()));
    // qualifier: partnership@/cam@ present AND an ops teammate present
    const hasQualify = qualify.some(a => everyone.has(a));
    const hasOps = [...everyone].some(isOps);
    if (!hasQualify || !hasOps) continue;

    // first ops reply after each inbound (external) message
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i - 1], cur = msgs[i];
      if (isOps(cur.fromAddr) && !isOps(prev.fromAddr)) {
        gaps.push({
          source: "email", channel: "email", responderAddr: cur.fromAddr.toLowerCase(),
          gapHours: hours(prev.dateMs, cur.dateMs), ms: cur.dateMs,
          subject: th.subject, link: th.link,
          client: clientOf(`${th.subject} ${cur.text || ""}`, cfg.clients)
        });
      }
    }
    // open / overdue: latest message is inbound (external) and past warn
    const last = msgs[msgs.length - 1];
    if (last && !isOps(last.fromAddr)) {
      const overdue = hours(last.dateMs, cfg.nowMs ?? Date.now());
      if (overdue >= cfg.sla.warnHours) {
        open.push({
          source: "email", channel: "email", subject: th.subject, link: th.link,
          lastTouchBy: last.fromAddr, waitingOn: "Ops", overdueHours: round(overdue, 1),
          client: clientOf(th.subject, cfg.clients)
        });
      }
    }
  }
  return { gaps, open };
}

// ---------- per-person + team rollups ----------
function personRow(o, gaps) {
  const mine = gaps.filter(g => g.responderId === o.slackId || g.responderAddr === o.handle.toLowerCase());
  if (!mine.length) {
    return { name: o.name, handle: o.handle, role: o.role, color: o.color, na: true,
             note: "no qualifying replies in window", replies: 0 };
  }
  const hs = mine.map(g => g.gapHours);
  return {
    name: o.name, handle: o.handle, role: o.role, color: o.color,
    avgHours: round(mean(hs)), medianHours: round(median(hs)),
    replies: mine.length,
    onTimeRate: Math.round(hs.filter(h => h <= DEFAULT_CFG.sla.targetHours).length / hs.length * 100),
    fastest: round(Math.min(...hs)), slowest: round(Math.max(...hs)), trend: null
  };
}

// ---------- main builder ----------
export function build({ slack = {}, emailThreads = [] } = {}, cfg = DEFAULT_CFG) {
  const slackGaps = gapsFromSlack(slack, cfg);
  const { gaps: emailGaps, open: emailOpen } = fromEmail(emailThreads, cfg);
  const allGaps = [...slackGaps, ...emailGaps];

  const people = cfg.ops.map(o => personRow(o, allGaps));
  const scored = allGaps.map(g => g.gapHours);
  const slaTarget = cfg.sla.targetHours;

  // slowest replies (snapshot) + any open/overdue email items, by impact
  const slowFromGaps = [...allGaps].sort((a, b) => b.gapHours - a.gapHours).slice(0, 4).map(g => ({
    source: g.source, client: g.client || "—", channel: g.channel,
    subject: g.subject || (g.text || "").slice(0, 80) || "(thread)",
    link: g.link || "", lastTouchBy: "", waitingOn: "", gapHours: round(g.gapHours, 1)
  }));
  const slow = [...emailOpen.map(o => ({ ...o, gapHours: o.overdueHours })), ...slowFromGaps]
    .sort((a, b) => b.gapHours - a.gapHours).slice(0, 6);

  // per-client counts
  const clients = Object.keys(cfg.clients).map(name => {
    const ths = allGaps.filter(g => g.client === name).length;
    const open = emailOpen.filter(o => o.client === name).length;
    return { name, threads: ths, open, where: "auto" };
  });

  return {
    generatedAt: new Date(cfg.nowMs ?? Date.now()).toISOString().slice(0, 10),
    windowDays: cfg.windowDays, cadenceDays: cfg.cadenceDays,
    sources: { slack: Object.keys(slack).length > 0, email: emailThreads.length > 0 },
    sla: cfg.sla,
    team: {
      avgHours: round(mean(scored) ?? 0), medianHours: round(median(scored) ?? 0),
      slaHitRate: scored.length ? Math.round(scored.filter(h => h <= slaTarget).length / scored.length * 100) : 0,
      repliesAnalyzed: scored.length, threadsAnalyzed: emailThreads.length + Object.keys(slack).length,
      openSlow: slow.length
    },
    people, slow, clients
  };
}

// ---------- self-test ----------
function selftest() {
  const cfg = { ...DEFAULT_CFG, nowMs: Date.parse("2026-05-30T23:00:00Z") };
  const t0 = Date.parse("2026-05-20T15:00:00Z");
  const H = 36e5;
  const out = build({
    slack: {
      "#media-operations": [
        { ts: (t0 / 1000), userId: "U095TRKA220", text: "super.com tracking update" },
        { ts: (t0 / 1000) + 1800, userId: "U03C1MTSR55", text: "thanks, looks good" },    // Cam 0.5h
        { ts: (t0 / 1000) + 9000, userId: "U09UVJ43W06", text: "amp energybits make good" } // Wally 2h
      ]
    },
    emailThreads: [
      { id: "e1", subject: "Rella — June invoice", link: "#",
        messages: [
          { fromAddr: "client@rella.com", to: ["partnership@spotsnow.io"], cc: ["aiza@spotsnow.io"], dateMs: t0 },
          { fromAddr: "aiza@spotsnow.io", to: ["client@rella.com"], cc: [], dateMs: t0 + 3 * H } // Aiza 3h
        ] },
      { id: "e2", subject: "Bolster kickoff", link: "#",
        messages: [ // last msg inbound -> open/overdue
          { fromAddr: "ops@bolster.com", to: ["cam@spotsnow.io"], cc: ["wally@spotsnow.io"], dateMs: cfg.nowMs - 20 * H }
        ] },
      { id: "e3", subject: "unrelated", link: "#",
        messages: [ { fromAddr: "x@y.com", to: ["random@z.com"], cc: [], dateMs: t0 } ] } // should be filtered out
    ]
  }, cfg);

  const cam = out.people.find(p => p.name === "Cam Pritchard");
  const aiza = out.people.find(p => p.name === "Aiza");
  const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  -", m); };
  assert(cam.avgHours === 0.5, "Cam avg = 0.5h");
  assert(aiza.replies === 1 && aiza.avgHours === 3, "Aiza scored 1 email reply at 3h");
  assert(out.team.repliesAnalyzed === 3, "3 reply gaps total (e3 filtered out)");
  assert(out.slow.some(s => s.gapHours === 20), "Bolster open item surfaced at 20h overdue");
  assert(out.sources.slack && out.sources.email, "both sources flagged on");
  console.log("\nDATA preview:\n", JSON.stringify(out, null, 2).slice(0, 600), "…");
}

if (process.argv[1] && process.argv[1].endsWith("compute.mjs") && process.argv.includes("--selftest")) {
  selftest();
}
