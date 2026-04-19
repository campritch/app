export const config = {
  matcher: ['/', '/index.html', '/bi', '/bi.html', '/api/gtm-data']
};

export default function middleware(request) {
  const { pathname } = new URL(request.url);
  const isBi = pathname === '/bi' || pathname === '/bi.html' || pathname === '/api/gtm-data';

  const expected = isBi ? process.env.BI_PASSWORD : process.env.WIKI_PASSWORD;
  const realm = isBi ? 'SpotsNow BI' : 'SpotsNow Wiki';
  const envName = isBi ? 'BI_PASSWORD' : 'WIKI_PASSWORD';

  if (!expected) {
    console.warn(`[middleware] ${envName} not set — ${pathname} is currently unprotected`);
    return;
  }

  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const sep = decoded.indexOf(':');
      const password = sep >= 0 ? decoded.slice(sep + 1) : '';
      if (password === expected) return;
    } catch (_) {}
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"`,
      'Content-Type': 'text/plain'
    }
  });
}
