export type Person={id:string;name:string;aliases:string[];isMe:boolean};
export type Appearance={id:string;personId:string;assetId:string;start_s:number;end_s:number;frame_s:number;status:string};
export async function peopleApi<T>(path='',method='GET',payload?:unknown):Promise<T>{
  const response=await fetch('/api/people'+path,{method,cache:'no-store',headers:payload===undefined?{}:{'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  const data=await response.json().catch(()=>({error:'People are temporarily unavailable.'}));
  if(!response.ok)throw new Error(data.error||'Unable to load or save people.');return data;
}
export async function allPeople(){
  const people:Person[]=[];let after='';
  do{const page=await peopleApi<{items:Person[];hasMore:boolean;nextAfter:string|null}>('?limit=100'+(after?'&after='+encodeURIComponent(after):''));people.push(...page.items);after=page.hasMore&&page.nextAfter?page.nextAfter:'';}while(after);
  return people;
}
