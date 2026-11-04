import { EventEmitter } from 'events';
import { withSearchDisconnect } from './search-disconnect';
import { searchDelay, withSearchDeadline } from './search-deadline';

describe('search disconnect lifecycle', () => {
  const pair = () => ({ request: Object.assign(new EventEmitter(), { aborted: false }),
    response: Object.assign(new EventEmitter(), { writableFinished: false, destroyed: false }) });
  it('cancels after a fully received request when the response connection closes', async () => {
    const { request, response } = pair();
    const result = withSearchDisconnect(request as any, response as any,
      (signal) => withSearchDeadline(10000, () => searchDelay(10000), signal));
    request.emit('close'); // A normally completed request body must not cancel work.
    response.emit('close');
    await expect(result).rejects.toThrow('Search deadline');
    expect(response.listenerCount('close')).toBe(0);
    expect(request.listenerCount('aborted')).toBe(0);
  });
  it('does not cancel a successfully finished response', async () => {
    const { request, response } = pair();
    response.writableFinished = true;
    await expect(withSearchDisconnect(request as any, response as any, async (signal) => {
      response.emit('close');
      expect(signal.aborted).toBe(false);
      return 'ok';
    })).resolves.toBe('ok');
  });
  it('blocks work on an already disconnected response', async () => {
    const { request, response } = pair();
    response.destroyed = true;
    const work = jest.fn();
    await expect(withSearchDisconnect(request as any, response as any,
      (signal) => withSearchDeadline(10000, work, signal))).rejects.toThrow('Search deadline');
    expect(work).not.toHaveBeenCalled();
  });
});
