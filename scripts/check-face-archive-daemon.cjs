// Explicit local-only smoke check; requires a running API and --faces-only worker.
// A consenting participant's previously labelled frame is repeated into two short
// generated videos. This tests plumbing, not independent-video recognition accuracy.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {Client}=require(require.resolve('pg',{paths:[path.resolve('apps/api')]}));
const argument=process.argv.indexOf('--enrollment-bundle');
if(argument<0||!process.argv[argument+1])throw Error('Pass --enrollment-bundle with an explicitly authorized local private bundle');
const rows=JSON.parse(fs.readFileSync(process.argv[argument+1],'utf8'));
const sample=rows.find(row=>row.identity&&row.embedding&&rows.filter(other=>other.image===row.image).length===1);
if(!sample)throw Error('No isolated usable enrolled frame in the supplied private bundle');
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
const base='http://127.0.0.1:3001';const files=[];let owner,other;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{assert(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));await client.connect();
try{
  for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/v1/health');await r.body?.cancel();if(r.ok)break;}catch{}await pause(500);}
  owner=randomUUID();other=randomUUID();const person=randomUUID();const token=randomBytes(32).toString('base64url'),otherToken=randomBytes(32).toString('base64url');
  for(const [id,t] of [[owner,token],[other,otherToken]]){await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'!fixture')",[id,id+'@example.invalid']);await client.query("INSERT INTO saas.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(t).digest('hex'),id]);}
  await client.query("INSERT INTO people(id,user_id,name) VALUES($1,$2,'Local consenting participant fixture')",[person,owner]);
  const ffmpeg=require(require.resolve('@ffmpeg-installer/ffmpeg',{paths:[path.resolve('apps/api')]})).path;
  const assets=[];
  for(const [suffix,duration] of [['gallery',2],['probe',3]]){
    const id='face-'+owner+'-'+suffix,file=path.resolve('storage/proxies/'+id+'.mp4');files.push(file);
    execFileSync(ffmpeg,['-v','error','-loop','1','-i',path.resolve(sample.image),'-t',String(duration),'-r','12','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-y',file],{windowsHide:true});
    const checksum=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    await client.query("INSERT INTO media_assets(id,user_id,original_filename,checksum,duration,status,proxy_status,proxy_path) VALUES($1,$2,$3,$4,$5,'indexed','ready',$6)",[id,owner,'local-'+suffix+'.mp4',checksum,duration,file]);assets.push(id);
  }
  await client.query("INSERT INTO person_appearances(user_id,person_id,asset_id,start_s,end_s,frame_s,box) VALUES($1,$2,$3,0,2,.5,$4)",[owner,person,assets[0],sample.box]);
  const endpoint=base+'/api/v1/saas-engine/people/'+person+'/face-archive';
  const request=async(method,payload,t=token,url=endpoint)=>{const response=await fetch(url,{method,headers:{Authorization:'SaaS '+t,...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});const body=await response.json();return {status:response.status,body};};
  assert.equal((await request('GET',undefined,otherToken)).status,404);
  assert.equal((await request('PUT',{enabled:true,owner})).status,400);
  assert.equal((await request('PUT',{enabled:true})).status,200);
  let progress;
  for(let i=0;i<120;i++){progress=(await request('GET')).body;if(progress.assets?.completed===2)break;const failures=(progress.states||[]).filter(row=>['blocked','failed'].includes(row.state));if(failures.length)throw Error('Worker could not finish generated repeated-frame videos: '+JSON.stringify(progress.problems));await pause(1000);}
  assert.equal(progress.assets.completed,2,'Dedicated worker did not finish both videos');
  const suggestions=(await client.query("SELECT id FROM face_suggestions WHERE user_id=$1 AND asset_id=$2 AND status='pending' ORDER BY frame_s",[owner,assets[1]])).rows;
  assert(suggestions.length>0,'Expected local positive suggestions from repeated owner-labelled frame');
  assert.equal(Number((await client.query("SELECT count(*) n FROM person_appearances WHERE user_id=$1 AND origin='face_match'",[owner])).rows[0].n),0);
  const reviewUrl=base+'/api/v1/saas-engine/people/face-suggestions/'+suggestions[0].id+'/review';
  assert.equal((await request('POST',{decision:'confirm'},token,reviewUrl)).status,201);
  assert.equal((await request('POST',{decision:'confirm'},token,reviewUrl)).status,201);
  assert.equal(Number((await client.query("SELECT count(*) n FROM person_appearances WHERE user_id=$1 AND origin='face_match'",[owner])).rows[0].n),1);
  // A later addition is picked up without another enable or enqueue request.
  const later='face-'+owner+'-later';
  await client.query("INSERT INTO media_assets(id,user_id,original_filename,checksum,duration,status,proxy_status,proxy_path) SELECT $1,user_id,'local-later.mp4',checksum,duration,'indexed','ready',proxy_path FROM media_assets WHERE id=$2",[later,assets[1]]);
  for(let i=0;i<60;i++){progress=(await request('GET')).body;if(progress.assets.completed===3)break;await pause(1000);}
  assert.equal(progress.assets.completed,3,'Worker did not discover the later video');
  assert.equal(Number((await client.query('SELECT count(*) n FROM face_archive_jobs WHERE user_id=$1 AND asset_id=$2 AND reused_from IS NOT NULL',[owner,later])).rows[0].n),1);
  const changed=path.resolve('storage/proxies/'+later+'.mp4');files.push(changed);
  execFileSync(ffmpeg,['-v','error','-loop','1','-i',path.resolve(sample.image),'-t','4','-r','12','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-y',changed],{windowsHide:true});
  await client.query('UPDATE media_assets SET checksum=$2,duration=4,proxy_path=$3 WHERE id=$1',[later,createHash('sha256').update(fs.readFileSync(changed)).digest('hex'),changed]);
  for(let i=0;i<60;i++){progress=(await request('GET')).body;if(progress.assets.completed===3)break;await pause(1000);}
  assert.equal(progress.assets.completed,3,'Worker did not scan the changed video');
  assert.equal(Number((await client.query('SELECT count(*) n FROM face_archive_jobs WHERE user_id=$1 AND asset_id=$2',[owner,later])).rows[0].n),2);
  const jobCount=Number((await client.query('SELECT count(*) n FROM face_archive_jobs WHERE user_id=$1',[owner])).rows[0].n);await pause(12000);
  assert.equal(Number((await client.query('SELECT count(*) n FROM face_archive_jobs WHERE user_id=$1',[owner])).rows[0].n),jobCount);
  await request('PUT',{enabled:false});
  console.log(JSON.stringify({status:'passed',scope:'Actual API sessions, daemon discovery, PostgreSQL leases, local FFmpeg/YuNet/SFace, pending suggestions and explicit idempotent review',fixture:'Three short videos repeating one owner-authorized annotated frame; not independent recordings or accuracy evidence',completedVideos:3,laterAdditionDiscovered:true,changedVideoRescanned:true,duplicateContentReused:true,probeSuggestions:suggestions.length,autoConfirmed:0,explicitConfirmed:1,duplicateDiscoveryJobs:0,paidCalls:0}));
}finally{
  if(owner)await client.query('DELETE FROM users WHERE id=$1',[owner]);if(other)await client.query('DELETE FROM users WHERE id=$1',[other]);await client.end();for(const file of files){assert(path.dirname(file)===path.resolve('storage/proxies'));if(fs.existsSync(file))fs.unlinkSync(file);}
}})().catch(error=>{console.error('Face daemon check failed: '+error.message);process.exitCode=1;});
