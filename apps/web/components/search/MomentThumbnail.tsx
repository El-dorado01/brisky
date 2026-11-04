"use client";
import { useState } from 'react';
import { ImageOff } from 'lucide-react';

export function momentThumbnailUrl(spaceId:string,momentId:string){return `/api/spaces/${encodeURIComponent(spaceId)}/moments/${encodeURIComponent(momentId)}/thumbnail`;}
export function MomentThumbnail({spaceId,momentId,label}:{spaceId:string;momentId:string;label:string}){
  const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),[loaded,setLoaded]=useState(false);
  return <div className="absolute inset-0 overflow-hidden bg-brand-canvas">
    {!failed&&<>{/* Same-origin authenticated image; keep the exact card dimensions. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={momentThumbnailUrl(spaceId,momentId)+(attempt?`?retry=${attempt}`:'')} alt={`Frame from ${label}`} loading="lazy" decoding="async" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)} className={`h-full w-full object-cover transition-opacity ${loaded?'opacity-100':'opacity-0'}`}/>
    </>}
    {!loaded&&!failed&&<div role="status" aria-label="Loading thumbnail" className="absolute inset-0 animate-pulse bg-brand-violet/10 motion-reduce:animate-none"/>}
    {failed&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-brand-muted"><ImageOff size={22}/><span className="text-xs">Thumbnail unavailable</span><button type="button" onClick={event=>{event.stopPropagation();setFailed(false);setLoaded(false);setAttempt(value=>value+1);}} className="relative z-10 text-xs font-semibold text-brand-violet">Retry thumbnail</button></div>}
  </div>;
}
