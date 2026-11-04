// Explicit, ledger-guarded direct Meta pilot. Generated evidence only; no Drive access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
if(!process.argv.includes('--live')){console.log('No calls made. Use --live with an approved budget.');process.exit(0);}
const api=path.resolve('apps/api');
require(require.resolve('ts-node',{paths:[api]})).register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const {ConfigService}=require(require.resolve('@nestjs/config',{paths:[api]}));
require(require.resolve('@nestjs/common',{paths:[api]})).Logger.overrideLogger(false);
const {MetaAiProvider}=require(path.join(api,'src/modules/pipeline/providers/meta-ai.provider'));
const {FfmpegService}=require(path.join(api,'src/modules/ffmpeg/ffmpeg.service'));
const {FfmpegPipelineService}=require(path.join(api,'src/modules/pipeline/ffmpeg-pipeline.service'));
const config=new ConfigService({...process.env,META_REQUEST_TIMEOUT_MS:'60000'});
const media=new FfmpegPipelineService(new FfmpegService(),config);
const provider=new MetaAiProvider(config,media,{getEmbeddingModel:()=> 'unused',generateEmbedding:()=>{throw Error('Excluded');}});
fs.mkdirSync(path.resolve('.tmp'),{recursive:true});
const root=fs.mkdtempSync(path.join(path.resolve('.tmp'),'meta-pilot-'));
const binary=require(require.resolve('@ffmpeg-installer/ffmpeg',{paths:[api]})).path;
const ffmpeg=args=>execFileSync(binary,['-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,timeout:30000,stdio:'pipe'});
const report={date:new Date().toISOString(),provider:'meta',scope:'Generated text/video/silent audio; no personal media, indexing or workers',results:[],status:'running',limitations:['Not a real-footage accuracy or end-to-end browser evaluation.']};
const save=()=>fs.writeFileSync('docs/hackathon-evidence/2026-11-01-meta-live-pilot.json',JSON.stringify(report,null,2)+'\n');
(async()=>{try{
  const base={phase:'plan',history:[{role:'user',content:'Hi Brisky!'}],evidence:[],selectionNotes:[],searchStatus:'not_requested'};
  const greeting=await provider.spaceConversation(base);
  assert.equal(greeting.action,'reply');assert(greeting.text.trim());assert.equal(greeting.citedEvidenceIds.length,0);
  report.results.push({stage:'greeting',passed:true,text:greeting.text,usage:greeting.usage});save();
  const evidence={id:'e1',assetId:'generated-fixture',startS:0,endS:4,title:'Synthetic graphic',filename:'fixture.mp4',transcript:'',description:'A red rectangle changes to blue.',status:'indexed'};
  const grounded=await provider.spaceConversation({...base,phase:'answer',history:[{role:'user',content:'What happens in this selected moment?'}],evidence:[evidence],searchStatus:'complete'});
  assert(grounded.citedEvidenceIds.includes('e1'));assert(/red|blue/i.test(grounded.text));
  report.results.push({stage:'grounded_reply',passed:true,text:grounded.text,usage:grounded.usage});save();
  if(!process.argv.includes('--text-only')){
    const clip=path.join(root,'clip.mp4'),audio=path.join(root,'silence.mp3'),frame=path.join(root,'anchor.jpg');
    ffmpeg(['-f','lavfi','-i','color=c=red:s=320x180:r=10:d=2','-f','lavfi','-i','color=c=blue:s=320x180:r=10:d=2','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[out]','-map','[out]','-map','2:a','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',clip]);
    ffmpeg(['-i',clip,'-frames:v','1',frame]);
    ffmpeg(['-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','1','-c:a','libmp3lame',audio]);
    const visual=await provider.analyzeVideo(clip);
    assert(/red/i.test(JSON.stringify(visual.analysis))&&/blue/i.test(JSON.stringify(visual.analysis)));
    report.results.push({stage:'generated_video',passed:true,...visual});save();
    const speech=await provider.transcribeAudio(audio);assert.equal(speech.transcript.length,0);
    report.results.push({stage:'silence',passed:true,...speech});save();
    const context=await provider.verifyConversation({clipPath:clip,start:0,end:4,candidateStart:0,candidateEnd:4,hasAudio:true,
      anchors:['p','q'].map((personId,i)=>({personId,anchorId:personId,name:'Synthetic label '+i,frameTime:i,framePath:frame,start:0,end:4,box:[i*.5,0,.3,.4]})),
      cues:[{id:'c',start:0,end:1,text:'Synthetic untrusted cue'},{id:'d',start:2,end:3,text:'Another invented cue'}]});
    report.results.push({stage:'contextual_negative',passed:context.status!=='supported'&&context.status!=='error',assessment:context});save();
    assert(context.status!=='supported'&&context.status!=='error','Contextual negative check failed');
  }
  report.status='passed';save();console.log(JSON.stringify(report));
}catch(error){report.status='failed';report.error=/HTTP \d+|budget|bound|assert|check failed/i.test(error.message)?error.message:'Provider or validation failure; details suppressed';save();console.error(report.error);process.exitCode=1;
}finally{if(path.dirname(root)===path.resolve('.tmp')&&path.basename(root).startsWith('meta-pilot-'))fs.rmSync(root,{recursive:true,force:true});}})();
