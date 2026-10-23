// "Permit Renewal" BFF: the API behind the Next.js frontend in ../web.
// Like a typical login.gov partner backend it owns the login:
//   /v1/auth/start/    -> redirect to the identity provider (Keycloak standing in for login.gov)
//   /v1/auth/callback/ -> exchange the code on the server, set the __Host-ses session cookie
// The API accepts only that cookie, and changing requests also need the
// X-CSRFToken that GET /v1/application hands out as a response header.
//
// The browser reaches it through the frontend (Next.js proxies /v1/* here),
// so the cookie belongs to localhost; API tests can call it directly on :8000.
//
// No dependencies: node bff/server.mjs
import http from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8000);
// Public URL of the frontend: the browser comes back to its /v1/auth/callback/.
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
const ISSUER = process.env.OIDC_ISSUER || 'http://localhost:8180/realms/logingov-local';
const CLIENT_ID = process.env.OIDC_CLIENT_ID || 'permits-bff';
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || 'permits-bff-local-secret';
const SESSION_MINUTES = Number(process.env.SESSION_MINUTES || 20);
const REDIRECT_URI = `${FRONTEND_URL}/v1/auth/callback/`;
const COOKIE = '__Host-ses';
const CSRF_HEADER = 'X-CSRFToken';

const pending = new Map(); // state -> { verifier, nonce, returnTo }
const sessions = new Map(); // sid -> { user, csrf, expires }
const applications = new Map(); // user sub -> application

const b64url = (buf) => buf.toString('base64url');
const cookie = (req, name) => new RegExp(`(?:^|; )${name.replace(/[-]/g, '\\-')}=([^;]+)`).exec(req.headers.cookie || '')?.[1];
let discovery;
async function oidc() {
  discovery ??= await fetch(`${ISSUER}/.well-known/openid-configuration`).then((r) => r.json());
  return discovery;
}

function sessionOf(req) {
  const sid = cookie(req, COOKIE);
  const s = sid && sessions.get(sid);
  if (!s) return undefined;
  if (s.expires < Date.now()) {
    sessions.delete(sid);
    return undefined;
  }
  return s;
}

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, { 'Content-Type': json ? 'application/json' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
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

function newApplication(user) {
  return {
    id: randomUUID(),
    status: 'in_progress',
    applicant: { email: user.email, ial: user.ial },
    personalInformation: null,
    updatedAt: new Date().toISOString(),
  };
}

const REQUIRED = ['surname', 'givenName', 'emailAddress', 'permitType'];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, FRONTEND_URL);
  // Accept paths with or without the trailing slash the frontend uses.
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const session = sessionOf(req);
  try {
    // ── Login (BFF) ──────────────────────────────────────────────
    if (path === '/v1/auth/start') {
      const { authorization_endpoint } = await oidc();
      const state = b64url(randomBytes(16));
      const verifier = b64url(randomBytes(32));
      const nonce = b64url(randomBytes(16));
      pending.set(state, { verifier, nonce, returnTo: url.searchParams.get('returnTo') || '/application/' });
      const auth = new URL(authorization_endpoint);
      auth.search = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: REDIRECT_URI,
        state,
        nonce,
        code_challenge: b64url(createHash('sha256').update(verifier).digest()),
        code_challenge_method: 'S256',
        acr_values: 'http://idmanagement.gov/ns/assurance/ial/2',
      }).toString();
      return redirect(res, auth.href);
    }
    if (path === '/v1/auth/callback') {
      const tx = pending.get(url.searchParams.get('state') || '');
      if (!tx) return send(res, 400, { error: 'invalid_state', message: 'Unknown or expired sign-in. Start again at /v1/auth/start/.' });
      pending.delete(url.searchParams.get('state'));
      const { token_endpoint } = await oidc();
      const tokens = await fetch(token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: url.searchParams.get('code') || '',
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code_verifier: tx.verifier,
        }),
      }).then((r) => r.json());
      if (!tokens.id_token) return send(res, 502, { error: 'token_exchange_failed', detail: tokens });
      const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
      if (claims.nonce !== tx.nonce) return send(res, 400, { error: 'nonce_mismatch' });
      const sid = randomUUID();
      sessions.set(sid, {
        user: { sub: claims.sub, email: claims.email, ial: Number(claims.ial || 1), name: claims.name },
        csrf: b64url(randomBytes(24)),
        expires: Date.now() + SESSION_MINUTES * 60_000,
      });
      return redirect(res, `${FRONTEND_URL}${tx.returnTo}`, {
        'Set-Cookie': `${COOKIE}=${sid}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MINUTES * 60}`,
      });
    }
    if (path === '/v1/auth/logout') {
      const sid = cookie(req, COOKIE);
      if (sid) sessions.delete(sid);
      return redirect(res, `${FRONTEND_URL}/`, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
    }

    // ── Test support (local only): drop every session, as if they expired ─
    if (path === '/__test/expire-sessions' && req.method === 'POST') {
      sessions.clear();
      return send(res, 204, '');
    }
    if (path === '/health') return send(res, 200, { ok: true });

    // ── API: session cookie only; changing requests also need the CSRF token ─
    if (path.startsWith('/v1/')) {
      if (!session) return send(res, 401, { error: 'unauthenticated' });
      const { user } = session;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET') && req.headers[CSRF_HEADER.toLowerCase()] !== session.csrf) {
        return send(res, 403, { error: 'csrf_token_invalid', message: `Send the ${CSRF_HEADER} from GET /v1/application.` });
      }
      if (path === '/v1/me') return send(res, 200, user);
      if (path === '/v1/application' && req.method === 'GET') {
        if (!applications.has(user.sub)) applications.set(user.sub, newApplication(user));
        // CSRF_IN=body: hand the token out in the JSON instead of a response header.
        if (process.env.CSRF_IN === 'body') return send(res, 200, { ...applications.get(user.sub), csrfToken: session.csrf });
        return send(res, 200, applications.get(user.sub), { [CSRF_HEADER]: session.csrf, 'Access-Control-Expose-Headers': CSRF_HEADER });
      }
      if (path === '/v1/application/personal-information' && req.method === 'PUT') {
        const app = applications.get(user.sub);
        if (!app) return send(res, 409, { error: 'no_application', message: 'GET /v1/application first.' });
        const body = await readJson(req);
        const missing = REQUIRED.filter((k) => !body?.[k]);
        if (!body || missing.length) return send(res, 422, { error: 'validation_failed', missing });
        app.personalInformation = body;
        app.updatedAt = new Date().toISOString();
        return send(res, 200, app);
      }
      if (path === '/v1/application' && req.method === 'DELETE') {
        applications.delete(user.sub);
        return send(res, 204, '');
      }
      return send(res, 404, { error: 'not found' });
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 500, { error: 'server_error', message: err.message });
  }
});

server.listen(PORT, () => console.log(`Permit renewal BFF on http://localhost:${PORT} (frontend ${FRONTEND_URL}, identity provider ${ISSUER})`));
