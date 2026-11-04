"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useSpaces} from '@/lib/spaces-context';
import {spaceRequestId,spacesFetch} from '@/lib/spaces-client';
import type {SpaceDetail,SpaceCitation} from '@/lib/spaces-types';
import {useBrowserPreferences} from '@/lib/browser-preferences';
import {acknowledgementPath,acknowledgementOrder,shouldAcknowledgeVoice} from '@/lib/voice-acknowledgements';
import {StreamingSpeechPlayer} from '@/lib/streaming-speech';
import {endsVoiceSession} from '@/lib/brisky-voices';
import {VoiceModeModal} from './VoiceModeModal';
import {ImmersiveVoiceOverlay} from './ImmersiveVoiceOverlay';
import {LiveVoiceConversation} from './LiveVoiceConversation';

type Phase='ready'|'permission'|'recording'|'transcribing'|'review'|'answering'|'synthesizing'|'speaking';
type Pending={spaceId:string|null;spaceRequestId:string;messageId:string;content:string;sent:boolean};
async function voiceFetch(action:string,value:unknown,signal:AbortSignal){const response=await fetch('/api/voice/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal});if(!response.ok){let message='Voice could not finish. Please retry.';try{message=(await response.json()).error||message;}catch{}throw Error(message);}return response;}
function encoded(blob:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('The recording could not be read.'));reader.readAsDataURL(blob);});}

/** One persistent controller survives the first voice-created Space navigation. */
export function VoiceConversation(){
  const {voiceOpen,setVoiceOpen}=useSpaces();
  const [mode,setMode]=useState<'live'|'turn-based'|'meta-mms'|null>(null),[configurationError,setConfigurationError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{const abort=new AbortController();void fetch('/api/voice/config',{signal:abort.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(!['live','turn-based','meta-mms'].includes(value.mode))throw Error();setMode(value.mode);setConfigurationError(false);}).catch(()=>{if(!abort.signal.aborted)setConfigurationError(true);});return()=>abort.abort();},[retry]);
  if(!mode)return configurationError?<ImmersiveVoiceOverlay open={voiceOpen} onClose={()=>setVoiceOpen(false)} status="Paused" error="The voice connection could not be checked." active={false} muted={false} onMicToggle={()=>setRetry(value=>value+1)}/>:null;
  return mode==='live'||mode==='meta-mms'?<LiveVoiceConversation/>:<TurnBasedVoiceConversation/>;
}
function TurnBasedVoiceConversation(){
  const {voiceOpen:open,setVoiceOpen:setOpen,activeSpaceId,createSpace,refreshSpaces}=useSpaces(),{preferences}=useBrowserPreferences();
  const [phase,setPhase]=useState<Phase>('ready'),[draft,setDraft]=useState(''),[error,setError]=useState(''),[,setSeconds]=useState(0),[,setSubmitted]=useState(false),[style]=useState('natural'),[inCall,setInCall]=useState(false),[muted,setMuted]=useState(false);
  const [reply,setReply]=useState<{id:string;spaceId:string;text:string;heard:string;citations:SpaceCitation[]}|null>(null);
  const capture=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timeout=useRef<ReturnType<typeof setTimeout>|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null),request=useRef<AbortController|null>(null),audio=useRef<HTMLAudioElement|StreamingSpeechPlayer|null>(null),audioUrl=useRef<string|null>(null),playbackContext=useRef<AudioContext|null>(null),pending=useRef<Pending|null>(null),generation=useRef(0),busy=useRef(false),ending=useRef(false),speechRetry=useRef(false),acknowledgement=useRef<HTMLAudioElement|null>(null),activeAcknowledgement=useRef<HTMLAudioElement|null>(null),prepareAcknowledgement=useRef<()=>void>(()=>{}),ackOrder=useRef<number[]>([]),lastAck=useRef(-1);
  const detector=useRef<AudioContext|null>(null),silenceTimer=useRef<ReturnType<typeof setInterval>|null>(null),resume=useRef<()=>void>(()=>{}),interrupt=useRef<(device:MediaStream)=>void>(()=>{});
  const releaseMic=useCallback(()=>{if(silenceTimer.current)clearInterval(silenceTimer.current);silenceTimer.current=null;void detector.current?.close();detector.current=null;if(timeout.current)clearTimeout(timeout.current);if(timer.current)clearInterval(timer.current);timeout.current=null;timer.current=null;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;},[]);
  const clean=useCallback(()=>{generation.current++;request.current?.abort();acknowledgement.current?.pause();activeAcknowledgement.current?.pause();if(capture.current){capture.current.onstop=null;if(capture.current.state!=='inactive')capture.current.stop();capture.current=null;}releaseMic();audio.current?.pause();audio.current=null;void playbackContext.current?.close().catch(()=>{});playbackContext.current=null;if(audioUrl.current)URL.revokeObjectURL(audioUrl.current);audioUrl.current=null;busy.current=false;},[releaseMic]);
  const close=useCallback(()=>{ending.current=false;clean();setOpen(false);setInCall(false);setMuted(false);setPhase('ready');},[clean,setOpen]);
  useEffect(()=>()=>clean(),[clean]);
  useEffect(()=>{
    if(!open)return;let disposed=false;const players=new Set<HTMLAudioElement>();
    function prepare(){
      if(disposed)return;if(!ackOrder.current.length){ackOrder.current=acknowledgementOrder();if(ackOrder.current.at(-1)===lastAck.current)[ackOrder.current[0],ackOrder.current[ackOrder.current.length-1]]=[ackOrder.current[ackOrder.current.length-1],ackOrder.current[0]];}
      const index=ackOrder.current.pop()!;lastAck.current=index;
      const player=new Audio(acknowledgementPath(preferences.briskyVoice,index));players.add(player);player.preload='auto';player.playbackRate=preferences.speechRate;player.load?.();acknowledgement.current=player;
      player.onended=()=>{players.delete(player);if(activeAcknowledgement.current===player)activeAcknowledgement.current=null;};
    }
    prepareAcknowledgement.current=prepare;prepare();return()=>{disposed=true;prepareAcknowledgement.current=()=>{};for(const player of players){player.onended=null;player.pause();}acknowledgement.current=null;};
  },[open,preferences.briskyVoice,preferences.speechRate]);

  function acknowledge(){const player=acknowledgement.current;if(!player)return;activeAcknowledgement.current?.pause();activeAcknowledgement.current=player;player.currentTime=0;void player.play().catch(()=>{});prepareAcknowledgement.current();}

  async function transcribe(blob:Blob,mimeType:string,token:number){if(blob.size>2*1024*1024){setError('The recording is too large. Try a shorter message.');setPhase('ready');busy.current=false;return;}setPhase('transcribing');request.current=new AbortController();try{const response=await voiceFetch('transcribe',{audio:await encoded(blob),mimeType},request.current.signal),result=await response.json();if(token!==generation.current)return;if(!result.speechDetected||!result.text){setError('I couldn’t hear clear speech. Please try speaking again.');setPhase('ready');return;}ending.current=endsVoiceSession(result.text);if(shouldAcknowledgeVoice(result.text))acknowledge();setDraft(result.text);busy.current=false;await send(result.text);}catch(e){if(token===generation.current){setError(e instanceof Error?e.message:'Transcription failed.');setPhase('ready');}}finally{if(token===generation.current)busy.current=false;}}
  async function record(existingDevice?:MediaStream){if(busy.current){existingDevice?.getTracks().forEach(t=>t.stop());return;}audio.current?.pause();acknowledgement.current?.pause();activeAcknowledgement.current?.pause();speechRetry.current=false;setError('');setPhase('permission');busy.current=true;const token=++generation.current;
    try{if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Microphone recording needs HTTPS or localhost and a supported browser. Please use a supported browser.');const device=existingDevice??await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});if(token!==generation.current){device.getTracks().forEach(t=>t.stop());return;}stream.current=device;
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type)),recorder=new MediaRecorder(device,mime?{mimeType:mime}:undefined);capture.current=recorder;const chunks:Blob[]=[];let size=0;recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>2*1024*1024&&recorder.state==='recording')recorder.stop();}};recorder.onerror=()=>{recorder.onstop=null;capture.current=null;if(recorder.state==='recording')recorder.stop();releaseMic();if(token===generation.current){setError('Recording stopped unexpectedly. Please try again.');setPhase('ready');busy.current=false;}};recorder.onstop=()=>{releaseMic();capture.current=null;if(token!==generation.current)return;void transcribe(new Blob(chunks,{type:recorder.mimeType}),recorder.mimeType.split(';')[0],token);};recorder.start(250);
      // End a turn after speech followed by silence; never upload a silent open mic.
      const context=new AudioContext();detector.current=context;const analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(device).connect(analyser);const samples=new Float32Array(analyser.fftSize);let heard=false,lastSpeech=Date.now();const started=Date.now();
      silenceTimer.current=setInterval(()=>{analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);if(rms>.01){heard=true;lastSpeech=Date.now();}if(heard&&Date.now()-lastSpeech>2800&&Date.now()-started>3000&&recorder.state==='recording')recorder.stop();},100);
      setSeconds(0);setPhase('recording');timer.current=setInterval(()=>setSeconds(s=>s+1),1000);timeout.current=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},60000);
    }catch(e){if(capture.current){capture.current.onstop=null;if(capture.current.state==='recording')capture.current.stop();capture.current=null;}releaseMic();if(token!==generation.current)return;const denied=e instanceof DOMException&&e.name==='NotAllowedError';setError(denied?'Microphone access was blocked. Allow it in your browser to continue.':e instanceof Error?e.message:'The microphone could not start.');setPhase('ready');busy.current=false;}
  }
  async function speak(messageId:string,token=generation.current){acknowledgement.current?.pause();activeAcknowledgement.current?.pause();window.dispatchEvent(new Event('brisky-stop-speech'));speechRetry.current=false;setPhase('synthesizing');request.current=new AbortController();try{const response=await voiceFetch(typeof AudioContext==='undefined'?'speak':'stream',{messageId,style,voice:preferences.briskyVoice},request.current.signal);if(token!==generation.current){void response.body?.cancel();return;}if(response.headers.get('content-type')?.includes('application/x-ndjson')){const player=new StreamingSpeechPlayer(playbackContext.current||undefined);audio.current=player;await player.play(response,{signal:request.current.signal,rate:preferences.speechRate,onStart:()=>{if(token===generation.current)setPhase('speaking');}});if(token===generation.current){if(ending.current)close();else setPhase('ready');}return;}const blob=await response.blob();if(token!==generation.current)return;if(audioUrl.current)URL.revokeObjectURL(audioUrl.current);audioUrl.current=URL.createObjectURL(blob);const player=new Audio(audioUrl.current);audio.current=player;player.playbackRate=preferences.speechRate;player.onended=()=>{if(token===generation.current){if(ending.current)close();else setPhase('ready');}};player.onerror=()=>{if(token===generation.current){setPhase('ready');speechRetry.current=true;setError('Audio could not play. Your reply is saved; tap the microphone to retry.');}};await player.play();if(token===generation.current)setPhase('speaking');}catch(e){if(token===generation.current){setPhase('ready');speechRetry.current=true;setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Your browser needs a tap to start audio.':e instanceof Error?e.message:'Speech could not play. Your text reply is saved.');}}}
  async function send(spoken?:string){const text=(spoken??draft).trim();if(!text||busy.current)return;if(pending.current&&pending.current.content!==text){setError('Retry the saved message before starting another turn.');return;}busy.current=true;setError('');setPhase('answering');audio.current?.pause();const token=++generation.current;
    try{const item=pending.current||{spaceId:activeSpaceId,spaceRequestId:spaceRequestId(),messageId:spaceRequestId(),content:text,sent:false};pending.current=item;
      if(!item.spaceId){const space=await createSpace(item.content,item.spaceRequestId,{autoReply:false});item.spaceId=space.id;const detail=await spacesFetch<SpaceDetail>(`/${space.id}`);item.messageId=detail.messages[0].id;item.sent=true;}
      else if(!item.sent){await spacesFetch(`/${item.spaceId}/messages`,'POST',{id:item.messageId,content:item.content});item.sent=true;}
      if(token===generation.current)setSubmitted(true);const result=await spacesFetch<{messageId:string}>(`/${item.spaceId}/reply`,'POST',{messageId:item.messageId}),detail=await spacesFetch<SpaceDetail>(`/${item.spaceId}`),message=detail.messages.find(m=>m.id===result.messageId&&m.role==='assistant');if(!message)throw Error('The saved reply is not ready. Please retry.');
      window.dispatchEvent(new CustomEvent('brisky-space-updated',{detail:{spaceId:item.spaceId}}));void refreshSpaces();pending.current=null;if(token!==generation.current)return;setSubmitted(false);setReply({id:message.id,spaceId:item.spaceId,text:message.content,heard:item.content,citations:message.citations||[]});setDraft('');await speak(message.id,token);
    }catch(e){if(token===generation.current){setSubmitted(!!pending.current?.sent);setError(e instanceof Error?e.message:'Brisky could not finish. Retry uses the same saved message.');setPhase('review');}}finally{if(token===generation.current)busy.current=false;}
  }
  // Watch echo-cancelled microphone input during playback. No audio is uploaded
  // until sustained near-end speech stops the reply and starts a fresh recording.
  interrupt.current=(device)=>{audio.current?.pause();busy.current=false;void record(device);};
  useEffect(()=>{
    if(!open||!inCall||muted||ending.current||phase!=='speaking')return;
    let disposed=false,device:MediaStream|null=null,context:AudioContext|null=null,interval:ReturnType<typeof setInterval>|null=null;
    const token=generation.current;
    const dispose=(stopTracks=true)=>{disposed=true;if(interval)clearInterval(interval);interval=null;void context?.close().catch(()=>{});context=null;if(stopTracks)device?.getTracks().forEach(track=>track.stop());device=null;};
    void (async()=>{try{
      const input=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(disposed||token!==generation.current){input.getTracks().forEach(track=>track.stop());return;}
      device=input;context=new AudioContext();await context.resume();if(disposed)return;
      const analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(input).connect(analyser);
      const samples=new Float32Array(analyser.fftSize);const started=Date.now();let aboveSince=0,noise=.008;
      interval=setInterval(()=>{if(disposed||token!==generation.current){dispose();return;}analyser.getFloatTimeDomainData(samples);
        const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);
        // Brief settling window and an adaptive floor suppress playback leakage.
        if(Date.now()-started<350){noise=Math.min(.035,noise*.85+rms*.15);return;}
        const threshold=Math.max(.035,noise*3);
        if(rms>threshold){if(!aboveSince)aboveSince=Date.now();if(Date.now()-aboveSince>=200){const transferred=device!;dispose(false);interrupt.current(transferred);}}
        else{aboveSince=0;noise=Math.min(.035,noise*.98+rms*.02);}
      },50);
    }catch{dispose();/* Playback continues; the microphone button remains a fallback. */}})();
    return()=>dispose();
  },[open,inCall,muted,phase]);
  resume.current=()=>{if(!busy.current)void record();};
  useEffect(()=>{if(!open||!inCall||muted||error||phase!=='ready')return;const id=setTimeout(()=>resume.current(),250);return()=>clearTimeout(id);},[open,inCall,muted,error,phase]);
  const label={ready:muted?'Paused':'Connecting',permission:'Connecting',recording:'Listening',transcribing:'Thinking',review:'Paused',answering:'Thinking',synthesizing:'Thinking',speaking:'Speaking'}[phase];
  function primeSpeech(){if(typeof AudioContext!=='undefined'){playbackContext.current??=new AudioContext();void playbackContext.current.resume().catch(()=>{});}}
  function toggleMic(){primeSpeech();if(error){setError('');if(pending.current){void send();return;}if(reply&&speechRetry.current){void speak(reply.id);return;}setMuted(false);setPhase('ready');return;}if(phase==='recording'){clean();setMuted(true);setPhase('ready');}else if(phase==='speaking'){clean();primeSpeech();setMuted(false);setPhase('ready');}else if(phase==='ready'){setMuted(value=>!value);}}
  return <><VoiceModeModal open={open&&!inCall} onClose={close} onStartVoice={()=>{primeSpeech();setError('');setInCall(true);setPhase('ready');}}/><ImmersiveVoiceOverlay open={open&&inCall} onClose={close} status={label} error={error} active={phase==='recording'||phase==='speaking'} muted={muted} onMicToggle={toggleMic}/></>;
}
