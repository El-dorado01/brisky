// Local-only schema validation; fixtures always roll back. --apply persists DDL only.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require(require.resolve('pg', { paths: [path.resolve(__dirname, '../apps/api')] }));
const url = process.env.DATABASE_URL;
if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('DATABASE_URL must identify local PostgreSQL');
}
const sql = fs.readFileSync(path.resolve(__dirname, '../apps/api/src/modules/database/saas-schema.sql'), 'utf8');
const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
async function reject(statement, params, code) {
  await client.query('SAVEPOINT invalid_write');
  let actual;
  try { await client.query(statement, params); } catch (error) { actual = error.code; }
  await client.query('ROLLBACK TO SAVEPOINT invalid_write');
  await client.query('RELEASE SAVEPOINT invalid_write');
  assert.equal(actual, code);
}
async function begin() {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '3s'");
  await client.query("SET LOCAL statement_timeout = '10s'");
  await client.query('SELECT pg_advisory_xact_lock(624917302)');
}
async function run() {
  await client.connect();
  try {
    await begin();
    try {
      await client.query(sql);
      await client.query(sql);
      const owner = randomUUID(), other = randomUUID(), space = randomUUID(), secondSpace = randomUUID();
      const asset = `saas-check-${randomUUID()}`, message = randomUUID(), moment = randomUUID();
      for (const id of [owner, other]) {
        await client.query("INSERT INTO public.users(id,email,password_hash) VALUES($1,$2,'fixture-only')", [id, `${id}@example.invalid`]);
      }
      await client.query("INSERT INTO public.media_assets(id,user_id,original_filename,checksum,duration) VALUES($1,$2,'fixture.mp4','fixture-only',30)", [asset, owner]);
      for (const id of [space, secondSpace]) {
        await client.query("INSERT INTO saas.spaces(id,user_id,title,initial_query) VALUES($1,$2,'Fixture','Find a moment')", [id, owner]);
      }
      await reject("INSERT INTO saas.spaces(user_id,title,initial_query) VALUES($1,' ','query')", [owner], '23514');
      const addMessage = "INSERT INTO saas.messages(id,user_id,space_id,sequence_no,role,content) VALUES($1,$2,$3,1,'user','Find this')";
      await reject(addMessage, [randomUUID(), other, space], '23503');
      await client.query(addMessage, [message, owner, space]);
      await reject(addMessage, [randomUUID(), owner, space], '23505');
      const addMoment = 'INSERT INTO saas.moments(id,user_id,space_id,asset_id,start_s,end_s) VALUES($1,$2,$3,$4,$5,$6)';
      for (const range of [[-1,2],[2,1],[0,Infinity],[NaN,3],[0,NaN]]) {
        await reject(addMoment, [randomUUID(), owner, space, asset, ...range], '23514');
      }
      const foreignSpace = randomUUID();
      await client.query("INSERT INTO saas.spaces(id,user_id,title,initial_query) VALUES($1,$2,'Other','Query')", [foreignSpace, other]);
      await reject(addMoment, [randomUUID(), other, foreignSpace, asset, 1,2], '23503');
      await client.query(addMoment, [moment, owner, space, asset, 1,2]);
      await reject('INSERT INTO saas.message_moments VALUES($1,$2,$3,$4,0)', [owner, secondSpace, message, moment], '23503');
      await client.query('INSERT INTO saas.message_moments VALUES($1,$2,$3,$4,0)', [owner, space, message, moment]);
      await reject('INSERT INTO saas.shortlist_items(user_id,space_id,moment_id,position) VALUES($1,$2,$3,1)', [other, space, moment], '23503');
      await client.query('INSERT INTO saas.shortlist_items(user_id,space_id,moment_id,position) VALUES($1,$2,$3,0)', [owner, space, moment]);
      await client.query('DELETE FROM saas.spaces WHERE id=$1', [space]);
      for (const table of ['messages','moments','message_moments','shortlist_items']) {
        assert.equal((await client.query(`SELECT 1 FROM saas.${table} WHERE space_id=$1`, [space])).rowCount, 0);
      }
      assert.equal((await client.query('SELECT 1 FROM public.media_assets WHERE id=$1', [asset])).rowCount, 1);
      console.log('PASS: repeatable DDL, tenant/space foreign keys, message ordering, finite ranges, citation ownership and deletion cascades.');
    } finally { await client.query('ROLLBACK'); }
    if (process.argv.includes('--apply')) {
      await begin();
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log('Applied SaaS schema to local PostgreSQL; no fixture data retained.');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { await client.end(); }
}
run().catch(error => {
  console.error(`SaaS schema check failed (${error.code || error.name}); credentials suppressed.`);
  if (error instanceof assert.AssertionError) console.error(error.message);
  process.exitCode = 1;
});
