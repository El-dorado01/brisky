// Run from the repository root with the disposable validation containers only.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('node:assert/strict');
const api = path.resolve(__dirname, '../apps/api');
const load = (name) => require(require.resolve(name, { paths: [api] }));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-integration-'));
Object.assign(process.env, {
  JWT_SECRET: require('crypto').randomBytes(48).toString('hex'), ENABLE_DEMO_ACCOUNT: 'false',
  DATABASE_URL: 'postgresql://postgres:validation-only@127.0.0.1:5547/brisky_validation',
  REDIS_HOST: '127.0.0.1', REDIS_PORT: '6387', STORAGE_ROOT: scratch,
  AI_PROVIDER: 'google', AI_API_KEY: '', AI_API_KEYS: '', GEMINI_API_KEY: '', GEMINI_API_KEYS: '',
  AI_BUDGET_USD: '0', ENABLE_CONNECTOR_POLLING: 'false', IS_WORKER: 'false', RUN_WORKER_IN_API: 'false',
});
load('ts-node').register({ project: path.join(api, 'tsconfig.json'), transpileOnly: true });
load('reflect-metadata');
const { NestFactory } = load('@nestjs/core');
const { FastifyAdapter } = load('@nestjs/platform-fastify');
const { AppModule } = require(path.join(api, 'src/app.module'));
const { DatabaseService } = require(path.join(api, 'src/modules/database/database.service'));
const { AiIntelligenceService } = require(path.join(api, 'src/modules/pipeline/ai-intelligence.service'));
const { MediaService } = require(path.join(api, 'src/modules/media/media.service'));
const { ProcessingUnitsService } = require(path.join(api, 'src/modules/pipeline/processing-units.service'));
const { getQueueToken } = load('@nestjs/bullmq');
const { ConfigService } = load('@nestjs/config');

async function main() {
  // Exercise simultaneous API/worker migrations against real PostgreSQL.
  const connections = [new DatabaseService(new ConfigService()), new DatabaseService(new ConfigService())];
  try { await Promise.all(connections.map((connection) => connection.onModuleInit())); }
  finally { await Promise.all(connections.map((connection) => connection.onModuleDestroy())); }
  const app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: ['error', 'warn'], abortOnError: false });
  try {
    app.setGlobalPrefix('api/v1');
    await app.init();
    const server = app.getHttpAdapter().getInstance();
    await server.ready();
    const db = app.get(DatabaseService);
    assert.equal(app.get(AiIntelligenceService).isConfigured(), false, 'live AI must be disabled');
    const request = async (url, payload, token) => {
      const response = await server.inject({ method: 'POST', url: '/api/v1/' + url, payload,
        headers: token ? { authorization: 'Bearer ' + token } : {} });
      assert.ok(response.statusCode < 400, `${url}: ${response.statusCode} ${response.body}`);
      return response.json();
    };
    const suffix = Date.now();
    const owner = await request('auth/register', { email: `owner-${suffix}@example.test`, password: 'validation-only-password' });
    const other = await request('auth/register', { email: `other-${suffix}@example.test`, password: 'validation-only-password' });
    const asset = `validation-${suffix}`;
    await db.query(`INSERT INTO media_assets(id,user_id,original_filename,checksum,status,stage,duration)
      VALUES($1,$2,'validation.mp4','validation','indexed','complete',10)`, [asset, owner.user.id]);
    await db.query(`INSERT INTO media_segments(id,asset_id,user_id,start_time,end_time,title,description,visual_objects)
      VALUES($1,$2,$3,0,10,'Red bottle','A person holding a red bottle',ARRAY['bottle'])`, [asset + '-scene', asset, owner.user.id]);
    const units = app.get(ProcessingUnitsService);
    await units.saveSourcePreparation(asset, { fingerprint: 'integration-v1', sourceVersion: 'v1', scenes: [] });
    assert.deepEqual((await units.getUnit(asset, 'source_preparation')).metadata,
      { fingerprint: 'integration-v1', sourceVersion: 'v1', scenes: [] });
    await units.saveSourcePreparation(asset, { fingerprint: 'integration-v1', sourceVersion: 'v1', scenes: [{ sceneId: 1 }] });
    assert.equal((await units.getUnit(asset, 'source_preparation')).metadata.scenes.length, 1);
    assert.equal(await units.pendingSiblingUnits(asset, 'finalize'), 0, 'completed preparation must not block finalization');
    await db.query("UPDATE media_assets SET status='processing' WHERE id=$1", [asset]);
    await db.query(`INSERT INTO media_observations(asset_id,user_id,observation_type,timestamp_start,timestamp_end,raw_data)
      VALUES($1,$2,'transcript',0,1,'{"text":"legacy words"}'::jsonb)`, [asset, owner.user.id]);
    await units.beginTranscriptWindows(asset, owner.user.id, 'audio-v1');
    assert.equal(Number((await db.query("SELECT count(*) AS count FROM media_observations WHERE asset_id=$1 AND raw_data->>'text'='legacy words'", [asset])).rows[0].count), 1,
      'starting windows must retain the old transcript until a replacement is published');
    const window = { index: 0, start: 0, end: 10, readStart: 0, readEnd: 10 };
    const cues = [{ start_time: 2, end_time: 4, text: 'fresh spoken phrase' }];
    await units.publishTranscriptWindow(asset, owner.user.id, 'audio-v1', window, cues);
    await units.publishTranscriptWindow(asset, owner.user.id, 'audio-v1', window, cues);
    assert.equal(Number((await db.query("SELECT count(*) AS count FROM media_observations WHERE asset_id=$1 AND observation_type='transcript'", [asset])).rows[0].count), 1,
      'republication must replace the same window, not duplicate it');
    assert.equal((await db.query('SELECT status FROM media_assets WHERE id=$1', [asset])).rows[0].status, 'partially_indexed');
    const early = await request('media/search', { query: 'fresh spoken phrase', phase: 'retrieve' }, owner.token);
    assert.ok(early.results.some((hit) => hit.assetId === asset), 'published window must be searchable before completion');
    await assert.rejects(units.publishTranscriptWindow(asset, other.user.id, 'audio-v1', window, cues), /does not belong/);
    await assert.rejects(units.publishTranscriptWindow(asset, owner.user.id, 'audio-v1', window,
      [{ start_time: 'invalid-number', end_time: 4, text: 'must roll back' }]), /invalid input syntax/);
    assert.equal((await db.query("SELECT raw_data->>'text' AS text FROM media_observations WHERE asset_id=$1 AND observation_type='transcript'", [asset])).rows[0].text,
      'fresh spoken phrase', 'failed publication must roll back observation deletion');
    assert.equal((await units.getCompletedTranscriptWindows(asset)).size, 1);
    await assert.rejects(units.beginTranscriptWindows(asset, owner.user.id, 'audio-v2'), /reindex is required/);
    await units.finishTranscriptWindows(asset, 'audio-v1');
    assert.equal(await units.pendingSiblingUnits(asset, 'finalize'), 0);
    const search = (account, phase) => request('media/search', { query: 'holding red bottle', phase }, account.token);
    const provisional = await search(owner, 'retrieve');
    assert.ok(provisional.results.some((hit) => hit.assetId === asset), 'SQL retrieval must find the fixture');
    assert.equal(provisional.searchStatus, 'refining');
    assert.ok(provisional.results.every((hit) => !hit.stage2Verified));
    const hidden = await search(other, 'retrieve');
    assert.ok(!hidden.results.some((hit) => hit.assetId === asset), 'other account must not see owner asset');
    const verified = await search(owner, 'verify');
    assert.ok(verified.results.some((hit) => hit.assetId === asset), 'unavailable inference must retain candidates');
    assert.ok(verified.results.every((hit) => !hit.stage2Verified));
    const media = app.get(MediaService);
    // Use deterministic evidence/inference at the boundary, with the real SQL cache.
    const frame = path.join(scratch, 'validation.jpg');
    fs.writeFileSync(frame, 'synthetic frame for cache identity');
    await db.query('UPDATE media_segments SET keyframe_paths=$1::jsonb WHERE id=$2',
      [JSON.stringify([{ timestamp: 5, path: 'validation.jpg' }]), asset + '-scene']);
    const ai = app.get(AiIntelligenceService);
    const originalVerifier = ai.verifyCandidate;
    let checks = 0;
    ai.verifyCandidate = async () => { checks++; return { status: 'evaluated', matched: true,
      confidence: 0.9, explanation: 'Deterministic integration fixture', matchedTimestamp: 5 }; };
    const { parseSearchQuery } = require(path.join(api, 'src/modules/media/query-parse'));
    const candidate = { ...provisional.results[0], segmentId: asset + '-scene', startTime: 0, endTime: 10 };
    const fresh = await media.verifySceneResults([candidate], parseSearchQuery('bottle'), false, owner.user.id);
    const cached = await media.verifySceneResults([candidate], parseSearchQuery('bottle'), false, owner.user.id);
    assert.equal(checks, 1, 'second verification must reuse persisted cache');
    assert.equal(fresh[0].stage2Verified, true);
    assert.deepEqual(cached, fresh, 'persisted verification must preserve the time window');
    fs.writeFileSync(frame, 'changed evidence');
    await media.verifySceneResults([candidate], parseSearchQuery('bottle'), false, owner.user.id);
    assert.equal(checks, 2, 'changed evidence must invalidate persisted cache');
    ai.verifyCandidate = originalVerifier;
    const original = media.searchWithinDeadline;
    const hit = provisional.results[0];
    const { publishSearchResults } = require(path.join(api, 'src/common/search-progress'));
    const { searchDelay } = require(path.join(api, 'src/common/search-deadline'));
    process.env.SEARCH_DEADLINE_MS = '50';
    media.searchWithinDeadline = async () => { publishSearchResults([hit]); await searchDelay(1000); return { results: [] }; };
    const timed = await search(owner, 'verify');
    assert.equal(timed.searchStatus, 'incomplete');
    assert.equal(timed.canContinue, true);
    assert.equal(timed.results[0].assetId, hit.assetId);
    media.searchWithinDeadline = original;
    delete process.env.SEARCH_DEADLINE_MS;
    const resumed = await search(owner, 'verify');
    assert.ok(resumed.results.some((result) => result.assetId === asset));
    const { withSearchDeadline } = require(path.join(api, 'src/common/search-deadline'));
    const sleepSql = 'SELECT pg_sleep(10) /* brisky_validation_cancel */';
    const start = Date.now();
    await assert.rejects(withSearchDeadline(100, () => db.query(sleepSql)), /Search deadline/);
    const waitUntil = async (check) => {
      const expires = Date.now() + 4000;
      while (!(await check())) {
        assert.ok(Date.now() < expires, 'cancellation did not settle within four seconds');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    const running = async (sql) => Number((await db.query(
      "SELECT count(*) AS count FROM pg_stat_activity WHERE query=$1 AND state='active'", [sql])).rows[0].count);
    await waitUntil(async () => (await running(sleepSql)) === 0);
    assert.ok(Date.now() - start < 5000, 'PostgreSQL sleep must stop before completing naturally');
    assert.equal((await db.query('SELECT 1 AS value')).rows[0].value, 1, 'subsequent queries must remain healthy');

    // Test an actual socket disconnect after the HTTP request body has arrived.
    let stopped = false;
    const disconnectSql = 'SELECT pg_sleep(10) /* brisky_validation_disconnect */';
    media.searchWithinDeadline = async () => {
      try { await db.query(disconnectSql); return { results: [] }; }
      finally { stopped = true; }
    };
    await app.listen(0, '127.0.0.1');
    const port = server.server.address().port;
    const http = require('node:http');
    const socketRequest = http.request({ host: '127.0.0.1', port, path: '/api/v1/media/search', method: 'POST',
      headers: { authorization: 'Bearer ' + owner.token, 'content-type': 'application/json' } });
    socketRequest.on('error', () => {}); // Intentional client disconnect.
    socketRequest.end(JSON.stringify({ query: 'bottle', phase: 'verify' }));
    await waitUntil(async () => (await running(disconnectSql)) === 1);
    socketRequest.destroy();
    await waitUntil(async () => stopped && (await running(disconnectSql)) === 0);
    media.searchWithinDeadline = original;
    const queue = app.get(getQueueToken('indexing-queue'));
    assert.equal((await queue.getWorkers()).length, 0, 'indexing workers must stay off');
    assert.equal(Number((await db.query('SELECT COUNT(*) AS count FROM indexing_jobs')).rows[0].count), 0);
    console.log('PASS: concurrent migrations, auth, SQL retrieval, account isolation, persisted verification cache/invalidation, provisional/retained results, retry, SQL deadline cancellation, real HTTP disconnect cancellation, Redis, workers off; no AI calls.');
  } finally {
    await app.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
