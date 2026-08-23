// Password gate for the VC outreach workspace (/raise, /vc-crm.html).
// Same shape as demo-login but a separate cookie + password so the fundraising
// CRM is never reachable with the shared client-demo password.
import { signSession } from '../lib/auth.js';
import { loginPage } from '../lib/demo-gate.js';

const COOKIE = 'sn_vc';
const MAXAGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_PASSWORD = 'raise2026';

export const GATE_OPTS = {
  title: 'SpotsNow raise',
  sub: 'Enter the workspace password.',
  action: '/api/vc-login'
};

function safeNext(next) {
  const n = (next || '/raise').toString();
  return n.startsWith('/') && !n.startsWith('//') ? n : '/raise';
}

export default async function handler(req, res) {
  const secret = process.env.SESSION_SECRET;

  // Sign out
  if (req.method === 'GET' && req.query?.signout !== undefined) {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
    res.writeHead(302, { Location: '/raise' });
    return res.end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  if (!secret) {
    return res.status(500).json({ error: 'auth not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { body = Object.fromEntries(new URLSearchParams(body)); }
  }
  const password = (body?.password || '').toString();
  const next = safeNext(body?.next);
  const expected = process.env.VC_PASSWORD || DEFAULT_PASSWORD;

  if (password !== expected) {
    res.status(401);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(loginPage(next, true, GATE_OPTS));
  }

  const token = await signSession('vc', secret);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; Max-Age=${MAXAGE}; HttpOnly; SameSite=Lax; Secure`);
  res.writeHead(302, { Location: next });
  return res.end();
}
