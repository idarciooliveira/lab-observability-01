import { useMemo, useState } from 'react';
import {
  API_BASE,
  SEED_POLICIES,
  callAll,
  getHealth,
  getInfo,
  getMetrics,
  postClaim,
  type ApiResult,
} from './api';
import './App.css';

function bodyText(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function explain(r: ApiResult): string {
  if (r.status == null) return 'No response — is the API running at ' + API_BASE + '?';
  if (r.ok && (r.status === 201 || r.status === 200))
    return r.label.includes('claims')
      ? '✅ Claim created and persisted.'
      : '✅ Request succeeded.';
  const text = bodyText(r.body).toLowerCase();
  if (r.status === 422) {
    if (text.includes('risk check') || text.includes('chaos'))
      return '❌ Rejected by risk check: amount exceeds 50k, exceeds 80% of the coverage limit, or chaos fault-injection fired. Try a smaller amount (e.g. 1000) or set CHAOS_REJECT_RATE=0.';
    if (text.includes('coverage'))
      return '❌ Amount exceeds the policy coverage limit. Try a smaller amount.';
    if (text.includes('inactive'))
      return '❌ Policy is INACTIVE and cannot receive claims. Switch to Alice or Bob.';
    if (text.includes('greater than zero'))
      return '❌ Amount must be greater than zero.';
    return '❌ Rejected (422). See response body for the rule that fired.';
  }
  if (r.status === 404)
    return '❌ Policy not found — seed data may be missing. Check the seed panel below.';
  if (r.status === 400)
    return '❌ Invalid request (400). Amount must be a number ≥ 0.01.';
  if (r.status >= 500) return '❌ Server error. Check the API logs.';
  return r.ok ? '✅ Request succeeded.' : `❌ Failed with ${r.status}.`;
}

function statusClass(r: ApiResult): string {
  if (r.ok) return 'badge ok';
  if (r.status == null) return 'badge network';
  if (r.status === 422) return 'badge warn';
  return 'badge err';
}

function statusLabel(r: ApiResult): string {
  if (r.status == null) return 'NETWORK ERROR';
  const outcome = r.ok ? 'SUCCESS' : 'FAILED';
  const code = r.statusText ? `${r.status} ${r.statusText}` : `${r.status}`;
  return `${outcome} · ${code}`;
}

export default function App() {
  const [policyId, setPolicyId] = useState(SEED_POLICIES[0].id);
  const [amount, setAmount] = useState(1000);
  const [results, setResults] = useState<ApiResult[]>([]);
  const [busy, setBusy] = useState(false);

  const push = (r: ApiResult | ApiResult[]) =>
    setResults((prev) => [...(Array.isArray(r) ? r : [r]), ...prev].slice(0, 100));

  const run = async (fn: () => Promise<ApiResult | ApiResult[]>) => {
    setBusy(true);
    try {
      push(await fn());
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => {
    const ok = results.filter((r) => r.ok).length;
    return { ok, fail: results.length - ok };
  }, [results]);

  return (
    <div className="container">
      <header>
        <h1>Insurance Direct</h1>
        <p>
          API: <code>{API_BASE}</code> · no auth
        </p>
      </header>

      <section className="hint">
        <strong>Approval rules:</strong> ACTIVE policy · amount ≤ coverage limit · amount ≤ 50k ·{' '}
        amount ≤ 80% of coverage (Alice ≤ 80k, Bob ≤ 40k). Charlie is INACTIVE and always 422.
        If <em>every</em> call returns 422, check <code>CHAOS_REJECT_RATE</code> in{' '}
        <code>.env</code> (must be <code>0</code>–<code>1</code>, e.g. <code>0.1</code> = 10%).
      </section>

      <section className="controls">
        <label>
          Policy
          <select value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
            {SEED_POLICIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <input
          className="policy-input"
          value={policyId}
          onChange={(e) => setPolicyId(e.target.value)}
          placeholder="policy UUID"
          spellCheck={false}
        />
        <label>
          Amount
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
      </section>

      <section className="buttons">
        <button disabled={busy} onClick={() => run(() => postClaim(policyId, amount))}>
          POST /policies/:id/claims
        </button>
        <button disabled={busy} onClick={() => run(getHealth)}>
          GET /actuator/health
        </button>
        <button disabled={busy} onClick={() => run(getInfo)}>
          GET /actuator/info
        </button>
        <button disabled={busy} onClick={() => run(getMetrics)}>
          GET /actuator/metrics
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => run(() => callAll(policyId, amount))}
        >
          {busy ? 'Calling…' : 'Call all endpoints'}
        </button>
        <button disabled={results.length === 0} onClick={() => setResults([])}>
          Clear
        </button>
      </section>

      <section>
        <h2>
          Results ({results.length}
          {results.length > 0 && (
            <span className="summary">
              {' '}
              · <span className="ok-count">{summary.ok} succeeded</span> ·{' '}
              <span className="fail-count">{summary.fail} failed</span>
            </span>
          )}
          )
        </h2>
        {results.length === 0 && <p className="empty">No calls yet. Click a button above.</p>}
        <ul className="results">
          {results.map((r) => (
            <li key={r.id} className={r.ok ? 'ok' : 'err'}>
              <div className="row">
                <strong>{r.label}</strong>
                <span className="meta">
                  {r.method} {r.url}
                </span>
                <span className="meta">
                  {r.ms}ms · {r.time}
                </span>
              </div>
              <div className="row">
                <span className={statusClass(r)}>{statusLabel(r)}</span>
              </div>
              <p className="explanation">{explain(r)}</p>
              <pre>{typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2)}</pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
