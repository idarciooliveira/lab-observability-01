// Shared, seedable traffic model for insurance-web load generation.
//
// Purpose: produce a weighted mix of realistic + error-path requests so the
// Java OTEL agent emits diverse spans/logs/metrics (2xx + 4xx, small/large
// amounts, active/inactive/unknown policies).
//
// Pure functions only (no Playwright / DOM / Node APIs) so it can be shared
// between the browser runner and the API loader, and unit-tested.

export const SEED_POLICY_ACTIVE_1 = 'b1c2e8d0-2222-4b3b-8d2b-000000000001';
export const SEED_POLICY_ACTIVE_2 = 'b1c2e8d0-2222-4b3b-8d2b-000000000002';
export const SEED_POLICY_INACTIVE = 'b1c2e8d0-2222-4b3b-8d2b-000000000003';

export type ScenarioKind =
  | 'happy-claim' // valid ACTIVE policy, normal amount -> 201
  | 'full-sweep' // "Call all endpoints" -> 1 claim + 3 actuator calls
  | 'inactive-policy' // INACTIVE seed policy -> 4xx business error
  | 'unknown-policy' // well-formed but unknown UUID -> 404
  | 'invalid-input' // malformed UUID and/or invalid amount -> 400
  | 'read-probe'; // actuator GETs only, no claim write

export interface LoadScenario {
  kind: ScenarioKind;
  policyId: string;
  amount: number;
  /** Which UI buttons / API calls this iteration performs. */
  actions: Array<'claim' | 'health' | 'info' | 'metrics' | 'call-all'>;
}

/** Mulberry32 — tiny seedable PRNG so soak runs are reproducible. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomUuid(rng: () => number): string {
  const hex = () =>
    Math.floor(rng() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  const h1 = hex();
  const h2 = hex().slice(0, 4);
  const h3 = `4${hex().slice(1, 4)}`;
  const h4 = `${((8 + Math.floor(rng() * 4)).toString(16))}${hex().slice(1, 4)}`;
  const h5 = `${hex()}${hex().slice(0, 4)}`;
  return `${h1}-${h2}-${h3}-${h4}-${h5}`.slice(0, 36);
}

function pickWeighted<T>(rng: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function normalAmount(rng: () => number): number {
  // Typical claim sizes; keep 2 decimals like the UI number input.
  return Math.round((10 + rng() * 4990) * 100) / 100;
}

export function nextScenario(rng: () => number): LoadScenario {
  const kind = pickWeighted<ScenarioKind>(rng, [
    ['happy-claim', 40],
    ['full-sweep', 20],
    ['inactive-policy', 10],
    ['unknown-policy', 10],
    ['invalid-input', 10],
    ['read-probe', 10],
  ]);

  switch (kind) {
    case 'happy-claim':
      return {
        kind,
        policyId: rng() < 0.5 ? SEED_POLICY_ACTIVE_1 : SEED_POLICY_ACTIVE_2,
        amount: normalAmount(rng),
        actions: ['claim'],
      };
    case 'full-sweep':
      return {
        kind,
        policyId: rng() < 0.85 ? SEED_POLICY_ACTIVE_1 : SEED_POLICY_ACTIVE_2,
        amount: normalAmount(rng),
        actions: ['call-all'],
      };
    case 'inactive-policy':
      return {
        kind,
        // INACTIVE seed, or a huge amount to trip coverage checks.
        policyId: SEED_POLICY_INACTIVE,
        amount: rng() < 0.5 ? normalAmount(rng) : 999_999,
        actions: ['claim'],
      };
    case 'unknown-policy':
      return {
        kind,
        policyId: randomUuid(rng),
        amount: normalAmount(rng),
        actions: ['claim'],
      };
    case 'invalid-input': {
      const malformed = rng() < 0.5;
      return {
        kind,
        policyId: malformed ? 'not-a-uuid' : SEED_POLICY_ACTIVE_1,
        amount: malformed ? normalAmount(rng) : pickWeighted(rng, [[0, 1], [-50, 1]]),
        actions: ['claim'],
      };
    }
    case 'read-probe':
      return {
        kind,
        policyId: SEED_POLICY_ACTIVE_1,
        amount: normalAmount(rng),
        actions: pickWeighted(rng, [
          [['health'] as LoadScenario['actions'], 1],
          [['info'] as LoadScenario['actions'], 1],
          [['metrics'] as LoadScenario['actions'], 1],
          [['health', 'info', 'metrics'] as LoadScenario['actions'], 1],
        ]),
      };
  }
}

/** Jittered think time between iterations so workers don't move in lockstep. */
export function thinkMs(rng: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(min + rng() * (max - min));
}
