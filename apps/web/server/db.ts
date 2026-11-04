import 'server-only';
import { Pool } from 'pg';

const globalDb = globalThis as typeof globalThis & { saasPool?: Pool };
export function database() {
  const url = process.env.SAAS_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('SAAS_DATABASE_URL or DATABASE_URL is required');
  if (!globalDb.saasPool) {
    globalDb.saasPool = new Pool({ connectionString: url,
      max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
      statement_timeout: 10000, application_name: 'brisky-saas' });
    globalDb.saasPool.on('error', () => console.error('SaaS database connection failed'));
  }
  return globalDb.saasPool;
}
