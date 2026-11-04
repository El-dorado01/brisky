"use client";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

import { useCallback,useEffect,useRef,useState } from 'react';
import { Play } from '@/components/animate-ui/icons/hugeicons/play';
import { FactoryLoading as LoaderCircle } from '@/components/connectors/FactoryIcons';
import type { SavedMoment } from '@/lib/spaces-types';
import { MomentThumbnail,momentThumbnailUrl } from './MomentThumbnail';
import { TagPerson,type TagFrame } from '@/components/entities/TagPerson';

/** Original-source playback with a cited-range starting point and playback boundary. */
export function SourcePreview({spaceId,moment,autoPlay=false}:{spaceId:string;moment:SavedMoment;autoPlay?:boolean}){
  const [state,setState]=useState<'idle'|'loading'|'ready'|'error'>(autoPlay?'loading':'idle');
  const [message,setMessage]=useState(''),[fullVideo,setFullVideo]=useState(false),[duration,setDuration]=useState(moment.endS);
  const video=useRef<HTMLVideoElement>(null);
  const [frame,setFrame]=useState<TagFrame|null>(null);
  function tag(){
    const element=video.current;if(!element||element.readyState<2)return;
    element.pause();
    if(!fullVideo&&element.currentTime>=moment.endS){setMessage('Seek to a frame inside this moment before tagging.');return;}
    try{const canvas=document.createElement('canvas');canvas.width=element.videoWidth;canvas.height=element.videoHeight;canvas.getContext('2d')!.drawImage(element,0,0);setFrame({image:canvas.toDataURL('image/jpeg',.85),time:element.currentTime});setMessage('');}catch{setMessage('Unable to capture this frame. Please reload the preview and retry.');}
  }
  async function chooseFrame(time:number){
    const element=video.current;if(!element)throw new Error('Reload the preview to choose a frame.');
    element.pause();
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>finish(new Error('The frame could not load. Try again.')),15000);
      const finish=(error?:Error)=>{clearTimeout(timer);element.removeEventListener('seeked',done);element.removeEventListener('error',failed);if(error)reject(error);else resolve();};
      const done=()=>finish(),failed=()=>finish(new Error('Unable to load this frame.'));
      element.addEventListener('seeked',done,{once:true});element.addEventListener('error',failed,{once:true});
      if(Math.abs(element.currentTime-time)<.001&&element.readyState>=2)finish();else element.currentTime=time;
    });
    const canvas=document.createElement('canvas');canvas.width=element.videoWidth;canvas.height=element.videoHeight;
    canvas.getContext('2d')!.drawImage(element,0,0);
    setFrame({image:canvas.toDataURL('image/jpeg',.85),time:element.currentTime});
  }
  const source=`/api/spaces/${encodeURIComponent(spaceId)}/moments/${encodeURIComponent(moment.id)}/playback`;
  const prepare=useCallback(async()=>{
    try{
      const response=await fetch(source,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(25000)});
      if(response.status===202)throw new Error('This source is unavailable for playback. Check that the original is still accessible, then try again.');
      if(!response.ok)throw new Error(response.status===401?'Sign in again to play this source.':'This source is unavailable right now.');
      setState('ready');
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to load this source.');setState('error');}
  },[source]);
  useEffect(()=>{if(!autoPlay)return;const frame=requestAnimationFrame(()=>void prepare());return()=>cancelAnimationFrame(frame);},[autoPlay,prepare]);
  function clamp(element:HTMLVideoElement){
    if(fullVideo)return;
    const end=Math.min(moment.endS,element.duration||moment.endS);
    if(element.currentTime<moment.startS-0.05)element.currentTime=moment.startS;
    else if(element.currentTime>=end){element.pause();if(element.currentTime>end+0.01)element.currentTime=Math.max(moment.startS,end);}
  }
  return <><div className="relative flex aspect-video w-full items-center justify-center overflow-hidden border-b border-brand-line bg-brand-canvas">
    {state==='ready'?<video ref={video} src={source} poster={momentThumbnailUrl(spaceId,moment.id)} controls playsInline preload="metadata" aria-label={`Source preview: ${moment.title||moment.filename}`}
      tabIndex={-1} className="h-full w-full bg-black object-contain focus-visible:outline-2 focus-visible:outline-brand-violet"
      onLoadedMetadata={event=>{const element=event.currentTarget;if(element.duration<=moment.startS){setMessage('The saved range is outside this source.');setState('error');return;}setDuration(element.duration);element.currentTime=moment.startS;if(autoPlay){element.focus({preventScroll:true});const scroller=element.closest<HTMLElement>('[data-moments-content]');const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';if(scroller)scroller.scrollTo({top:scroller.scrollTop+element.getBoundingClientRect().top-scroller.getBoundingClientRect().top-12,behavior});else element.scrollIntoView({block:'center',behavior});}void element.play().catch(()=>{setMessage('Your moment is ready. Press play to begin.');});}}
      onTimeUpdate={event=>clamp(event.currentTarget)} onSeeked={event=>clamp(event.currentTarget)}
      onPlay={event=>{if(!fullVideo&&event.currentTarget.currentTime>=moment.endS-0.05)event.currentTarget.currentTime=moment.startS;}}
      onError={()=>{setMessage('This source could not be played. Try again or check its availability.');setState('error');}}
    />:<><MomentThumbnail spaceId={spaceId} momentId={moment.id} label={moment.title||moment.filename}/><div className="relative z-10 flex max-w-sm flex-col items-center gap-3 rounded-xl bg-brand-surface/90 p-4 text-center">
      <AnimateIcon animateOnHover asChild><button type="button" disabled={state==='loading'} onClick={()=>{setState('loading');setMessage('');void prepare();}} aria-label={`Play ${moment.title||moment.filename}`}
        className="grid size-11 place-items-center rounded-full bg-brand-action text-white shadow-lg disabled:opacity-60">
        {state==='loading'?<LoaderCircle size={20} className="animate-spin motion-reduce:animate-none"/>:<Play size={20}/>}
      </button></AnimateIcon>
      <p role="status" className="text-xs text-brand-muted">{message||(state==='loading'?'Loading source…':'Play selected source range')}</p>
      {state==='error'&&<button type="button" onClick={()=>{setState('loading');setMessage('');void prepare();}} className="text-xs font-semibold text-brand-violet">Retry preview</button>}
    </div></>}
  </div>{state==='ready'&&<div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-line bg-brand-surface px-4 py-3"><span role="status" className="text-xs text-brand-muted">{message||(fullVideo?'Playing the full original video.':'Playing the saved moment. Switch to Full video to explore beyond it.')}</span><div className="flex flex-wrap items-center gap-2"><button type="button" aria-pressed={fullVideo} onClick={()=>{const next=!fullVideo;setFullVideo(next);setMessage('');if(!next&&video.current&&(video.current.currentTime<moment.startS||video.current.currentTime>=moment.endS))video.current.currentTime=moment.startS;}} className="min-h-10 rounded-xl border border-brand-line px-3 py-2 text-sm font-medium transition hover:bg-brand-violet/5">{fullVideo?'Back to moment':'Full video'}</button><button type="button" onClick={tag} className="rounded-xl bg-brand-violet/10 px-3 py-2 text-sm font-semibold text-brand-violet">Tag a person</button></div></div>}{frame&&<TagPerson frame={frame} assetId={moment.assetId} startS={fullVideo?0:moment.startS} endS={fullVideo?duration:moment.endS} onChooseFrame={chooseFrame} onClose={()=>setFrame(null)}/>}</>;
}

