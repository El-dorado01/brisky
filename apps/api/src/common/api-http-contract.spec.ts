import { Controller, Get, Module, Post } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiErrorsFilter } from './api-errors';
import { ApiContractController } from './api-contract';
import { createRequestLimitHook } from './request-limits';

@Controller('fixture')
class FixtureController {
  @Get('failure') fail() { throw new Error('private database credentials'); }
  @Post('body') body() { return { ok: true }; }
}
@Module({ controllers: [FixtureController,ApiContractController], providers: [{ provide: APP_FILTER, useClass: ApiErrorsFilter }] })
class FixtureModule {}

describe('HTTP API contract bootstrap', () => {
  it('serves the contract and normalizes handler and parser errors without live dependencies', async () => {
    const app = await NestFactory.create<NestFastifyApplication>(FixtureModule, new FastifyAdapter({ bodyLimit: 128 }), { logger: false });
    const server = app.getHttpAdapter().getInstance();
    server.addHook('onRequest', createRequestLimitHook());
    app.setGlobalPrefix('api/v1');
    try {
      await app.init(); await server.ready();
      const contract = await server.inject('/api/v1/openapi.json');
      expect(contract.statusCode).toBe(200);
      expect(contract.json().openapi).toBe('3.1.0');
      const failure = await server.inject('/api/v1/fixture/failure');
      expect(failure.statusCode).toBe(500);
      expect(failure.json().code).toBe('INTERNAL_ERROR');
      expect(failure.body).not.toContain('credentials');
      expect(failure.json().requestId).toBe(failure.headers['x-request-id']);
      const large = await server.inject({ method: 'POST', url: '/api/v1/fixture/body', payload: { text: 'a'.repeat(256) } });
      expect(large.statusCode).toBe(413);
      expect(large.json().code).toBe('PAYLOAD_TOO_LARGE');
      const malformed = await server.inject({ method: 'POST', url: '/api/v1/fixture/body', headers: { 'content-type': 'application/json' }, payload: '{' });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json().requestId).toBeTruthy();
    } finally { await app.close(); }
  });
});
