import {
  createBddTest,
  PlaywrightApiAdapter,
  PlaywrightUiAdapter,
  UniversalAuthAdapter,
  DefaultCleanupAdapter,
  TuiTesterAdapter,
} from '@esimplicitylabs/katalyst-xspec';

export const { test } = createBddTest({
  createApi: ({ apiRequest }) => new PlaywrightApiAdapter(apiRequest),
  createUi: ({ page }) => new PlaywrightUiAdapter(page),
  // Logins read AUTH_<ROLE>_USERNAME / AUTH_<ROLE>_PASSWORD and the API_AUTH_* /
  // UI_LOGIN_* settings in .env. You can also give credentials in code:
  //   roles: { pm: { username: 'pm@example.com', password: process.env.PM_PASSWORD } },
  // For SSO or unusual login flows, subclass UniversalAuthAdapter and override
  // apiLogin() / uiLogin() (see the Authentication guide).
  createAuth: ({ api, ui }) => new UniversalAuthAdapter({ api, ui, roles: {} }),
  createCleanup: () => new DefaultCleanupAdapter(),
  // TUI testing (optional - requires tui-tester and tmux installed)
  // Uncomment and configure for your CLI application:
  // createTui: () => new TuiTesterAdapter({
  //   command: ['node', 'dist/cli.js'],
  //   size: { cols: 100, rows: 30 },
  //   debug: process.env.DEBUG === 'true',
  // }),
});
