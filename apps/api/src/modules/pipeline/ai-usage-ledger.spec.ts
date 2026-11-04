import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { AiBudgetError, AiUsageLedger, withAiBudgetPlan } from './ai-usage-ledger';
import { GoogleAiProvider } from './providers/google-ai.provider';

describe('AI budget ledger', () => {
  let root: string;
  let file: string;
  let config: ConfigService;
  const price = { reservationUsd: 0.1, inputUsdPerMillion: 1, outputUsdPerMillion: 2 };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-budget-'));
    file = path.join(root, 'ledger.jsonl');
    config = new ConfigService({ AI_BUDGET_USD: 0.2, AI_USAGE_LEDGER_PATH: file,
      AI_MODEL_PRICING_JSON: JSON.stringify({ 'google/test-model': price }),
      GEMINI_MODEL: 'test-model', GEMINI_FALLBACK_MODELS: '', GEMINI_FALLBACK_MODEL: '',
      GEMINI_API_KEY: 'test-key', GEMINI_API_KEYS: '',
    });
  });
  afterEach(() => { jest.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });
  const read = (f: string) => fs.readFileSync(f, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

  it('renews a released file plan for retry while retaining unknown attempt holds', () => {
    config.set('AI_BUDGET_USD', 0.3);
    const ledger=new AiUsageLedger(config);
    ledger.reservePlan('google','test-model',2,'asset');
    withAiBudgetPlan('asset',()=>ledger.reserve('google','test-model','frame','unknown'));
    ledger.releasePlan('asset');
    const prefix=fs.readFileSync(file,'utf8');
    expect(new AiUsageLedger(config).restorePlanForRetry('asset')).toBe(true);
    expect(fs.readFileSync(file,'utf8').startsWith(prefix)).toBe(true);
    withAiBudgetPlan('asset',()=>ledger.assertAvailable('google','test-model'));
    expect(()=>ledger.reserve('google','test-model','other','blocked')).toThrow(AiBudgetError);
  });
  it('refuses an unaffordable retry and does not invent a plan for unknown files',()=>{
    const ledger=new AiUsageLedger(config);
    expect(ledger.restorePlanForRetry('unknown')).toBe(false);
    ledger.reservePlan('google','test-model',2,'asset');
    withAiBudgetPlan('asset',()=>ledger.reserve('google','test-model','frame','unknown'));
    ledger.releasePlan('asset');
    expect(()=>ledger.restorePlanForRetry('asset')).toThrow('complete file plan');
  });
  it('reserves only the measured remaining calls on a video-only retry',()=>{
    config.set('AI_BUDGET_USD',0.6);
    const ledger=new AiUsageLedger(config);
    ledger.reservePlan('google','test-model',6,'asset');
    withAiBudgetPlan('asset',()=>ledger.reserve('google','test-model','frame','unknown'));
    ledger.releasePlan('asset');
    config.set('AI_BUDGET_USD',0.3);
    expect(ledger.restorePlanForRetry('asset',2)).toBe(true);
    expect(read(file).filter(e=>e.event==='plan_reserved').at(-1).attempt.reservedUsd).toBeCloseTo(.2);
  });

  it('shares reservations across service instances and restarts', () => {
    new AiUsageLedger(config).reserve('google', 'test-model', 'search', 'one');
    new AiUsageLedger(config).reserve('google', 'test-model', 'search', 'two');
    expect(() => new AiUsageLedger(config).reserve('google', 'test-model', 'search', 'three')).toThrow(AiBudgetError);
    expect(read(file)).toHaveLength(2);
  });
  it('admits only explicit same-provider models using the largest reservation and survives restart',()=>{
    config.set('AI_BUDGET_USD',1);
    config.set('AI_MODEL_PRICING_JSON',JSON.stringify({'meta/text':price,'meta/video':{...price,reservationUsd:.2},'meta/other':price,'baseten/video':price}));
    const ledger=new AiUsageLedger(config);ledger.reservePlan('meta','text',2,'asset',['text','video']);
    expect(read(file)[0].attempt.reservedUsd).toBeCloseTo(.4);
    expect(()=>ledger.reservePlan('meta','text',2,'asset',['text','other'])).toThrow('changed');
    withAiBudgetPlan('asset',()=>{
      const fresh=new AiUsageLedger(config);fresh.reserve('meta','text','frame','one');fresh.reserve('meta','video','video','two');
      expect(()=>fresh.reserve('meta','other','other','three')).toThrow('incompatible');
      expect(()=>fresh.reserve('baseten','video','video','four')).toThrow('incompatible');
      expect(()=>fresh.reserve('meta','video','video','five')).toThrow('exhausted');
    });
  });
  it('holds a complete plan against other callers and consumes its holds across restarts', () => {
    const ledger = new AiUsageLedger(config);
    ledger.reservePlan('google', 'test-model', 2, 'owner/asset');
    ledger.reservePlan('google', 'test-model', 2, 'owner/asset');
    expect(read(file)).toHaveLength(1);
    expect(() => ledger.reserve('google', 'test-model', 'other', 'other')).toThrow(AiBudgetError);
    withAiBudgetPlan('owner/asset', () => {
      const fresh = new AiUsageLedger(config);
      fresh.assertAvailable('google', 'test-model');
      fresh.settle(fresh.reserve('google', 'test-model', 'frame', 'one'), 'success', 1, 1000, 100);
      fresh.reserve('google', 'test-model', 'frame', 'two');
      expect(() => fresh.reserve('google', 'test-model', 'frame', 'three')).toThrow('plan exhausted');
    });
  });
  it('releases only unused plan holds, retaining failed and unsettled attempts', () => {
    config.set('AI_BUDGET_USD', 0.3);
    const ledger = new AiUsageLedger(config);
    ledger.reservePlan('google', 'test-model', 3, 'asset');
    withAiBudgetPlan('asset', () => {
      ledger.settle(ledger.reserve('google', 'test-model', 'frame', 'one'), 'error', 1);
      ledger.reserve('google', 'test-model', 'frame', 'two');
    });
    ledger.releasePlan('asset');ledger.releasePlan('asset');
    ledger.reserve('google', 'test-model', 'other', 'three');
    expect(() => ledger.reserve('google', 'test-model', 'other', 'four')).toThrow(AiBudgetError);
  });
  it('rejects an unaffordable plan without appending and prevents cross-file borrowing', () => {
    const ledger = new AiUsageLedger(config);
    expect(() => ledger.reservePlan('google', 'test-model', 3, 'asset')).toThrow('complete file');
    expect(fs.existsSync(file)).toBe(false);
    ledger.reservePlan('google', 'test-model', 2, 'asset');
    withAiBudgetPlan('other-asset', () => expect(() => ledger.reserve('google', 'test-model', 'frame', 'one')).toThrow('Missing'));
  });
  it('retains reservations for failed calls and records unknown cost as null', () => {
    const ledger = new AiUsageLedger(config);
    const attempt = ledger.reserve('google', 'test-model', 'search', 'one');
    ledger.settle(attempt, 'error', 200);
    expect(read(file)[1]).toMatchObject({ status: 'error', estimatedUsd: null });
    new AiUsageLedger(config).reserve('google', 'test-model', 'search', 'two');
    expect(() => ledger.reserve('google', 'test-model', 'search', 'three')).toThrow(AiBudgetError);
  });
  it('replaces successful holds with estimates across instances without rewriting history', () => {
    const ledger = new AiUsageLedger(config);
    const attempt = ledger.reserve('google', 'test-model', 'search', 'one');
    ledger.settle(attempt, 'success', 10, 1000, 100);
    expect(read(file)[1].estimatedUsd).toBeCloseTo(0.0012);
    const journal = fs.readFileSync(file, 'utf8');
    new AiUsageLedger(config).reserve('google', 'test-model', 'search', 'two');
    expect(() => ledger.reserve('google', 'test-model', 'search', 'three')).toThrow(AiBudgetError);
    expect(fs.readFileSync(file, 'utf8').startsWith(journal)).toBe(true);
    config.set('AI_BUDGET_USD', 0.15);
    expect(() => new AiUsageLedger(config).assertAvailable('google', 'test-model')).toThrow(AiBudgetError);
  });
  it('releases enough allowance for new work after successful settlement', () => {
    config.set('AI_BUDGET_USD', 0.15);
    const ledger = new AiUsageLedger(config);
    const attempt = ledger.reserve('google', 'test-model', 'search', 'one');
    ledger.settle(attempt, 'success', 10, 1000, 100);
    expect(() => new AiUsageLedger(config).reserve('google', 'test-model', 'search', 'two')).not.toThrow();
    expect(() => ledger.reserve('google', 'test-model', 'search', 'three')).toThrow(AiBudgetError);
  });
  it.each(['success', 'error'] as const)('retains unknown usage after %s', status => {
    config.set('AI_BUDGET_USD', 0.15);
    const ledger = new AiUsageLedger(config);
    ledger.settle(ledger.reserve('google', 'test-model', 'search', 'one'), status, 10);
    expect(() => new AiUsageLedger(config).reserve('google', 'test-model', 'search', 'two')).toThrow(AiBudgetError);
  });
  it('keeps failed-call reservations even when a small usage estimate is known', () => {
    config.set('AI_BUDGET_USD', 0.15);
    const ledger = new AiUsageLedger(config);
    ledger.settle(ledger.reserve('google', 'test-model', 'search', 'one'), 'error', 10, 1, 1);
    expect(() => ledger.reserve('google', 'test-model', 'search', 'two')).toThrow(AiBudgetError);
  });
  it('accounts for an estimate larger than the reservation', () => {
    const ledger = new AiUsageLedger(config);
    const attempt = ledger.reserve('google', 'test-model', 'search', 'one');
    ledger.settle(attempt, 'success', 10, 300000, 0);
    expect(() => ledger.reserve('google', 'test-model', 'search', 'two')).toThrow(AiBudgetError);
  });
  it('fails closed when a successful estimate disagrees with its recorded usage', () => {
    const ledger = new AiUsageLedger(config);
    ledger.settle(ledger.reserve('google', 'test-model', 'search', 'one'), 'success', 10, 1000, 100);
    const entries = read(file);
    entries[1].estimatedUsd = 0;
    fs.writeFileSync(file, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
    expect(() => ledger.assertAvailable('google', 'test-model')).toThrow('disagrees');
  });
  it('fails closed for absent budgets, unpriced models, corrupt journals, and held locks', () => {
    const disabled = new AiUsageLedger(new ConfigService({ AI_USAGE_LEDGER_PATH: file }));
    expect(() => disabled.reserve('google', 'test-model', 'search', 'one')).toThrow(AiBudgetError);
    const ledger = new AiUsageLedger(config);
    expect(() => ledger.reserve('google', 'unpriced', 'search', 'one')).toThrow(AiBudgetError);
    fs.writeFileSync(file, '{truncated');
    expect(() => ledger.reserve('google', 'test-model', 'search', 'one')).toThrow(AiBudgetError);
    fs.writeFileSync(file, '');
    ledger.reserve('google', 'test-model', 'search', 'one');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').trimEnd());
    expect(() => ledger.reserve('google', 'test-model', 'search', 'two')).toThrow(AiBudgetError);
    fs.writeFileSync(file, '');
    fs.writeFileSync(`${file}.lock`, 'held');
    expect(() => ledger.reserve('google', 'test-model', 'search', 'one')).toThrow(AiBudgetError);
  });

  function service(c: ConfigService): any {
    return new GoogleAiProvider(c, {} as any);
  }
  it('blocks SDK calls when no budget is configured', async () => {
    const disabled = service(new ConfigService({ GEMINI_API_KEY: 'test-key', GEMINI_API_KEYS: '',
      AI_BUDGET_USD: 0, AI_USAGE_LEDGER_PATH: file, GEMINI_MODEL: 'test-model' }));
    const generate = jest.fn();
    disabled.aiClients = [{ models: { generateContent: generate } }];
    await expect(disabled.generateContent('search', ['query'])).rejects.toThrow(AiBudgetError);
    expect(generate).not.toHaveBeenCalled();
  });
  it('reserves each retry, then blocks further attempts at the limit', async () => {
    jest.useFakeTimers();
    const instance = service(config);
    const generate = jest.fn().mockRejectedValue(new Error('503 unavailable'));
    instance.aiClients = [{ models: { generateContent: generate } }];
    const result = instance.generateContent('search', ['query']);
    const assertion = expect(result).rejects.toThrow(AiBudgetError);
    await jest.runAllTimersAsync();
    await assertion;
    expect(generate).toHaveBeenCalledTimes(2);
    const events = read(file);
    expect(events.filter((e) => e.event === 'reserved')).toHaveLength(2);
    expect(new Set(events.map((e) => e.attempt.requestId)).size).toBe(1);
  });
  it('records thinking tokens, enforces request options, and omits prompts and keys', async () => {
    const instance = service(config);
    const generate = jest.fn().mockResolvedValue({ text: '{}', usageMetadata: {
      promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30,
    } });
    instance.aiClients = [{ models: { generateContent: generate } }];
    const result = await instance.generateContent('search', ['private prompt']);
    expect(result.outputTokens).toBe(50);
    expect(generate.mock.calls[0][0].config).toMatchObject({ maxOutputTokens: 4096,
      httpOptions: { timeout: 30000, retryOptions: { attempts: 1 } } });
    const journal = fs.readFileSync(file, 'utf8');
    expect(journal).not.toContain('private prompt');
    expect(journal).not.toContain('test-key');
    expect(read(file)[1]).toMatchObject({ inputTokens: 100, outputTokens: 50, status: 'success' });
  });
  it('does not disguise embedding failures as free empty vectors', async () => {
    const instance = service(config);
    instance.getEmbeddingModel = () => 'test-model';
    instance.aiClients = [{ models: { embedContent: jest.fn().mockRejectedValue(new Error('transport failed')) } }];
    await expect(instance.generateEmbedding('text')).rejects.toThrow('transport failed');
    expect(read(file)[1]).toMatchObject({ status: 'error', estimatedUsd: null });
  });
  it('blocks an unpriced fallback model before calling it', async () => {
    const instance = service(config);
    instance.getModelCascade = () => ['test-model', 'unpriced'];
    const generate = jest.fn().mockRejectedValue(new Error('NOT_FOUND'));
    instance.aiClients = [{ models: { generateContent: generate } }];
    await expect(instance.generateContent('search', ['query'])).rejects.toThrow(AiBudgetError);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('keeps successful calls with absent token metadata as unknown charges', async () => {
    const instance = service(config);
    instance.aiClients = [{ models: { generateContent: jest.fn().mockResolvedValue({ text: '{}' }) } }];
    const result = await instance.generateContent('search', ['query']);
    expect(result.usageKnown).toBe(false);
    expect(read(file)[1]).toMatchObject({ status: 'success', estimatedUsd: null });
  });
});
