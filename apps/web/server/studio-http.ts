import 'server-only';
import { auth } from './auth';
import { AuthError } from './auth-core';
import { body,json,sessionCookie } from './auth-http';
import { database } from './db';
import { createStudio,type EngineStudio,type StudioGeneration } from './studio-core';

async function engineStudio(token:string,input:StudioGeneration):Promise<EngineStudio>{
  const configured=process.env.BRISKY_ENGINE_URL;if(!configured)throw new AuthError(503,'Studio is not connected to Brisky yet.');
  const base=new URL(configured),local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
  if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||!['http:','https:'].includes(base.protocol)||(!local&&base.protocol!=='https:'))throw new AuthError(503,'The Studio connection needs attention.');
  const response=await fetch(new URL('/api/v1/saas-engine/studio/generate',base),{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(100000),headers:{Authorization:`SaaS ${token}`,'Content-Type':'application/json'},body:JSON.stringify(input)});
  if(!response.ok){await response.body?.cancel();throw new AuthError(response.status===429?429:503,'Brisky could not create this document. Your shortlist is safe; please retry.');}
  const reader=response.body?.getReader();if(!reader)throw new AuthError(503,'Studio returned an empty document.');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>256000){await reader.cancel();throw new AuthError(503,'Studio returned an oversized document.');}chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8')) as EngineStudio;}finally{reader.releaseLock();}
}
export async function studioRequest(request:Request,options:{spaceId?:string;outputId?:string}={}){
  try{
    const token=await sessionCookie(),user=token?await auth().session(token):null;if(!user||!token)throw new AuthError(401,'Sign in to use Studio.');
    const service=createStudio(database(),input=>engineStudio(token,input));
    if(request.method==='POST'&&options.spaceId)return json(await service.create(user.id,options.spaceId,await body(request,6000)));
    if(request.method==='GET')return json(options.outputId?{output:await service.read(user.id,options.outputId)}:await service.list(user.id,new URL(request.url).searchParams.get('after')));
    throw new AuthError(405,'Method not allowed.');
  }catch(error){if(error instanceof AuthError)return json({error:error.message},error.status,error.retryAfter);console.error('SaaS Studio request failed');return json({error:'Studio could not finish this request. Please try again.'},503);}
}
