export const config = {
  matcher: ['/', '/index.html', '/api/wiki-auth', '/bi', '/bi.html', '/api/gtm-data']
};

const WIKI_COOKIE = 'sn_wiki';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  const isBi = pathname === '/bi' || pathname === '/bi.html' || pathname === '/api/gtm-data';
  return isBi ? biAuth(request) : wikiAuth(request, pathname);
}

function biAuth(request) {
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
      if ((sep >= 0 ? decoded.slice(sep + 1) : '') === expected) return;
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

async function wikiAuth(request, pathname) {
  const expected = process.env.WIKI_PASSWORD;
  if (!expected) {
    console.warn('[middleware] WIKI_PASSWORD not set — / is currently unprotected');
    return;
  }
  const validToken = await tokenFor(expected);

  if (pathname === '/api/wiki-auth') {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    let body = {};
    try { body = await request.json(); } catch (_) {}
    if (body.password === expected) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `${WIKI_COOKIE}=${validToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`
        }
      });
    }
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|; )${WIKI_COOKIE}=([^;]+)`));
  if (match && match[1] === validToken) return;

  return new Response(loginHtml(), {
    status: 401,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function tokenFor(pwd) {
  const data = new TextEncoder().encode(pwd + '|spotsnow-wiki');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function loginHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SpotsNow Wiki</title>
<meta name="robots" content="noindex" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
:root {
  --navy: #17212b;
  --coral: #ff6267;
  --dark: #0e1323;
  --grey-1: #8a95a3;
  --text-primary: #17212b;
  --text-secondary: #5a6472;
  --border: #C5CBD5;
  --border-light: #dee0e4;
  --white: #ffffff;
  --bg-page: #fafafa;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px; line-height: 1.5;
  color: var(--dark);
  background: var(--bg-page);
  -webkit-font-smoothing: antialiased;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.card {
  width: 100%; max-width: 380px;
  background: var(--white);
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 40px 32px 32px;
  box-shadow: 0 4px 24px rgba(14, 19, 35, 0.04);
  text-align: center;
}
.card__logo {
  width: 48px; height: 48px; border-radius: 14px;
  background: var(--coral);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 20px;
}
.card__logo svg { display: block; }
.card__title {
  margin: 0 0 6px;
  font-size: 20px; font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text-primary);
}
.card__subtitle {
  margin: 0 0 28px;
  font-size: 13px;
  color: var(--grey-1);
}
form { text-align: left; }
label {
  display: block;
  font-size: 12px; font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin: 0 0 8px;
}
.input-wrap {
  position: relative;
}
input[type="password"] {
  width: 100%;
  font: inherit; font-size: 14px;
  color: var(--text-primary);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
  -webkit-appearance: none; appearance: none;
}
input[type="password"]:focus {
  outline: none;
  border-color: var(--coral);
  box-shadow: 0 0 0 3px rgba(255, 98, 103, 0.15);
}
.error {
  margin: 10px 0 0;
  font-size: 12px; color: var(--coral);
  min-height: 16px;
}
button {
  width: 100%;
  margin-top: 16px;
  font: inherit; font-size: 14px; font-weight: 600;
  color: var(--white);
  background: var(--navy);
  border: none; border-radius: 10px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s, transform 0.05s;
}
button:hover { background: var(--dark); }
button:active { transform: translateY(1px); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.footer {
  margin-top: 28px;
  font-size: 11px; color: var(--grey-1);
  letter-spacing: 0.3px;
}
</style>
</head>
<body>
<main class="card">
  <div class="card__logo" aria-hidden="true">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 12h8a5 5 0 005-5V5M18 12l-4-4M18 12l-4 4" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <h1 class="card__title">SpotsNow Wiki</h1>
  <p class="card__subtitle">Enter the password to continue.</p>
  <form id="f" autocomplete="on">
    <label for="p">Password</label>
    <div class="input-wrap">
      <input id="p" name="password" type="password" autocomplete="current-password" required autofocus />
    </div>
    <p class="error" id="err" role="alert"></p>
    <button type="submit" id="b">Unlock</button>
  </form>
  <p class="footer">spotsnow.wiki</p>
</main>
<script>
(function () {
  var f = document.getElementById('f');
  var p = document.getElementById('p');
  var b = document.getElementById('b');
  var err = document.getElementById('err');
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.textContent = '';
    b.disabled = true;
    var original = b.textContent;
    b.textContent = 'Unlocking…';
    try {
      var res = await fetch('/api/wiki-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: p.value })
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      err.textContent = 'Incorrect password.';
    } catch (_) {
      err.textContent = 'Something went wrong. Try again.';
    }
    b.disabled = false;
    b.textContent = original;
    p.select();
  });
})();
</script>
</body>
</html>`;
}
