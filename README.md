# katalyst-xspec example: a login.gov-style service with TOTP

An example of a project that uses [katalyst-xspec](https://github.com/esimplicityinc/katalyst-xspec) to test a service whose users sign in with **login.gov** and an **authenticator app** (TOTP). Everything runs locally, and [CI](.github/workflows/test.yml) runs the same thing on every push:

| Piece | What it is | Where |
|---|---|---|
| Identity provider | Keycloak 26, set up like login.gov | `keycloak/logingov-local-realm.json`, `docker-compose.yml` → http://localhost:8180 |
| Service under test | "Benefits Application", a small BFF (backend-for-frontend) | `app/server.mjs` → http://localhost:4100 |
| Tests | A katalyst-xspec project (`katalyst-xspec init`), configured only in `.env` | `tests/` |

All credentials and secrets in this repo are for local test users only.

Library docs: [Apps with a BFF login](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication/#apps-with-a-bff-login), [One-time passcodes](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication/#one-time-passcodes-totp), [API calls with the browser session](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication/#api-calls-with-the-browser-session), [Session reuse](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication/#session-reuse).

## How it mirrors login.gov

| login.gov | Here |
|---|---|
| Users sign in with a password, then a second factor; the **authentication app** option is TOTP | Keycloak realm `logingov-local`. Every user has a password and an OTP credential (TOTP, SHA1, 6 digits, 30 s) |
| A code can be used only once | `otpPolicyCodeReusable: false` |
| No machine-to-machine logins; only users sign in, through the browser | The client allows the authorization code flow only (no password grant, no service accounts) |
| Identity verification levels: IAL1 (self-asserted) and IAL2 (verified, incl. facial match) | User attribute `ial` (`1` or `2`) and `verified_at`, put in the ID token as claims |
| The app asks for a level with `acr_values` | The app sends login.gov's `http://idmanagement.gov/ns/assurance/ial/2` (Keycloak logs a warning and ignores it) |
| The partner app (here a BFF) exchanges the code on its server, then gives the browser its own session | `/auth/start` → Keycloak → `/auth/callback` (code + PKCE exchanged with a client secret) → `benefits_sid` cookie |
| The app's API trusts its own session, not login.gov tokens | `/api/*` accepts only the `benefits_sid` cookie, with no bearer tokens |

Test users (all from the realm file):

| User | Password | OTP secret | IAL | Role in the tests |
|---|---|---|---|---|
| `facial@test.local` | `password` | `logingov-local-otp-secret` | 2 | `applicant`: can apply |
| `basic@test.local` | `password` | `logingov-local-otp-secret` | 1 | `unverified`: gets 403 when applying |
| `caseworker@test.local` | `caseworker-password` | `caseworker-otp-secret` | 2 | `admin`: shows a per-role secret |

Keycloak stores OTP secrets as plain text, so the tests use `AUTH_OTP_ENCODING=latin1` (the same as `OTPAuth.Secret.fromLatin1(...)`). To sign in by hand at http://localhost:4100, add the secret to an authenticator app in its base32 form (`NRXWO2LOM5XXMLLMN5RWC3BNN52HALLTMVRXEZLU` for `logingov-local-otp-secret`), or print a code with:

```bash
node -e "import('@esimplicitylabs/katalyst-xspec').then(m => console.log(m.generateTotp({ secret: 'logingov-local-otp-secret', encoding: 'latin1' })))"
```

(run that from `tests/`, after `npm install`).

## Run it

Needs Docker and Node 20+. With [just](https://github.com/casey/just) installed:

```bash
just setup     # npm install, Chromium, .env from .env.example
just up        # Keycloak (waits until ready)
just app       # the BFF on :4100 (leave it running; new terminal for the rest)
just test      # the scenarios, 4 workers
just down      # stop Keycloak
```

Without `just`:

```bash
docker compose up -d --wait
node app/server.mjs &
cd tests && cp .env.example .env && npm install && npx playwright install chromium
WORKERS=4 npm test
```

## The test project

Nothing in `tests/features/steps/` was changed from what `katalyst-xspec init` creates. All the login, TOTP and session handling comes from `tests/.env`:

```bash
FRONTEND_URL=http://localhost:4100
UI_LOGIN_PATH=/auth/start          # the login starts at the app's own route
API_AUTH_MODE=ui-session           # API steps send the browser session's cookie
UI_SESSION_CHECK_PATH=/            # a saved session that lands on the provider from here has expired

AUTH_APPLICANT_USERNAME=facial@test.local
AUTH_APPLICANT_PASSWORD=password
AUTH_UNVERIFIED_USERNAME=basic@test.local
AUTH_UNVERIFIED_PASSWORD=password

AUTH_OTP_SECRET=logingov-local-otp-secret   # every role's authenticator secret
AUTH_OTP_ENCODING=latin1
CLEANUP_AUTH_ROLE=applicant                 # users can only delete their own applications
```

The scenarios, in `tests/features/`:

- `api/applications.feature`: a verified applicant applies through the cookie-only API, with cleanup; the API reports the IAL; an IAL1 user gets 403; no session gets 401.
- `ui/sign-in.feature`: a signed-in applicant sees the dashboard; an application created through the API shows up in the UI; and the sign-in itself (password page, then one-time code page) as a test of its own.

What happens in a run:

1. The first scenario that needs `applicant` (UI or API, in any worker) takes a lock and signs in through `/auth/start`, Keycloak's password page and its one-time code page, then saves the session to `tests/.xspec/auth/`. API-only scenarios use a headless browser of their own for this.
2. Every other scenario for that role, in every worker, restores the session. Each role signs in **once per run**.
3. A login never submits a code that another worker already used for that account. If it would, it waits for the next 30 s window, which is why `playwright.config.ts` sets `timeout: 90_000`.
4. Cleanup deletes the created applications with the applicant's session.

Try the expired-session handling: while a run is going (or between runs with `UI_SESSION_SCOPE=persistent`), log everyone out of the app with `curl -X POST http://localhost:4100/__test/expire-sessions`. The next scenario notices that its saved session lands on Keycloak, signs in again, and saves the new session for the other workers.

## Against the real login.gov sandbox

The tests wouldn't change. The app would point at `https://idp.int.identitysandbox.gov` (with `private_key_jwt` client authentication, which login.gov requires), and `tests/.env` would get the sandbox test accounts' usernames, passwords and authentication-app secrets. Check login.gov's partner terms before automating sign-ins against the sandbox. For production, use tests that don't sign in, or a test login the app provides.
