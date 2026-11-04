// Run from frontend: node --env-file=.env.local scripts/migrate-auth.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS migration command. */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const url = process.env.SAAS_DATABASE_URL;
if (!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) {
  throw new Error('This migration command requires local SAAS_DATABASE_URL');
}
async function main() {
  const db = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("SET LOCAL statement_timeout='10s'");
    await db.query('SELECT pg_advisory_xact_lock(624917302)');
    await db.query(fs.readFileSync(path.join(__dirname,'../server/auth-schema.sql'),'utf8'));
    await db.query('COMMIT');
    console.log('SaaS authentication schema applied locally.');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { await db.end(); }
}
main().catch(() => { console.error('SaaS authentication migration failed; connection details suppressed.'); process.exitCode=1; });
