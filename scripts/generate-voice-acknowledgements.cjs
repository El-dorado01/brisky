// Optional maintenance only: shipped generic audio works without running this script.
const fs=require('fs'),path=require('path');process.chdir(path.resolve(__dirname,'..'));
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const ts=require('../apps/web/node_modules/typescript'),mod={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('apps/web/lib/voice-acknowledgements.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports,mod);
const samples=mod.exports.voiceAcknowledgements,allowed=['Kore','Puck','Charon','Aoede','Zephyr','Sulafat'],voice=option('--voice'),voices=voice?[voice]:allowed;
if(voices.some(v=>!allowed.includes(v)))throw Error('Choose an available Brisky voice');
const maximum=Number(option('--max-calls')||8);if(!Number.isSafeInteger(maximum)||maximum<1||maximum>20)throw Error('--max-calls must be 1-20');
const dir=path.resolve('apps/web/public/audio/brisky'),missing=[];for(const v of voices)for(let i=0;i<samples.length;i++){const file=path.join(dir,v+'-ack'+(i?'-'+i:'')+'.wav');if(!fs.existsSync(file))missing.push({voice:v,index:i,file});}
console.log(JSON.stringify({voices:voices.length,variants:samples.length,missing:missing.length,mode:args.includes('--generate')?'bounded-generation':'dry-run',maxCalls:maximum}));
if(!args.includes('--generate')||!missing.length)process.exit(0);
const {VoiceService}=require('../apps/api/dist/modules/conversation/voice.service'),{ConfigService}=require('../apps/api/node_modules/@nestjs/config');
const model=option('--model')||process.env.VOICE_TTS_MODEL||'gemini-3.8-flash-tts';if(!/^gemini-[a-z0-9.-]+-tts$/.test(model))throw Error('Choose a Gemini TTS model');
let text='';const service=new VoiceService(new ConfigService({...process.env,VOICE_TTS_MODEL:model,VOICE_TTS_FALLBACK_MODEL:'',VOICE_CACHE_DIR:'.tmp/voice-ack-cache'}),{query:async()=>({rows:[{content:text}]})});
(async()=>{fs.mkdirSync(dir,{recursive:true});let started=0,completed=0;for(const job of missing.slice(0,maximum)){await new Promise(r=>setTimeout(r,Math.max(0,started+8000-Date.now())));started=Date.now();text=samples[job.index];const bytes=await service.speak('public-brisky-ack-'+job.voice,{messageId:'11111111-1111-4111-8111-111111111111',style:'natural',voice:job.voice});fs.writeFileSync(job.file,bytes);completed++;console.log(JSON.stringify({voice:job.voice,index:job.index,model,completed}));}console.log(JSON.stringify({complete:true,remaining:missing.length-completed}));})().catch(e=>{console.error('Generation stopped: '+e.message);process.exitCode=1});
