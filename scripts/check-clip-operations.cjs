// Isolated SQL validation only. Uses a temporary database on local PostgreSQL; no Redis/provider calls.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const api = path.resolve(__dirname, '../apps/api');
const load = (name) => require(require.resolve(name, { paths: [api] }));
const dotenv = require('module').createRequire(require.resolve('@nestjs/config', { paths: [api] }))('dotenv');
const env = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
const { Pool } = load('pg');
load('ts-node').register({ project: path.join(api, 'tsconfig.json'), transpileOnly: true });
load('reflect-metadata');
const { IndexingService } = require(path.join(api, 'src/modules/queue/indexing.service'));
const { MediaService } = require(path.join(api, 'src/modules/media/media.service'));
const { parsePage } = require(path.join(api, 'src/common/pagination'));
const { apiContract } = require(path.join(api, 'src/common/api-contract'));

async function main() {
  const target = new URL(env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/brisky');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Validation requires local PostgreSQL');
  target.pathname = '/postgres';
  const admin = new Pool({ connectionString: target.toString(), connectionTimeoutMillis: 3000 });
  const name = 'brisky_clip_validation_' + crypto.randomBytes(6).toString('hex');
  let pool;
  let created = false;
  const scratch = fs.mkdtempSync(path.join(require('os').tmpdir(), 'brisky-contract-validation-'));
  try {
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    target.pathname = '/' + name;
    pool = new Pool({ connectionString: target.toString(), max: 12 });
    const schema = fs.readFileSync(path.join(api, 'src/modules/database/schema.sql'), 'utf8');
    await pool.query(schema); await pool.query(schema);
    const owner = crypto.randomUUID(), other = crypto.randomUUID();
    await pool.query(`INSERT INTO users(id,email,password_hash) VALUES($1,'owner@example.test','unused'),($2,'other@example.test','unused')`, [owner,other]);
    await pool.query(`INSERT INTO media_assets(id,user_id,original_filename,checksum,duration) VALUES('master',$1,'source.mp4','fixture',20)`, [owner]);
    const delivered = new Map();
    let sends = 0, loseAck = false, retries = 0;
    const factory = { cancel: async () => true, dispatch: async (envelope) => {
      sends++; delivered.set(envelope.job_id, { getState: async () => 'waiting' });
      if (loseAck) { loseAck = false; throw Error('simulated lost queue acknowledgement'); }
      return envelope.job_id;
    } };
    const db = { query: (sql,args) => pool.query(sql,args), getClient: () => pool.connect() };
    const queue = { getJob: async (id) => delivered.get(id) || null };
    const service = new IndexingService(queue, db, { get: (_key,fallback) => fallback }, undefined, factory);
    const request = { job_type: 'extract_clip', asset_id: 'master', user_id: owner, priority: 'interactive',
      source: { provider: 'upload' }, segment: { start_s: 0, end_s: 5 } };
    const responses = await Promise.all(Array.from({ length: 8 }, () => service.enqueueClip(request, 'concurrent-key')));
    assert.equal(new Set(responses.map((r) => r.job_id)).size, 1);
    assert.equal(sends, 1, 'concurrent requests should share one delivery lease and job identity');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM indexing_jobs')).rows[0].n, 1);
    const jobId = responses[0].job_id;
    await assert.rejects(service.getJob(jobId, other), (error) => error.getStatus() === 404);
    await assert.rejects(service.enqueueClip({ ...request, segment: { start_s: 1, end_s: 6 } }, 'concurrent-key'), (error) => error.getStatus() === 409);
    const operation = (await pool.query('SELECT * FROM clip_operations WHERE bull_job_id=$1', [jobId])).rows[0];
    const output = operation.output_asset_id;
    const writeOutput = async (client) => {
      await client.query(`INSERT INTO media_assets(id,user_id,original_filename,checksum,parent_asset_id) VALUES($1,$2,'clip.mp4','clip-fixture','master')`, [output,owner]);
      await client.query(`INSERT INTO asset_relationships(source_asset_id,target_asset_id,relationship_type) VALUES('master',$1,'derived_from')`, [output]);
    };
    await assert.rejects(service.publishClip(operation.id, owner, output, jobId, async (client) => {
      await writeOutput(client); throw Error('publication interrupted');
    }), /interrupted/);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM media_assets WHERE id=$1', [output])).rows[0].n, 0);
    assert.equal((await service.getJob(jobId, owner)).result_asset_id, null);
    await Promise.all([service.publishClip(operation.id, owner, output, jobId, writeOutput),
      service.publishClip(operation.id, owner, output, jobId, writeOutput)]);
    assert.equal((await service.getJob(jobId, owner)).result_asset_id, output);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM asset_relationships WHERE target_asset_id=$1', [output])).rows[0].n, 1);
    assert.equal((await service.enqueueClip(request, 'concurrent-key')).result_asset_id, output);

    loseAck = true;
    const pending = await service.enqueueClip(request, 'lost-ack');
    assert.equal(pending.status, 'dispatch_pending');
    const before = sends;
    await pool.query('UPDATE clip_operations SET dispatch_after=NOW() WHERE bull_job_id=$1', [pending.job_id]);
    await service.dispatchPendingClips();
    assert.equal(sends, before, 'recovery must retain an ambiguously delivered queue job');
    assert.equal((await service.getJob(pending.job_id, owner)).status, 'queued');

    delivered.set(pending.job_id, { getState: async () => 'failed', retry: async () => { retries++; } });
    await pool.query("UPDATE indexing_jobs SET status='failed' WHERE bull_job_id=$1", [pending.job_id]);
    const retried = await service.retryClip(pending.job_id, owner);
    assert.equal(retried.job_id, pending.job_id); assert.equal(retries, 1);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM indexing_jobs')).rows[0].n, 2);
    await assert.rejects(service.retryClip(pending.job_id, other), (error) => error.getStatus() === 404);
    await service.cancelJob(pending.job_id, owner);
    const cancelled = (await pool.query('SELECT * FROM clip_operations WHERE bull_job_id=$1', [pending.job_id])).rows[0];
    assert.equal(await service.publishClip(cancelled.id, owner, cancelled.output_asset_id, pending.job_id, async () => { throw Error('cancelled callback must not run'); }), false);
    assert.equal((await service.getJob(pending.job_id, owner)).status, 'cancelled');
    assert.equal((await pool.query("SELECT status FROM media_assets WHERE id='master'")).rows[0].status, 'queued', 'clip cancellation must not cancel source indexing');
    const media = new MediaService({ get: (key, fallback) => key === 'STORAGE_ROOT' ? scratch : fallback }, db, service, {}, {}, {});
    await pool.query(`INSERT INTO media_assets(id,user_id,original_filename,checksum,created_at) VALUES
      ('page-a',$1,'a.mp4','a','2030-01-01 00:00:00.123456+00'),
      ('page-b',$1,'b.mp4','b','2030-01-01 00:00:00.123457+00'),
      ('page-c',$1,'c.mp4','c','2030-01-01 00:00:00.123457+00'),
      ('other-asset',$2,'private.mp4','private','2030-01-01 00:00:00.123458+00')`, [owner,other]);
    const firstPage = await media.listAssetsPage(owner, parsePage('1', undefined, 'assets', owner));
    assert.equal(firstPage.assets[0].assetId, 'page-c');
    await pool.query("DELETE FROM media_assets WHERE id='page-c'");
    const secondPage = await media.listAssetsPage(owner, parsePage('1', firstPage.nextCursor, 'assets', owner));
    assert.equal(secondPage.assets[0].assetId, 'page-b', 'a deleted anchor must not break cursor navigation');
    const thirdPage = await media.listAssetsPage(owner, parsePage('1', secondPage.nextCursor, 'assets', owner));
    assert.equal(thirdPage.assets[0].assetId, 'page-a', 'microsecond differences must survive JSON cursors');
    assert.throws(() => parsePage('1', firstPage.nextCursor, 'assets', other));
    await pool.query(`INSERT INTO indexing_jobs(id,bull_job_id,asset_id,user_id,created_at) VALUES
      ('00000000-0000-4000-8000-000000000001','page-job-1','master',$1,'2030-01-01 00:00:00.123457+00'),
      ('00000000-0000-4000-8000-000000000002','page-job-2','master',$1,'2030-01-01 00:00:00.123457+00')`, [owner]);
    const jobsPage = await service.listJobsPage(owner, parsePage('1',undefined,'jobs',owner));
    assert.equal(jobsPage.jobs[0].bull_job_id, 'page-job-2');
    assert.equal(jobsPage.jobs[0].status, 'queued');
    const jobsNext = await service.listJobsPage(owner, parsePage('1',jobsPage.nextCursor,'jobs',owner));
    assert.equal(jobsNext.jobs[0].bull_job_id, 'page-job-1');
    await pool.query(`INSERT INTO verified_queries(query_hash,asset_id,segment_id) VALUES
      ('owner','master','owner-entry'),('other1','other-asset','other-entry-1'),('other2','other-asset','other-entry-2')`);
    await pool.query("UPDATE media_assets SET cost_usd=CASE WHEN id='master' THEN 1.2 ELSE 99 END WHERE id IN ('master','other-asset')");
    const economics = await media.getUnitEconomics(owner);
    assert.equal(economics.stage1Ingestion.totalCostUsd, 1.2);
    assert.equal(economics.stage1Ingestion.costPerSourceMinuteUsd, 3.6, 'rate denominator must use precise duration, not rounded display minutes');
    assert.equal(economics.stage2Verification.cachedEvaluations, 1);
    assert.equal((await media.getUnitEconomics(other)).stage2Verification.cachedEvaluations, 2);
    assert.equal(economics.stage2Verification.estimatedCostUsd, null);
    assert.equal(economics.stage2Verification.cacheHitRate, null);
    assert.equal(economics.searchFeedback.positiveRatio, null, 'no feedback is not 100 percent satisfaction');
    await pool.query("INSERT INTO search_feedback(user_id,query,asset_id,feedback) VALUES($1,'fixture','master','positive'),($2,'fixture','other-asset','negative')", [owner,other]);
    assert.equal((await media.getUnitEconomics(owner)).searchFeedback.positiveRatio, 1);
    assert.equal((await media.getUnitEconomics(other)).searchFeedback.positiveRatio, 0);
    await assert.rejects(media.getUnitEconomics(), (error) => error.getStatus() === 401);
    const compiler = require('module').createRequire(require.resolve('fastify', { paths: [api] })).resolve('@fastify/ajv-compiler');
    const Ajv = require('module').createRequire(compiler)('ajv/dist/2020').default;
    const ajv = new Ajv({ strict: false, validateFormats: false, allowUnionTypes: true });
    ajv.addSchema({ $id: 'brisky', components: apiContract.components });
    for (const [schema, payload] of [['AssetPage',firstPage],['JobPage',jobsPage],['Economics',economics]]) {
      const valid = ajv.compile({ $ref: `brisky#/components/schemas/${schema}` });
      assert.ok(valid(JSON.parse(JSON.stringify(payload))), JSON.stringify(valid.errors));
    }
    console.log('PASS: clip recovery/publication; asset/job cursors with ties, deleted anchors and microseconds; tenant-isolated economics; real responses match core schemas. No provider or Redis calls.');
  } finally {
    if (pool) await pool.end();
    if (created) {
      assert.match(name, /^brisky_clip_validation_[0-9a-f]{12}$/);
      await admin.query(`DROP DATABASE "${name}"`);
    }
    await admin.end();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.message || error.code || 'Local PostgreSQL unavailable'); process.exitCode = 1; });
