import 'server-only';
import {auth} from './auth';
import {AuthError} from './auth-core';
import {body,json,sessionCookie} from './auth-http';

export async function voiceRequest(request:Request,action:'transcribe'|'speak'|'preview'|'stream'|'config'|'live-ticket'){
  try{const token=await sessionCookie(),user=token?await auth().session(token):null;if(!user||!token)throw new AuthError(401,'Sign in to use voice mode.');const value=action==='config'?{}:await body(request,action==='transcribe'?4*1024*1024:2048);
    const configured=process.env.BRISKY_ENGINE_URL;if(!configured)throw new AuthError(503,'Voice mode is not connected to Brisky.');const base=new URL(configured),local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||!['https:','http:'].includes(base.protocol)||!local&&base.protocol!=='https:')throw new AuthError(503,'The voice connection needs attention.');
    const response=await fetch(new URL(`/api/v1/saas-engine/voice/${action}`,base),{method:'POST',redirect:'error',cache:'no-store',headers:{Authorization:`SaaS ${token}`,'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.any([request.signal,AbortSignal.timeout(110000)])});
    if(!response.ok){let message='Voice could not finish. Please retry.';try{const error=await response.json();if(typeof error.message==='string')message=error.message;}catch{}return json({error:message},response.status>=400&&response.status<500?response.status:503);}
    if(action==='transcribe'||action==='config'||action==='live-ticket')return json(await response.json());if(action==='stream'){if(!response.headers.get('content-type')?.includes('application/x-ndjson')){await response.body?.cancel();throw new AuthError(503,'Speech returned no stream.');}return new Response(response.body,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'private, no-store, no-transform','X-Content-Type-Options':'nosniff','X-Accel-Buffering':'no'}});}if(!response.headers.get('content-type')?.includes('audio/wav')){await response.body?.cancel();throw new AuthError(503,'Voice returned no playable audio.');}
    return new Response(response.body,{headers:{'Content-Type':'audio/wav','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){if(error instanceof AuthError)return json({error:error.message},error.status);return json({error:'Voice could not finish. Check the connection and retry.'},503);}
}
