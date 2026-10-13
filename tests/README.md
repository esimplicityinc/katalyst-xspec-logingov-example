# tests

The test project for the [Benefits Application](../app/server.mjs). It was created with `npx @esimplicitylabs/katalyst-xspec init` and shows how little has to change to test a login.gov-style service: **all the auth is configuration** in [`.env.example`](.env.example). See the [repo README](../README.md) for the big picture.

## Run

Keycloak and the app must be running (`just up` and `just app` from the repo root). Then:

```bash
cp .env.example .env              # once
npm install                       # once
npx playwright install chromium   # once
npm test                          # all scenarios
WORKERS=4 npm test                # in parallel (each role still signs in once)
npx playwright test --project api # just features/api
HEADLESS=false npm test           # watch the sign-in happen
```

Reports: `cucumber-report/index.html` (HTML) and `test-results/` (traces of failures).

## What changed from the scaffold

| File | Change | Why |
|---|---|---|
| [`.env.example`](.env.example) | Login and OTP settings, three roles | The whole auth setup. See below |
| [`playwright.config.ts`](playwright.config.ts) | `timeout: 90_000` | A sign-in may wait up to one 30 s TOTP window for a code that no other worker has used ([why](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#one-time-passcodes-totp)) |
| `features/api/`, `features/ui/` | The scaffold's examples replaced with these scenarios | |
| [`features/steps/`](features/steps/) | **Nothing** | No custom steps or adapters: the built-in ones cover the login, the code page, sessions and cleanup |

## The settings, explained

From [`.env.example`](.env.example), grouped by what they do:

**Where the app is, and how its login starts**

```bash
FRONTEND_URL=http://localhost:4100
UI_LOGIN_PATH=/auth/start
```

`I am logged in as` opens `UI_LOGIN_PATH`, and the app redirects to Keycloak. The sign-in then goes page by page (username and password, then the one-time code) until the browser is back on `FRONTEND_URL`. Any page on another origin counts as part of the login. → [UI login](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#ui-login), [Apps with a BFF login](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#apps-with-a-bff-login)

**Who signs in**

```bash
AUTH_APPLICANT_USERNAME=facial@test.local    # used as: Given I am logged in as "applicant"
AUTH_APPLICANT_PASSWORD=password
AUTH_UNVERIFIED_USERNAME=basic@test.local    # used as: ... as "unverified"
AUTH_UNVERIFIED_PASSWORD=password
```

Any role name works: `"applicant"` reads `AUTH_APPLICANT_*`. → [Credentials](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#credentials)

**Their one-time codes**

```bash
AUTH_OTP_SECRET=logingov-local-otp-secret    # every role's authenticator secret
AUTH_OTP_ENCODING=latin1                     # Keycloak's secrets are plain text
AUTH_ADMIN_OTP_SECRET=caseworker-otp-secret  # a role's own secret wins
```

These generate the same 6-digit codes an authenticator app would show for that user. → [One-time passcodes](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#one-time-passcodes-totp)

**API calls with the browser's session**

```bash
API_AUTH_MODE=ui-session
```

The app's API only accepts its session cookie. With this, `Given I am authenticated as "applicant" via API` uses the role's browser session, signing in through a headless browser first if needed, and later API steps send the cookie. → [API calls with the browser session](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#api-calls-with-the-browser-session)

**Reusing sessions safely**

```bash
UI_SESSION_CHECK_PATH=/
```

Sessions are saved to `.xspec/auth/` and shared by every worker, so each role signs in once per run. Before reusing one, the library loads this page; if it lands on Keycloak, the session has expired and the role signs in again. → [Session reuse](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#session-reuse)

Other session settings you might want: `UI_SESSION_TTL` (default 30 minutes), `UI_SESSION_SCOPE=persistent` (keep sessions between local runs). See the [configuration reference](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/api/configuration#authentication).

**Cleaning up**

```bash
CLEANUP_AUTH_ROLE=applicant
```

`I register cleanup DELETE "..."` deletes created data after the scenario. Here each user can only delete their own applications, so cleanup runs as the applicant. → [Cleanup authentication](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/authentication#cleanup-authentication)

## The scenarios

**[`features/api/applications.feature`](features/api/applications.feature)**: API only. No browser is opened for the scenarios themselves; the sign-in uses a headless browser behind the scenes.

| Scenario | Shows |
|---|---|
| A verified applicant submits an application | `I am authenticated as … via API` on a cookie-only API; storing a value; registering cleanup |
| The API knows who is signed in | The session belongs to the right user, with the right identity level (`ial: 2`) |
| Applying needs a verified identity | A second role (`unverified`, IAL1) gets 403 |
| The API refuses requests without a session | No login step, so no cookie: 401 |

**[`features/ui/sign-in.feature`](features/ui/sign-in.feature)**: browser.

| Scenario | Shows |
|---|---|
| A signed-in applicant sees their benefits | `I am logged in as`: signs in once, then reused |
| An application submitted through the API shows up in the UI | API and UI steps in one scenario, sharing one session ([hybrid testing](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/hybrid-testing)) |
| The sign-in itself, with password and authenticator code | `When I log in as … in UI` always goes through the provider, for testing the login itself |

Every step is built in: see the [steps quick reference](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/quick-reference).

## Useful steps not used here

```gherkin
Given I clear the saved session for "applicant"            # after a scenario signs out or changes the password
When I fill the one-time code for "applicant" in "One-time code"  # your own login steps
Given I generate a one-time code for "applicant" as "otp"  # the code as a variable
Given I use the API session in the browser                 # API login first, then continue in the browser
```

→ [UI steps](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/ui-steps#authentication-steps), [shared steps](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/shared-steps#given-i-generate-a-one-time-code-for-string-as-string), [hybrid steps](https://esimplicityinc.github.io/katalyst-xspec/docs/reference/steps/hybrid-steps#given-i-use-the-api-session-in-the-browser)

## Structure

- `features/api/`, `features/ui/`: feature files; each folder is a Playwright project
- `features/steps/steps.ts`: registers the built-in steps
- `features/steps/fixtures.ts`: wires the adapters (scaffold defaults)
- `playwright.config.ts`: projects, reporters, base URL, timeout
- `.xspec/auth/`: saved sessions while tests run (git-ignored, owner-only files; delete it to sign everyone out)

Undefined steps? `npm run gen:stubs` generates stubs. Upgrading: `npm run upgrade` ([upgrading guide](https://esimplicityinc.github.io/katalyst-xspec/docs/guides/upgrading)).
