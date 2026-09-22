import { test, expect } from '@playwright/test';
import { createRng, nextScenario, thinkMs } from './scenarios.js';

// Duration-based browser load: each worker opens insurance-web once and loops
// weighted user journeys until LOAD_DURATION_S expires. Tune via env:
//
//   WEB_URL            default http://localhost:5173
//   LOAD_DURATION_S    default 120 (smoke 30, soak 600)
//   LOAD_SEED          default 42 (offset per worker internally)
//   LOAD_THINK_MIN_MS  default 50
//   LOAD_THINK_MAX_MS  default 300
//   LOAD_CLEAR_EVERY   clear results list every N iterations (default 20,
//                      keeps the capped results list from hiding new entries)

const DURATION_S = Number(process.env.LOAD_DURATION_S ?? 120);
const SEED = Number(process.env.LOAD_SEED ?? 42);
const THINK_MIN = Number(process.env.LOAD_THINK_MIN_MS ?? 50);
const THINK_MAX = Number(process.env.LOAD_THINK_MAX_MS ?? 300);
const CLEAR_EVERY = Number(process.env.LOAD_CLEAR_EVERY ?? 20);

test('browser soak: drive insurance-web to generate backend telemetry', async ({
  page,
}) => {
  test.setTimeout((DURATION_S + 120) * 1000);

  const workerIndex = Number(process.env.PLAYWRIGHT_WORKER_INDEX ?? 0);
  const rng = createRng(SEED + workerIndex * 100003);
  const deadline = Date.now() + DURATION_S * 1000;

  const stats = new Map<string, { ok: number; fail: number }>();
  const record = (kind: string, ok: boolean) => {
    const s = stats.get(kind) ?? { ok: 0, fail: 0 };
    if (ok) s.ok += 1;
    else s.fail += 1;
    stats.set(kind, s);
  };

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Insurance Direct' })).toBeVisible();

  const policyInput = page.getByPlaceholder('policy UUID');
  const amountInput = page.getByLabel('Amount');
  const claimBtn = page.getByRole('button', { name: 'POST /policies/:id/claims' });
  const healthBtn = page.getByRole('button', { name: 'GET /actuator/health' });
  const infoBtn = page.getByRole('button', { name: 'GET /actuator/info' });
  const metricsBtn = page.getByRole('button', { name: 'GET /actuator/metrics' });
  const callAllBtn = page.getByRole('button', { name: 'Call all endpoints' });
  const clearBtn = page.getByRole('button', { name: 'Clear' });
  const resultsHeading = page.getByRole('heading', { name: /Results/ });

  let iterations = 0;
  let actions = 0;

  while (Date.now() < deadline) {
    const scenario = nextScenario(rng);
    iterations += 1;

    await policyInput.fill(scenario.policyId);
    await amountInput.fill(String(scenario.amount));

    // Track how many result entries this iteration should append so we can
    // wait for the UI round-trip instead of sleeping blindly. The heading
    // format is "Results (N ...)" — parse only the leading count so this
    // stays robust to heading copy changes.
    const countOf = (t: string | null) =>
      Number(t?.match(/Results \((\d+)/)?.[1] ?? Number.NaN);
    const beforeCount = countOf(await resultsHeading.textContent());
    const expectedNew =
      scenario.actions.includes('call-all') ? 4 : scenario.actions.length;

    const clickFor = async (a: string) => {
      if (a === 'claim') await claimBtn.click();
      else if (a === 'health') await healthBtn.click();
      else if (a === 'info') await infoBtn.click();
      else if (a === 'metrics') await metricsBtn.click();
      else await callAllBtn.click();
    };

    let ok = true;
    try {
      for (const a of scenario.actions) {
        await clickFor(a);
        actions += 1;
      }
      await expect
        .poll(async () => countOf(await resultsHeading.textContent()), {
          timeout: 15_000,
        })
        .toBeGreaterThanOrEqual(beforeCount + expectedNew);
    } catch {
      ok = false;
    }
    record(scenario.kind, ok);

    if (iterations % CLEAR_EVERY === 0 && (await clearBtn.isEnabled())) {
      await clearBtn.click();
    }

    await page.waitForTimeout(thinkMs(rng, THINK_MIN, THINK_MAX));
  }

  const summary = {
    worker: workerIndex,
    iterations,
    actions,
    durationS: DURATION_S,
    byScenario: Object.fromEntries(stats),
  };
  // eslint-disable-next-line no-console
  console.log(`[load-browser] ${JSON.stringify(summary)}`);
});
