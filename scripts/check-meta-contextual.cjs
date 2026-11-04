// Private, owner-reviewed real-media diagnostic. No network without --live and recorded approval.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const manifestPath=arg('--manifest');
if(!manifestPath){console.log('Usage: node --env-file=.env scripts/check-meta-contextual.cjs --manifest <private-review.json> [--live]');process.exit(0);}
const root=path.dirname(fs.realpathSync(manifestPath)),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const local=name=>{assert.equal(path.basename(name),name,'Evidence must be local to the review folder');const p=fs.realpathSync(path.join(root,name));assert.equal(path.dirname(p),root);return p;};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const clip=local('review.mp4'),frame=local('anchor.jpg'),transcript=JSON.parse(fs.readFileSync(local('transcript.private.json'),'utf8'));
const duration=manifest.sourceEnd-manifest.sourceStart;
assert(Number.isFinite(duration)&&duration>0&&duration<=20,'Review window must be bounded');
assert(Array.isArray(manifest.anchors)&&manifest.anchors.length===2,'Two owner-reviewed anchors required');
const cues=transcript.cues.filter(c=>c.start_time>=0&&c.end_time<=duration&&c.end_time>c.start_time&&c.text?.trim()).map((c,i)=>({id:'cue-'+i,start:c.start_time+manifest.sourceStart,end:c.end_time+manifest.sourceStart,text:c.text}));
assert(cues.length<=100,'Too many speech cues for bounded inspection');
const evidence={clipPath:clip,start:manifest.sourceStart,end:manifest.sourceEnd,candidateStart:manifest.sourceStart,candidateEnd:manifest.sourceEnd,hasAudio:true,
  anchors:manifest.anchors.map((a,i)=>({anchorId:'anchor-'+i,personId:'participant-'+i,name:'Participant '+(i+1),frameTime:manifest.anchorSourceTime,framePath:frame,start:manifest.sourceStart,end:manifest.sourceEnd,box:a.box})),cues};
const hashes={video:hash(clip),frame:hash(frame),transcript:hash(local('transcript.private.json'))};
if(!process.argv.includes('--live')){console.log(JSON.stringify({status:'prepared_only',duration,cues:cues.length,contextReady:cues.length>=2,egressApproved:manifest.egressApproved===true,hashes}));process.exit(0);}
assert(manifest.egressApproved===true&&manifest.approvedAt,'Explicit owner egress approval must be recorded before live use');
assert(['supported','not_supported','uncertain'].includes(manifest.expectedExchange),'Human exchange label required');
assert(manifest.approvedHashes&&Object.keys(hashes).every(k=>manifest.approvedHashes[k]===hashes[k]),'Reviewed evidence changed or approval hashes are missing');
const sourceDiagnostic=process.argv.includes('--source-diagnostic');
assert(sourceDiagnostic||manifest.appearanceRangesReviewed===true,'Owner must confirm the two participant anchors apply to this review range');
assert(sourceDiagnostic||cues.length>=2,'At least two complete speech cues required for contextual inference');
const api=path.resolve('apps/api');require(require.resolve('ts-node',{paths:[api]})).register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const {ConfigService}=require(require.resolve('@nestjs/config',{paths:[api]}));require(require.resolve('@nestjs/common',{paths:[api]})).Logger.overrideLogger(false);
const {MetaAiProvider}=require(path.join(api,'src/modules/pipeline/providers/meta-ai.provider'));
const {FfmpegService}=require(path.join(api,'src/modules/ffmpeg/ffmpeg.service'));
const {FfmpegPipelineService}=require(path.join(api,'src/modules/pipeline/ffmpeg-pipeline.service'));
const config=new ConfigService({...process.env,META_REQUEST_TIMEOUT_MS:'60000'});
const provider=new MetaAiProvider(config,new FfmpegPipelineService(new FfmpegService(),config), {getEmbeddingModel:()=> 'unused',generateEmbedding:()=>{throw Error('Excluded');}});
(async()=>{
  if(sourceDiagnostic){
    // This is a separate source-understanding check, not a grounded conversation verdict.
    const result=await provider.analyzeVideo(clip);
    fs.writeFileSync(path.join(root,'source-assessment.private.json'),JSON.stringify({hashes,result},null,2)+'\n');
    const report={date:new Date().toISOString(),provider:'meta',stage:'real_source_diagnostic',humanExchangeLabel:manifest.expectedExchange,
      contextualStatus:cues.length<2?'insufficient_evidence':'not_run',reason:'Source analysis does not establish grounded reciprocal participant turns',
      localCueCount:cues.length,segments:result.analysis.segments.length,usage:result.usage,hashes,
      limitations:['One owner-reviewed negative excerpt; positive conversation accuracy remains unverified.','Source analysis is separate from the contextual verifier; no identity tags are written.']};
    fs.writeFileSync(path.join(root,'result-summary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));return;
  }
  const assessment=await provider.verifyConversation(evidence);
  // Model explanations may contain private transcript content: retain only inside the ignored review folder.
  fs.writeFileSync(path.join(root,'assessment.private.json'),JSON.stringify({hashes,expected:manifest.expectedExchange,assessment},null,2)+'\n');
  const report={date:new Date().toISOString(),provider:'meta',stage:'real_contextual_diagnostic',status:assessment.status,expected:manifest.expectedExchange,
    agreement:assessment.status===manifest.expectedExchange,scope:assessment.scope,turnCount:assessment.turns.length,usage:assessment.usage,hashes,
    limitations:['Single owner-reviewed development excerpt; not an accuracy benchmark.','Direct adapter diagnostic; does not test database search, sessions or browser playback.','No identities are confirmed or written.']};
  fs.writeFileSync(path.join(root,'result-summary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  if(assessment.status==='error')process.exitCode=1;
})().catch(()=>{console.error('Contextual diagnostic failed; private details suppressed.');process.exitCode=1;});
