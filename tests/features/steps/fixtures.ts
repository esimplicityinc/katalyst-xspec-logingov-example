import {
  createBddTest,
  PlaywrightApiAdapter,
  PlaywrightUiAdapter,
  UniversalAuthAdapter,
  DefaultCleanupAdapter,
} from '@esimplicitylabs/katalyst-xspec';

export const { test } = createBddTest({
  createApi: ({ apiRequest }) => new PlaywrightApiAdapter(apiRequest),
  createUi: ({ page }) => new PlaywrightUiAdapter(page),
  // Logins read AUTH_<ROLE>_USERNAME / AUTH_<ROLE>_PASSWORD, the one-time code
  // settings (AUTH_OTP_*) and the UI_* / API_AUTH_MODE settings in .env.
  createAuth: ({ api, ui }) => new UniversalAuthAdapter({ api, ui, roles: {} }),
  createCleanup: () => new DefaultCleanupAdapter(),
});
