/**
 * Vercel serverless function: fetch YouTube transcript via Supadata API.
 * Requires SUPADATA_API_KEY env var set in Vercel dashboard.
 * Endpoint: POST /api/supadata  { videoId: "..." }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SUPADATA_API_KEY not configured' });

  const { videoId } = req.body || {};
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  const url = `https://api.supadata.ai/v1/youtube/transcript?videoId=${encodeURIComponent(videoId)}&text=true`;

  try {
    const r = await fetch(url, { headers: { 'x-api-key': apiKey } });
    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: data?.message || `Supadata error ${r.status}` });
    }

    // text=true returns { content: "plain string" }; segments fallback
    const transcript =
      typeof data.content === 'string'
        ? data.content
        : Array.isArray(data.content)
        ? data.content.map(s => s.text).join(' ')
        : '';

    if (!transcript) return res.status(404).json({ error: 'No transcript found' });

    return res.status(200).json({ transcript, videoId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
