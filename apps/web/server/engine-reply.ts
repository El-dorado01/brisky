import 'server-only';
import { AuthError } from './auth-core';
import type { EngineReply,ReplyContext } from './space-replies-core';

/** Server-to-server only. Engine keys and JWT secrets never enter the SaaS app. */
export async function engineReply(token:string,context:ReplyContext):Promise<EngineReply>{
  const configured=process.env.BRISKY_ENGINE_URL;
  if(!configured)throw new AuthError(503,'Brisky replies are not connected yet. Your message is saved.');
  const url=new URL(configured);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(!local&&url.protocol!=='https:')||!['http:','https:'].includes(url.protocol))throw new AuthError(503,'The Brisky connection needs attention. Your message is saved.');
  let response:Response;
  try {response=await fetch(new URL('/api/v1/saas-engine/reply',url),{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(125000),headers:{Authorization:`SaaS ${token}`,'Content-Type':'application/json'},body:JSON.stringify(context)});}
  catch{throw new AuthError(503,'Brisky could not finish replying. Your message is saved; please retry.');}
  if(!response.ok){await response.body?.cancel();throw new AuthError(response.status===429?429:503,'Brisky cannot reply right now. Your message is saved; please retry shortly.');}
  const reader=response.body?.getReader();if(!reader)throw new AuthError(503,'Brisky returned an empty reply.');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>512000){await reader.cancel();throw new Error('Oversized engine response');}chunks.push(next.value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as EngineReply;
  }catch{throw new AuthError(503,'Brisky could not return a complete reply. Please retry.');}finally{reader.releaseLock();}
}
