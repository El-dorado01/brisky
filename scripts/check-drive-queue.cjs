// Real BullMQ + PostgreSQL + production processor/services, on a private temporary queue.
// Source: the retained real Drive pilot video. No Google writes or production queue worker.
// node --env-file=.env scripts/check-drive-queue.cjs --live
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
if(!process.argv.includes('--live')){console.log('No work started. Explicit --live required.');process.exit(0);}
const api=path.resolve('apps/api');require(require.resolve('ts-node',{paths:[api]})).register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const dep=name=>require(require.resolve(name,{paths:[api]})),load=name=>require(path.join(api,'src/modules',name));
const {ConfigService}=dep('@nestjs/config'),{Logger}=dep('@nestjs/common'),{Pool}=dep('pg'),{Queue,Worker,DelayedError,UnrecoverableError}=dep('bullmq');Logger.overrideLogger(false);
const {FfmpegService}=load('ffmpeg/ffmpeg.service'),{FfmpegPipelineService}=load('pipeline/ffmpeg-pipeline.service'),{AiIntelligenceService}=load('pipeline/ai-intelligence.service'),{LocalEmbeddingService}=load('pipeline/local-embedding.service'),{WhisperTranscriptionService}=load('pipeline/whisper-transcription.service'),{IntelligenceMergerService}=load('pipeline/intelligence-merger.service'),{ProcessingUnitsService}=load('pipeline/processing-units.service'),{IndexingProcessor}=load('queue/indexing.processor'),{IndexingService}=load('queue/indexing.service'),{FactorySchedulerService}=load('queue/factory-scheduler.service'),{resolveStorageLocator}=load('../common/storage-paths');
const remoteAudio=process.argv.includes('--remote-audio'),remoteFull=process.argv.includes('--remote-full'),remoteSource=remoteAudio||remoteFull;
const state=JSON.parse(fs.readFileSync('storage/drive-pilot-latest.json','utf8')),id=randomUUID().replaceAll('-',''),asset='vid_queue_'+id,name='brisky-queue-pilot-'+id,root=path.resolve('storage/queue-pilot-'+id),ledger=path.resolve('storage/usage/ai-attempts.jsonl');
const connection={host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379),connectTimeout:4000,maxRetriesPerRequest:null,retryStrategy:attempt=>attempt<3?500:null};
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:4000,max:6}),db={query:(...args)=>pool.query(...args),getClient:()=>pool.connect()};
process.env.HF_HUB_OFFLINE='1';process.env.WHISPER_CPU_THREADS='1';process.env.EMBEDDING_THREADS='1';
const config=new ConfigService({...process.env,...(remoteAudio?{AI_BUDGET_USD:0}:{}),...(process.argv.includes('--budget-plan')?{INDEX_BUDGET_PLAN_ENABLED:'true',INDEX_ALLOWED_CONNECTOR_ACCOUNT_IDS:state.accountId}:{}),STORAGE_ROOT:root,BASETEN_MEDIA_ENABLED:'true',BASETEN_REQUEST_TIMEOUT_MS:120000,AI_USAGE_LEDGER_PATH:ledger,GLOBAL_MAX_ACTIVE_JOBS:1,LOCAL_EMBEDDING_USER_IDS:state.owner});
let worker,queue,fatal,injectId,injected=0,sequence=0,created=false,remoteService;const uploaded=[];const errors=[];
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const report={date:localDate(),startedDate:localDate(),status:'running',checks:{},scope:'Actual retained Drive source through isolated real Redis queue, PostgreSQL and production processor; no cloud upload, broad sync or production queue worker',limitations:['Local-file queue execution of real Drive media, not remote connector queue download/upload verification.','Not a labelled accuracy evaluation or automatic sync test.']};
const embedding=new LocalEmbeddingService(config),whisper=new WhisperTranscriptionService(config),units=new ProcessingUnitsService(db),scheduler=new FactorySchedulerService(db,config),media=new FfmpegPipelineService(new FfmpegService(),config),ai=new AiIntelligenceService(config,media),merger=new IntelligenceMergerService(ai,embedding,config);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check,timeout=remoteFull?1800000:720000){const end=Date.now()+timeout;while(Date.now()<end){if(fatal)throw Error(fatal);if(await check())return;await pause(500);}throw Error('Queue pilot deadline exceeded');}
(async()=>{try{
  report.stage='source';assert(config.get('AI_PROVIDER')==='baseten','Pilot requires Baseten');
  const original=await db.query('SELECT * FROM media_assets WHERE id=$1 AND user_id=$2',[state.asset,state.owner]);assert.equal(original.rowCount,1);const row=original.rows[0],source=resolveStorageLocator(row.proxy_path,path.resolve(process.env.STORAGE_ROOT||'storage'));assert(source&&fs.statSync(source).size>0);
  const beforeVectors=await db.query('SELECT count(*)::int AS count FROM media_segments WHERE embedding IS NOT NULL');
  report.stage='queue';queue=new Queue(name,{connection});queue.on('error',()=>{});await queue.waitUntilReady();
  const factory={provider:'bullmq',dispatch:async envelope=>{
    const inject=!injectId&&envelope.job_type==='analyze_frames';if(inject)injectId=envelope.job_id;
    const job=await queue.add(envelope.job_type,envelope,{jobId:envelope.job_id,attempts:inject?2:1,backoff:{type:'fixed',delay:500},removeOnComplete:false,removeOnFail:false});return job.id;
  }};
  report.stage='construct processor';const service=new IndexingService(queue,db,config,scheduler,factory,units);
  let registry={get:()=>{throw Error('Unexpected connector access');}},connectors={};
  const initialLedger=fs.readFileSync(ledger,'utf8');
  if(remoteSource){
    const {ConnectorRegistry}=load('connector/connector.registry'),{GoogleDriveConnector}=load('connector/google-drive.connector'),{TokenCryptoService}=load('connector/token-crypto.service'),{ConnectorsService}=load('connector/connectors.service');
    registry=new ConnectorRegistry();const drive=new GoogleDriveConnector(config);registry.register(drive);connectors=new ConnectorsService(db,new TokenCryptoService(config),drive,registry,service);remoteService=connectors;
    if(remoteFull){const upload=drive.uploadAsset.bind(drive);drive.uploadAsset=async(...args)=>{assert(String(args[3]).startsWith(asset+'_'),'Unexpected derived upload scope');const result=await upload(...args);uploaded.push(result.remoteId);return result;};}
    const account=await db.query('SELECT selected_folders FROM connector_accounts WHERE id=$1 AND user_id=$2',[state.accountId,state.owner]);assert.equal(account.rowCount,1);
    const remote=await drive.getAsset(await connectors.getAuthContext(state.accountId,state.owner),state.fileId);assert(account.rows[0].selected_folders.some(folder=>folder.id===remote.path),'Source left selected folder');assert.equal(remote.size,Number(row.file_size));
    report.scope=remoteFull?'Real Google Drive source, frame/video/speech queue and derived preview upload through isolated production services; no broad sync':'Real Google Drive ranged source access and local speech through isolated production queue/services; paid inference blocked, no cloud writes or broad sync';
    report.limitations=remoteFull?['Not an automatic sync, forced OAuth refresh or labelled accuracy test.','Only derived test uploads are deleted; shared Brisky app folders remain.']:['Remote audio/read/auth path only; forced token refresh, cloud-derived uploads and a full remote scene/video queue run are unverified.','Not an automatic sync or labelled speech accuracy test.'];
  }
  const processor=new IndexingProcessor(db,media,ai,whisper,merger,config,registry,connectors,units,undefined,scheduler,service);
  report.stage='insert fixture';await db.query(`INSERT INTO media_assets(id,user_id,source_type,original_filename,checksum,file_size,status,original_path) VALUES($1,$2,'upload','queue-pilot.mp4',$3,$4,'queued',$5)`,[asset,state.owner,row.checksum,row.file_size,source]);created=true;
  report.stage='start worker';worker=new Worker(name,async job=>{
    if(fatal)throw new UnrecoverableError('Pilot stopped');
    if(job.id===injectId&&job.attemptsMade===0){injected++;throw Error('Injected pre-inference interruption');}
    try{await processor.process(job);}catch(error){if(error instanceof DelayedError)throw error;report.processorCode=error.code||error.name;report.processorJob=job.data.job_type;fs.writeFileSync('.tmp/queue-pilot-private-error.json',JSON.stringify({message:error.message,stack:error.stack}));fatal='Production processor failed; see stage checks';throw new UnrecoverableError('Pilot processing failed');}
  },{connection,concurrency:1});worker.on('error',()=>{});worker.on('failed',(_job,error)=>errors.push(error.name));await worker.waitUntilReady();
  const envelope={job_type:remoteAudio?'transcribe':'plan_asset',asset_id:asset,user_id:state.owner,source:{provider:remoteSource?'google_drive':'upload',...(remoteSource?{remoteId:state.fileId,connectorAccountId:state.accountId}:{}),sourcePath:source,originalFilename:'queue-pilot.mp4',fileSize:Number(row.file_size),checksum:row.checksum},priority:'normal',processing_config:{forceReindex:true}};
  if(remoteAudio){
    await units.planUnits(asset,[],true);await service.enqueueAsset(envelope);
    await waitFor(async()=> (await units.getUnit(asset,'audio_transcribe'))?.status==='completed');
    const transcript=await db.query("SELECT count(*)::int AS count FROM media_observations WHERE asset_id=$1 AND user_id=$2 AND observation_type='transcript'",[asset,state.owner]);assert(transcript.rows[0].count>0);
    const job=await db.query("SELECT access_mode,bytes_read FROM indexing_jobs WHERE asset_id=$1 AND status='completed'",[asset]);assert.equal(job.rows[0].access_mode,'range_read');assert(Number(job.rows[0].bytes_read)>0);
    const replayId='queue_replay_'+id;await service.enqueueAsset({...envelope,job_id:replayId});await waitFor(async()=> (await queue.getJob(replayId))?.getState().then(value=>value==='completed'),30000);
    assert.equal(fs.readFileSync(ledger,'utf8'),initialLedger);
    report.checks={selectedFolderAndOwner:true,realDriveRangeRead:true,localTranscription:true,completedCheckpointReplay:true,noInferenceLedgerChange:true};report.transcriptCues=transcript.rows[0].count;report.bytesRead=Number(job.rows[0].bytes_read);report.status='passed';return;
  }
  report.stage='enqueue';await service.enqueueAsset(envelope);report.stage='process units';
  await waitFor(async()=>{const result=await db.query('SELECT status FROM media_assets WHERE id=$1',[asset]);return ['indexed','partially_indexed'].includes(result.rows[0]?.status)&&!(await units.pendingSiblingUnits(asset,'finalize'));});
  // Finalizer may be the next job, so require its checkpoint separately.
  await waitFor(async()=> (await units.getUnit(asset,'finalize'))?.status==='completed');
  const completed=await units.getUnits(asset),segments=await db.query('SELECT embedding_dim,transcript_text,sources FROM media_segments WHERE asset_id=$1 AND user_id=$2',[asset,state.owner]),frames=await db.query("SELECT count(*)::int AS count FROM media_observations WHERE asset_id=$1 AND observation_type='frame'",[asset]);
  assert(completed.every(unit=>unit.status==='completed'));assert(segments.rowCount>0);assert(segments.rows.every(s=>s.embedding_dim===384&&s.sources.includes('video')));assert(segments.rows.some(s=>s.transcript_text.trim()));assert(frames.rows[0].count>0);assert.equal(injected,1);
  report.checks={plannedUnitsComplete:true,realFrameAnalysis:true,localSpeech:true,localEmbeddings:true,nativeVideoEnriched:true,preInferenceRetry:true};report.units=completed.length;report.scenes=segments.rowCount;report.frameObservations=frames.rows[0].count;
  if(process.argv.includes('--strict-frames')){
    assert(remoteFull,'Strict coverage check requires remote full mode');
    const prepared=await units.getUnit(asset,'source_preparation');
    const planned=prepared.metadata.scenes.reduce((count,scene)=>count+scene.keyframes.length,0);
    assert.equal(frames.rows[0].count,planned,'Frame observations differ from prepared evidence');
    report.plannedFrames=planned;report.checks.strictRequiredFrameGuard=true;report.checks.everyPreparedFrameObserved=true;
  }
  if(remoteFull){assert(uploaded.length>0,'No remote preview upload');report.checks.derivedPreviewUploaded=true;report.derivedUploads=uploaded.length;}
  const beforeLedger=fs.readFileSync(ledger,'utf8'),unit=completed.find(u=>u.unit_type==='analyze_frames'),replayId='queue_replay_'+id;
  await service.enqueueAsset({...envelope,job_id:replayId,job_type:'analyze_frames',segment:{start_s:Number(unit.start_s),end_s:Number(unit.end_s)},processing_config:{unitId:unit.unit_id}});
  await waitFor(async()=> (await queue.getJob(replayId))?.getState().then(value=>value==='completed'),30000);
  assert.equal(fs.readFileSync(ledger,'utf8'),beforeLedger);report.checks.completedCheckpointWithoutInference=true;
  const afterVectors=await db.query('SELECT count(*)::int AS count FROM media_segments WHERE embedding IS NOT NULL');assert.equal(afterVectors.rows[0].count,beforeVectors.rows[0].count);report.checks.existingGoogleVectorsPreserved=true;
  report.status='passed';
}catch(error){report.status='failed';report.error=/deadline|budget|HTTP \d+/.test(error.message)?error.message:'Queue pilot assertion or processing failure; private details suppressed';report.errorCode=error.code||error.name;process.exitCode=1;
}finally{
  if(worker)await worker.close();await whisper.onModuleDestroy();await embedding.onModuleDestroy();
  if(uploaded.length){try{const {google}=dep('googleapis'),auth=await remoteService.getAuthContext(state.accountId,state.owner);for(const fileId of uploaded)await google.drive({version:'v3',auth}).files.delete({fileId});report.derivedUploadsRemoved=uploaded.length;}catch{report.remoteCleanupFailed=true;report.status='failed';process.exitCode=1;fs.writeFileSync('storage/drive-pilot-pending-cleanup.json',JSON.stringify({accountId:state.accountId,owner:state.owner,fileIds:uploaded}));}}
  if(queue){await queue.pause();assert(name.startsWith('brisky-queue-pilot-')&&name.endsWith(id));await queue.obliterate({force:true});await queue.close();}
  if(created){await db.query('DELETE FROM asset_processing_locks WHERE asset_id=$1',[asset]);await db.query('DELETE FROM media_assets WHERE id=$1 AND user_id=$2',[asset,state.owner]);}
  await pool.end();assert.equal(path.dirname(root),path.resolve('storage'));assert(path.basename(root)==='queue-pilot-'+id);fs.rmSync(root,{recursive:true,force:true});
  report.date=localDate();report.cleanup={isolatedQueueRemoved:true,temporaryAssetRemoved:true,privateDerivedMediaRemoved:true};fs.writeFileSync('docs/hackathon-evidence/'+report.date+(remoteAudio?'-drive-remote-audio-queue':remoteFull?'-drive-remote-full-queue':'-drive-queue-pilot')+(process.argv.includes('--strict-frames')?'-strict-frames':'')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}})();
