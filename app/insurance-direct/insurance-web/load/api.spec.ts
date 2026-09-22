import { test } from '@playwright/test';
import { createRng, nextScenario, thinkMs } from './scenarios.js';

// High-throughput API load: hits insurance-api directly (no browser overhead)
// with the same weighted scenario mix. This is what produces "massive"
// telemetry volume; the browser spec produces realistic UI-driven traffic.
//
//   API_URL            default http://localhost:8083
//   LOAD_DURATION_S    default 120
//   LOAD_SEED          default 1000
//   LOAD_THINK_MIN_MS  default 5
//   LOAD_THINK_MAX_MS  default 50

const DURATION_S = Number(process.env.LOAD_DURATION_S ?? 120);
const SEED = Number(process.env.LOAD_SEED ?? 1000);
const THINK_MIN = Number(process.env.LOAD_THINK_MIN_MS ?? 5);
const THINK_MAX = Number(process.env.LOAD_THINK_MAX_MS ?? 50);

test('api soak: bombard insurance-api to generate telemetry volume', async ({
  request,
}) => {
  test.setTimeout((DURATION_S + 120) * 1000);

  const workerIndex = Number(process.env.PLAYWRIGHT_WORKER_INDEX ?? 0);
  const rng = createRng(SEED + workerIndex * 100003);
  const deadline = Date.now() + DURATION_S * 1000;

  const stats = new Map<string, { ok: number; fail: number; status: Record<string, number> }>();
  const record = (kind: string, status: number) => {
    const s = stats.get(kind) ?? { ok: 0, fail: 0, status: {} };
    if (status >= 200 && status < 400) s.ok += 1;
    else s.fail += 1;
    s.status[String(status)] = (s.status[String(status)] ?? 0) + 1;
    stats.set(kind, s);
  };

  let iterations = 0;
  let requests = 0;

  while (Date.now() < deadline) {
    const scenario = nextScenario(rng);
    iterations += 1;

    const call = async (a: string) => {
      if (a === 'claim' || a === 'call-all') {
        const res = await request.post(`/policies/${scenario.policyId}/claims`, {
          data: { amount: scenario.amount },
          headers: { 'Content-Type': 'application/json' },
          timeout: 15_000,
        });
        requests += 1;
        record(scenario.kind, res.status());
      }
      if (a === 'health' || a === 'call-all') {
        const res = await request.get('/actuator/health', { timeout: 15_000 });
        requests += 1;
        record(`${scenario.kind}:health`, res.status());
      }
      if (a === 'info' || a === 'call-all') {
        const res = await request.get('/actuator/info', { timeout: 15_000 });
        requests += 1;
        record(`${scenario.kind}:info`, res.status());
      }
      if (a === 'metrics' || a === 'call-all') {
        const res = await request.get('/actuator/metrics', { timeout: 15_000 });
        requests += 1;
        record(`${scenario.kind}:metrics`, res.status());
      }
    };

    for (const a of scenario.actions) {
      try {
        await call(a);
      } catch {
        const s = stats.get(scenario.kind) ?? { ok: 0, fail: 0, status: {} };
        s.fail += 1;
        s.status['ERR'] = (s.status['ERR'] ?? 0) + 1;
        stats.set(scenario.kind, s);
      }
    }

    if (THINK_MAX > 0) {
      await new Promise((r) => setTimeout(r, thinkMs(rng, THINK_MIN, THINK_MAX)));
    }
  }

  const summary = {
    worker: workerIndex,
    iterations,
    requests,
    durationS: DURATION_S,
    byScenario: Object.fromEntries(stats),
  };
  // eslint-disable-next-line no-console
  console.log(`[load-api] ${JSON.stringify(summary)}`);
});
