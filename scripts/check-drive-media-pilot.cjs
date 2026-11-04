// Explicit scoped live preflight, not indexing or sync:
// node --env-file=.env scripts/check-drive-media-pilot.cjs --live <account-id> <file-id>
// Writes only non-sensitive evidence; deletes its exact private scratch directory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
if(process.argv[2]!=='--live'){console.log('No calls made. Explicit --live account-id file-id required.');process.exit(0);}
const [accountId,fileId]=process.argv.slice(3);assert(/^[\w-]{1,200}$/.test(accountId||'')&&/^[\w-]{1,200}$/.test(fileId||''),'Invalid scope');
const api=path.resolve('apps/api');require(require.resolve('ts-node',{paths:[api]})).register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const {ConfigService}=require(require.resolve('@nestjs/config',{paths:[api]})),{Logger}=require(require.resolve('@nestjs/common',{paths:[api]})),{Client}=require(require.resolve('pg',{paths:[api]})),{google}=require(require.resolve('googleapis',{paths:[api]}));Logger.overrideLogger(false);
const load=name=>require(path.join(api,'src/modules',name));
const {TokenCryptoService}=load('connector/token-crypto.service'),{GoogleDriveConnector}=load('connector/google-drive.connector'),{FfmpegService}=load('ffmpeg/ffmpeg.service'),{FfmpegPipelineService}=load('pipeline/ffmpeg-pipeline.service'),{WhisperTranscriptionService}=load('pipeline/whisper-transcription.service'),{BasetenAiProvider}=load('pipeline/providers/baseten-ai.provider');
process.env.HF_HUB_OFFLINE='1';process.env.WHISPER_CPU_THREADS='1';
const config=new ConfigService({...process.env,BASETEN_MEDIA_ENABLED:'true',BASETEN_MAX_MEDIA_REQUEST_BYTES:8388608,BASETEN_REQUEST_TIMEOUT_MS:120000});
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:4000}),media=new FfmpegPipelineService(new FfmpegService(),config),whisper=new WhisperTranscriptionService(config);
const scratchRoot=path.resolve('storage/scratch');fs.mkdirSync(scratchRoot,{recursive:true});const scratch=fs.mkdtempSync(path.join(scratchRoot,'drive-pilot-'));
const report={date:'2026-10-31',scope:'One explicitly selected Drive video; original quality; no database writes, indexing workers, polling or broad sync',status:'running',checks:{},limitations:['Real-media component preflight, not persisted indexing or a labelled accuracy evaluation.','No private filenames, IDs, observations or transcript text are stored in this evidence.']};
const evidence='docs/hackathon-evidence/2026-10-31-drive-media-preflight.json';
(async()=>{try{
  await db.connect();const accounts=await db.query("SELECT user_id,encrypted_tokens,selected_folders FROM connector_accounts WHERE id=$1 AND provider='google_drive'",[accountId]);assert.equal(accounts.rows.length,1,'Scoped account missing');
  const account=accounts.rows[0],drive=new GoogleDriveConnector(config),auth=drive.createAuthenticatedClient(new TokenCryptoService(config).decryptJson(account.encrypted_tokens));const remote=google.drive({version:'v3',auth});
  const get=async()=>(await remote.files.get({fileId,fields:'name,size,mimeType,md5Checksum,modifiedTime,parents,videoMediaMetadata(durationMillis)'},{timeout:20000})).data;
  const before=await get();assert(account.selected_folders.some(f=>before.parents?.includes(f.id)),'File outside selected folders');
  const bytes=Number(before.size),duration=Number(before.videoMediaMetadata?.durationMillis)/1000;assert(before.mimeType==='video/mp4'&&bytes>0&&bytes<=5*1024*1024&&duration>0&&duration<=60,'Pilot requires MP4 <=5 MiB and <=60 seconds');
  report.sourceBytes=bytes;report.durationSeconds=duration;
  const source=path.join(scratch,'source.mp4'),hash=createHash('md5');let downloaded=0;
  const response=await remote.files.get({fileId,alt:'media'},{responseType:'stream',timeout:60000});
  await pipeline(response.data,new Transform({transform(chunk,encoding,done){downloaded+=chunk.length;if(downloaded>bytes)return done(new Error('Source exceeds admitted byte count'));hash.update(chunk);done(null,chunk);}}),fs.createWriteStream(source));
  assert.equal(downloaded,bytes,'Incomplete source');const digest=hash.digest('hex');if(before.md5Checksum)assert.equal(digest,before.md5Checksum,'Checksum mismatch');
  const after=await get();assert.equal(after.modifiedTime,before.modifiedTime,'Source changed');assert.equal(after.size,before.size,'Source size changed');report.checks.sourceStable=true;
  const metadata=await media.probeMetadata(source);assert(Math.abs(metadata.duration-duration)<0.2,'Duration mismatch');
  let transcript=[];
  if(metadata.hasAudio){const audio=path.join(scratch,'speech.mp3');assert(await media.extractAudio(source,audio),'Audio extraction failed');const result=await whisper.transcribeAudio(audio);transcript=result.transcript;assert(result.transcript.every(c=>c.start_time>=0&&c.end_time<=metadata.duration+0.1),'Speech outside source bounds');report.audio={provider:result.usage.provider,model:result.usage.model,cues:result.transcript.length,durationMs:result.usage.durationMs};report.checks.audioProcessed=true;}else report.audio={hasAudio:false};
  const provider=new BasetenAiProvider(config,media,{getEmbeddingModel:()=> 'unused',generateEmbedding:()=>{throw Error('Excluded');}});const result=await provider.analyzeVideo(source);
  report.video={segments:result.analysis.segments.length,usage:result.usage};report.checks.videoProcessed=true;report.checks.visualDialogueEmpty=result.analysis.segments.every(s=>!s.dialogue);assert(report.checks.visualDialogueEmpty);
  if(process.argv.includes('--persist')){
    report.scope='One owner-scoped native-video/local-speech index; no queue workers, polling or broad sync';
    report.persistence=await require('./drive-pilot-persistence.cjs')({db,config,media,api,accountId,owner:account.user_id,fileId,metadata,remote:before,source,checksum:digest,analysis:result.analysis,transcript,usage:result.usage});
    report.limitations=['Persisted native-video/local-speech pilot, not normal queue ingestion or labelled accuracy evaluation.','No independent frame OCR was performed. Original-quality playback copy is retained in ignored storage.'];
  }
  report.status='passed';
}catch(error){report.status='failed';report.error=/HTTP \d+|budget|byte bound/.test(error.message)?error.message:'Scoped source, processing or validation failure; private details suppressed';process.exitCode=1;
}finally{fs.mkdirSync(path.dirname(evidence),{recursive:true});fs.writeFileSync(process.argv.includes('--persist')?evidence.replace('media-preflight','index-pilot'):evidence,JSON.stringify(report,null,2)+'\n');await whisper.onModuleDestroy();await db.end();assert.equal(path.dirname(path.resolve(scratch)),scratchRoot);assert(path.basename(scratch).startsWith('drive-pilot-'));fs.rmSync(scratch,{recursive:true,force:true});console.log(JSON.stringify(report));}})();
