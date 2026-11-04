// Invoked inside the rollback-only people check; no API/queue application bootstrap.
const path = require('path');
const assert = require('node:assert/strict');
const { randomBytes } = require('crypto');
module.exports = async function checkPeopleHttp(client, owners, asset) {
  const api = path.resolve(__dirname, '../apps/api');
  const load = name => require(require.resolve(name, { paths: [api] }));
  load('reflect-metadata');
  load('ts-node').register({ project: path.join(api, 'tsconfig.json'), transpileOnly: true });
  const { Module } = load('@nestjs/common');
  const { APP_FILTER, NestFactory } = load('@nestjs/core');
  const { FastifyAdapter } = load('@nestjs/platform-fastify');
  const { PeopleService } = require(path.join(api, 'src/modules/people/people.service'));
  const { PeopleSearchService } = require(path.join(api, 'src/modules/people/people-search.service'));
  const { PeopleController } = require(path.join(api, 'src/modules/people/people.controller'));
  const { AuthService } = require(path.join(api, 'src/modules/auth/auth.service'));
  const { AuthGuard } = require(path.join(api, 'src/modules/auth/auth.guard'));
  const { ApiErrorsFilter } = require(path.join(api, 'src/common/api-errors'));
  // Keep the outer rollback transaction usable after deliberately rejected writes.
  const db = { query: async (sql, params) => {
    await client.query('SAVEPOINT service_query');
    try {
      const result = await client.query(sql, params);
      await client.query('RELEASE SAVEPOINT service_query');
      return result;
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT service_query');
      await client.query('RELEASE SAVEPOINT service_query');
      if (error.code?.startsWith('42')) console.error(`Fixture SQL rejected: ${error.code}, position ${error.position || 'unknown'}: ${error.message}`);
      throw error;
    }
  } };
  const secret = randomBytes(48).toString('hex');
  const auth = new AuthService(db, { get: (key, fallback) => key === 'JWT_SECRET' ? secret : fallback });
  class ValidationModule {}
  Module({ controllers: [PeopleController], providers: [AuthGuard,
    { provide: AuthService, useValue: auth },
    { provide: PeopleService, useValue: new PeopleService(db) },
    { provide: PeopleSearchService, useValue: new PeopleSearchService(db) },
    { provide: APP_FILTER, useClass: ApiErrorsFilter },
  ] })(ValidationModule);
  const app = await NestFactory.create(ValidationModule, new FastifyAdapter(), { logger: false });
  app.setGlobalPrefix('api/v1');
  try {
    await app.init();
    const server = app.getHttpAdapter().getInstance();
    await server.ready();
    const tokens = owners.map(id => auth.createToken({ id, email: `${id}@example.invalid` }));
    async function request(method, route, status, payload, user = 0) {
      const response = await server.inject({ method, url: '/api/v1' + route,
        headers: user === null ? {} : { authorization: `Bearer ${tokens[user]}` }, payload });
      assert.equal(response.statusCode, status, `${method} ${route}: ${response.statusCode} (expected ${status})`);
      return response.json();
    }
    await request('GET', '/people', 401, undefined, null);
    const self = await request('POST', '/people', 201, { name: 'Me', isMe: true });
    await request('POST', '/people', 409, { name: 'Second me', isMe: true });
    const uncle = await request('POST', '/people', 201, { name: 'Dave', aliases: ['my uncle'] });
    const directory = await request('GET', '/people?limit=1', 200);
    assert.equal(directory.items.length, 1);
    assert.equal(directory.hasMore, true);
    const next = await request('GET', `/people?limit=1&after=${directory.nextAfter}`, 200);
    assert.equal(next.items.length, 1);
    assert.notEqual(next.items[0].id, directory.items[0].id);
    const updated = await request('PUT', `/people/${uncle.id}`, 200, { name: 'Uncle Dave', aliases: ['my uncle', 'Dave'] });
    assert.equal(updated.name, 'Uncle Dave');
    await request('PUT', `/people/${uncle.id}`, 404, { name: 'Intruder' }, 1);
    await request('DELETE', `/people/${uncle.id}`, 404, undefined, 1);
    await request('GET', `/people/${uncle.id}/appearances`, 404, undefined, 1);
    const other = await request('POST', '/people', 201, { name: 'Other owner' }, 1);
    const body = { assetId: asset, start_s: 2, end_s: 6, frame_s: 3, box: [0.1, 0.2, 0.3, 0.4] };
    await request('POST', `/people/${other.id}/appearances`, 404, body, 1);
    await request('POST', `/people/${uncle.id}/appearances`, 404, { ...body, end_s: 21 });
    await request('POST', `/people/${uncle.id}/appearances`, 400, { ...body, box: [0,0,2,1] });
    const tag = await request('POST', `/people/${uncle.id}/appearances`, 201, body);
    assert.equal(tag.assetId, asset);
    assert.equal(tag.start_s, 2);
    assert.equal(tag.end_s, 6);
    assert.equal(tag.frame_s, 3);
    assert.equal(tag.status, 'confirmed');
    assert.equal(tag.origin, 'manual');
    assert.deepEqual(tag.box, body.box);
    const listed = await request('GET', `/people/${uncle.id}/appearances`, 200);
    assert.equal(listed.items[0].id, tag.id);
    await request('PATCH', `/people/appearances/${tag.id}`, 404, { status: 'rejected' }, 1);
    await request('DELETE', `/people/appearances/${tag.id}`, 404, undefined, 1);
    await request('PATCH', `/people/appearances/${tag.id}`, 400, { status: 'suggested' });
    assert.equal((await request('PATCH', `/people/appearances/${tag.id}`, 200, { status: 'rejected' })).status, 'rejected');
    assert.equal((await request('PATCH', `/people/appearances/${tag.id}`, 200, { status: 'confirmed' })).status, 'confirmed');
    await request('DELETE', `/people/appearances/${tag.id}`, 200);
    assert.equal((await request('GET', `/people/${uncle.id}/appearances`, 200)).count, 0);
    const tagRange = (personId, start, end, assetId = asset) => request('POST', `/people/${personId}/appearances`, 201,
      { ...body, assetId, start_s: start, end_s: end, frame_s: start });
    await tagRange(self.id, 1, 8);
    await tagRange(self.id, 7, 11);
    await tagRange(self.id, 11, 14);
    const firstUncle = await tagRange(uncle.id, 4, 6);
    await tagRange(uncle.id, 6, 9);
    await tagRange(uncle.id, 12, 15);
    await tagRange(self.id, 15, 17);
    await tagRange(uncle.id, 17, 19); // Touching endpoints are not co-presence.
    const bridge = await tagRange(uncle.id, 9, 12);
    await request('PATCH', `/people/appearances/${bridge.id}`, 200, { status: 'rejected' });
    const secondAsset = asset + '-other';
    await client.query(`INSERT INTO media_assets(id,user_id,original_filename,checksum,duration)
      VALUES($1,$2,'fixture2.mp4','test-only',20)`, [secondAsset, owners[0]]);
    await tagRange(self.id, 1, 2, secondAsset);
    await tagRange(uncle.id, 3, 4, secondAsset); // Same asset without overlap must not match.
    const searchBody = {query:'where I was talking to my uncle'};
    const search = await request('POST', '/people/search', 200, searchBody);
    assert.deepEqual(search.results.map(r => [r.assetId,r.startTime,r.endTime]), [[asset,4,9],[asset,12,14]]);
    assert.equal(search.hasExactMatch, false);
    assert.equal(search.canContinue, false);
    assert.equal(search.identitySearch.queryConditionsVerified, false);
    assert(search.results.every(r => r.stage2Verified === false));
    const bounded = await request('POST', '/people/search', 200, {...searchBody,limit:1});
    assert.equal(bounded.results.length, 1);
    assert.equal(bounded.identitySearch.hasMore, true);
    const anotherUncle = await request('POST', '/people', 201, {name:'Uncle Peter',aliases:['my uncle']});
    const ambiguous = await request('POST', '/people/search', 200, searchBody);
    assert.equal(ambiguous.identitySearch.status, 'needs_clarification');
    assert.equal(ambiguous.results.length, 0);
    const selected = {...searchBody,selections:[{reference:'my uncle',personId:uncle.id}]};
    assert.equal((await request('POST','/people/search',200,selected)).results.length, 2);
    await request('POST','/people/search',400,{...searchBody,selections:[{reference:'my uncle',personId:other.id}]});
    await request('DELETE', `/people/${anotherUncle.id}`, 200);
    await request('PATCH', `/people/appearances/${firstUncle.id}`, 200, {status:'rejected'});
    assert.equal((await request('POST','/people/search',200,searchBody)).results[0].startTime, 6);
    await request('PATCH', `/people/appearances/${firstUncle.id}`, 200, {status:'confirmed'});
    assert.equal((await request('POST','/people/search',200,{...searchBody,assetId:secondAsset})).results.length, 0);
    assert.equal((await request('POST','/people/search',200,searchBody,1)).results.length, 0);
    await client.query("UPDATE media_assets SET availability='offline' WHERE id=$1", [asset]);
    assert.equal((await request('POST','/people/search',200,searchBody)).results.length, 0);
    await client.query("UPDATE media_assets SET availability='online' WHERE id=$1", [asset]);
    await require('./conversation-http-validation.cjs')(client,db,owners,asset,self,uncle,auth);
    await request('POST', `/people/${uncle.id}/appearances`, 201, body);
    await request('DELETE', `/people/${uncle.id}`, 200);
    assert.equal((await client.query('SELECT id FROM person_appearances WHERE person_id=$1', [uncle.id])).rowCount, 0);
    await request('DELETE', `/people/${self.id}`, 200);
    await request('DELETE', `/people/${other.id}`, 200, undefined, 1);
    console.log('PASS: real people HTTP routes and session guard against PostgreSQL; tagging, identity resolution, overlapping range unions, gaps/touching endpoints, rejected tags, ambiguity selection, offline exclusion and cross-owner denials.');
  } finally { await app.close(); }
};
