// Explicit paid smoke check: node --env-file=.env scripts/check-baseten-media.cjs --live
// Two serial, ledger-guarded requests using generated video and silence; no Drive access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
if(!process.argv.includes('--live')){console.log('No calls made. Use --live with an authorized budget and root environment.');process.exit(0);}
const api=path.resolve('apps/api');
require(require.resolve('ts-node',{paths:[api]})).register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const {ConfigService}=require(require.resolve('@nestjs/config',{paths:[api]}));
const {Logger}=require(require.resolve('@nestjs/common',{paths:[api]}));Logger.overrideLogger(false);
const {FfmpegService}=require(path.join(api,'src/modules/ffmpeg/ffmpeg.service'));
const {FfmpegPipelineService}=require(path.join(api,'src/modules/pipeline/ffmpeg-pipeline.service'));
const {BasetenAiProvider,BASETEN_HACKATHON_MODEL:model}=require(path.join(api,'src/modules/pipeline/providers/baseten-ai.provider'));
const binary=require(require.resolve('@ffmpeg-installer/ffmpeg',{paths:[api]})).path;
const config=new ConfigService({...process.env,BASETEN_MEDIA_ENABLED:'true',BASETEN_MAX_REQUEST_BYTES:'131072',BASETEN_REQUEST_TIMEOUT_MS:'45000'});
const media=new FfmpegPipelineService(new FfmpegService(),config);
const provider=new BasetenAiProvider(config,media,{getEmbeddingModel:()=> 'unused',generateEmbedding:()=>{throw Error('Excluded');}});
const root=path.resolve('.tmp/baseten-media-preflight');fs.mkdirSync(root,{recursive:true});
const video=path.join(root,'red-then-blue.mp4'),audio=path.join(root,'silence.mp3');
const ffmpeg=args=>execFileSync(binary,['-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,timeout:30000,stdio:'pipe'});
(async()=>{
  ffmpeg(['-f','lavfi','-i','color=c=red:s=320x180:r=10:d=2','-f','lavfi','-i','color=c=blue:s=320x180:r=10:d=2','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[out]','-map','[out]','-c:v','libx264','-pix_fmt','yuv420p',video]);
  ffmpeg(['-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','1','-c:a','libmp3lame','-b:a','24k',audio]);
  const results=[];const report={date:new Date().toISOString().slice(0,10),provider:'baseten',model,scope:'Generated four-second red-then-blue visual video and silent audio; no personal footage, workers or Drive sync',results,status:'running',limitations:['Synthetic smoke checks only; no real speech, personal video or retrieval accuracy evaluation.','Direct Meta transport remains offline-tested only.']};
  const save=()=>{fs.mkdirSync('docs/hackathon-evidence',{recursive:true});fs.writeFileSync('docs/hackathon-evidence/2026-10-31-baseten-'+(process.argv.includes('--audio-only')?'audio':'media')+'-preflight.json',JSON.stringify(report,null,2)+'\n');};
  try{
    if(!process.argv.includes('--audio-only')){
    const visual=await provider.analyzeVideo(video);
    const checks={completeRange:visual.analysis.segments[0].start_time===0&&Math.abs(visual.analysis.segments.at(-1).end_time-4)<0.05,noInventedDialogue:visual.analysis.segments.every(s=>!s.dialogue),mentionsBothColors:/red/i.test(JSON.stringify(visual.analysis))&&/blue/i.test(JSON.stringify(visual.analysis)),provider:visual.usage.provider==='baseten'};
    results.push({stage:'video',checks,...visual});save();assert(Object.values(checks).every(Boolean),'Video assertions failed');
    }
    if(!process.argv.includes('--video-only')){
      const speech=await provider.transcribeAudio(audio);results.push({stage:'silent_audio',checks:{noInventedSpeech:speech.transcript.length===0,provider:speech.usage.provider==='baseten'},...speech});save();assert.equal(speech.transcript.length,0,'Silence must not produce invented speech');
    }else report.limitations.push('Remote audio check explicitly omitted from this run.');
    report.status='passed';save();console.log(JSON.stringify({status:report.status,results:results.map(r=>({stage:r.stage,checks:r.checks,usage:r.usage}))}));
  }catch(error){report.status='failed';report.error=/HTTP \d+|budget|byte bound|assertion|Silence/i.test(error.message)?error.message:'Provider or validation failure; details suppressed';save();throw new Error(report.error);}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
