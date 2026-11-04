// Isolated real PostgreSQL admission and Redis queue ordering. No AI or media processing.
const path=require('path'),assert=require('assert/strict'),{randomUUID}=require('crypto');
const api=path.resolve('apps/api'),dep=n=>require(require.resolve(n,{paths:[api]}));
dep('ts-node').register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const {Pool}=dep('pg'),{Queue,Worker}=dep('bullmq'),{ConfigService}=dep('@nestjs/config');dep('@nestjs/common').Logger.overrideLogger(false);
const {FactorySchedulerService}=require(path.join(api,'src/modules/queue/factory-scheduler.service'));
const {pipelineQueuePriority}=require(path.join(api,'src/modules/queue/indexing.types'));
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
const suffix=randomUUID().replaceAll('-',''),schema='factory_test_'+suffix,name='factory-order-'+suffix;
const admin=new Pool({connectionString:process.env.DATABASE_URL,max:1});let pool,queue,worker;
(async()=>{try{
  assert(/^factory_test_[a-f0-9]{32}$/.test(schema));await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new Pool({connectionString:process.env.DATABASE_URL,options:'-c search_path='+schema+',public',max:8});
  await pool.query('CREATE TABLE indexing_jobs (LIKE public.indexing_jobs INCLUDING DEFAULTS)');
  const config=new ConfigService({GLOBAL_MAX_ACTIVE_JOBS:5,DEFAULT_USER_SLOTS:5,FACTORY_INGEST_SLOTS:2,FACTORY_CONTINUATION_SLOTS:3});
  const scheduler=new FactorySchedulerService({query:(...a)=>pool.query(...a),getClient:()=>pool.connect()},config),owner=randomUUID();
  const types=['plan_asset','plan_asset','plan_asset','transcribe','analyze_frames','gemini_video','embed'];
  for(let i=0;i<types.length;i++)await pool.query("INSERT INTO indexing_jobs(bull_job_id,asset_id,user_id,job_type,status) VALUES($1,$2,$3,$4,'waiting')",['job'+i,'asset'+i,owner,types[i]]);
  const claim=i=>scheduler.claimSlot('job'+i,'asset'+i,owner,'normal',types[i]);
  const ingest=await Promise.all([0,1,2].map(claim));assert.equal(ingest.filter(r=>r.canRun).length,2);
  const continuation=await Promise.all([3,4,5,6].map(claim));assert.equal(continuation.filter(r=>r.canRun).length,3);
  assert.equal(Number((await pool.query("SELECT count(*) FROM indexing_jobs WHERE status='active'")).rows[0].count),5);
  const connection={host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379),maxRetriesPerRequest:null};
  queue=new Queue(name,{connection});const trace=[];let active=0,maxActive=0,releaseB,bActive=false;
  const gate=new Promise(resolve=>{releaseB=resolve;});
  const envelope=(asset,type)=>({asset_id:asset,job_type:type,priority:'normal',source:{fileSize:1}});
  for(const asset of ['A','B','C']){const data=envelope(asset,'plan_asset');await queue.add('plan',data,{priority:pipelineQueuePriority(data)});}
  worker=new Worker(name,async job=>{active++;maxActive=Math.max(maxActive,active);trace.push(job.data.asset_id+':'+job.data.job_type);try{
    if(job.data.asset_id==='B'){bActive=true;await gate;}
    if(job.data.asset_id==='A'&&job.data.job_type==='plan_asset'){await new Promise(r=>setTimeout(r,20));const data=envelope('A','transcribe');await queue.add('next',data,{priority:pipelineQueuePriority(data)});}
    if(job.data.asset_id==='A'&&job.data.job_type==='transcribe'){assert(bActive,'Different files must overlap');assert(!trace.includes('C:plan_asset'),'Ready continuation must precede fresh source');releaseB();}
  }finally{active--;}} ,{connection,concurrency:2});
  worker.on('error',()=>{});worker.on('failed',()=>releaseB());
  const deadline=Date.now()+10000;while((await queue.getCompletedCount())<4){assert(Date.now()<deadline,'Ordering check timed out');await new Promise(r=>setTimeout(r,25));}
  assert(maxActive<=2);assert(trace.indexOf('A:transcribe')<trace.indexOf('C:plan_asset'));
  console.log(JSON.stringify({status:'passed',atomicIngestCap:2,atomicContinuationCap:3,globalCap:5,continuationBeforeFreshSource:true,independentFilesOverlap:true}));
}finally{
  if(worker)await worker.close();if(queue){assert(name==='factory-order-'+suffix);await queue.obliterate({force:true});await queue.close();}
  if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
}})().catch(error=>{console.error('Scheduling fixture failed: '+(error.message||error.code));process.exitCode=1;});
