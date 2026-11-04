"use client";

import { useEffect,useState } from 'react';
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { Copy01Icon } from '@/components/animate-ui/icons/hugeicons/copy-01';
import { CheckIcon } from '@/components/animate-ui/icons/hugeicons/check';
import { ClapperboardIcon } from '@/components/animate-ui/icons/hugeicons/clapperboard';
import { FactoryAudio } from '@/components/connectors/FactoryIcons';
import {useBriskySpeech} from '@/lib/use-brisky-speech';
import { useBrowserPreferences } from '@/lib/browser-preferences';

export function ResponseActions({text,messageId,onSources}:{text:string;messageId?:string;onSources?:()=>void}){
  const {preferences}=useBrowserPreferences();
  const [copied,setCopied]=useState(false),[error,setError]=useState('');
  const speech=useBriskySpeech(),reading=speech.state!=='idle';
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),1800);return()=>clearTimeout(timer);},[copied]);
  const button='grid size-9 place-items-center rounded-lg text-brand-muted transition hover:bg-brand-violet/5 hover:text-brand-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet disabled:opacity-35';
  function read(){if(reading)speech.stop();else if(messageId)void speech.play('speak',{messageId,style:'natural'});}
  return <div className="mt-2"><div role="group" aria-label="Response actions" className="-ml-1 flex items-center gap-1">
    <AnimateIcon animateOnHover asChild><button type="button" title={copied?'Copied':'Copy response'} aria-label={copied?'Response copied':'Copy response'} className={button} onClick={async()=>{setError('');try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setError('Could not copy. Select the response text to copy it.');}}}>{copied?<CheckIcon size={16}/>:<Copy01Icon size={16}/>}</button></AnimateIcon>
{(preferences.readAloud||reading)&&<AnimateIcon animateOnHover asChild><button type="button" disabled={!messageId} title={reading?'Stop reading':'Read aloud with Brisky’s voice'} aria-label={reading?'Stop reading response':'Read response aloud'} aria-pressed={reading} onClick={read} className={`${button} ${reading?'bg-brand-violet/10 text-brand-violet':''}`}><FactoryAudio size={16}/></button></AnimateIcon>}
    {onSources&&<AnimateIcon animateOnHover asChild><button type="button" title="Open cited moments" aria-label="Open cited moments" onClick={onSources} className={button}><ClapperboardIcon size={16}/></button></AnimateIcon>}
  </div><span role="status" className="sr-only">{copied?'Response copied.':''}</span>{(error||speech.error)&&<p role="alert" className="mt-1 text-xs text-red-700">{error||speech.error}</p>}</div>;
}
