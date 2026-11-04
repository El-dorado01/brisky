interface AdmissionReply {
  code(status: number): AdmissionReply;
  header(name: string, value: string): AdmissionReply;
  send(body: unknown): unknown;
}

/** Process-local admission control. A shared gateway/store must enforce multi-instance quotas. */
export function createRequestLimitHook(apiLimit = 120, authLimit = 10) {
  if (![apiLimit, authLimit].every((value) => Number.isInteger(value) && value > 0 && value <= 100000)) {
    throw new Error('Request limits must be positive integers at most 100000');
  }
  const buckets = new Map<string, { count: number; expires: number }>();
  return async (req: { url: string; ip: string; id?: string }, reply: AdmissionReply) => {
    if (req.id) reply.header('X-Request-Id', req.id);
    const route = req.url.split('?')[0].replace(/\/+$/, '');
    const auth = route === '/api/v1/auth/login' || route === '/api/v1/auth/register';
    const key = `${auth ? 'auth' : 'api'}:${req.ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (bucket && bucket.expires <= now) { buckets.delete(key); bucket = undefined; }
    if (!bucket) {
      // Bounded memory; refuse new identities rather than evicting active quota state.
      if (buckets.size >= 10000) {
        for (const [id, item] of buckets) if (item.expires <= now) buckets.delete(id);
        if (buckets.size >= 10000) return reply.code(429).header('Retry-After', '60').send({ statusCode: 429, code: 'RATE_LIMITED', message: 'Request capacity reached; retry later', requestId: req.id });
      }
      bucket = { count: 0, expires: now + 60000 }; buckets.set(key, bucket);
    }
    if (++bucket.count > (auth ? authLimit : apiLimit)) {
      return reply.code(429).header('Retry-After', String(Math.max(1, Math.ceil((bucket.expires - now) / 1000))))
        .send({ statusCode: 429, code: 'RATE_LIMITED', message: 'Too many requests; retry later', requestId: req.id });
    }
  };
}
