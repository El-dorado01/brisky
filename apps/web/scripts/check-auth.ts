// Local PostgreSQL integration checks. Uses an isolated temporary schema and fake mail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createAuth, AuthError, tokenHash } from '../server/auth-core';
import { createOnboarding } from '../server/onboarding-core';
import { readAuthResponse } from '../lib/auth-response';

async function main() {
  assert.equal((await readAuthResponse(Response.json({error:'Invalid code'},{status:400}))).error,'Invalid code');
  for(const response of [new Response('<!DOCTYPE html><h1>Not found</h1>',{status:404,headers:{'Content-Type':'text/html'}}),
    new Response('not-json',{headers:{'Content-Type':'application/json'}})]) {
    await assert.rejects(()=>readAuthResponse(response),/Sign-in is temporarily unavailable/);
  }
  const url = process.env.SAAS_DATABASE_URL;
  if (!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new Error('Local database required');
  const pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000 });
  const schema = `auth_check_${randomUUID().replaceAll('-','')}`;
  const rewrite = (sql: string) => sql.replaceAll('public.users', `${schema}.users`).replaceAll('saas.', `${schema}.`)
    .replaceAll('SCHEMA IF NOT EXISTS saas', `SCHEMA IF NOT EXISTS ${schema}`).replaceAll('SCHEMA saas FROM', `SCHEMA ${schema} FROM`);
  const db = {
    query: (sql: string, params?: unknown[]) => pool.query(rewrite(sql), params),
    async connect() {
      const client = await pool.connect();
      return { query: (sql: string, params?: unknown[]) => client.query(rewrite(sql), params), release: () => client.release() };
    },
  } as unknown as Pool;
  let code = '', failMail = false, sends = 0;
  const service = createAuth(db, 'test-secret-only-'.repeat(4), async (_email, value) => {
    if (failMail) throw new Error('synthetic SMTP failure');
    code = value; sends++;
  });
  const email = 'fixture@example.invalid';
  const invalid = (fn: () => Promise<unknown>, status: number) => assert.rejects(fn, (e: unknown) => e instanceof AuthError && e.status === status);
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE ${schema}.users (LIKE public.users INCLUDING ALL)`);
    const sql = rewrite(fs.readFileSync('server/auth-schema.sql','utf8'));
    await pool.query(sql); await pool.query(sql);
    await invalid(() => service.requestCode('invalid\r\nemail'),400);
    const challenge = await service.requestCode(' Fixture@Example.Invalid ');
    assert.match(code,/^\d{6}$/); const firstCode = code;
    const stored = (await db.query('SELECT * FROM saas.email_challenges WHERE email=$1',[email])).rows[0];
    assert.notEqual(stored.code_hash,code); assert.notEqual(stored.browser_hash,challenge.browser);
    await invalid(() => service.requestCode(email),429);
    await invalid(() => service.verifyCode(email,code,'a'.repeat(43)),400);
    assert.equal((await db.query('SELECT attempts FROM saas.email_challenges WHERE email=$1',[email])).rows[0].attempts,0);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i=0;i<5;i++) await invalid(() => service.verifyCode(email,wrong,challenge.browser),400);
    await invalid(() => service.verifyCode(email,code,challenge.browser),400);
    assert.equal((await db.query('SELECT attempts FROM saas.email_challenges WHERE email=$1',[email])).rows[0].attempts,5);
    await db.query("UPDATE saas.email_challenges SET last_sent_at=now()-interval '61 seconds' WHERE email=$1",[email]);
    const fresh = await service.requestCode(email);
    await invalid(() => service.verifyCode(email,firstCode,challenge.browser),400);
    const results = await Promise.allSettled([service.verifyCode(email,code,fresh.browser),service.verifyCode(email,code,fresh.browser)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const success = results.find(r=>r.status==='fulfilled');
    assert(success?.status==='fulfilled'); const {token,user}=success.value;
    assert.equal(success.value.isNew,true);
    const onboarding=createOnboarding(db);
    assert.equal((await onboarding.read(user.id)).completed,false);
    const setup={displayName:'Test Creator',creatorType:'creator',aliases:['Me','me','I'],
      workspaceName:'Test Studio',workspaceIcon:'film',connectorPreference:'local'};
    const saved=await onboarding.save(user.id,setup);
    assert(saved.completed);assert.equal(saved.user.name,'Test Creator');assert.deepEqual(saved.profile?.aliases,['me','i']);
    const workspaceId=saved.workspace?.id;
    await Promise.all([onboarding.save(user.id,setup),onboarding.save(user.id,setup)]);
    for(const creatorType of ['personal','learning','work','creative','exploring']) {
      const broad=await onboarding.save(user.id,{...setup,creatorType});
      assert.equal(broad.profile?.creatorType,creatorType);
      assert.equal(broad.workspace?.id,workspaceId);
    }
    assert.equal((await onboarding.read(user.id)).workspace?.id,workspaceId);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM saas.workspaces WHERE user_id=$1',[user.id])).rows[0].count,1);
    for(const bad of [{...setup,email:'another@example.invalid'},{...setup,workspaceName:' '},
      {...setup,creatorType:'admin'},{...setup,aliases:['x'.repeat(65)]},{...setup,connectorPreference:'connected'}]) {
      await invalid(()=>onboarding.save(user.id,bad),400);
    }
    assert.equal((await onboarding.read(user.id)).workspace?.id,workspaceId);
    const otherUser=randomUUID();
    await db.query("INSERT INTO public.users(id,email,password_hash) VALUES($1,$2,'!fixture')",[otherUser,'other@example.invalid']);
    const otherSetup=await onboarding.save(otherUser,{...setup,displayName:'Another Creator',workspaceName:'Other Studio'});
    assert.notEqual(otherSetup.workspace?.id,workspaceId);
    await assert.rejects(()=>db.query('UPDATE saas.user_profiles SET first_workspace_id=$1 WHERE user_id=$2',[workspaceId,otherUser]),
      (error:unknown)=>(error as {code:string}).code==='23503');
    assert.equal((await onboarding.read(user.id)).user.name,'Test Creator');
    await db.query('DELETE FROM public.users WHERE id=$1',[otherUser]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM saas.workspaces')).rows[0].count,1);
    assert.equal((await service.session(token))?.id,user.id);
    assert.equal(await service.session('invalid'),null);
    assert.equal(await service.session('dev-session-'+Buffer.from(email).toString('base64url')),null);
    assert.equal((await db.query('SELECT token_hash FROM saas.sessions')).rows[0].token_hash,tokenHash(token));
    await service.logout(token); assert.equal(await service.session(token),null);
    await db.query("UPDATE saas.email_challenges SET last_sent_at=now()-interval '61 seconds' WHERE email=$1",[email]);
    const expired = await service.requestCode(email);
    await db.query("UPDATE saas.email_challenges SET expires_at=now()-interval '1 second' WHERE email=$1",[email]);
    await invalid(() => service.verifyCode(email,code,expired.browser),400);
    await db.query("UPDATE saas.email_challenges SET last_sent_at=now()-interval '61 seconds' WHERE email=$1",[email]);
    failMail=true; await invalid(() => service.requestCode(email),503);
    assert.equal((await db.query('SELECT state FROM saas.email_challenges WHERE email=$1',[email])).rows[0].state,'failed');
    assert.equal(sends,3);
    failMail=false;
    await db.query("UPDATE saas.email_challenges SET last_sent_at=now()-interval '61 seconds' WHERE email=$1",[email]);
    const finalChallenge=await service.requestCode(email);
    const oldToken=challenge.browser;
    await db.query("INSERT INTO saas.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[tokenHash(oldToken),user.id]);
    const rotated=await service.verifyCode(email,code,finalChallenge.browser,oldToken);
    assert.equal(rotated.isNew,false);
    assert.equal(await service.session(oldToken),null);
    assert.equal(rotated.user.id,user.id);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.users')).rows[0].count,1);
    await db.query("UPDATE saas.sessions SET created_at=now()-interval '2 seconds',expires_at=now()-interval '1 second'");
    assert.equal(await service.session(rotated.token),null);
    await db.query("UPDATE saas.email_challenges SET last_sent_at=now()-interval '61 seconds' WHERE email=$1",[email]);
    await invalid(()=>service.requestCode(email),429);
    console.log('PASS: repeatable migration, normalization, hashed codes/tokens, cooldown, browser binding, committed attempt limits, resend invalidation, concurrent single use, session lookup/logout, expiry and SMTP failure.');
    console.log('PASS: persisted onboarding, normalized aliases, account name, idempotent concurrent workspace creation, validation, tenant foreign keys, user cascade and database-backed login routing.');
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
}
main().catch(error => { console.error(`Auth integration check failed (${error.code || error.name}); credentials suppressed.`);
  if (error instanceof assert.AssertionError) console.error(error.message);
  process.exitCode=1; });
