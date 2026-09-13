import { GoogleDriveConnector } from './google-drive.connector';

describe('GoogleDriveConnector: Rate Limit Resilience & Retry (Phase 4)', () => {
  let connector: GoogleDriveConnector;

  beforeEach(() => {
    const fakeConfig = {
      get: (key: string, def?: string) => def || '',
    };
    connector = new GoogleDriveConnector(fakeConfig as any);
  });

  it('succeeds on the first attempt when no rate limit occurs', async () => {
    const op = jest.fn().mockResolvedValue('ok');
    const res = await connector.withRetry(op);
    expect(res).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries with backoff on HTTP 429 and succeeds on subsequent attempt', async () => {
    const rateLimitError = new Error('Rate limit exceeded');
    (rateLimitError as any).status = 429;

    const op = jest
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce('recovered');

    const res = await connector.withRetry(op, 3, 10);
    expect(res).toBe('recovered');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 503 service unavailable and succeeds', async () => {
    const serverError = new Error('Backend error');
    (serverError as any).code = 503;

    const op = jest
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce('recovered_503');

    const res = await connector.withRetry(op, 3, 10);
    expect(res).toBe('recovered_503');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not retry 404 Not Found errors and fails immediately', async () => {
    const notFound = new Error('File not found');
    (notFound as any).status = 404;

    const op = jest.fn().mockRejectedValue(notFound);

    await expect(connector.withRetry(op, 3, 10)).rejects.toThrow('File not found');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('fails after exhausting maximum retries on repeated 429s', async () => {
    const rateLimitError = new Error('Rate limit exceeded');
    (rateLimitError as any).status = 429;

    const op = jest.fn().mockRejectedValue(rateLimitError);

    await expect(connector.withRetry(op, 2, 10)).rejects.toThrow('Rate limit exceeded');
    expect(op).toHaveBeenCalledTimes(2);
  });
});
