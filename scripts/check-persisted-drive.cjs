// Real indexed media + local retrieval + Next/engine HTTP. --live permits one new reply.
// Uses a temporary session/space for the existing pilot owner; removes both afterward.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomBytes,randomUUID,createHash}=require('node:crypto');
if(!process.argv.includes('--live')){console.log('Explicit --live required for the bounded model reply check.');process.exit(0);}
const api=path.resolve('apps/api');require(require.resolve('ts-node',{paths:[api]})).register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const dep=name=>require(require.resolve(name,{paths:[api]}));const {ConfigService}=dep('@nestjs/config'),{Logger}=dep('@nestjs/common'),{Client}=dep('pg');Logger.overrideLogger(false);
const {MediaService}=require(path.join(api,'src/modules/media/media.service')),{LocalEmbeddingService}=require(path.join(api,'src/modules/pipeline/local-embedding.service')),{parseSearchQuery}=require(path.join(api,'src/modules/media/query-parse'));
const state=JSON.parse(fs.readFileSync('storage/drive-pilot-latest.json','utf8')),config=new ConfigService(process.env),db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:4000}),local=new LocalEmbeddingService(config);
const media=new MediaService(config,{query:(...args)=>db.query(...args)},{},{isConfigured:()=>false,getEmbeddingModel:()=> 'unused'},local,{});
const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex'),space=randomUUID(),base='http://localhost:3000';
let created=false,stage='database';const checks={};
const request=(url,method='GET',body,extra={})=>fetch(base+url,{method,headers:{Cookie:'brisky_session='+token,Origin:base,...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(110000)});
async function json(url,method,body){const response=await request(url,method,body);assert(response.ok,'SaaS HTTP '+response.status);return response.json();}
(async()=>{try{
  await db.connect();const rows=await db.query('SELECT * FROM media_segments WHERE asset_id=$1 AND user_id=$2 ORDER BY start_time',[state.asset,state.owner]);assert.equal(rows.rowCount,state.segments);
  const chosen=rows.rows.find(r=>r.transcript_text.trim())||rows.rows[0];
  // Actual production retrieval SQL and local query embedding; no fabricated search provider.
  stage='indexed retrieval';const results=await media.searchSegments(parseSearchQuery(chosen.title),state.asset,state.owner,5);assert(results.some(r=>r.assetId===state.asset));checks.indexedRetrieval=true;
  const vector=await media.getCachedOrGenerateEmbedding(chosen.title,state.owner);assert.equal(vector.length,384);checks.queryIndexDimensionsAgree=true;
  const wrong=await media.searchSegments(parseSearchQuery(chosen.title),state.asset,randomUUID(),5);assert.equal(wrong.length,0);checks.searchOwnership=true;
  stage='source playback';const stream=await media.getStreamInfo(state.asset,state.owner,false);assert.equal(stream.status,'ready');assert(fs.statSync(stream.filePath).size>0);checks.playbackReady=true;
  await db.query("INSERT INTO saas.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",[hash,state.owner]);
  const question='Summarize only the selected source moment in one short sentence and cite it. Use the supplied transcript and description; do not search other media or guess identities.';
  stage='SaaS space';await json('/api/spaces','POST',{id:space,query:question,title:'Temporary Drive integration check'});created=true;
  const moment=await json('/api/spaces/'+space+'/moments','POST',{assetId:state.asset,startS:Number(chosen.start_time),endS:Number(chosen.end_time),title:chosen.title});
  await json('/api/spaces/'+space+'/shortlist','PUT',{momentIds:[moment.id]});
  const initial=await json('/api/spaces/'+space);const trigger=initial.messages[0].id;
  stage='live cited reply';await json('/api/spaces/'+space+'/reply','POST',{messageId:trigger});
  const detail=await json('/api/spaces/'+space),answer=detail.messages.find(m=>m.role==='assistant');assert(answer?.content.trim());assert(answer.citations.length>0,'No playable citations');
  assert(answer.citations.every(c=>c.assetId===state.asset&&c.startS>=0&&c.endS>c.startS));checks.persistedNaturalReply=true;checks.persistedSourceCitations=true;
  const citation=answer.citations[0],playback='/api/spaces/'+space+'/moments/'+citation.momentId+'/playback',thumbnail='/api/spaces/'+space+'/moments/'+citation.momentId+'/thumbnail';
  stage='citation media';const head=await request(playback,'HEAD');assert.equal(head.status,200);assert(Number(head.headers.get('content-length'))>0);
  const partial=await request(playback,'GET',undefined,{Range:'bytes=0-31'});assert.equal(partial.status,206);assert.equal((await partial.arrayBuffer()).byteLength,32);checks.sourceRangePlayback=true;
  const image=await request(thumbnail);assert.equal(image.status,200);assert(image.headers.get('content-type')?.includes('image/jpeg'));const bytes=Buffer.from(await image.arrayBuffer());assert.equal(bytes.subarray(0,3).toString('hex'),'ffd8ff');checks.sourceThumbnail=true;
  const ledger=fs.readFileSync('storage/usage/ai-attempts.jsonl','utf8');const retry=await json('/api/spaces/'+space+'/reply','POST',{messageId:trigger});assert.equal(retry.cached,true);assert.equal(fs.readFileSync('storage/usage/ai-attempts.jsonl','utf8'),ledger);checks.retryWithoutInference=true;
  const refresh=await json('/api/spaces/'+space);assert(refresh.messages.find(m=>m.id===answer.id)?.citations.length>0);assert.deepEqual(refresh.shortlist,[moment.id]);checks.reloadAndShortlist=true;
  const noSession=await fetch(base+thumbnail,{signal:AbortSignal.timeout(10000)});assert.equal(noSession.status,401);await noSession.body?.cancel();checks.thumbnailAuth=true;
  const report={date:'2026-10-31',status:'passed',checks,segments:rows.rowCount,replyCitations:answer.citations.length,limitations:['Actual source HTTP/retrieval integration, not labelled accuracy or a new mobile browser playback evaluation.','Temporary test space/session removed; persisted source index and private playback media retained.','Queue ingestion, independent frame OCR and automatic sync remain unverified.']};fs.writeFileSync('docs/hackathon-evidence/2026-10-31-persisted-drive-integration.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(created)await db.query('DELETE FROM saas.spaces WHERE id=$1 AND user_id=$2',[space,state.owner]);await db.query('DELETE FROM saas.sessions WHERE token_hash=$1',[hash]);await local.onModuleDestroy();media.onModuleDestroy();await db.end();}})().catch(error=>{console.error('Drive integration check failed at '+stage+': '+(/HTTP \d+|No playable/i.test(error.message)?error.message:'Assertion or integration failure; private details suppressed')+' ('+(error.code||error.name)+')');process.exitCode=1;});
