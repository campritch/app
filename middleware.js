import { verifySession, classifyEmail, hasAccess } from './lib/auth.js';
import { loginPage } from './lib/demo-gate.js';

// Three Google-OAuth tiers:
//   ceo  — only cam@spotsnow.io
//   team — anyone with @spotsnow.io or @dropstation.io
//   open — anyone (not listed → middleware doesn't fire)
// Plus a separate shared-PASSWORD demo area (sn_demo cookie), independent of
// the Google login. Demo paths are checked first and never touch the tiers.

const CEO_PATHS = new Set([
  '/nav', '/nav.html',
  '/strategy', '/strategy.html',
  '/ceo-dashboard', '/ceo-dashboard.html',
  '/bi', '/bi.html',
  '/api/gtm-data'
]);

const TEAM_PATHS = new Set([
  '/ad-ops', '/ad-ops.html',
  '/chat', '/chat-ui.html',
  '/intelligence', '/intelligence.html',
  '/proposal', '/proposal.html',
  '/ear-check', '/ear-check.html',
  '/empty-state', '/empty-state.html',
  '/home', '/home.html',
  '/homepage', '/homepage.html',
  '/landing', '/landing.html',
  '/media-plans', '/media-plans.html',
  '/new-homepage', '/new-homepage.html'
]);

// Shared-password demo area. Includes the clean rewrite paths AND the real
// files behind them (iframes / rewrite targets) so nothing is reachable
// ungated.
const DEMO_PATHS = new Set([
  '/demos', '/demos.html',
  '/acme', '/acme-os.html',
  '/acme-inventory.html', '/acme-vetting.html',
  '/outbound', '/acme-outbound.html',
  '/financialdashboard', '/financial-dashboard-preview.html'
]);

// VC outreach workspace: its own shared password (sn_vc cookie), separate
// from the client-demo password so fundraising data never leaks through it.
const VC_PATHS = new Set([
  '/investorcrm', '/raise', '/vc-crm', '/vc-crm.html',
  '/vc-fund-data.js' // real investor pipeline data - must never be open
]);

export const config = {
  matcher: [
    '/investorcrm', '/raise', '/vc-crm', '/vc-crm.html', '/vc-fund-data.js',
    '/nav', '/nav.html',
    '/strategy', '/strategy.html',
    '/ceo-dashboard', '/ceo-dashboard.html',
    '/bi', '/bi.html',
    '/api/gtm-data',
    '/ad-ops', '/ad-ops.html',
    '/chat', '/chat-ui.html',
    '/intelligence', '/intelligence.html',
    '/proposal', '/proposal.html',
    '/ear-check', '/ear-check.html',
    '/empty-state', '/empty-state.html',
    '/home', '/home.html',
    '/homepage', '/homepage.html',
    '/landing', '/landing.html',
    '/media-plans', '/media-plans.html',
    '/new-homepage', '/new-homepage.html',
    '/demos', '/demos.html',
    '/acme', '/acme-os.html',
    '/acme-inventory.html', '/acme-vetting.html',
    '/outbound', '/acme-outbound.html',
    '/financialdashboard', '/financial-dashboard-preview.html'
  ]
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // ── VC outreach workspace (own password, checked first) ──
  if (VC_PATHS.has(pathname)) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) return; // not configured -> leave open (matches tier behavior)
    const cookie = request.headers.get('cookie') || '';
    const m = cookie.match(/(?:^|; )sn_vc=([^;]+)/);
    const ok = m ? await verifySession(m[1], secret) : null;
    if (ok) return;
    return new Response(loginPage(pathname + url.search, false, {
      title: 'SpotsNow raise',
      sub: 'Enter the workspace password.',
      action: '/api/vc-login'
    }), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  // ── Shared-password demo area (checked first, independent of Google tiers) ──
  if (DEMO_PATHS.has(pathname)) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) return; // not configured -> leave open (matches tier behavior)
    const cookie = request.headers.get('cookie') || '';
    const m = cookie.match(/(?:^|; )sn_demo=([^;]+)/);
    const ok = m ? await verifySession(m[1], secret) : null;
    if (ok) return;
    return new Response(loginPage(pathname + url.search), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  // ── Google-OAuth tiers ──
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
  :root { --navy:#17212b; --grey:#5a6472; --bg:#fafafa; --border:#dee0e4; --white:#fff; }
  *,*::before,*::after { box-sizing:border-box; }
  html,body { height:100%; margin:0; }
  body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; color:var(--navy); background:var(--bg); display:flex; align-items:center; justify-content:center; padding:24px; -webkit-font-smoothing:antialiased; }
  .card { width:100%; max-width:420px; background:var(--white); border:1px solid var(--border); border-radius:20px; padding:40px 32px; box-shadow:0 4px 24px rgba(14,19,35,0.04); text-align:center; }
  .logo { width:48px; height:48px; border-radius:14px; background:var(--navy); display:inline-flex; align-items:center; justify-content:center; margin-bottom:20px; }
  h1 { font-size:20px; font-weight:700; margin:0 0 8px; letter-spacing:-0.3px; }
  p { font-size:14px; color:var(--grey); margin:0 0 12px; line-height:1.5; }
  .email { font-weight:600; color:var(--navy); }
  .btn { display:inline-block; margin-top:16px; font-size:14px; font-weight:600; color:var(--white); background:var(--navy); border-radius:10px; padding:12px 18px; text-decoration:none; }
  .btn:hover { background:#0e1323; }
  .footer { margin-top:24px; font-size:11px; color:#8a95a3; letter-spacing:0.3px; }
</style></head>
<body><main class="card">
  <div class="logo"><svg width="26" height="24" viewBox="0 0 78.1 73.2" fill="none"><path d="M78.078 1.79314L75.3917 22.0607C75.3043 22.6722 74.9112 23.1527 74.3434 23.3492C74.1686 23.4147 73.9939 23.4584 73.8192 23.4584C73.4042 23.4584 73.0111 23.3055 72.7272 23.0216L66.6994 17.3214L39.1154 47.1767C38.351 48.0066 37.2809 48.4652 36.2107 48.4652C35.5774 48.4652 34.944 48.3123 34.3543 48.0066L18.6514 39.7074C16.7076 38.6809 15.965 36.2785 16.9915 34.3347C18.018 32.391 20.3986 31.6484 22.3423 32.6749L35.359 39.5545L60.9336 11.8614L55.3207 6.55425C54.9058 6.13929 54.731 5.52778 54.9058 4.95994C55.0586 4.3921 55.5391 3.95529 56.1288 3.84609L76.2216 0.0240946C76.7239 -0.0632654 77.2262 0.0896158 77.5975 0.439056C77.9688 0.788496 78.1435 1.29082 78.078 1.79314ZM0.0218405 38.4188C0.0218405 57.5725 15.5501 73.1007 34.7038 73.1007C53.8574 73.1007 69.3857 57.5725 69.3857 38.4188C69.3857 33.7887 68.4684 29.3771 66.8304 25.3585L59.0772 33.7451C59.3611 35.252 59.514 36.8245 59.514 38.4188C59.514 52.1343 48.3974 63.2509 34.6819 63.2509C20.9664 63.2509 9.84984 52.1343 9.84984 38.4188C9.84984 24.7033 20.9664 13.5867 34.6819 13.5867C39.5959 13.5867 44.1823 15.0282 48.048 17.4961L54.8184 10.1579C49.14 6.09562 42.1949 3.71506 34.6819 3.71506C15.5282 3.71506 0 19.2433 0 38.397L0.0218405 38.4188Z" fill="#ffffff"/></svg></div>
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
