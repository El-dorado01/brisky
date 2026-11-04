import { BadRequestException } from '@nestjs/common';
import { ApiErrorsFilter } from './api-errors';

describe('public error responses', () => {
  function response(error: unknown) {
    const reply: any = { code: jest.fn().mockReturnThis(), header: jest.fn().mockReturnThis(), send: jest.fn() };
    new ApiErrorsFilter().catch(error, { switchToHttp: () => ({ getRequest: () => ({ id: 'request-123' }), getResponse: () => reply }) } as any);
    return reply;
  }
  it('keeps meaningful request codes and correlation IDs', () => {
    const reply = response(new BadRequestException({ code: 'INVALID_CURSOR', message: 'Invalid cursor' }));
    expect(reply.send).toHaveBeenCalledWith({ statusCode: 400, code: 'INVALID_CURSOR', message: 'Invalid cursor', requestId: 'request-123' });
  });
  it('does not expose internal failures or turn parser errors into server errors', () => {
    const reply = response(new Error('password=do-not-return'));
    expect(reply.send.mock.calls[0][0].message).not.toContain('password');
    expect(reply.code).toHaveBeenCalledWith(500);
    expect(response({ statusCode: 413 }).code).toHaveBeenCalledWith(413);
  });
});
