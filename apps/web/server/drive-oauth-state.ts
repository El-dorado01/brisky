import { createHash,createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
export function createDriveState(session:string,secret:string,now=Date.now()){
  if(secret.length<32)throw new Error('SaaS auth secret is not configured');
  const state=randomBytes(32).toString('base64url');
  const data=Buffer.from(JSON.stringify({state,session:createHash('sha256').update(session).digest('hex'),expires:now+600000})).toString('base64url');
  return {state,cookie:data+'.'+createHmac('sha256',secret).update(data).digest('base64url')};
}
export function validDriveState(cookie:string,state:string,session:string,secret:string,now=Date.now()){
  try{
    if(secret.length<32||cookie.length>2048||! /^[A-Za-z0-9_-]{43}$/.test(state))return false;
    const [data,signature,...rest]=cookie.split('.');if(rest.length||!signature)return false;
    const expected=createHmac('sha256',secret).update(data).digest(),actual=Buffer.from(signature,'base64url');
    if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return false;
    const parsed=JSON.parse(Buffer.from(data,'base64url').toString());
    return parsed.state===state&&parsed.session===createHash('sha256').update(session).digest('hex')&&Number.isFinite(parsed.expires)&&parsed.expires>now&&parsed.expires<=now+600000;
  }catch{return false;}
}
