import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

@Catch()
export class ApiErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorsFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest();
    const reply = host.switchToHttp().getResponse();
    const adapterStatus = (error as { statusCode?: number })?.statusCode;
    const status = error instanceof HttpException ? error.getStatus() :
      Number.isInteger(adapterStatus) && adapterStatus! >= 400 && adapterStatus! < 500 ? adapterStatus! : 500;
    const original = error instanceof HttpException ? error.getResponse() : null;
    const body = original && typeof original === 'object' ? original as Record<string, unknown> : {};
    const codes: Record<number, string> = { 400: 'INVALID_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN',
      404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED', 503: 'SERVICE_UNAVAILABLE' };
    const code = status >= 500 ? codes[status] || 'INTERNAL_ERROR' : typeof body.code === 'string' ? body.code : codes[status] || 'REQUEST_FAILED';
    const message = status >= 500 ? 'The request could not be completed' : body.message || original || 'Request failed';
    if (status >= 500) this.logger.error(`Request ${request.id} failed (${status})`);
    reply.code(status).header('X-Request-Id', request.id).send({ statusCode: status, code,
      message: Array.isArray(message) ? message.join('; ') : String(message), requestId: request.id });
  }
}
