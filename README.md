# katalyst-xspec example: a login.gov-style service with TOTP

[![Test](https://github.com/esimplicityinc/katalyst-xspec-logingov-example/actions/workflows/test.yml/badge.svg)](https://github.com/esimplicityinc/katalyst-xspec-logingov-example/actions/workflows/test.yml)

This repo shows how to test a service whose users sign in with **login.gov** and an **authenticator app** (TOTP), using [katalyst-xspec](https://github.com/esimplicityinc/katalyst-xspec). It's a complete, runnable setup:

- a **local identity provider** (Keycloak) set up to behave like login.gov,
- a small **service under test** whose login works like a typical login.gov partner app (a BFF),
- a **test project** that signs in through all of it, one-time codes included, with **no login code written**: just settings in `.env`.

CI runs all three on every push: there's a [GitHub Actions workflow](.github/workflows/test.yml) and a [GitLab CI equivalent](.gitlab-ci.yml) (see [Running in CI](#running-in-ci)).

> All usernames, passwords and OTP secrets in this repo belong to local test users. They aren't real credentials.

**Contents:** [The problem](#the-problem-this-solves) · [Quick start](#quick-start) · [What's in the repo](#whats-in-the-repo) · [Where to look first](#where-to-look-first) · [How a run works](#how-a-run-works) · [How it mirrors login.gov](#how-it-mirrors-logingov) · [Running in CI](#running-in-ci) · [Using this for your own service](#using-this-for-your-own-service) · [Troubleshooting](#troubleshooting) · [Docs](#further-reading)

---

## The problem this solves

Testing an app behind login.gov is awkward:

1. **Every sign-in needs a one-time code.** login.gov always requires a second factor, so a test has to produce a valid TOTP code, and each code works **only once**.
2. **There's no machine-to-machine login.** login.gov only signs in people, through a browser. You can't fetch a token for API tests.
3. **The app owns the session.** Partner apps usually exchange the login.gov code on their own server (a backend-for-frontend, BFF) and give the browser a session cookie. Their API accepts that cookie, not login.gov tokens.
4. **Parallel tests make it worse.** Workers signing in as the same user at the same moment send the same code, and all but one are rejected.

The usual result is a hand-written login script, a saved `user.json`, and flaky CI. With katalyst-xspec, the scenarios just say who's signed in:

```gherkin
Given I am logged in as "applicant"                 # browser, signed in
Given I am authenticated as "applicant" via API     # API calls carry the same session
```

The library does the rest: it goes through the provider's pages, generates the code, signs each role in **once per run** and shares that session with every worker, sends the session cookie on API calls, and replaces sessions that have expired. See the [Authentication guide](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication).

## Quick start

You need Docker, Node 20+, and (optionally) [just](https://github.com/casey/just).

```bash
git clone https://github.com/esimplicityinc/katalyst-xspec-logingov-example
cd katalyst-xspec-logingov-example

just setup     # npm install in tests/, download Chromium, create tests/.env
just up        # start Keycloak on :8180 and wait until it's ready
just app       # start the service on :4100 (leave it running)
just test      # in a second terminal: run the scenarios with 4 workers
```

Without `just`:

```bash
docker compose up -d --wait
node app/server.mjs &
cd tests && cp .env.example .env && npm install && npx playwright install chromium
WORKERS=4 npm test
```

You should see `7 passed`. The HTML report is in `tests/cucumber-report/index.html`.

To sign in by hand, open http://localhost:4100 and use `facial@test.local` / `password`. For the code, either add the secret `NRXWO2LOM5XXMLLMN5RWC3BNN52HALLTMVRXEZLU` to an authenticator app, or print the current code from `tests/`:

```bash
node -e "import('@esimplicitylabs/katalyst-xspec').then(m => console.log(m.generateTotp({ secret: 'logingov-local-otp-secret', encoding: 'latin1' })))"
```

When you're done: `just down` (or `docker compose down`).

## What's in the repo

```
.
├── docker-compose.yml                  Keycloak 26 on http://localhost:8180
├── keycloak/
│   └── logingov-local-realm.json       the login.gov stand-in: realm, client, users, OTP policy
├── app/
│   └── server.mjs                      the service under test (no dependencies) on http://localhost:4100
├── tests/                              the test project, created with `npx @esimplicitylabs/katalyst-xspec init`
│   ├── .env.example                    ← all the auth configuration lives here
│   ├── playwright.config.ts            scaffolded; a 90 s timeout, no TUI project
│   ├── features/
│   │   ├── api/applications.feature    API scenarios (cookie-only API)
│   │   ├── ui/sign-in.feature          browser scenarios
│   │   └── steps/                      scaffolded: no custom steps (TUI wiring removed)
│   └── README.md                       how the test project is put together
├── justfile                            setup / up / app / test / expire / down
├── .github/workflows/test.yml          GitHub Actions: Keycloak + app + tests on every push
├── .gitlab-ci.yml                      the same for GitLab CI
└── ci/
    ├── import-realm.mjs                creates the realm through Keycloak's admin API (GitLab)
    └── wait-for.mjs                    waits for Keycloak / the app to answer
```

## Where to look first

Read these in order.

1. **[`tests/.env.example`](tests/.env.example)**: the entire auth setup. Each line is commented. These are the ones that matter:

   | Setting | What it does | Docs |
   |---|---|---|
   | `UI_LOGIN_PATH=/auth/start` | The login starts at the app's own route, which sends the browser to the provider | [Apps with a BFF login](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#apps-with-a-bff-login) |
   | `FRONTEND_URL` | Pages outside this origin count as "still signing in" (the provider) | [UI login](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#ui-login) |
   | `AUTH_<ROLE>_USERNAME` / `_PASSWORD` | One pair per role: `applicant`, `unverified`, `admin` | [Credentials](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#credentials) |
   | `AUTH_OTP_SECRET`, `AUTH_OTP_ENCODING=latin1` | The authenticator secret, for generating codes | [One-time passcodes](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#one-time-passcodes-totp) |
   | `API_AUTH_MODE=ui-session` | API steps send the browser session's cookie, because the API accepts nothing else | [API calls with the browser session](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#api-calls-with-the-browser-session) |
   | `UI_SESSION_CHECK_PATH=/` | How a saved session is checked before reuse | [Session reuse](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#session-reuse) |
   | `CLEANUP_AUTH_ROLE=applicant` | Who deletes test data after each scenario | [Cleanup authentication](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#cleanup-authentication) |

2. **[`tests/features/api/applications.feature`](tests/features/api/applications.feature)** and **[`tests/features/ui/sign-in.feature`](tests/features/ui/sign-in.feature)**: what the scenarios look like. They're all built-in steps:

   | Step | Docs |
   |---|---|
   | `Given I am logged in as "applicant"` | [UI steps](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/ui-steps#given-i-am-logged-in-as-string) |
   | `When I log in as "unverified" in UI` (always signs in, for testing the login itself) | [UI steps](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/ui-steps#when-i-log-in-as-string-in-ui) |
   | `Given I am authenticated as "applicant" via API` | [API steps](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/api-steps#given-i-am-authenticated-as-string-via-api) |
   | `When I POST "/api/applications" with JSON body:` | [API steps](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/api-steps#when-i-post-string-with-json-body) |
   | `And I register cleanup DELETE "/api/applications/{applicationId}"` | [Shared steps](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/shared-steps#given-i-register-cleanup-delete-string) |

3. **[`keycloak/logingov-local-realm.json`](keycloak/logingov-local-realm.json)**: how the provider is set up (see [How it mirrors login.gov](#how-it-mirrors-logingov)).

4. **[`app/server.mjs`](app/server.mjs)**: the login routes (`/auth/start`, `/auth/callback`) and the cookie-only API. Read it to see what "BFF" means in practice (under 200 lines).

## How a run works

```
 worker 1 ─┐                          ┌──────────────────────────────────────────────┐
 worker 2 ─┼─ "I am logged in as      │  first worker to need "applicant":            │
 worker 3 ─┤   applicant"             │   takes a lock in tests/.xspec/auth/          │
 worker 4 ─┘                          │   /auth/start → Keycloak password page        │
                                      │   → one-time code page (generated TOTP)       │
                                      │   → /auth/callback → session cookie           │
                                      │   saves the session, releases the lock        │
                                      └──────────────────────────────────────────────┘
            everyone else: waits for the lock, then restores the saved session
```

1. **Once per role per run.** The first scenario that needs a role, in any worker, takes a lock and signs in. The others wait and then reuse the session it saved to `tests/.xspec/auth/` (git-ignored, readable only by you). With 7 scenarios and 4 workers, Keycloak sees one sign-in per role. → [Session reuse](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#session-reuse)
2. **Page by page.** The sign-in fills whatever each page asks for (username and password, then the one-time code) until the browser is back on the app. → [UI login](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#ui-login)
3. **No code is used twice.** Workers record which 30-second window they last used for each account. A sign-in that would reuse a code waits for the next window instead, which is why `playwright.config.ts` raises the timeout to 90 s. → [One-time passcodes](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#one-time-passcodes-totp)
4. **API scenarios use the same session.** With `API_AUTH_MODE=ui-session`, `I am authenticated as "applicant" via API` sends the saved session's cookie. If no session exists yet, it signs in through a headless browser of its own, so API-only scenarios don't need one. → [API calls with the browser session](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#api-calls-with-the-browser-session)
5. **Expired sessions are replaced.** Before reusing a session, the library loads `UI_SESSION_CHECK_PATH`. If that ends up on Keycloak, the session has expired, and the role signs in again. Try it: run `just expire` during a run. → [Session reuse](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#session-reuse)
6. **Cleanup** deletes what the scenarios created, as `CLEANUP_AUTH_ROLE`, using the same session. → [Cleanup authentication](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#cleanup-authentication)
7. **Nothing leaks.** Cookies and tokens are redacted in error messages and reports. → [Keeping secrets out of logs and git](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#keeping-secrets-out-of-logs-and-git)

## How it mirrors login.gov

| login.gov | This repo | Where |
|---|---|---|
| Password, then a second factor; the **authentication app** option is TOTP (SHA1, 6 digits, 30 s) | Every user has a password and an OTP credential with that policy | realm: `otpPolicy*`, users' `credentials` |
| Each code works once | `otpPolicyCodeReusable: false` | realm |
| Only people sign in, in a browser; no password grant, no service accounts | The client allows the authorization code flow only | realm: `clients[0]` |
| The partner app authenticates with a private key and uses PKCE | Client secret here (simpler locally), plus PKCE | `app/server.mjs` `/auth/callback` |
| Identity assurance: IAL1 (self-asserted), IAL2 (verified, incl. facial match) | User attributes `ial` and `verified_at`, mapped into the ID token | realm: `attributes`, `protocolMappers` |
| The app asks for a level with `acr_values` | The app sends login.gov's IAL2 URN (Keycloak logs a warning and ignores it) | `app/server.mjs` `/auth/start` |
| The app keeps its own session; its API trusts that, not login.gov tokens | `benefits_sid` cookie; `/api/*` returns 401 without it | `app/server.mjs` |

Test users:

| User | Password | OTP secret | IAL | Role in the tests |
|---|---|---|---|---|
| `facial@test.local` | `password` | `logingov-local-otp-secret` | 2 | `applicant`: can apply |
| `basic@test.local` | `password` | `logingov-local-otp-secret` | 1 | `unverified`: gets 403 when applying |
| `caseworker@test.local` | `caseworker-password` | `caseworker-otp-secret` | 2 | `admin`: shows a per-role secret (not used by the features) |

**Why `AUTH_OTP_ENCODING=latin1`?** Keycloak stores an OTP secret as plain text and uses its bytes as the key. Authenticator apps show the same secret in base32. `latin1` tells katalyst-xspec to use the text as-is, the same as `OTPAuth.Secret.fromLatin1(...)` in the `otpauth` library. With a base32 secret, from a QR code or login.gov, leave the encoding unset.

## Running in CI

Both pipelines do the same thing: start Keycloak, start the app, run `npm test` with 4 workers, and keep the reports.

| | GitHub Actions ([`.github/workflows/test.yml`](.github/workflows/test.yml)) | GitLab CI ([`.gitlab-ci.yml`](.gitlab-ci.yml)) |
|---|---|---|
| Keycloak | `docker compose up -d --wait`, same as locally | A [service container](https://docs.gitlab.com/ci/services/) with the alias `keycloak` |
| Realm | Imported at startup from `keycloak/` (mounted into the container) | Created by [`ci/import-realm.mjs`](ci/import-realm.mjs) through the admin API, because service containers can't mount repo files |
| Keycloak's address | `http://localhost:8180` | `http://keycloak:8180`, so the job sets `OIDC_ISSUER` for the app. The browser and the app both use that name, so the issuer matches |
| Browser | `npx playwright install --with-deps chromium` on `ubuntu-latest` | The `mcr.microsoft.com/playwright` image (keep its tag near the `@playwright/test` version in `tests/package-lock.json`) |
| Reports | `cucumber-report/` and `test-results/` as an artifact | The same, plus `cucumber-report/junit.xml` as a JUnit report, so results show in merge requests |

The tests and `.env` are identical in both. Only the way Keycloak is started differs. The GitLab job has been checked by running its script in the Playwright image, with Keycloak on a separate container network reachable only as `keycloak` (the way GitLab runs services): 7/7 pass.

The test credentials come from `.env.example`. For a real service, keep passwords and OTP secrets in [GitHub secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions) / [GitLab CI/CD variables](https://docs.gitlab.com/ci/variables/) (masked and protected), and pass them in as `AUTH_<ROLE>_*` environment variables instead of committing them. More in the [CI/CD guide](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/ci-cd).

## Using this for your own service

1. **Create a test project:** `npx @esimplicitylabs/katalyst-xspec init my-tests` ([Quick start](https://esimplicityinc.github.io/katalyst-xspec/docs/getting-started/quick-start)).
2. **Copy the auth part of [`tests/.env.example`](tests/.env.example)** and change:
   - `FRONTEND_URL` to your app, and `UI_LOGIN_PATH` to the route that starts its login,
   - the `AUTH_<ROLE>_*` users and their OTP secrets,
   - `UI_SESSION_CHECK_PATH` to a page that needs a login.
3. **If your API accepts only the app's session**, keep `API_AUTH_MODE=ui-session`. If it accepts bearer tokens from an identity provider you control, see [OIDC login](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#oidc-login) instead.
4. **Raise Playwright's `timeout`** to at least 60 s if the same account may sign in more than once per run.
5. **Run it in CI:** start your app and its identity provider, then `npm test`. See [Running in CI](#running-in-ci).

**Against the real login.gov sandbox** (`idp.int.identitysandbox.gov`), the tests don't change. Your app points at the sandbox, and `.env` gets the sandbox test accounts and their authentication-app secrets (base32, so no `AUTH_OTP_ENCODING`). Check login.gov's partner terms before automating sign-ins there. In production, prefer tests that don't sign in, or a test login your app provides.

**Login pages the built-in sign-in can't handle** (CAPTCHA, SMS, custom widgets): codes can also come from email or a function you supply ([Codes from email or elsewhere](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#codes-from-email-or-elsewhere)), or you can override the login and keep everything else ([Extending the login](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#extending-the-login)).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `the one-time code was rejected twice` | Wrong secret or encoding, or the clock is off | Check `AUTH_OTP_SECRET` / `AUTH_OTP_ENCODING` against the realm; sync the machine clock |
| `asks for a one-time code. Set AUTH_X_OTP_SECRET` | The role has no OTP secret | Set `AUTH_<ROLE>_OTP_SECRET`, or `AUTH_OTP_SECRET` for every role |
| `the password was asked for again (the page says "Invalid username or password.")` | Wrong `AUTH_<ROLE>_PASSWORD` | Compare with the realm's users |
| `Test timeout of 30000ms exceeded` during a login | A login waited for a fresh code | Keep `timeout: 90_000` in `playwright.config.ts` |
| `connect ECONNREFUSED 127.0.0.1:4100` | The app isn't running | `just app` |
| Login page never loads | Keycloak isn't ready | `just up` waits for it; `docker compose logs keycloak` |
| Strange results after changing users | An old saved session | `rm -rf tests/.xspec` |

More in the [library's troubleshooting table](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#troubleshooting).

## Further reading

- [Authentication guide](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication): everything above, in depth
- [Configuration reference](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/api/configuration#authentication): every setting
- [Steps quick reference](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/quick-reference): every built-in step
- [Hybrid testing](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/hybrid-testing): mixing API and UI steps in one scenario
- [Best practices](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/best-practices): organizing features, test data and auth
- [katalyst-xspec on GitHub](https://github.com/esimplicityinc/katalyst-xspec) · [on npm](https://www.npmjs.com/package/@esimplicitylabs/katalyst-xspec)
