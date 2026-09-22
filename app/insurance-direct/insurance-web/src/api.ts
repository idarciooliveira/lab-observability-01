export const API_BASE =
  import.meta.env.VITE_INSURANCE_API_URL ?? 'http://localhost:8083';

export interface ApiResult {
  id: number;
  time: string;
  label: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  ms: number;
  body: unknown;
  ok: boolean;
}

let seq = 0;

async function request(
  label: string,
  method: string,
  path: string,
  init?: RequestInit,
): Promise<ApiResult> {
  const url = `${API_BASE}${path}`;
  const start = performance.now();
  try {
    // Only send Content-Type when there is a body: sending it on bodyless
    // GETs forces a CORS preflight for no benefit.
    const headers: Record<string, string> =
      init?.body != null ? { 'Content-Type': 'application/json' } : {};
    const res = await fetch(url, {
      ...init,
      method,
      headers,
    });
    const ms = Math.round(performance.now() - start);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return {
      id: ++seq,
      time: new Date().toLocaleTimeString(),
      label,
      method,
      url,
      status: res.status,
      statusText: res.statusText || statusTextFor(res.status),
      ms,
      body,
      ok: res.ok,
    };
  } catch (e) {
    const ms = Math.round(performance.now() - start);
    return {
      id: ++seq,
      time: new Date().toLocaleTimeString(),
      label,
      method,
      url,
      ms,
      body: e instanceof Error ? e.message : String(e),
      ok: false,
    };
  }
}

export const postClaim = (policyId: string, amount: number) =>
  request('POST /claims', 'POST', `/policies/${policyId}/claims`, {
    body: JSON.stringify({ amount }),
  });

export const getHealth = () => request('GET /health', 'GET', '/actuator/health');
export const getInfo = () => request('GET /info', 'GET', '/actuator/info');
export const getMetrics = () => request('GET /metrics', 'GET', '/actuator/metrics');

export async function callAll(policyId: string, amount: number): Promise<ApiResult[]> {
  const settled = await Promise.allSettled([
    postClaim(policyId, amount),
    getHealth(),
    getInfo(),
    getMetrics(),
  ]);
  return settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : {
          id: ++seq,
          time: new Date().toLocaleTimeString(),
          label: `call-${i}`,
          method: 'GET',
          url: API_BASE,
          ms: 0,
          body: String(s.reason),
          ok: false,
        },
  );
}

export const SEED_POLICIES = [
  { id: 'b1c2e8d0-2222-4b3b-8d2b-000000000001', label: 'INS-2024-001 · Alice (ACTIVE · limit 100k)' },
  { id: 'b1c2e8d0-2222-4b3b-8d2b-000000000002', label: 'INS-2024-002 · Bob (ACTIVE · limit 50k)' },
  { id: 'b1c2e8d0-2222-4b3b-8d2b-000000000003', label: 'INS-2024-003 · Charlie (INACTIVE)' },
];

export function statusTextFor(status: number): string {
  if (status === 201) return 'Created';
  if (status === 200) return 'OK';
  if (status === 400) return 'Bad Request';
  if (status === 404) return 'Not Found';
  if (status === 422) return 'Unprocessable Content';
  if (status >= 500) return 'Server Error';
  return '';
}
