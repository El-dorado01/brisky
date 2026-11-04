"use client";

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { useBrowserPreferences } from '@/lib/browser-preferences';
import type { BriskyPose } from '@/components/mascot/BriskyCompanion';

const BriskyCompanion=dynamic(()=>import('@/components/mascot/BriskyCompanion').then(m=>m.BriskyCompanion),{ssr:false,loading:()=> <span className="grid size-full place-items-center text-xl text-brand-violet [font-family:var(--font-logo),sans-serif]">b.</span>});
const subscribeMotion=(callback:()=>void)=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);};
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const serverMotion=()=>true;

export function SpaceCompanion({busy,initialSearch,failed,focused,hasReply,hasSources,loading}:{busy:boolean;initialSearch:boolean;failed:boolean;focused:boolean;hasReply:boolean;hasSources:boolean;loading:boolean}) {
  const deviceReducedMotion=useSyncExternalStore(subscribeMotion,reducedMotion,serverMotion);
  const {preferences}=useBrowserPreferences();
  const reduceMotion=deviceReducedMotion||preferences.mascotMotion==='reduced';
  let pose:BriskyPose='idle',message='Ready when you are.';
  if(failed){pose='error';message='Something needs attention. You can retry above.';}
  else if(loading){pose='thinking';message='Opening your space...';}
  else if(busy){pose=initialSearch?'searching':'thinking';message=initialSearch?'Looking through your moments...':'Thinking about your message...';}
  else if(focused){pose='listening';message='Go on, I’m here.';}
  else if(!hasReply){pose='greeting';message='What would you like to explore?';}
  else if(hasSources){pose='success';message='Your source moments are ready to explore.';}
  else{pose='idle';message='Ready when you are.';}
  if(!preferences.showMascot)return busy||loading?<p role="status" aria-live="polite" className="pb-3 text-xs leading-relaxed text-brand-muted">{message}</p>:null;
  return <div data-space-companion={pose} className="flex min-w-0 items-center gap-2 pb-2">
    <div className="character-stage relative size-16 shrink-0"><BriskyCompanion enabled draggable={false} config={{size:145,amplitude:reduceMotion?0:0.35,satellites:false,tracking:!reduceMotion,motion:!reduceMotion,pose}}/></div>
    <div className="min-w-0"><p className="text-xs font-semibold text-brand-ink">Brisky</p><p role="status" aria-live="polite" aria-atomic="true" className="mt-1 text-xs leading-relaxed text-brand-muted">{message}</p></div>
  </div>;
}
