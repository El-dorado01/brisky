import 'server-only';
import { auth } from './auth';
import { AuthError } from './auth-core';
import { assertSameOrigin,body,json,sessionCookie } from './auth-http';

export async function peopleRequest(request:Request,parts:string[]=[]){
  try{
    const token=await sessionCookie();
    if(!token||!await auth().session(token))throw new AuthError(401,'Sign in to manage people.');
    if(request.method!=='GET')assertSameOrigin(request);
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const scan=parts.length===2&&uuid.test(parts[0])&&parts[1]==='face-scan';
    const check=parts.length===2&&uuid.test(parts[0])&&parts[1]==='reference-check';
    const archive=parts.length===2&&uuid.test(parts[0])&&parts[1]==='face-archive';
    const retry=parts.length===2&&uuid.test(parts[0])&&parts[1]==='face-archive-retry';
    const image=parts.length===3&&parts[0]==='face-suggestions'&&uuid.test(parts[1])&&parts[2]==='frame';
    const review=parts.length===3&&parts[0]==='face-suggestions'&&uuid.test(parts[1])&&parts[2]==='review';
    const valid=archive?['GET','PUT']:scan||review||check||retry?['POST']:image?['GET']:parts.length===2&&uuid.test(parts[0])&&parts[1]==='face-suggestions'?['GET']:parts.length===0?['GET','POST']:parts.length===1&&uuid.test(parts[0])?['PUT','DELETE']:parts.length===2&&uuid.test(parts[0])&&parts[1]==='appearances'?['GET','POST']:parts.length===2&&parts[0]==='appearances'&&uuid.test(parts[1])?['DELETE']:[];
    if(!valid.includes(request.method))throw new AuthError(404,'People endpoint not found.');
    const configured=process.env.BRISKY_ENGINE_URL;
    if(!configured)throw new AuthError(503,'People are not connected yet.');
    const base=new URL(configured);
    if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||!['http:','https:'].includes(base.protocol)||(base.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw new AuthError(503,'The people connection needs attention.');
    const target=new URL('/api/v1/saas-engine/people'+(parts.length?'/'+parts.join('/') :''),base);
    for(const key of ['limit','after']){const value=new URL(request.url).searchParams.get(key);if(value)target.searchParams.set(key,value);}
    const payload=['POST','PUT'].includes(request.method)?await body(request,16000):undefined;
    const response=await fetch(target,{method:request.method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(scan?180000:check?60000:30000),headers:{Authorization:`SaaS ${token}`,...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    if(check&&!response.ok){await response.body?.cancel();throw new AuthError([400,401,404,409].includes(response.status)?response.status:503,response.status===409?'Another face check is running or the source changed. Retry when it finishes.':response.status===404?'The person or source is unavailable.':response.status===400?'Check the source frame and face selection.':'Face checks are unavailable. You can still save a manual tag.');}
    if((archive||retry)&&!response.ok){await response.body?.cancel();throw new AuthError([400,401,404].includes(response.status)?response.status:503,'Library matching is unavailable. Please retry.');}
    if(!response.ok){await response.body?.cancel();throw new AuthError([400,401,404,409,422].includes(response.status)?response.status:503,scan||review||image?response.status===422?'Tag a clear face in a playable source before scanning. No usable reference face was found.':response.status===404?'This suggestion expired, or the selected video is unavailable or longer than five minutes.':response.status===409?'A scan is running or a source changed. Open the source preview and retry.':'Face matching could not finish. Check the local runtime and retry.':response.status===409?'Another person is already marked as you. Edit that profile first.':response.status===400?'Check the name, aliases, face selection and time range.':response.status===404?'This person or source is no longer available.':'Unable to save or load people. Please retry.');}
    const reader=response.body?.getReader();if(!reader)throw new Error('Empty response');const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>(image?4*1024*1024:512000)){await reader.cancel();throw new Error('Oversized response');}chunks.push(next.value);}}finally{reader.releaseLock();}
    if(image)return new Response(Buffer.concat(chunks),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    return json(JSON.parse(Buffer.concat(chunks).toString()),response.status);
  }catch(error){return error instanceof AuthError?json({error:error.message},error.status):json({error:'People are temporarily unavailable. Please retry.'},503);}
}
