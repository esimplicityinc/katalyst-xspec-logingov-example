import { defineConfig } from '@playwright/test';
import { defineBddProject, cucumberReporter } from 'playwright-bdd';
import { resolveWorkers, tagsForProject, resolveExtraTags, resolveTargets, logTargets } from '@esimplicitylabs/katalyst-xspec';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localEnvPath = path.resolve(__dirname, '.env');
const rootEnvPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

// UI and API base URLs from FRONTEND_URL / API_BASE_URL (API falls back to the
// frontend URL). Printed once per run; silence with KATALYST_XSPEC_QUIET=true.
const targets = logTargets(resolveTargets());

// Each project runs the feature files in its folder. Any scenario can use any
// step (API, UI, shared). Tags are optional: use your own (e.g. @smoke) and
// filter with TEST_TAGS="@smoke"; scenarios tagged @Skip or @ignore are skipped.
const tags = tagsForProject({ extraTags: resolveExtraTags(process.env.TEST_TAGS) });

const apiBdd = defineBddProject({
  name: 'api',
  features: 'features/api/**/*.feature',
  steps: 'features/steps/**/*.ts',
  tags,
});

const uiBdd = defineBddProject({
  name: 'ui',
  features: 'features/ui/**/*.feature',
  steps: 'features/steps/**/*.ts',
  tags,
});

// TUI project (optional - requires tui-tester and tmux; also enable
// registerTuiSteps in features/steps/steps.ts and createTui in fixtures.ts)
// const tuiBdd = defineBddProject({
//   name: 'tui',
//   features: 'features/tui/**/*.feature',
//   steps: 'features/steps/**/*.ts',
//   tags,
// });

export default defineConfig({
  workers: resolveWorkers(),
  reporter: [
    cucumberReporter('html', { outputFile: 'cucumber-report/index.html' }),
    cucumberReporter('json', { outputFile: 'cucumber-report/report.json' }),
  ],
  // Add tuiBdd to this array when TUI testing is enabled
  // A login may wait up to one TOTP period (30 s) for an unused code.
  timeout: 90_000,
  projects: [apiBdd, uiBdd /* , tuiBdd */],
  use: {
    baseURL: targets.frontendUrl,
    headless: process.env.HEADLESS === 'false' ? false : true,
  },
});
