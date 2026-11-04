"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useSpaces} from '@/lib/spaces-context';
import {spacesFetch,spaceRequestId} from '@/lib/spaces-client';
import type {SpaceDetail} from '@/lib/spaces-types';
import {useBrowserPreferences} from '@/lib/browser-preferences';
import {LiveVoiceClient,type LiveStatus} from '@/lib/live-voice';
import {VoiceModeModal} from './VoiceModeModal';
import {ImmersiveVoiceOverlay} from './ImmersiveVoiceOverlay';

export function LiveVoiceConversation(){
  const {voiceOpen:open,setVoiceOpen,activeSpaceId,createSpace,refreshSpaces}=useSpaces(),{preferences}=useBrowserPreferences();
  const [inCall,setInCall]=useState(false),[status,setStatus]=useState<LiveStatus>('Connecting'),[error,setError]=useState(''),[muted,setMuted]=useState(false);
  const client=useRef<LiveVoiceClient|null>(null),space=useRef(activeSpaceId),chain=useRef<Promise<unknown>>(Promise.resolve()),calls=useRef(new Map<string,Promise<string>>()),generation=useRef(0);
  // Navigation after creating a Space must not replace the active audio connection.
  useEffect(()=>{space.current=activeSpaceId;},[activeSpaceId]);
  const close=useCallback(()=>{generation.current++;client.current?.stop();client.current=null;setInCall(false);setVoiceOpen(false);setMuted(false);},[setVoiceOpen]);
  useEffect(()=>()=>client.current?.stop(),[]);
  useEffect(()=>{if(!open){client.current?.stop();client.current=null;}},[open]);
  function tool(id:string,query:string){
    const existing=calls.current.get(id);if(existing)return existing;
    const epoch=generation.current;
    const task=chain.current.catch(()=>{}).then(async()=>{
      if(epoch!==generation.current)throw Error('The call ended before this request started.');
      let messageId=spaceRequestId();
      if(!space.current){const created=await createSpace(query,spaceRequestId(),{autoReply:false});space.current=created.id;const detail=await spacesFetch<SpaceDetail>(`/${created.id}`);messageId=detail.messages[0].id;}
      else await spacesFetch(`/${space.current}/messages`,'POST',{id:messageId,content:query});
      const result=await spacesFetch<{messageId:string}>(`/${space.current}/reply`,'POST',{messageId}),detail=await spacesFetch<SpaceDetail>(`/${space.current}`),reply=detail.messages.find(message=>message.id===result.messageId&&message.role==='assistant');
      if(!reply)throw Error('The saved reply is not ready.');
      window.dispatchEvent(new CustomEvent('brisky-space-updated',{detail:{spaceId:space.current}}));void refreshSpaces();
      return JSON.stringify({answer:reply.content,citations:reply.citations||[]});
    });chain.current=task;calls.current.set(id,task);return task;
  }
  function start(){
    generation.current++;client.current?.stop();setError('');setMuted(false);setStatus('Connecting');setInCall(true);calls.current.clear();
    const live=new LiveVoiceClient({voice:preferences.briskyVoice,onStatus:setStatus,onError:message=>{setError(message);setStatus('Paused');},onEnd:close,onTool:tool});client.current=live;window.dispatchEvent(new Event('brisky-stop-speech'));void live.start();
  }
  return <><VoiceModeModal open={open&&!inCall} onClose={close} onStartVoice={start}/><ImmersiveVoiceOverlay open={open&&inCall} onClose={close} status={status} error={error} muted={muted} active={status==='Listening'||status==='Speaking'} onMicToggle={()=>{if(error){start();return;}client.current?.pause(!muted);setMuted(!muted);}}/></>;
}
