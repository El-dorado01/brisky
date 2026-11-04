// Real PostgreSQL stage-history fixture. No media, workers or AI. Fixture rows roll back.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{randomUUID}=require('crypto');
const api=path.resolve('apps/api'),dep=n=>require(require.resolve(n,{paths:[api]}));
dep('ts-node').register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const {Pool}=dep('pg'),{recordFactoryStep,factoryRunsSql,summarizeFactoryRuns,updateFactoryProgress}=require(path.join(api,'src/modules/queue/factory-telemetry'));
const {factoryAssetsSql}=require(path.join(api,'src/modules/connector/saas-connectors.controller'));
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),'Local database only');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
(async()=>{const client=await pool.connect();try{
  const schema=fs.readFileSync('apps/api/src/modules/database/schema.sql','utf8');
  await client.query(schema.slice(schema.indexOf('-- Event-developed Factory stage history;')));
  await client.query('BEGIN');const owner=randomUUID(),asset='factory-'+randomUUID(),job='factory-'+randomUUID();
  await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'!fixture')",[owner,owner+'@example.invalid']);
  await client.query("INSERT INTO media_assets(id,user_id,source_type,original_filename,checksum,status) VALUES($1,$2,'upload','factory-fixture.mp4','fixture-checksum','queued')",[asset,owner]);
  await client.query("INSERT INTO indexing_jobs(bull_job_id,asset_id,user_id,status,last_heartbeat_at) VALUES($1,$2,$3,'active',NOW())",[job,asset,owner]);
  const db={query:async(...args)=>{try{return await client.query(...args);}catch(error){console.error('Fixture SQL: '+error.message);throw error;}}},env={user_id:owner,asset_id:asset};
  await recordFactoryStep(db,{id:job},env,'scene_detection',async()=>{
    const rows=(await client.query(factoryRunsSql,[owner])).rows;
    assert.equal(summarizeFactoryRuns(rows).find(s=>s.id==='scenes').files.length,1);
    assert.equal(rows[0].progress,null,'Job milestone is not a measured stage percentage');
    await updateFactoryProgress(db,job,owner,'scenes',1,4);
    const measured=(await client.query(factoryRunsSql,[owner])).rows[0];assert.equal(measured.progress,25);
    assert(summarizeFactoryRuns([measured]).find(s=>s.id==='scenes').files[0].note.includes('1 of 4 frames'));
  });
  const result=summarizeFactoryRuns((await client.query(factoryRunsSql,[owner])).rows).find(s=>s.id==='scenes');
  assert.equal(result.doneToday,1);assert.equal(result.files.length,0);assert.equal(result.activity.length,1);
  assert.equal((await client.query(factoryRunsSql,[randomUUID()])).rowCount,0);
  await client.query("UPDATE media_assets SET status='processing' WHERE id=$1",[asset]);
  const state=async()=> (await client.query(factoryAssetsSql+' SELECT status FROM factory_assets WHERE id=$2',[owner,asset])).rows[0].status;
  assert.equal(await state(),'processing');
  await client.query("UPDATE indexing_jobs SET status='waiting' WHERE bull_job_id=$1",[job]);assert.equal(await state(),'queued');
  await client.query("UPDATE indexing_jobs SET status='failed' WHERE bull_job_id=$1",[job]);assert.equal(await state(),'failed');
  console.log(JSON.stringify({status:'passed',liveDuringStep:true,fastCompletionRetained:true,ownerIsolation:true,activeQueuedFailedAgree:true,fixturesRolledBack:true}));
}finally{await client.query('ROLLBACK');client.release();await pool.end();}})().catch(error=>{console.error('Factory fixture failed: '+(error.code||error.name));process.exitCode=1;});
