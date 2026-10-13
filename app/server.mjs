// "Benefits Application": a small backend-for-frontend (BFF) like the one
// under test. It owns the login: /auth/start redirects to the identity
// provider (Keycloak standing in for login.gov), /auth/callback exchanges the
// code on the server and sets a session cookie. The API only accepts that
// cookie: no bearer tokens.
//
// No dependencies: node app/server.mjs
import http from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 4100);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const ISSUER = process.env.OIDC_ISSUER || 'http://localhost:8180/realms/logingov-local';
const CLIENT_ID = process.env.OIDC_CLIENT_ID || 'benefits-app';
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || 'benefits-app-local-secret';
const SESSION_MINUTES = Number(process.env.SESSION_MINUTES || 30);

const pending = new Map(); // state -> { verifier, nonce, returnTo }
const sessions = new Map(); // sid -> { user, expires }
const applications = new Map(); // id -> { id, owner, benefit, status, createdAt }

const b64url = (buf) => buf.toString('base64url');
const cookie = (req, name) => new RegExp(`(?:^|; )${name}=([^;]+)`).exec(req.headers.cookie || '')?.[1];
let discovery;
async function oidc() {
  discovery ??= await fetch(`${ISSUER}/.well-known/openid-configuration`).then((r) => r.json());
  return discovery;
}

function sessionOf(req) {
  const sid = cookie(req, 'benefits_sid');
  const s = sid && sessions.get(sid);
  if (!s) return undefined;
  if (s.expires < Date.now()) {
    sessions.delete(sid);
    return undefined;
  }
  return s.user;
}

const page = (title, body, user) => `<!doctype html><html><head><meta charset="utf-8"><title>${title} - Benefits</title>
<style>body{font-family:system-ui;margin:2rem;max-width:44rem}nav a{margin-right:1rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.3rem .6rem}</style></head>
<body><nav><a href="/">Home</a><a href="/applications">Applications</a>${user ? `<span>Signed in as ${user.email} (IAL${user.ial})</span> <a href="/auth/logout">Sign out</a>` : ''}</nav>
<h1>${title}</h1>${body}</body></html>`;

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, { 'Content-Type': json ? 'application/json' : 'text/html; charset=utf-8', ...headers });
  res.end(json ? JSON.stringify(body) : body);
}
const redirect = (res, to, headers = {}) => send(res, 302, '', { Location: to, ...headers });
const readJson = (req) =>
  new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c)).on('end', () => {
      try {
        resolve(JSON.parse(d || '{}'));
      } catch {
        resolve(undefined);
      }
    });
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, APP_URL);
  const user = sessionOf(req);
  try {
    // ── Login (BFF) ──────────────────────────────────────────────
    if (url.pathname === '/auth/start') {
      const { authorization_endpoint } = await oidc();
      const state = b64url(randomBytes(16));
      const verifier = b64url(randomBytes(32));
      const nonce = b64url(randomBytes(16));
      pending.set(state, { verifier, nonce, returnTo: url.searchParams.get('returnTo') || '/' });
      const auth = new URL(authorization_endpoint);
      auth.search = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: `${APP_URL}/auth/callback`,
        state,
        nonce,
        code_challenge: b64url(createHash('sha256').update(verifier).digest()),
        code_challenge_method: 'S256',
        // login.gov asks for an identity-verified (IAL2) user with these.
        acr_values: 'http://idmanagement.gov/ns/assurance/ial/2',
      }).toString();
      return redirect(res, auth.href);
    }
    if (url.pathname === '/auth/callback') {
      const tx = pending.get(url.searchParams.get('state') || '');
      if (!tx) return send(res, 400, page('Sign-in failed', '<p>Unknown or expired sign-in. <a href="/auth/start">Try again</a>.</p>'));
      pending.delete(url.searchParams.get('state'));
      const { token_endpoint } = await oidc();
      const tokens = await fetch(token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: url.searchParams.get('code') || '',
          redirect_uri: `${APP_URL}/auth/callback`,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code_verifier: tx.verifier,
        }),
      }).then((r) => r.json());
      if (!tokens.id_token) return send(res, 502, page('Sign-in failed', `<pre>${JSON.stringify(tokens)}</pre>`));
      // The token came straight from the provider over the back channel, so its claims can be read here.
      const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
      if (claims.nonce !== tx.nonce) return send(res, 400, page('Sign-in failed', '<p>Nonce mismatch.</p>'));
      const sid = randomUUID();
      sessions.set(sid, {
        user: { sub: claims.sub, email: claims.email, ial: Number(claims.ial || 1), name: claims.name },
        expires: Date.now() + SESSION_MINUTES * 60_000,
      });
      return redirect(res, tx.returnTo, { 'Set-Cookie': `benefits_sid=${sid}; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (url.pathname === '/auth/logout') {
      const sid = cookie(req, 'benefits_sid');
      if (sid) sessions.delete(sid);
      return redirect(res, '/', { 'Set-Cookie': 'benefits_sid=; Path=/; Max-Age=0' });
    }

    // ── Test support (local only): drop every session, as if they expired ─
    if (url.pathname === '/__test/expire-sessions' && req.method === 'POST') {
      sessions.clear();
      return send(res, 204, '');
    }

    // ── API: session cookie only ─────────────────────────────────
    if (url.pathname.startsWith('/api/')) {
      if (!user) return send(res, 401, { error: 'unauthenticated' });
      if (url.pathname === '/api/me') return send(res, 200, user);
      if (url.pathname === '/api/applications' && req.method === 'GET') {
        return send(res, 200, [...applications.values()].filter((a) => a.owner === user.sub));
      }
      if (url.pathname === '/api/applications' && req.method === 'POST') {
        if (user.ial < 2) return send(res, 403, { error: 'identity_verification_required', message: 'Applying needs a verified identity (IAL2).' });
        const body = await readJson(req);
        if (!body?.benefit) return send(res, 422, { error: 'benefit is required' });
        const app = { id: randomUUID(), owner: user.sub, benefit: body.benefit, status: 'submitted', createdAt: new Date().toISOString() };
        applications.set(app.id, app);
        return send(res, 201, app);
      }
      const m = /^\/api\/applications\/([^/]+)$/.exec(url.pathname);
      const app = m && applications.get(m[1]);
      if (m && (!app || app.owner !== user.sub)) return send(res, 404, { error: 'not found' });
      if (m && req.method === 'GET') return send(res, 200, app);
      if (m && req.method === 'DELETE') {
        applications.delete(app.id);
        return send(res, 204, '');
      }
      return send(res, 404, { error: 'not found' });
    }

    // ── Pages: logged out -> sign in ─────────────────────────────
    if (!user) return redirect(res, `/auth/start?returnTo=${encodeURIComponent(url.pathname)}`);
    if (url.pathname === '/') {
      return send(res, 200, page('Your benefits', `<p>Welcome, ${user.name || user.email}.</p><p><a href="/applications">View your applications</a></p>`, user));
    }
    if (url.pathname === '/applications') {
      const mine = [...applications.values()].filter((a) => a.owner === user.sub);
      const rows = mine.map((a) => `<tr><td>${a.benefit}</td><td>${a.status}</td><td>${a.createdAt}</td></tr>`).join('');
      return send(
        res,
        200,
        page('Your applications', mine.length ? `<table><tr><th>Benefit</th><th>Status</th><th>Submitted</th></tr>${rows}</table>` : '<p>No applications yet.</p>', user),
      );
    }
    send(res, 404, page('Not found', '<p>Nothing here.</p>', user));
  } catch (err) {
    send(res, 500, page('Error', `<pre>${err.message}</pre>`));
  }
});

server.listen(PORT, () => console.log(`Benefits app on ${APP_URL} (identity provider: ${ISSUER})`));
