export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const next = sanitizeNext(url.searchParams.get('next'));
  return new Response(null, {
    status: 302,
    headers: {
      'Location': next,
      'Set-Cookie': 'sn_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
    }
  });
}

function sanitizeNext(next) {
  if (!next || typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
