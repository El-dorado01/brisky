// Offline report. No provider calls, environment secrets, or ledger mutations.
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'storage', 'usage', 'ai-attempts.jsonl');
if (!fs.existsSync(file)) {
  console.log('No usage ledger exists. No recorded attempts.');
  process.exit(0);
}
try {
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const attempts = new Map();
  const plans = new Map();
  for (const entry of entries) {
    if (entry.event === 'plan_reserved') {
      if (plans.has(entry.attempt.id) || !Number.isFinite(entry.attempt.reservedUsd) || entry.attempt.reservedUsd <= 0) throw new Error('Invalid plan');
      plans.set(entry.attempt.id, { remaining: entry.attempt.reservedUsd, released: false });
    } else if (entry.event === 'plan_released') {
      const plan = plans.get(entry.attempt.id);
      if (!plan || plan.released) throw new Error('Invalid release');
      plan.remaining = 0; plan.released = true;
    } else if (entry.event === 'reserved') {
      if (attempts.has(entry.attempt.id)) throw new Error('Duplicate reservation');
      if (entry.attempt.planId) {
        const plan = plans.get(entry.attempt.planId);
        if (!plan || plan.released || plan.remaining + 1e-9 < entry.attempt.reservedUsd) throw new Error('Invalid plan consumption');
        plan.remaining = Math.max(0, plan.remaining - entry.attempt.reservedUsd);
      }
      attempts.set(entry.attempt.id, { ...entry.attempt, status: 'unsettled', estimatedUsd: null });
    } else if (entry.event === 'settled' && attempts.has(entry.attempt.id)) {
      const attempt = attempts.get(entry.attempt.id);
      if (attempt.status !== 'unsettled') throw new Error('Duplicate settlement');
      Object.assign(attempt, { status: entry.status, estimatedUsd: entry.estimatedUsd,
        inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, durationMs: entry.durationMs });
    } else throw new Error('Invalid journal sequence');
  }
  const groups = new Map();
  for (const attempt of attempts.values()) {
    const key = `${attempt.provider}/${attempt.model}/${attempt.stage}`;
    const group = groups.get(key) || { task: key, attempts: 0, errors: 0, unsettled: 0,
      unknownCharge: 0, reservedOrEstimatedUsd: 0, knownEstimatedUsd: 0 };
    group.attempts++;
    group.errors += attempt.status === 'error' ? 1 : 0;
    group.unsettled += attempt.status === 'unsettled' ? 1 : 0;
    group.unknownCharge += attempt.estimatedUsd == null ? 1 : 0;
    group.knownEstimatedUsd += attempt.estimatedUsd ?? 0;
    if (!Number.isFinite(attempt.reservedUsd) || attempt.reservedUsd <= 0 ||
        attempt.estimatedUsd != null && (!Number.isFinite(attempt.estimatedUsd) || attempt.estimatedUsd < 0) ||
        !['unsettled', 'success', 'error'].includes(attempt.status)) throw new Error('Invalid accounting values');
    if (attempt.estimatedUsd != null) {
      const values = [attempt.inputTokens, attempt.outputTokens, attempt.price?.inputUsdPerMillion, attempt.price?.outputUsdPerMillion];
      if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error('Usage missing');
      const expected = (attempt.inputTokens * attempt.price.inputUsdPerMillion + attempt.outputTokens * attempt.price.outputUsdPerMillion) / 1e6;
      if (!Number.isFinite(expected) || Math.abs(expected - attempt.estimatedUsd) > 1e-9) throw new Error('Estimate mismatch');
    }
    group.reservedOrEstimatedUsd += attempt.status === 'success' && attempt.estimatedUsd != null
      ? attempt.estimatedUsd : Math.max(attempt.reservedUsd, attempt.estimatedUsd ?? 0);
    groups.set(key, group);
  }
  console.table([...groups.values()]);
  const planHolds = [...plans.values()].reduce((sum, plan) => sum + plan.remaining, 0);
  const counted = [...groups.values()].reduce((sum, group) => sum + group.reservedOrEstimatedUsd, planHolds);
  const estimates = [...groups.values()].reduce((sum, group) => sum + group.knownEstimatedUsd, 0);
  console.log(`Counted toward allowance: $${counted.toFixed(6)}; reported-usage estimates: $${estimates.toFixed(6)}.`);
  console.log(`Unused file-plan holds: $${planHolds.toFixed(6)}.`);
  console.log('Estimates are not provider invoices. Unknown charges retain reservations. Reconcile with the provider dashboard.');
} catch {
  console.error('Ledger is invalid or unreadable; report aborted. Do not reset it to resume spending.');
  process.exitCode = 1;
}
