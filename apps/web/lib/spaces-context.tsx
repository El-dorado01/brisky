"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { spacesFetch, spaceRequestId } from './spaces-client';
import type { SpaceSession } from './spaces-types';
export type { SpaceSession } from './spaces-types';
type SpacesContextValue = {
 voiceOpen:boolean;setVoiceOpen:(open:boolean)=>void;
 mobileActionsHost: HTMLDivElement|null; setMobileActionsHost:(element:HTMLDivElement|null)=>void;
 spaces:SpaceSession[];activeSpaceId:string|null;activeSpace:SpaceSession|null;
 loading:boolean;error:string;refreshSpaces:()=>Promise<void>;
 selectSpace:(id:string|null)=>void;createSpace:(query:string,id?:string,options?:{autoReply?:boolean})=>Promise<SpaceSession>;
 updateSpace:(id:string,changes:{title?:string;pinned?:boolean})=>Promise<void>;
 deleteSpace:(id:string)=>Promise<void>;
 takeAutoReply:(spaceId:string)=>boolean;
};

const SpacesContext = createContext<SpacesContextValue | null>(null);

async function listSpaces() {
 const all:SpaceSession[]=[];let cursor:string|null=null;
 do {const page:{spaces:SpaceSession[];nextCursor:string|null}=await spacesFetch(cursor?`?before=${encodeURIComponent(cursor)}`:'');all.push(...page.spaces);cursor=page.nextCursor;}while(cursor&&all.length<1000);
 return all.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt));
}

export function SpacesProvider({children}:{children:ReactNode}) {
 const [voiceOpen,setVoiceOpen]=useState(false);
 const router=useRouter();
 const [mobileActionsHost,setMobileActionsHost]=useState<HTMLDivElement|null>(null);
 const [spaces,setSpaces]=useState<SpaceSession[]>([]);
 const [activeSpaceId,setActiveSpaceId]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const autoReplySpace=useRef<string|null>(null);
 const takeAutoReply=useCallback((id:string)=>{if(autoReplySpace.current!==id)return false;autoReplySpace.current=null;return true;},[]);
 const refreshSpaces=useCallback(()=>listSpaces().then(all=>{setSpaces(all);setError('');}).catch(error=>{
  setError(error instanceof Error?error.message:'Unable to load spaces.');
 }).finally(()=>setLoading(false)),[]);
 useEffect(()=>{function restore(){setActiveSpaceId(new URL(window.location.href).searchParams.get('space'));}void refreshSpaces().then(restore);window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[refreshSpaces]);
 function selectSpace(id:string|null){setActiveSpaceId(id);router.push(id?`/search?space=${encodeURIComponent(id)}`:'/search');}
 async function createSpace(query:string,id=spaceRequestId(),options:{autoReply?:boolean}={}) {
  const result=await spacesFetch<{space:SpaceSession}>('','POST',{id,query});
  autoReplySpace.current=options.autoReply===false?null:result.space.id;
  setSpaces(previous=>[result.space,...previous.filter(s=>s.id!==result.space.id)].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt)));selectSpace(result.space.id);return result.space;
 }
 async function updateSpace(id:string,changes:{title?:string;pinned?:boolean}) {
  const result=await spacesFetch<{space:SpaceSession}>(`/${id}`,'PATCH',changes);
  setSpaces(previous=>previous.map(s=>s.id===id?result.space:s).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt)));
 }
 async function deleteSpace(id:string){await spacesFetch(`/${id}`,'DELETE');setSpaces(previous=>previous.filter(s=>s.id!==id));if(activeSpaceId===id)selectSpace(null);}
 const activeSpace=spaces.find(s=>s.id===activeSpaceId)??null;
 return <SpacesContext.Provider value={{voiceOpen,setVoiceOpen,mobileActionsHost,setMobileActionsHost,spaces,activeSpaceId,activeSpace,loading,error,refreshSpaces,selectSpace,createSpace,updateSpace,deleteSpace,takeAutoReply}}>{children}</SpacesContext.Provider>;
}

export function useSpaces() {
  const ctx = useContext(SpacesContext);
  if (!ctx) {
    throw new Error("useSpaces must be used inside SpacesProvider");
  }
  return ctx;
}

