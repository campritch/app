import { verifySession, classifyEmail, hasAccess } from './lib/auth.js';

// Three tiers:
//   ceo  — only cam@spotsnow.io
//   team — anyone with @spotsnow.io or @dropstation.io
//   open — anyone (not listed → middleware doesn't fire)

const CEO_PATHS = new Set([
  '/nav', '/nav.html',
  '/strategy', '/strategy.html',
  '/ceo-dashboard', '/ceo-dashboard.html',
  '/bi', '/bi.html',
  '/api/gtm-data'
]);

const TEAM_PATHS = new Set([
  '/ad-ops', '/ad-ops.html',
  '/talking-points', '/talking-points.html',
  '/chat', '/chat-ui.html',
  '/proposal', '/proposal.html',
  '/ear-check', '/ear-check.html',
  '/pixel-setup', '/pixel-setup.html',
  '/submit-creative', '/submit-creative.html',
  '/youtube-article', '/youtube-article.html',
  '/empty-state', '/empty-state.html',
  '/home', '/home.html',
  '/homepage', '/homepage.html',
  '/landing', '/landing.html',
  '/media-plans', '/media-plans.html',
  '/new-homepage', '/new-homepage.html'
]);

export const config = {
  matcher: [
    '/nav', '/nav.html',
    '/strategy', '/strategy.html',
    '/ceo-dashboard', '/ceo-dashboard.html',
    '/bi', '/bi.html',
    '/api/gtm-data',
    '/ad-ops', '/ad-ops.html',
    '/talking-points', '/talking-points.html',
    '/chat', '/chat-ui.html',
    '/proposal', '/proposal.html',
    '/ear-check', '/ear-check.html',
    '/pixel-setup', '/pixel-setup.html',
    '/submit-creative', '/submit-creative.html',
    '/youtube-article', '/youtube-article.html',
    '/empty-state', '/empty-state.html',
    '/home', '/home.html',
    '/homepage', '/homepage.html',
    '/landing', '/landing.html',
    '/media-plans', '/media-plans.html',
    '/new-homepage', '/new-homepage.html'
  ]
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const requiredTier = CEO_PATHS.has(pathname) ? 'ceo'
                     : TEAM_PATHS.has(pathname) ? 'team'
                     : null;
  if (!requiredTier) return;

  const secret = process.env.SESSION_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!secret || !clientId) {
    console.warn('[middleware] Auth not configured — page open');
    return;
  }

  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|; )sn_user=([^;]+)/);
  const session = match ? await verifySession(match[1], secret) : null;

  if (!session) {
    const loginUrl = new URL('/api/google-login', url.origin);
    loginUrl.searchParams.set('next', pathname + url.search);
    return Response.redirect(loginUrl.toString(), 302);
  }

  const userTier = classifyEmail(session.email);
  if (!hasAccess(userTier, requiredTier)) {
    return forbiddenResponse(session.email, requiredTier);
  }
}

function forbiddenResponse(email, requiredTier) {
  const need = requiredTier === 'ceo'
    ? 'This page is for cam@spotsnow.io only.'
    : 'This page is for SpotsNow / Dropstation team members only.';
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Access denied — SpotsNow Wiki</title>
<meta name="robots" content="noindex"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  :root { --navy:#17212b; --coral:#ff6267; --grey:#5a6472; --bg:#fafafa; --border:#dee0e4; --white:#fff; }
  *,*::before,*::after { box-sizing:border-box; }
  html,body { height:100%; margin:0; }
  body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; color:var(--navy); background:var(--bg); display:flex; align-items:center; justify-content:center; padding:24px; -webkit-font-smoothing:antialiased; }
  .card { width:100%; max-width:420px; background:var(--white); border:1px solid var(--border); border-radius:20px; padding:40px 32px; box-shadow:0 4px 24px rgba(14,19,35,0.04); text-align:center; }
  .logo { width:48px; height:48px; border-radius:14px; background:var(--coral); display:inline-flex; align-items:center; justify-content:center; margin-bottom:20px; }
  h1 { font-size:20px; font-weight:700; margin:0 0 8px; letter-spacing:-0.3px; }
  p { font-size:14px; color:var(--grey); margin:0 0 12px; line-height:1.5; }
  .email { font-weight:600; color:var(--navy); }
  .btn { display:inline-block; margin-top:16px; font-size:14px; font-weight:600; color:var(--white); background:var(--navy); border-radius:10px; padding:12px 18px; text-decoration:none; }
  .btn:hover { background:#0e1323; }
  .footer { margin-top:24px; font-size:11px; color:#8a95a3; letter-spacing:0.3px; }
</style></head>
<body><main class="card">
  <div class="logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <h1>Access denied</h1>
  <p>You're signed in as <span class="email">${escapeHtml(email)}</span>.</p>
  <p>${need}</p>
  <a class="btn" href="/api/google-logout?next=/api/google-login">Try a different account</a>
  <p class="footer">spotsnow.wiki</p>
</main></body></html>`;
  return new Response(html, {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
