import { AsyncLocalStorage } from 'async_hooks';

const context = new AsyncLocalStorage<AbortSignal>();
export class SearchDeadlineError extends Error {
  constructor() { super('Search deadline exceeded or search cancelled'); }
}
export const searchSignal = () => context.getStore();
export function assertSearchActive(): void {
  if (searchSignal()?.aborted) throw new SearchDeadlineError();
}

export async function withSearchDeadline<T>(milliseconds: number, work: () => Promise<T>, external?: AbortSignal): Promise<T> {
  const parent = searchSignal();
  if (parent?.aborted || external?.aborted) throw new SearchDeadlineError();
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener('abort', abort, { once: true });
  external?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, milliseconds);
  let cancel!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => reject(new SearchDeadlineError());
    controller.signal.addEventListener('abort', cancel, { once: true });
  });
  try {
    return await context.run(controller.signal, () => Promise.race([work(), cancelled]));
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
    external?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', cancel);
    // Detached continuations must not start fresh work after a completed search.
    controller.abort();
  }
}

export function searchDelay(milliseconds: number): Promise<void> {
  const signal = searchSignal();
  if (signal?.aborted) return Promise.reject(new SearchDeadlineError());
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new SearchDeadlineError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
