import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8083';

// Seed policies from insurance-api data.sql
const POLICY_ACTIVE_100K = 'b1c2e8d0-2222-4b3b-8d2b-000000000001'; // ACTIVE, limit 100k
const POLICY_ACTIVE_50K = 'b1c2e8d0-2222-4b3b-8d2b-000000000002'; // ACTIVE, limit 50k
const POLICY_INACTIVE = 'b1c2e8d0-2222-4b3b-8d2b-000000000003'; // INACTIVE, limit 75k

// Custom metrics — sliceable by outcome tag in Grafana/Mimir
const cSuccess = new Counter('claims_success');
const cRiskRejected = new Counter('claims_risk_rejected');
const cCoverage = new Counter('claims_coverage_exceeded');
const cInactive = new Counter('claims_policy_inactive');
const cNotFound = new Counter('claims_policy_not_found');
const cValidation = new Counter('claims_validation_error');
const cUnexpected = new Counter('claims_unexpected');
const durationByOutcome = new Trend('claims_duration_ms');
const checksRate = new Rate('checks_passed');

export const options = {
  scenarios: {
    claims_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 }, // ramp up
        { duration: '60s', target: 50 }, // steady massive load
        { duration: '30s', target: 0 }, // ramp down
      ],
      gracefulRampDown: '10s',
      exec: 'claims',
    },
    health: {
      executor: 'constant-vus',
      vus: 1,
      duration: '2m',
      exec: 'health',
    },
  },
  thresholds: {
    // We EXPECT ~40% 4xx/422 by design, so don't fail on http_req_failed.
    // Instead assert on check pass rate and tail latency.
    checks_passed: ['rate>0.95'],
    claims_duration_ms: ['p(95)<800', 'p(99)<1500'],
    http_req_failed: ['rate<0.6'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomUUID() {
  // RFC4122 v4 — good enough for 404 policy-not-found cases
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function postClaim(policyId, payload, outcomeTag, expectedStatus) {
  const url = `${BASE_URL}/policies/${policyId}/claims`;
  const res = http.post(url, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    tags: { outcome: outcomeTag, endpoint: 'createClaim' },
  });

  durationByOutcome.add(res.timings.duration, { outcome: outcomeTag });

  const ok = check(res, {
    [`${outcomeTag} -> ${expectedStatus}`]: (r) => r.status === expectedStatus,
  });
  checksRate.add(ok);

  // Count by actual status so dashboards stay truthful even if API changes
  if (res.status === 201) cSuccess.add(1);
  else if (res.status === 400) cValidation.add(1);
  else if (res.status === 404) cNotFound.add(1);
  else if (res.status === 422) {
    if (outcomeTag === 'risk_reject') cRiskRejected.add(1);
    else if (outcomeTag === 'coverage') cCoverage.add(1);
    else if (outcomeTag === 'inactive') cInactive.add(1);
    else cUnexpected.add(1, { outcome: outcomeTag });
  } else {
    cUnexpected.add(1, { outcome: outcomeTag, status: String(res.status) });
  }

  return res;
}

export function claims() {
  const roll = Math.random();

  if (roll < 0.6) {
    // 60% happy path: small amount on ACTIVE 100k policy -> 201
    postClaim(
      POLICY_ACTIVE_100K,
      { amount: randomBetween(100, 5000) },
      'success',
      201,
    );
  } else if (roll < 0.75) {
    // 15% risk-rejected high-value: >50k threshold -> 422 RiskRejected
    postClaim(
      POLICY_ACTIVE_100K,
      { amount: randomBetween(55000, 95000) },
      'risk_reject',
      422,
    );
  } else if (roll < 0.85) {
    // 10% coverage-exhaustion: >80% of 50k limit (40k) on policy ...002 -> 422
    postClaim(
      POLICY_ACTIVE_50K,
      { amount: randomBetween(41000, 60000) },
      'coverage',
      422,
    );
  } else if (roll < 0.9) {
    // 5% inactive policy -> 422 PolicyInactive
    postClaim(POLICY_INACTIVE, { amount: 1000 }, 'inactive', 422);
  } else if (roll < 0.95) {
    // 5% policy not found -> 404
    postClaim(randomUUID(), { amount: 1000 }, 'not_found', 404);
  } else {
    // 5% validation errors -> 400 (zero / negative / missing field)
    const variants = [{ amount: 0 }, { amount: -10 }, {}];
    const payload = variants[randomBetween(0, variants.length - 1)];
    postClaim(POLICY_ACTIVE_100K, payload, 'validation', 400);
  }

  sleep(Math.random() * 0.8 + 0.2); // 0.2–1.0s jitter between iterations
}

export function health() {
  const res = http.get(`${BASE_URL}/actuator/health`, {
    tags: { endpoint: 'health' },
  });
  const ok = check(res, { 'health is 200': (r) => r.status === 200 });
  checksRate.add(ok);
  sleep(5);
}
