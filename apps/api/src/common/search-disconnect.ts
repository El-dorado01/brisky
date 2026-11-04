import { IncomingMessage, ServerResponse } from 'http';

/** Response close covers a disconnect after the request body was fully read. */
export async function withSearchDisconnect<T>(request: IncomingMessage, response: ServerResponse,
  work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => { if (!response.writableFinished) abort(); };
  request.once('aborted', abort);
  response.once('close', close);
  if (request.aborted || response.destroyed) abort();
  try { return await work(controller.signal); }
  finally {
    request.removeListener('aborted', abort);
    response.removeListener('close', close);
  }
}
