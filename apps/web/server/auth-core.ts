import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const CODE_SECONDS = 10 * 60;
export class AuthError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new AuthError(400, 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)) {
    throw new AuthError(400, 'Enter a valid email address.');
  }
  return email;
}
export function tokenHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function equalHash(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export type Mailer = (email: string, code: string) => Promise<void>;
export function createAuth(pool: Pool, secret: string, sendCode: Mailer) {
  if (secret.length < 32) throw new Error('SAAS_AUTH_SECRET must contain at least 32 characters');
  const digest = (id: string, code: string) => createHmac('sha256', secret).update(`${id}:${code}`).digest('hex');
  async function transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  async function rateLimit(key: string, limit: number) {
    const result = await pool.query(`INSERT INTO saas.auth_rate_limits(key,window_started_at,count)
      VALUES($1,date_trunc('minute',now()),1) ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN saas.auth_rate_limits.window_started_at < date_trunc('minute',now()) THEN 1 ELSE saas.auth_rate_limits.count+1 END,
      window_started_at=date_trunc('minute',now()) RETURNING count`, [key]);
    if (result.rows[0].count > limit) throw new AuthError(429, 'Too many requests. Please try again shortly.', 60);
  }
  return {
    async requestCode(input: unknown) {
      const email = normalizeEmail(input);
      await rateLimit('request-code', 30);
      const id = randomUUID(), browser = randomBytes(32).toString('base64url');
      const code = randomInt(0, 1000000).toString().padStart(6, '0');
      await transaction(async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 41831))', [email]);
        const previous = await db.query(`SELECT *, EXTRACT(EPOCH FROM now()-last_sent_at) AS elapsed,
          window_started_at > now()-interval '1 hour' AS in_window FROM saas.email_challenges WHERE email=$1 FOR UPDATE`, [email]);
        const row = previous.rows[0];
        if (row && Number(row.elapsed) < 60) throw new AuthError(429, 'Please wait before requesting another code.', Math.ceil(60-Number(row.elapsed)));
        if (row?.in_window && row.send_count >= 5) throw new AuthError(429, 'Too many codes requested. Please try again later.', 3600);
        await db.query(`INSERT INTO saas.email_challenges(email,id,browser_hash,code_hash,state,expires_at)
          VALUES($1,$2,$3,$4,'pending',now()+interval '10 minutes') ON CONFLICT(email) DO UPDATE SET
          id=excluded.id,browser_hash=excluded.browser_hash,code_hash=excluded.code_hash,state='pending',attempts=0,
          expires_at=excluded.expires_at,last_sent_at=now(),
          send_count=CASE WHEN saas.email_challenges.window_started_at > now()-interval '1 hour' THEN saas.email_challenges.send_count+1 ELSE 1 END,
          window_started_at=CASE WHEN saas.email_challenges.window_started_at > now()-interval '1 hour' THEN saas.email_challenges.window_started_at ELSE now() END`,
          [email,id,tokenHash(browser),digest(id,code)]);
      });
      try {
        await sendCode(email, code);
        const ready = await pool.query("UPDATE saas.email_challenges SET state='ready' WHERE id=$1 AND state='pending' RETURNING id", [id]);
        if (!ready.rowCount) throw new Error('Challenge superseded');
      } catch {
        await pool.query("UPDATE saas.email_challenges SET state='failed' WHERE id=$1 AND state='pending'", [id]);
        throw new AuthError(503, 'We could not send your code. Please try again in a minute.', 60);
      }
      return { browser, retryAfter: 60 };
    },
    async verifyCode(input: unknown, code: unknown, browser: string, oldSession?: string) {
      const email = normalizeEmail(input);
      if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !/^[A-Za-z0-9_-]{43}$/.test(browser)) {
        throw new AuthError(400, 'Invalid or expired code. Request a new code if needed.');
      }
      await rateLimit('verify-code', 300);
      // Invalid attempts must commit rather than being rolled back with an exception.
      const result = await transaction(async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 41831))', [email]);
        const found = await db.query(`SELECT *, expires_at > now() AS valid FROM saas.email_challenges WHERE email=$1 FOR UPDATE`, [email]);
        const row = found.rows[0];
        if (!row || row.state !== 'ready' || !row.valid || row.attempts >= 5 || !equalHash(row.browser_hash, tokenHash(browser))) return null;
        if (!equalHash(row.code_hash, digest(row.id, code))) {
          await db.query('UPDATE saas.email_challenges SET attempts=attempts+1 WHERE email=$1', [email]);
          return null;
        }
        const existing = await db.query('SELECT id,email,name FROM public.users WHERE lower(email)=$1 LIMIT 2', [email]);
        if (existing.rowCount! > 1) throw new AuthError(409, 'Please contact support to resolve this account.');
        const user = existing.rows[0] ?? (await db.query(`INSERT INTO public.users(email,password_hash,name)
          VALUES($1,'!email-code-only','') ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING id,email,name`, [email])).rows[0];
        const completed=await db.query('SELECT 1 FROM saas.user_profiles WHERE user_id=$1',[user.id]);
        const isNew=!completed.rowCount;
        const token = randomBytes(32).toString('base64url');
        await db.query("UPDATE saas.email_challenges SET state='consumed' WHERE email=$1", [email]);
        if (oldSession) await db.query('DELETE FROM saas.sessions WHERE token_hash=$1', [tokenHash(oldSession)]);
        await db.query(`INSERT INTO saas.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')`, [tokenHash(token), user.id]);
        return { token, user, isNew };
      });
      if (!result) throw new AuthError(400, 'Invalid or expired code. Request a new code if needed.');
      return result;
    },
    async session(token?: string) {
      if (!token) return null;
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      try {
        return (await pool.query(`SELECT u.id,u.email,u.name FROM saas.sessions s JOIN public.users u ON u.id=s.user_id
          WHERE s.token_hash=$1 AND s.expires_at > now()`, [tokenHash(token)])).rows[0] ?? null;
      } catch {
        console.warn('SaaS session lookup failed');
        return null;
      }
    },
    async logout(token?: string) {
      if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) await pool.query('DELETE FROM saas.sessions WHERE token_hash=$1', [tokenHash(token)]);
    },
  };
}
