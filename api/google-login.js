import { signState } from '../lib/auth.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const next = sanitizeNext(url.searchParams.get('next'));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.SESSION_SECRET;
  if (!clientId || !secret) {
    return new Response('Auth not configured. Set GOOGLE_CLIENT_ID and SESSION_SECRET.', { status: 500 });
  }

  const state = await signState(next, secret);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', `${url.origin}/api/google-callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  return Response.redirect(authUrl.toString(), 302);
}

function sanitizeNext(next) {
  if (!next || typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
