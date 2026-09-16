import { shouldRunWorkerProcess } from './queue.module';

describe('Worker Process Separation Seam (Phase F0)', () => {
  it('does NOT run worker in API by default (when RUN_WORKER_IN_API is unset)', () => {
    expect(shouldRunWorkerProcess({})).toBe(false);
  });

  it('does NOT run worker in API when RUN_WORKER_IN_API=false', () => {
    expect(shouldRunWorkerProcess({ RUN_WORKER_IN_API: 'false' })).toBe(false);
  });

  it('runs worker when IS_WORKER=true (standalone worker entry point)', () => {
    expect(shouldRunWorkerProcess({ IS_WORKER: 'true' })).toBe(true);
  });

  it('runs worker in API only when explicitly opted in via RUN_WORKER_IN_API=true', () => {
    expect(shouldRunWorkerProcess({ RUN_WORKER_IN_API: 'true' })).toBe(true);
  });
});
