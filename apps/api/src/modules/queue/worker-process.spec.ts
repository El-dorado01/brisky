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

  it('does not treat a path that merely contains "worker" as the worker entry', () => {
    expect(
      shouldRunWorkerProcess({}, ['node', 'C:/proj/apps/api/src/modules/queue/worker-process.spec.ts']),
    ).toBe(false);
    expect(shouldRunWorkerProcess({}, ['node', '/app/dist/worker-env.js'])).toBe(false);
  });

  it('runs worker when argv is the worker entry file', () => {
    expect(shouldRunWorkerProcess({}, ['node', '/app/dist/worker.js'])).toBe(true);
    expect(shouldRunWorkerProcess({}, ['node', 'C:\\app\\src\\worker.ts'])).toBe(true);
    expect(shouldRunWorkerProcess({}, ['node', '/usr/bin/worker'])).toBe(true);
  });
});
