import { createHmac } from 'crypto';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

describe('authentication admission', () => {
  const secret = 'test-only-private-signing-secret-with-48-characters';
  const make = (settings: Record<string, string> = {}) => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new AuthService(db as any, { get: (key: string, fallback?: unknown) => ({ JWT_SECRET: secret, ...settings })[key] ?? fallback } as any);
    return { service, db };
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'owner', email: 'owner@example.com', iat: now, exp: now + 300 };
  const sign = (value: any, head: any = { alg: 'HS256', typ: 'JWT' }) => {
    const unsigned = `${Buffer.from(JSON.stringify(head)).toString('base64url')}.${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
    return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  };
  it('requires a private secret and rejects the previous public fallback', () => {
    expect(() => make({ JWT_SECRET: '' })).toThrow('JWT_SECRET');
    expect(() => make({ JWT_SECRET: 'brisky-development-secret-key-32-chars-long' })).toThrow('JWT_SECRET');
  });
  it('accepts issued sessions and rejects tampering', () => {
    const { service } = make();
    expect(service.verifyToken(service.createToken({ id: 'owner', email: 'owner@example.com' })).sub).toBe('owner');
    expect(() => service.verifyToken(sign(payload).replace(/.$/, '!'))).toThrow();
    expect(() => service.verifyToken(sign(payload, { alg: 'none', typ: 'JWT' }))).toThrow();
  });
  it.each([
    { ...payload, sub: undefined }, { ...payload, sub: '' }, { ...payload, sub: [] },
    { ...payload, exp: undefined }, { ...payload, exp: String(now + 300) },
    { ...payload, exp: now }, { ...payload, iat: now + 300 }, { ...payload, email: undefined }, null,
  ])('rejects signed malformed claims before guard admission: %j', (claims) => {
    const { service } = make();
    const request: any = { headers: { authorization: `Bearer ${sign(claims)}` } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;
    expect(() => new AuthGuard(service).canActivate(context)).toThrow();
    expect(request.user).toBeUndefined();
  });
  it('does not touch the database for default demo setup or malformed credentials', async () => {
    const { service, db } = make();
    await service.onModuleInit();
    await expect(service.register(123 as any, 'long-enough-password')).rejects.toThrow();
    await expect(service.login('owner@example.com', {} as any)).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
  it('refuses demo seeding outside explicit development mode', async () => {
    const { service, db } = make({ ENABLE_DEMO_ACCOUNT: 'true', NODE_ENV: 'production' });
    await expect(service.onModuleInit()).rejects.toThrow('development');
    expect(db.query).not.toHaveBeenCalled();
  });
});
