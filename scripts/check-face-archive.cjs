// Local fixture check. No connector sync, emails or remote AI requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
process.env.TS_NODE_PROJECT=path.resolve('apps/api/tsconfig.json');
require(path.resolve('apps/api/node_modules/ts-node/register/transpile-only'));
const {Client}=require(require.resolve('pg',{paths:[path.resolve('apps/api')]}));
const {FaceArchiveService}=require(path.resolve('apps/api/src/modules/people/face-archive.service'));
const {FaceMatchingService}=require(path.resolve('apps/api/src/modules/people/face-matching.service'));
const {claimArchiveSql,archiveProfile,referenceRevisionSql}=require(path.resolve('apps/api/src/modules/people/face-archive.sql'));
const {execFileSync}=require('node:child_process');
const main=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
const second=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
let owner,other,video;
(async()=>{assert(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));await main.connect();await second.connect();
try{
  await main.query(fs.readFileSync('apps/api/src/modules/database/face-schema.sql','utf8'));
  owner=randomUUID();other=randomUUID();const person=randomUUID(),foreignPerson=randomUUID();
  for(const id of [owner,other])await main.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'!fixture')",[id,id+'@example.invalid']);
  await main.query("INSERT INTO people(id,user_id,name) VALUES($1,$2,'Archive fixture'),($3,$4,'Foreign fixture')",[person,owner,foreignPerson,other]);
  const fixtureClaimSql=claimArchiveSql.replace("q.state='queued'","q.state='queued' AND q.user_id=$3");
  const source='archive-'+randomUUID(),duplicate='archive-'+randomUUID(),foreign='archive-'+randomUUID();
  for(const [id,user] of [[source,owner],[duplicate,owner],[foreign,other]])await main.query("INSERT INTO media_assets(id,user_id,original_filename,checksum,duration,status) VALUES($1,$2,'generated.mp4',$3,130,'indexed')",[id,user,'a'.repeat(64)]);
  const ref=(await main.query("INSERT INTO person_appearances(user_id,person_id,asset_id,start_s,end_s,frame_s,box) VALUES($1,$2,$3,0,2,1,ARRAY[0.2,0.2,0.4,0.4]) RETURNING id",[owner,person,source])).rows[0].id;
  let scans=0;const fakeFaces={scan:async(user,p,body,context)=>{assert.equal(user,owner);assert.equal(p,person);scans++;await main.query(`INSERT INTO face_suggestions(user_id,person_id,reference_id,reference_version,reference_checksum,asset_id,asset_checksum,frame_s,box,score,model) SELECT $1,$2,r.id,r.updated_at,a.checksum,$4,$5,$6,ARRAY[0.2,0.2,0.4,0.4],.9,'opencv-yunet-sface-context-v2-tiles4-t065' FROM person_appearances r JOIN media_assets a ON a.id=r.asset_id AND a.user_id=r.user_id WHERE r.id=$3`,[owner,person,ref,body.assetId,'a'.repeat(64),context.startS+1]);return {suggested:1,framesScanned:24};}};
  const config={get:(key,fallback)=>key==='FACE_RECOGNITION_ENABLED'?'true':fallback};
  // Discovery is restricted to fixture settings even if a user opted in elsewhere.
  const db={query:(sql,params)=>{
    if(sql.startsWith('SELECT user_id,person_id FROM face_archive_settings'))return main.query(sql.replace('WHERE enabled','WHERE enabled AND user_id=$1'),[owner]);
    if(sql===claimArchiveSql)return main.query(fixtureClaimSql,[...params,owner]);
    if(sql.startsWith('UPDATE face_archive_jobs SET state=CASE'))return main.query(sql.replace("WHERE state='running'","WHERE user_id=$1 AND state='running'"),[owner]);
    return main.query(sql,params);
  }};
  const worker=new FaceArchiveService(db,fakeFaces,config);
  await worker.configure(owner,person,{enabled:true});await worker.discover();await worker.discover();
  assert.equal(Number((await main.query('SELECT count(*) n FROM face_archive_jobs WHERE user_id=$1',[owner])).rows[0].n),6);
  assert.equal(Number((await main.query('SELECT count(*) n FROM face_archive_jobs WHERE user_id=$1',[other])).rows[0].n),0);
  await main.query('BEGIN');const first=(await main.query(fixtureClaimSql,[randomUUID(),archiveProfile,owner])).rows[0];
  const next=(await second.query(fixtureClaimSql,[randomUUID(),archiveProfile,owner])).rows[0];assert(first&&next);assert.notEqual(first.id,next.id);await main.query('COMMIT');
  await worker.run(first);await worker.run(next);
  for(;;){const claimed=(await main.query(fixtureClaimSql,[randomUUID(),archiveProfile,owner])).rows[0];if(!claimed)break;await worker.run(claimed);}
  const finished=(await main.query('SELECT state,count(*)::int n FROM face_archive_jobs WHERE user_id=$1 GROUP BY state',[owner])).rows;
  assert.deepEqual(finished,[{state:'completed',n:6}]);assert.equal(scans,3);
  assert.equal(Number((await main.query('SELECT count(*) n FROM face_suggestions WHERE user_id=$1',[owner])).rows[0].n),6);
  const status=await worker.status(owner,person);assert.equal(status.assets.completed,2);assert.equal(status.assets.discovered,2);
  await assert.rejects(()=>worker.status(other,person),error=>error.getStatus()===404);
  const foreignJob=(await main.query(`INSERT INTO face_archive_jobs(user_id,person_id,asset_id,asset_checksum,reference_revision,profile,start_s,end_s,source_duration,state) VALUES($1,$2,$3,$4,'foreign',$5,0,60,130,'completed') RETURNING id`,[other,foreignPerson,foreign,'a'.repeat(64),archiveProfile])).rows[0].id;
  const ownedJob=(await main.query('SELECT id FROM face_archive_jobs WHERE user_id=$1 LIMIT 1',[owner])).rows[0].id;
  await main.query('BEGIN');await main.query('SAVEPOINT donor_owner');
  await assert.rejects(()=>main.query('UPDATE face_archive_jobs SET reused_from=$2 WHERE id=$1',[ownedJob,foreignJob]),error=>error.code==='23503');
  await main.query('ROLLBACK TO donor_owner');await main.query('COMMIT');
  const interruptedLease=randomUUID();
  await main.query("UPDATE face_archive_jobs SET state='running',attempts=1,lease_token=$2,lease_until=now()-interval '1 minute' WHERE id=$1",[ownedJob,interruptedLease]);
  await worker.tick();
  const recovered=(await main.query('SELECT state,attempts FROM face_archive_jobs WHERE id=$1',[ownedJob])).rows[0];assert.deepEqual(recovered,{state:'completed',attempts:2});
  const lateFinish=await main.query("UPDATE face_archive_jobs SET state='completed' WHERE id=$1 AND lease_token=$2 AND state='running'",[ownedJob,interruptedLease]);assert.equal(lateFinish.rowCount,0);
  // Content changes and enrollment changes produce fresh jobs, not duplicate runs.
  await main.query('UPDATE media_assets SET checksum=$2 WHERE id=$1',[duplicate,'b'.repeat(64)]);await worker.discover();
  assert.equal(Number((await main.query("SELECT count(*) n FROM face_archive_jobs WHERE user_id=$1 AND state='queued'",[owner])).rows[0].n),3);
  await worker.configure(owner,person,{enabled:false});assert.equal(Number((await main.query("SELECT count(*) n FROM face_archive_jobs WHERE user_id=$1 AND state='queued'",[owner])).rows[0].n),0);
  const stale=(await main.query('SELECT id FROM face_archive_jobs WHERE user_id=$1 LIMIT 1',[owner])).rows[0].id;
  const staleWrite=await main.query("UPDATE face_archive_jobs SET state='completed' WHERE id=$1 AND lease_token=$2 AND state='running'",[stale,randomUUID()]);assert.equal(staleWrite.rowCount,0);
  // Real decoder/model path: a generated no-face manual reference must block,
  // rather than record a successful zero-match identity scan.
  await main.query('DELETE FROM face_suggestions WHERE user_id=$1',[owner]);await main.query('DELETE FROM face_archive_jobs WHERE user_id=$1',[owner]);
  await main.query("UPDATE media_assets SET checksum=$2,duration=2 WHERE user_id=$1",[owner,'c'.repeat(64)]);
  const ffmpeg=require(require.resolve('@ffmpeg-installer/ffmpeg',{paths:[path.resolve('apps/api')]})).path;
  video=path.resolve('storage/proxies/archive-check-'+owner+'.mp4');fs.mkdirSync(path.dirname(video),{recursive:true});execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=160x160:r=12','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-y',video],{windowsHide:true});
  const realFaces=new FaceMatchingService(db,{getStreamInfo:async()=>({status:'ready',filePath:video})},{getFfmpegPath:()=>ffmpeg},config);
  const realWorker=new FaceArchiveService(db,realFaces,config);await realWorker.configure(owner,person,{enabled:true});await realWorker.discover();
  const realJob=(await main.query(fixtureClaimSql,[randomUUID(),archiveProfile,owner])).rows[0];await realWorker.run(realJob);
  const realState=(await main.query('SELECT state,error_code FROM face_archive_jobs WHERE id=$1',[realJob.id])).rows[0];assert.deepEqual(realState,{state:'blocked',error_code:'no_reference'});
  assert.equal(Number((await main.query('SELECT count(*) n FROM face_suggestions WHERE user_id=$1',[owner])).rows[0].n),0);
  console.log(JSON.stringify({status:'passed',checks:['Owner-scoped discovery','Discovery idempotency','Concurrent SKIP LOCKED claims','Bounded scan windows','Checksum duplicate reuse (3 decodes for 6 jobs)','Progress counts require complete video coverage','Foreign owner denied','Content revisions schedule fresh jobs','Pause cancels outstanding work','Expired leases recover on next worker tick','Stale leases cannot complete jobs','Real FFmpeg/YuNet/SFace no-reference job blocks without suggestions'],fixtureInference:'Positive candidate/dedup path uses a stub scan; no-face path uses real local runtime',paidCalls:0}));
}finally{
  if(owner)await main.query('DELETE FROM users WHERE id=$1',[owner]);if(other)await main.query('DELETE FROM users WHERE id=$1',[other]);if(video&&fs.existsSync(video))fs.unlinkSync(video);await second.end();await main.end();
}})().catch(error=>{console.error('Face archive check failed: '+error.message);process.exitCode=1;});
