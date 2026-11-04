import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { resolveFromRepo } from '../../common/repo-paths';
import { AsyncLocalStorage } from 'async_hooks';

const planScope = new AsyncLocalStorage<string>();
export function withAiBudgetPlan<T>(key: string, run: () => T): T { return planScope.run(key, run); }

export class AiBudgetError extends Error {}

interface Price {
  reservationUsd: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}
interface Attempt {
  id: string;
  requestId: string;
  provider: string;
  model: string;
  stage: string;
  reservedUsd: number;
  price: Price;
  planId?: string;
  allowedModels?: string[];
}
interface Entry {
  event: 'reserved' | 'settled' | 'plan_reserved' | 'plan_released';
  at: string;
  attempt: Attempt;
  status?: 'success' | 'error';
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  estimatedUsd?: number | null;
}

/** Local shared-disk admission control. Reservations are conservative accounting,
 * not a guarantee of the provider's bill. Unknown outcomes keep their reservation. */
export class AiUsageLedger {
  private readonly file: string;
  constructor(private readonly config: ConfigService) {
    this.file = resolveFromRepo(config.get<string>('AI_USAGE_LEDGER_PATH', './storage/usage/ai-attempts.jsonl'));
  }

  private budget(): number {
    const value = Number(this.config.get('AI_BUDGET_USD', 0));
    if (!Number.isFinite(value) || value <= 0) {
      throw new AiBudgetError('Remote inference disabled: configure a positive AI_BUDGET_USD');
    }
    return value;
  }

  estimateUsd(provider: string, model: string, inputTokens: number, outputTokens: number): number {
    const price = this.price(provider, model);
    return (inputTokens * price.inputUsdPerMillion + outputTokens * price.outputUsdPerMillion) / 1_000_000;
  }

  assertAvailable(provider: string, model: string): void {
    const budget = this.budget();
    const price = this.price(provider, model);
    this.locked((entries) => {
      if (planScope.getStore()) { this.availablePlan(entries, provider, model); return; }
      if (this.total(entries) + price.reservationUsd > budget + 1e-9) {
        throw new AiBudgetError('AI budget exhausted before media upload');
      }
    });
  }

  private availablePlan(entries: Entry[], provider: string, model: string): Attempt {
    const key = planScope.getStore();
    const plan = entries.slice().reverse().find(entry => entry.event === 'plan_reserved' && entry.attempt.requestId === key &&
      !entries.some(e => e.event === 'plan_released' && e.attempt.id === entry.attempt.id))?.attempt;
    if (!plan || plan.provider !== provider || !(plan.allowedModels || [plan.model]).includes(model)) throw new AiBudgetError('Missing or incompatible file budget plan');
    const used = entries.filter(e => e.event === 'reserved' && e.attempt.planId === plan.id)
      .reduce((sum, e) => sum + e.attempt.reservedUsd, 0);
    if (used + this.price(provider, model).reservationUsd > plan.reservedUsd + 1e-9) throw new AiBudgetError('File budget plan exhausted; no additional inference admitted');
    return plan;
  }

  reservePlan(provider: string, model: string, attempts: number, key: string, models: string[] = [model]): void {
    if (!key || !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10000) throw new AiBudgetError('Invalid file budget plan');
    const allowedModels=[...new Set([model,...models])].sort();
    if(allowedModels.length>4 || allowedModels.some(m=>!m || typeof m!=='string')) throw new AiBudgetError('Invalid file plan models');
    const price = allowedModels.map(m=>this.price(provider,m)).reduce((a,b)=>a.reservationUsd>=b.reservationUsd?a:b);
    const cost = attempts * price.reservationUsd, budget = this.budget();
    this.locked((entries, append) => {
      const existing = entries.slice().reverse().find(e => e.event === 'plan_reserved' && e.attempt.requestId === key &&
        !entries.some(r => r.event === 'plan_released' && r.attempt.id === e.attempt.id));
      if (existing) {
        if (existing.attempt.provider !== provider || existing.attempt.model !== model || existing.attempt.reservedUsd !== cost ||
          JSON.stringify([...(existing.attempt.allowedModels || [existing.attempt.model])].sort())!==JSON.stringify(allowedModels)) throw new AiBudgetError('File plan changed; reconcile before retry');
        return;
      }
      if (this.total(entries) + cost > budget + 1e-9) throw new AiBudgetError('Insufficient AI allowance for the complete file plan');
      append({ event: 'plan_reserved', at: new Date().toISOString(), attempt: {
        id: randomUUID(), requestId: key, provider, model, allowedModels, stage: 'indexing_plan', reservedUsd: cost, price,
      } });
    });
  }

  releasePlan(key: string | undefined = planScope.getStore()): void {
    if (!key) return;
    this.locked((entries, append) => {
      const plan = entries.slice().reverse().find(e => e.event === 'plan_reserved' && e.attempt.requestId === key &&
        !entries.some(r => r.event === 'plan_released' && r.attempt.id === e.attempt.id));
      if (plan) append({ event: 'plan_released', at: new Date().toISOString(), attempt: plan.attempt });
    });
  }

  private price(provider: string, model: string): Price {
    let value: Price;
    try {
      value = JSON.parse(this.config.get<string>('AI_MODEL_PRICING_JSON', '{}'))[`${provider}/${model}`];
    } catch { throw new AiBudgetError('Invalid AI_MODEL_PRICING_JSON'); }
    if (!value || !Number.isFinite(value.reservationUsd) || value.reservationUsd <= 0 ||
      !Number.isFinite(value.inputUsdPerMillion) || value.inputUsdPerMillion < 0 ||
      !Number.isFinite(value.outputUsdPerMillion) || value.outputUsdPerMillion < 0) {
      throw new AiBudgetError(`Explicit pricing and per-attempt reservation required for ${provider}/${model}`);
    }
    return value;
  }

  private locked<T>(fn: (entries: Entry[], append: (entry: Entry) => void) => T): T {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const lock = `${this.file}.lock`;
    let descriptor: number;
    try { descriptor = fs.openSync(lock, 'wx'); }
    catch { throw new AiBudgetError('AI ledger locked or unavailable; no inference admitted'); }
    try {
      const raw = fs.existsSync(this.file) ? fs.readFileSync(this.file, 'utf8') : '';
      if (raw && !raw.endsWith('\n')) throw new AiBudgetError('Incomplete AI ledger append');
      const entries: Entry[] = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      this.total(entries); // Fail closed on corrupted/truncated or inconsistent journal.
      return fn(entries, (entry) => {
        const fd = fs.openSync(this.file, 'a');
        try { fs.writeSync(fd, JSON.stringify(entry) + '\n'); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
      });
    } catch (err) {
      if (err instanceof AiBudgetError) throw err;
      throw new AiBudgetError('AI ledger read/write failed; no further inference admitted');
    } finally {
      fs.closeSync(descriptor);
      fs.unlinkSync(lock);
    }
  }

  private total(entries: Entry[]): number {
    const charges = new Map<string, number>();
    const reservations = new Map<string, Attempt>();
    const plans = new Set<string>();
    const released = new Set<string>();
    const settled = new Set<string>();
    for (const entry of entries) {
      const attempt = entry.attempt;
      if (!attempt?.id || !Number.isFinite(attempt.reservedUsd) || attempt.reservedUsd <= 0) {
        throw new AiBudgetError('Invalid AI ledger reservation');
      }
      if (entry.event === 'plan_reserved') {
        if (charges.has(attempt.id)) throw new AiBudgetError('Duplicate file budget plan');
        charges.set(attempt.id, attempt.reservedUsd); plans.add(attempt.id);
      } else if (entry.event === 'plan_released') {
        if (!plans.has(attempt.id) || released.has(attempt.id)) throw new AiBudgetError('Invalid file budget release');
        charges.set(attempt.id, 0); released.add(attempt.id);
      } else if (entry.event === 'reserved') {
        if (charges.has(attempt.id)) throw new AiBudgetError('Duplicate AI ledger reservation');
        if (attempt.planId) {
          if (!plans.has(attempt.planId) || released.has(attempt.planId) || charges.get(attempt.planId)! + 1e-9 < attempt.reservedUsd) throw new AiBudgetError('Invalid file budget consumption');
          charges.set(attempt.planId, Math.max(0, charges.get(attempt.planId)! - attempt.reservedUsd));
        }
        charges.set(attempt.id, attempt.reservedUsd);
        reservations.set(attempt.id, attempt);
      } else if (entry.event === 'settled' && reservations.has(attempt.id) && !settled.has(attempt.id)) {
        if (entry.estimatedUsd != null && (!Number.isFinite(entry.estimatedUsd) || entry.estimatedUsd < 0)) {
          throw new AiBudgetError('Invalid AI ledger estimate');
        }
        if (entry.status !== 'success' && entry.status !== 'error') {
          throw new AiBudgetError('Invalid AI ledger settlement status');
        }
        if (entry.estimatedUsd != null) {
          const price = reservations.get(attempt.id)!.price;
          const values = [entry.inputTokens, entry.outputTokens, price?.inputUsdPerMillion, price?.outputUsdPerMillion];
          if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
            throw new AiBudgetError('AI ledger estimate lacks valid reported usage/pricing');
          }
          const expected = (entry.inputTokens! * price.inputUsdPerMillion + entry.outputTokens! * price.outputUsdPerMillion) / 1_000_000;
          if (!Number.isFinite(expected) || Math.abs(expected - entry.estimatedUsd) > 1e-9) {
            throw new AiBudgetError('AI ledger estimate disagrees with recorded usage');
          }
        }
        // Successful reported usage replaces the hold. Unknown or failed outcomes
        // keep at least the original reservation, even when some usage was returned.
        charges.set(attempt.id, entry.status === 'success' && entry.estimatedUsd != null
          ? entry.estimatedUsd : Math.max(charges.get(attempt.id)!, entry.estimatedUsd ?? 0));
        settled.add(attempt.id);
      } else throw new AiBudgetError('Invalid AI ledger event sequence');
    }
    return [...charges.values()].reduce((sum, value) => sum + value, 0);
  }

  reserve(provider: string, model: string, stage: string, requestId: string): Attempt {
    const budget = this.budget();
    const price = this.price(provider, model);
    return this.locked((entries, append) => {
      const plan = planScope.getStore() ? this.availablePlan(entries, provider, model) : undefined;
      if (this.total(entries) + (plan ? 0 : price.reservationUsd) > budget + 1e-9) {
        throw new AiBudgetError('AI budget exhausted or reserved by in-flight/unknown attempts');
      }
      const attempt = { id: randomUUID(), requestId, provider, model, stage,
        reservedUsd: price.reservationUsd, price, ...(plan ? { planId: plan.id } : {}) };
      append({ event: 'reserved', at: new Date().toISOString(), attempt });
      return attempt;
    });
  }

  settle(attempt: Attempt, status: 'success' | 'error', durationMs: number,
    inputTokens?: number, outputTokens?: number): void {
    const valid = (n: number | undefined) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    const known = valid(inputTokens) && valid(outputTokens);
    const estimatedUsd = known ? (inputTokens! * attempt.price.inputUsdPerMillion +
      outputTokens! * attempt.price.outputUsdPerMillion) / 1_000_000 : null;
    this.locked((entries, append) => {
      if (!entries.some((e) => e.event === 'reserved' && e.attempt.id === attempt.id) ||
        entries.some((e) => e.event === 'settled' && e.attempt.id === attempt.id)) {
        throw new AiBudgetError('AI attempt missing or already settled');
      }
      append({ event: 'settled', at: new Date().toISOString(), attempt, status, durationMs,
        inputTokens: valid(inputTokens) ? inputTokens : undefined,
        outputTokens: valid(outputTokens) ? outputTokens : undefined, estimatedUsd });
    });
  }
}
