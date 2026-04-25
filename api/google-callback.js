import { verifyState, signSession, decodeIdToken, classifyEmail } from '../lib/auth.js';

export const config = { runtime: 'edge' };

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export default async function handler(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return errorPage(`Google sign-in cancelled: ${error}`);
  }
  if (!code || !stateParam) {
    return errorPage('Missing code or state.');
  }

  const secret = process.env.SESSION_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret || !clientId || !clientSecret) {
    return errorPage('Auth not configured.');
  }

  const state = await verifyState(stateParam, secret);
  if (!state) {
    return errorPage('Invalid or expired sign-in state. Please try again.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${url.origin}/api/google-callback`,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenRes.ok) {
    return errorPage('Could not exchange code with Google.');
  }

  const { id_token } = await tokenRes.json();
  if (!id_token) {
    return errorPage('No ID token from Google.');
  }

  let claims;
  try { claims = decodeIdToken(id_token); } catch { return errorPage('Bad ID token.'); }

  if (!claims.email || claims.email_verified === false) {
    return errorPage('Your Google account does not have a verified email.');
  }

  const email = String(claims.email).toLowerCase();
  const tier = classifyEmail(email);
  if (tier === 'guest') {
    return forbiddenPage(email);
  }

  const session = await signSession(email, secret);

  return new Response(null, {
    status: 302,
    headers: {
      'Location': state.next || '/',
      'Set-Cookie': `sn_user=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
    }
  });
}

function errorPage(message) {
  return new Response(shell('Sign-in error', message, true), {
    status: 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function forbiddenPage(email) {
  const message = `${email} doesn't have access to spotsnow.wiki. Sign in with a SpotsNow or Dropstation Google account.`;
  return new Response(shell('Access denied', message, true), {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function shell(title, message, showSwitch) {
  const switchBtn = showSwitch
    ? `<a class="btn" href="/api/google-logout?next=/api/google-login">Try a different account</a>`
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} — SpotsNow Wiki</title>
<meta name="robots" content="noindex"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  :root { --navy:#17212b; --coral:#ff6267; --grey:#5a6472; --bg:#fafafa; --border:#dee0e4; --white:#fff; }
  *,*::before,*::after { box-sizing:border-box; }
  html,body { height:100%; }
  body { margin:0; font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; color:var(--navy); background:var(--bg); display:flex; align-items:center; justify-content:center; padding:24px; -webkit-font-smoothing:antialiased; }
  .card { width:100%; max-width:420px; background:var(--white); border:1px solid var(--border); border-radius:20px; padding:40px 32px; box-shadow:0 4px 24px rgba(14,19,35,0.04); text-align:center; }
  .logo { width:48px; height:48px; border-radius:14px; background:var(--coral); display:inline-flex; align-items:center; justify-content:center; margin-bottom:20px; }
  h1 { font-size:20px; font-weight:700; margin:0 0 8px; letter-spacing:-0.3px; }
  p { font-size:14px; color:var(--grey); margin:0 0 24px; line-height:1.5; }
  .btn { display:inline-block; font-size:14px; font-weight:600; color:var(--white); background:var(--navy); border-radius:10px; padding:12px 18px; text-decoration:none; }
  .btn:hover { background:#0e1323; }
  .footer { margin-top:24px; font-size:11px; color:#8a95a3; letter-spacing:0.3px; }
</style></head>
<body><main class="card">
  <div class="logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 12h8a5 5 0 005-5V5M18 12l-4-4M18 12l-4 4" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <h1>${title}</h1>
  <p>${message}</p>
  ${switchBtn}
  <p class="footer">spotsnow.wiki</p>
</main></body></html>`;
}
