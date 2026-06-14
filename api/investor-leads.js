// Read-only feed for the investor-list dashboard.
// Password-gated (NOT Google auth). Returns the captured leads from Vercel Blob.
//
// Env (Vercel dashboard):
//   INVESTOR_DASH_PASSWORD  - the shared password for the dashboard
//   BLOB_READ_WRITE_TOKEN   - already configured

const BLOB_KEY = "investors/leads.json";

export default async function handler(req, res) {
  const expected = process.env.INVESTOR_DASH_PASSWORD;
  if (!expected) return res.status(500).json({ error: "INVESTOR_DASH_PASSWORD not configured" });

  const password = req.headers["x-investor-password"] || req.query?.password;
  if (password !== expected) return res.status(401).json({ error: "bad password" });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not configured" });
  }

  try {
    const { get } = await import("@vercel/blob");
    let data = { leads: [], updated_at: null };
    try {
      const result = await get(BLOB_KEY, { access: "private" });
      if (result?.stream) {
        const parsed = JSON.parse(await new Response(result.stream).text());
        if (Array.isArray(parsed?.leads)) data = parsed;
      }
    } catch { /* no file yet */ }

    // Newest activity first.
    data.leads.sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened));
    return res.status(200).json({ count: data.leads.length, updated_at: data.updated_at, leads: data.leads });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 10 };
