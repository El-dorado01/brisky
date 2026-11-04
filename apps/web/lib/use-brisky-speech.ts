"use client";
import {useEffect,useRef,useState} from 'react';
import {StreamingSpeechPlayer} from './streaming-speech';
import {useBrowserPreferences} from './browser-preferences';
export function useBriskySpeech(){
  const {preferences}=useBrowserPreferences();const [state,setState]=useState<'idle'|'loading'|'playing'>('idle'),[error,setError]=useState('');
  const player=useRef<HTMLAudioElement|StreamingSpeechPlayer|null>(null),url=useRef<string|null>(null),request=useRef<AbortController|null>(null),generation=useRef(0);
  function stop(){generation.current++;request.current?.abort();request.current=null;if(player.current){if(player.current instanceof HTMLAudioElement){player.current.onended=null;player.current.onerror=null;}player.current.pause();player.current=null;}if(url.current)URL.revokeObjectURL(url.current);url.current=null;setState('idle');}
  useEffect(()=>{const version=generation;const halt=()=>stop();window.addEventListener('brisky-stop-speech',halt);return()=>{window.removeEventListener('brisky-stop-speech',halt);version.current++;request.current?.abort();player.current?.pause();if(url.current)URL.revokeObjectURL(url.current);};},[]);
  async function play(action:'speak'|'preview',input:Record<string,unknown>){
    window.dispatchEvent(new Event('brisky-stop-speech'));const token=++generation.current;request.current=new AbortController();setError('');setState('loading');
    try{const pendingPlayer=action==='speak'&&typeof AudioContext!=='undefined'?new StreamingSpeechPlayer():null;if(pendingPlayer){player.current=pendingPlayer;pendingPlayer.prime();}const response=await fetch('/api/voice/'+(action==='speak'&&typeof AudioContext!=='undefined'?'stream':action),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice:preferences.briskyVoice,...input}),signal:request.current.signal});if(!response.ok){let message='Brisky could not speak right now.';try{message=(await response.json()).error||message;}catch{}throw Error(message);}if(token!==generation.current){void response.body?.cancel();return;}if(response.headers.get('content-type')?.includes('application/x-ndjson')){const audio=pendingPlayer||new StreamingSpeechPlayer();player.current=audio;await audio.play(response,{signal:request.current.signal,rate:preferences.speechRate,onStart:()=>{if(token===generation.current)setState('playing');}});if(token===generation.current)stop();return;}pendingPlayer?.pause();const blob=await response.blob();if(token!==generation.current)return;url.current=URL.createObjectURL(blob);const audio=new Audio(url.current);player.current=audio;audio.playbackRate=preferences.speechRate;audio.onended=()=>{if(token===generation.current){stop();}};audio.onerror=()=>{if(token===generation.current){stop();setError('Audio could not play. Please try again.');}};await audio.play();if(token===generation.current)setState('playing');
    }catch(e){if(token!==generation.current)return;stop();setError(e instanceof Error?e.message:'Speech could not start.');}
  }
  return {state,error,play,stop};
}
