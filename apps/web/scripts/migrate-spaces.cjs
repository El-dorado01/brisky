/* eslint-disable @typescript-eslint/no-require-imports -- Standalone local migration. */
const fs=require('node:fs'),path=require('node:path'),{Client}=require('pg');
async function main(){
  const url=process.env.SAAS_DATABASE_URL;
  if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Local PostgreSQL required');
  const db=new Client({connectionString:url,connectionTimeoutMillis:5000});await db.connect();
  try{
    await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
    await db.query('SELECT pg_advisory_xact_lock(624917302)');
    await db.query(fs.readFileSync(path.resolve(__dirname,'../../api/src/modules/database/saas-schema.sql'),'utf8'));
    await db.query('COMMIT');console.log('SaaS spaces schema applied locally.');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
}
main().catch(()=>{console.error('Spaces migration failed; verify local PostgreSQL and the existing engine users/media schema. Connection details suppressed.');process.exitCode=1;});
