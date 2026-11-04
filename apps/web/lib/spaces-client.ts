// getRandomValues also works when testing a local dev server over a LAN HTTP URL.
export function spaceRequestId() {
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function spacesFetch<T>(path:string,method='GET',value?:unknown):Promise<T> {
  const response=await fetch(`/api/spaces${path}`,{method,credentials:'same-origin',cache:'no-store',
    ...(value===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})});
  if(response.status===401){window.location.replace('/login');throw new Error('Sign in to access your spaces.');}
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Your spaces are temporarily unavailable. Please try again.');
  const result=await response.json();
  if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'Unable to save your changes.');
  return result as T;
}
