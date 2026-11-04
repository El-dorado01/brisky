import 'server-only';
import { cookies } from 'next/headers';
import { auth } from './auth';
import { AuthError } from './auth-core';
import { assertSameOrigin,body,cookieOptions,json,sessionCookie } from './auth-http';
import { createDriveState,validDriveState } from './drive-oauth-state';

const OAUTH_COOKIE=process.env.NODE_ENV==='production'?'__Host-brisky_drive_oauth':'brisky_drive_oauth';
async function session(){const token=await sessionCookie();if(!token||!await auth().session(token))throw new AuthError(401,'Sign in to manage your sources.');return token;}
async function engine(token:string,path:string,method='GET',payload?:unknown){
  const configured=process.env.BRISKY_ENGINE_URL;if(!configured)throw new AuthError(503,'Sources are not connected yet.');
  const url=new URL(configured);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['http:','https:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new AuthError(503,'The source connection needs attention.');
  const response=await fetch(new URL('/api/v1/saas-engine/connectors'+path,url),{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(method==='POST'&&(path.endsWith('/sync')||path.endsWith('/folders'))?90000:30000),headers:{Authorization:`SaaS ${token}`,...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  if(!response.ok){await response.body?.cancel();throw new AuthError(response.status===404?404:response.status===400?400:503,path.endsWith('/sync')?'Indexing is not enabled or the source could not sync. Your folders remain saved.':'Unable to access this source. Please retry or reconnect.');}
  const reader=response.body?.getReader();if(!reader)throw new AuthError(503,'Empty source response.');let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>512000){await reader.cancel();throw new Error('Oversized source response');}chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString());}finally{reader.releaseLock();}
}
function failure(error:unknown){return error instanceof AuthError?json({error:error.message},error.status):json({error:'Sources are temporarily unavailable.'},503);}
export async function connectorsRequest(request:Request,path='',method='GET'){
  try{
    const token=await session();if(method!=='GET')assertSameOrigin(request);
    let payload:unknown;
    if(method==='POST'&&path.endsWith('/folders'))payload=await body(request,32000);
    return json(await engine(token,path,method,payload));
  }catch(error){return failure(error);}
}
export async function startDrive(request:Request){
  try{
    assertSameOrigin(request);const token=await session();const state=createDriveState(token,process.env.SAAS_AUTH_SECRET||'');
    const result=await engine(token,'/google-drive/start','POST',{state:state.state});
    const target=new URL(result.url);if(target.protocol!=='https:'||target.hostname!=='accounts.google.com'||target.searchParams.get('state')!==state.state)throw new Error('Invalid Google URL');
    (await cookies()).set(OAUTH_COOKIE,state.cookie,{...cookieOptions,maxAge:600});return json({url:target.href});
  }catch(error){return failure(error);}
}
export async function completeDrive(request:Request){
  const jar=await cookies(),stored=jar.get(OAUTH_COOKIE)?.value;jar.set(OAUTH_COOKIE,'',{...cookieOptions,maxAge:0});
  const url=new URL(request.url);let result='error';
  try{
    const token=await session(),state=url.searchParams.get('state')||'';
    if(!stored||!validDriveState(stored,state,token,process.env.SAAS_AUTH_SECRET||''))throw new AuthError(400,'OAuth session expired.');
    if(url.searchParams.has('error'))result='denied';
    else{const code=url.searchParams.get('code');if(!code||code.length>8192)throw new Error('Missing code');await engine(token,'/google-drive/complete','POST',{code});result='connected';}
  }catch{/* Never return OAuth codes, provider errors or tokens to the browser. */}
  const origin=process.env.SAAS_APP_ORIGIN||(process.env.NODE_ENV!=='production'?url.protocol+'//'+(request.headers.get('host')||url.host):'');
  if(!origin)return json({error:'Configure the SaaS application origin.'},503);
  return Response.redirect(new URL('/factory?drive='+result,origin),303);
}
