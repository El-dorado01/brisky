import fastify from 'fastify';
import { createRequestLimitHook } from './request-limits';

describe('HTTP admission limits', () => {
  it('limits auth attempts before handlers and supplies Retry-After independently of API polling', async () => {
    const server = fastify();
    server.addHook('onRequest', createRequestLimitHook(2, 1));
    let calls = 0;
    server.post('/api/v1/auth/login', async () => { calls++; return {}; });
    server.get('/api/v1/media', async () => ({}));
    try {
      expect((await server.inject({ method: 'POST', url: '/api/v1/auth/login' })).statusCode).toBe(200);
      const denied = await server.inject({ method: 'POST', url: '/api/v1/auth/login?x=1' });
      expect(denied.statusCode).toBe(429);
      expect(denied.headers['retry-after']).toBeDefined();
      expect(calls).toBe(1);
      expect((await server.inject('/api/v1/media')).statusCode).toBe(200);
      expect((await server.inject('/api/v1/media')).statusCode).toBe(200);
      expect((await server.inject('/api/v1/media')).statusCode).toBe(429);
    } finally { await server.close(); }
  });
});
