# tests

Playwright + BDD tests powered by [@esimplicitylabs/katalyst-xspec](https://www.npmjs.com/package/@esimplicitylabs/katalyst-xspec).

## Setup
```bash
npm install
npx playwright install chromium   # one-time browser download for UI tests
```

## Run
```bash
npm test                          # generate specs from features, then run them
npx playwright test --project ui  # just one folder
TEST_TAGS=@smoke npm test         # just scenarios you tagged @smoke
```

The example features call public demo sites, so they pass with no configuration.
To test your own app, copy `.env.example` to `.env`, set `FRONTEND_URL` and
`API_BASE_URL`, and use relative paths such as `Given I navigate to "/login"`.

## Structure
- `features/api/`, `features/ui/`: feature files; each folder is a Playwright project
- `features/steps/steps.ts`: registers the built-in steps (any step works in any scenario)
- `features/steps/fixtures.ts`: wires adapters into the Playwright-BDD test
- `playwright.config.ts`: projects, reporters, base URL

Tags are optional. Add your own (`@smoke`, `@slow`) and filter with `TEST_TAGS`;
scenarios tagged `@Skip` or `@ignore` don't run.

## Notes
- Undefined steps? Run `npm run gen:stubs` to generate stubs.
- Keep @playwright/test and playwright-bdd versions aligned with @esimplicitylabs/katalyst-xspec peer ranges.

## TUI Testing (Optional)
To enable terminal user interface testing:

1. Install tmux (required by tui-tester):
   ```bash
   # macOS
   brew install tmux

   # Ubuntu/Debian
   apt-get install tmux
   ```

2. Install tui-tester:
   ```bash
   npm install tui-tester
   ```

3. Uncomment TUI configuration in:
   - `features/steps/fixtures.ts`: Configure TuiTesterAdapter with your CLI command
   - `features/steps/steps.ts`: Uncomment registerTuiSteps(test)
   - `playwright.config.ts`: Uncomment tuiBdd project and add to projects array

4. Write feature files in `features/tui/`
