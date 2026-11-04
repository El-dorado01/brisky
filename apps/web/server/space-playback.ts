import 'server-only';
import { auth } from './auth';
import { AuthError } from './auth-core';
import { json,sessionCookie } from './auth-http';
import { database } from './db';

export async function spacePlayback(request:Request,spaceId:string,momentId:string,thumbnail=false){
  try{
    const token=await sessionCookie(),account=await auth().session(token);
    if(!account)throw new AuthError(401,'Sign in to play this source.');
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!uuid.test(spaceId)||!uuid.test(momentId))throw new AuthError(404,'Source not found.');
    const found=await database().query(`SELECT m.asset_id,m.start_s,m.end_s FROM saas.moments m
      JOIN public.media_assets a ON a.id=m.asset_id AND a.user_id=m.user_id
      WHERE m.user_id=$1 AND m.space_id=$2 AND m.id=$3`,[account.id,spaceId,momentId]);
    if(!found.rowCount)throw new AuthError(404,'Source not found.');
    const base=new URL(process.env.BRISKY_ENGINE_URL||'http://invalid');
    if(!process.env.BRISKY_ENGINE_URL||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!['http:','https:'].includes(base.protocol)||(base.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw new AuthError(503,'Source playback is not connected yet.');
    const range=request.headers.get('range');
    if(range&&(!/^bytes=(\d*)-(\d*)$/.test(range)||range.length>100))return new Response(null,{status:416,headers:{'Cache-Control':'private, no-store'}});
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),thumbnail?45000:20000);
    const signal=AbortSignal.any([controller.signal,request.signal]);
    let upstream:Response;
    const target=new URL('/api/v1/saas-engine/media/'+encodeURIComponent(found.rows[0].asset_id)+(thumbnail?'/moment-thumbnail':'/stream'),base);
    if(thumbnail){target.searchParams.set('startS',String(found.rows[0].start_s));target.searchParams.set('endS',String(found.rows[0].end_s));}
    try{upstream=await fetch(target,{method:request.method,redirect:'error',cache:'no-store',signal,headers:{Authorization:`SaaS ${token}`,...(!thumbnail&&range?{Range:range}:{})}});}finally{clearTimeout(timeout);}
    const headers=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
    for(const name of ['content-type','content-length','content-range','accept-ranges','retry-after']){const value=upstream.headers.get(name);if(value)headers.set(name,value);}
    if(![200,206,202,416].includes(upstream.status)){await upstream.body?.cancel();throw new AuthError(upstream.status===404?404:503,'Source playback is unavailable.');}
    if(request.method==='HEAD'){await upstream.body?.cancel();return new Response(null,{status:upstream.status,headers});}
    return new Response(upstream.body,{status:upstream.status,headers});
  }catch(error){if(error instanceof AuthError)return json({error:error.message},error.status);return json({error:'Source playback is temporarily unavailable.'},503);}
}
