import { defineConfig } from '@playwright/test';

// Load-generation config for insurance-web / insurance-api.
// Everything is env-driven so the same files serve smoke/soak/spike:
//
//   WEB_URL  default http://localhost:5173  (dockerized nginx build)
//   API_URL  default http://localhost:8083  (Spring Boot)
//   LOAD_WORKERS  default 4
//   LOAD_HEADED=1  show the browser window (interactive / watch mode)
//   LOAD_SLOWMO_MS e.g. 250 — slows each action so you can follow along
//
// Examples:
//   npx playwright test --project=browser            # UI-driven traffic
//   npx playwright test --project=api                # high-volume API traffic
//   LOAD_DURATION_S=600 npx playwright test          # 10-min soak, both layers
//   npm run load:headed                              # visible browser, 1 worker
const HEADED = process.env.LOAD_HEADED === '1';
const SLOWMO_MS = Number(process.env.LOAD_SLOWMO_MS ?? 0);
export default defineConfig({
  testDir: './load',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  workers: Number(process.env.LOAD_WORKERS ?? 4),
  timeout: (Number(process.env.LOAD_DURATION_S ?? 120) + 120) * 1000,
  expect: { timeout: 15_000 },
  projects: [
    {
      name: 'browser',
      testMatch: /browser\.spec\.ts/,
      use: {
        baseURL: process.env.WEB_URL ?? 'http://localhost:5173',
        headless: !HEADED,
        ...(SLOWMO_MS > 0 ? { launchOptions: { slowMo: SLOWMO_MS } } : {}),
      },
    },
    {
      name: 'api',
      testMatch: /api\.spec\.ts/,
      use: {
        baseURL: process.env.API_URL ?? 'http://localhost:8083',
      },
    },
  ],
});
