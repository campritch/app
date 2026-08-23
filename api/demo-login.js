// Password gate for the /demos area. POST a password; on match, set a signed
// httpOnly cookie (sn_demo) reusing the same HMAC session helper as Google auth.
// GET ?signout=1 clears it. This is a shared demo password, separate from the
// Google-OAuth tiers — it does not touch any @spotsnow.io login.
import { signSession, verifySession } from '../lib/auth.js';
import { loginPage } from '../lib/demo-gate.js';

const COOKIE = 'sn_demo';
const MAXAGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_PASSWORD = 'spotsnow2026';

function safeNext(next) {
  const n = (next || '/demos').toString();
  return n.startsWith('/') && !n.startsWith('//') ? n : '/demos';
}

export default async function handler(req, res) {
  const secret = process.env.SESSION_SECRET;

  // Sign out
  if (req.method === 'GET' && req.query?.signout !== undefined) {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
    res.writeHead(302, { Location: '/demos' });
    return res.end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  if (!secret) {
    return res.status(500).json({ error: 'auth not configured' });
  }

  // Body arrives as parsed object (JSON / urlencoded) or raw string.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { body = Object.fromEntries(new URLSearchParams(body)); }
  }
  const password = (body?.password || '').toString();
  const next = safeNext(body?.next);
  const expected = process.env.DEMO_PASSWORD || DEFAULT_PASSWORD;

  if (password !== expected) {
    res.status(401);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(loginPage(next, true));
  }

  const token = await signSession('demo', secret);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; Max-Age=${MAXAGE}; HttpOnly; SameSite=Lax; Secure`);
  res.writeHead(302, { Location: next });
  return res.end();
}

// Exported for middleware use if needed.
export async function hasDemoCookie(cookieHeader, secret) {
  const m = (cookieHeader || '').match(/(?:^|; )sn_demo=([^;]+)/);
  if (!m || !secret) return false;
  const s = await verifySession(m[1], secret);
  return !!s;
}
