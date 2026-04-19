export const config = {
  matcher: ['/bi', '/bi.html', '/api/gtm-data']
};

export default function middleware(request) {
  const expected = process.env.BI_PASSWORD;

  if (!expected) {
    console.warn('[middleware] BI_PASSWORD not set — /bi is currently unprotected');
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
      'WWW-Authenticate': 'Basic realm="SpotsNow BI", charset="UTF-8"',
      'Content-Type': 'text/plain'
    }
  });
}
