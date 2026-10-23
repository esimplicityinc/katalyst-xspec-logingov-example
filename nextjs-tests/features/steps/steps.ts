import { test } from './fixtures.js';
import {
  registerApiSteps,
  registerUiSteps,
  registerSharedSteps,
  registerHybridSuite,
  registerTuiSteps,
} from '@esimplicitylabs/katalyst-xspec/steps';
import { createBdd } from 'playwright-bdd';

registerApiSteps(test);
registerUiSteps(test);
registerSharedSteps(test);
registerHybridSuite(test);

// TUI steps (optional - requires tui-tester and tmux installed)
// Uncomment when you have TUI testing configured:
// registerTuiSteps(test);

const { Then } = createBdd(test);

// Finds the CSRF token in the last API response: a response header, a cookie,
// or a JSON field. Set CSRF_TOKEN_PATH (e.g. data.csrfToken) if it's elsewhere.
const CSRF_HEADERS = ['x-csrf-token', 'x-xsrf-token', 'csrf-token', 'x-csrftoken'];
const CSRF_COOKIES = ['csrf', 'csrf-token', 'csrf_token', '_csrf', 'xsrf-token', 'x-csrf-token', '__host-csrf'];
const CSRF_FIELDS = ['csrfToken', 'csrf_token', 'csrf', 'xsrfToken', '_csrf', 'token'];

function pick(obj: unknown, path: string): unknown {
  return path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}

Then('I store the CSRF token as {string}', async ({ world }: any, varName: string) => {
  const headers: Record<string, string> = Object.fromEntries(
    Object.entries(world.lastHeaders || {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );
  let token: string | undefined;
  if (process.env.CSRF_TOKEN_PATH) {
    const v = pick(world.lastJson, process.env.CSRF_TOKEN_PATH);
    if (v != null) token = String(v);
  }
  token ??= CSRF_HEADERS.map((h) => headers[h]).find(Boolean);
  if (!token && headers['set-cookie']) {
    for (const line of headers['set-cookie'].split('\n')) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0 && CSRF_COOKIES.includes(pair.slice(0, eq).trim().toLowerCase())) token = decodeURIComponent(pair.slice(eq + 1).trim());
    }
  }
  token ??= CSRF_FIELDS.map((f) => pick(world.lastJson, f)).find((v) => typeof v === 'string') as string | undefined;
  if (!token) {
    throw new Error(
      `No CSRF token in the last response (looked at headers ${CSRF_HEADERS.join(', ')}, cookies, and JSON fields ` +
        `${CSRF_FIELDS.join(', ')}). Set CSRF_TOKEN_PATH to its JSON path. Response headers: ${Object.keys(headers).join(', ')}`,
    );
  }
  world.vars[varName] = token;
});

export { test };
