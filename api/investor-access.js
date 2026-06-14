// Soft email gate for the SPV investor portal.
// - Validates email format
// - Persists each open to Vercel Blob (investors/leads.json) so the list survives
//   across devices and is visible on the password-gated dashboard
// - Pings Slack (optional) and sets the access cookie
// This is attribution, not security. No passwords, no accounts.
//
// Env (Vercel dashboard):
//   BLOB_READ_WRITE_TOKEN   - already configured (used by the strategy tool)
//   SLACK_INVESTOR_WEBHOOK  - incoming-webhook URL for a private #investors channel (optional)

const BLOB_KEY = "investors/leads.json";
const COOKIE = "sn_investor";        // httpOnly server grant
const SEEN   = "sn_investor_seen";   // JS-readable bypass flag (mirrors the client)
const MAXAGE = 60 * 60 * 24 * 90;    // 90 days
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  // Sign out: clear cookies.
  if (req.method === "GET" && req.query?.signout !== undefined) {
    res.setHeader("Set-Cookie", [
      `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
      `${SEEN}=; Path=/; Max-Age=0; SameSite=Lax`,
    ]);
    return res.status(200).json({ ok: true, signedOut: true });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }

  // Parse body (sendBeacon arrives as text; fetch as object).
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const email = (body?.email || "").toString().trim().toLowerCase();
  const event = body?.event === "view" ? "view" : "enter";
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: "invalid email" });
  }

  // Attribution context.
  const ua  = req.headers["user-agent"] || "unknown";
  const ip  = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const ref = req.headers["referer"] || req.headers["referrer"] || "direct";
  const now = new Date().toISOString();

  console.log("[investor-access]", JSON.stringify({ email, event, ip, ref }));

  // Persist to Blob (best-effort: never block the investor on a storage hiccup).
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const data = await readLeads();
      let rec = data.leads.find((l) => l.email === email);
      if (!rec) {
        rec = { email, firstOpened: now, lastOpened: now, opens: 1, ip, ref, ua };
        data.leads.push(rec);
      } else {
        rec.lastOpened = now;
        rec.opens = (rec.opens || 0) + 1;
        rec.ip = ip; rec.ref = ref; rec.ua = ua;
      }
      data.updated_at = now;
      await writeLeads(data);
    }
  } catch (e) {
    console.error("[investor-access] blob write failed:", e?.message || e);
  }

  // Real-time Slack ping, only on first entry (best-effort).
  if (event === "enter" && process.env.SLACK_INVESTOR_WEBHOOK) {
    try {
      await fetch(process.env.SLACK_INVESTOR_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `📂 *Investor portal opened*\n*${email}*\n• Referrer: ${ref}\n• IP: ${ip}` }),
      });
    } catch (e) {
      console.error("[investor-access] slack failed:", e?.message || e);
    }
  }

  // A repeat-view beacon doesn't need to re-set cookies.
  if (event === "enter") {
    res.setHeader("Set-Cookie", [
      `${COOKIE}=1; Path=/; Max-Age=${MAXAGE}; HttpOnly; SameSite=Lax; Secure`,
      `${SEEN}=1; Path=/; Max-Age=${MAXAGE}; SameSite=Lax`,
    ]);
  }
  return res.status(200).json({ ok: true });
}

async function readLeads() {
  const { get } = await import("@vercel/blob");
  try {
    const result = await get(BLOB_KEY, { access: "private" });
    if (result?.stream) {
      const text = await new Response(result.stream).text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.leads)) return parsed;
    }
  } catch { /* first write — no file yet */ }
  return { leads: [], updated_at: null };
}

async function writeLeads(data) {
  const { put } = await import("@vercel/blob");
  return put(BLOB_KEY, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}
