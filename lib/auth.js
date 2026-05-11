// Shared auth helpers for edge middleware and edge API routes.
// HMAC-signs short payloads (sessions + OAuth state) using SESSION_SECRET.

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

const enc = new TextEncoder();
const dec = new TextDecoder();

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str) {
  const padded = str + '='.repeat((4 - str.length % 4) % 4);
  const standard = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return dec.decode(bytes);
}

export async function signSession(email, secret) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = b64urlEncode(JSON.stringify({ email, exp }));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifySession(token, secret) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await hmac(secret, payload);
  if (!timingSafeEq(sig, expected)) return null;
  let data;
  try { data = JSON.parse(b64urlDecode(payload)); } catch { return null; }
  if (!data.email || !data.exp || Date.now() > data.exp) return null;
  return data;
}

export async function signState(next, secret) {
  const exp = Date.now() + STATE_TTL_MS;
  const nonce = crypto.randomUUID();
  const payload = b64urlEncode(JSON.stringify({ next, exp, nonce }));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifyState(token, secret) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await hmac(secret, payload);
  if (!timingSafeEq(sig, expected)) return null;
  let data;
  try { data = JSON.parse(b64urlDecode(payload)); } catch { return null; }
  if (!data.exp || Date.now() > data.exp) return null;
  return data;
}

export function decodeIdToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  return JSON.parse(b64urlDecode(parts[1]));
}

function timingSafeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const CEO_EMAIL = 'cam@spotsnow.io';
export const TEAM_DOMAINS = new Set(['spotsnow.io', 'dropstation.io']);

export function classifyEmail(email) {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (lower === CEO_EMAIL) return 'ceo';
  const domain = lower.split('@')[1];
  if (TEAM_DOMAINS.has(domain)) return 'team';
  return 'guest';
}

export function hasAccess(userTier, requiredTier) {
  if (requiredTier === 'open') return true;
  if (requiredTier === 'team') return userTier === 'ceo' || userTier === 'team';
  if (requiredTier === 'ceo') return userTier === 'ceo';
  return false;
}
