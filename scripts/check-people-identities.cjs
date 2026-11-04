// Explicit, rollback-only PostgreSQL validation. Does not start workers or call AI.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const api = path.resolve(__dirname, '../apps/api');
const { Client } = require(require.resolve('pg', { paths: [api] }));
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL securely before running this check');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  throw new Error('Validation requires local PostgreSQL');
}
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
async function rejected(sql, params, code) {
  await client.query('SAVEPOINT invalid_write');
  let actual;
  try { await client.query(sql, params); } catch (error) { actual = error.code; }
  await client.query('ROLLBACK TO SAVEPOINT invalid_write');
  await client.query('RELEASE SAVEPOINT invalid_write');
  assert.equal(actual, code);
}
async function run() {
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const schema = fs.readFileSync(path.join(api, 'src/modules/database/schema.sql'), 'utf8');
    const sql = schema.slice(schema.indexOf('-- Event-developed manual identity grounding.'),
      schema.indexOf('-- Media Registry: Asset Relationships Graph Table'));
    assert(sql.includes('CREATE TABLE IF NOT EXISTS people'));
    await client.query(sql);
    await client.query(sql); // Reapplication must be safe.
    const owners = [randomUUID(), randomUUID()];
    for (const id of owners) await client.query(`INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test-only')`, [id, `${id}@example.invalid`]);
    const asset = `people-check-${randomUUID()}`;
    await client.query(`INSERT INTO media_assets(id,user_id,original_filename,checksum,duration)
      VALUES($1,$2,'fixture.mp4','test-only',20)`, [asset, owners[0]]);
    const person = randomUUID();
    await client.query(`INSERT INTO people(id,user_id,name,is_me) VALUES($1,$2,'Me',true)`, [person, owners[0]]);
    await rejected(`INSERT INTO people(user_id,name,is_me) VALUES($1,'Also me',true)`, [owners[0]], '23505');
    const insert = `INSERT INTO person_appearances(user_id,person_id,asset_id,start_s,end_s,frame_s,box)
      VALUES($1,$2,$3,1,3,2,$4)`;
    await rejected(insert, [owners[1], person, asset, [0,0,1,1]], '23503');
    const otherPerson = randomUUID();
    await client.query(`INSERT INTO people(id,user_id,name) VALUES($1,$2,'Other owner')`, [otherPerson, owners[1]]);
    await rejected(insert, [owners[1], otherPerson, asset, [0,0,1,1]], '23503');
    for (const box of [[], [0,0,2,1], [0,0,0,1], [0,0,null,1], [0,0,NaN,1]]) {
      await rejected(insert, [owners[0], person, asset, box], '23514');
    }
    await client.query(insert, [owners[0], person, asset, [0.1,0.1,0.2,0.2]]);
    await client.query('DELETE FROM people WHERE id=$1', [person]);
    assert.equal((await client.query('SELECT id FROM person_appearances WHERE person_id=$1', [person])).rowCount, 0);
    await client.query('DELETE FROM people WHERE id=$1', [otherPerson]);
    await require('./people-http-validation.cjs')(client, owners, asset);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
  console.log('PASS: schema reapplication, owner foreign keys, self uniqueness, face-box checks and person deletion cascade. All fixture writes rolled back.');
}
run().catch(error => {
  console.error(`People database validation failed (${error.code || 'unknown error'}); connection details suppressed.`);
  if (error instanceof assert.AssertionError) console.error(error.message);
  process.exitCode = 1;
});
