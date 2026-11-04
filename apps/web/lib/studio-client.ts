export async function studioFetch<T>(url:string,payload?:unknown):Promise<T>{
  const response=await fetch(url,{method:payload===undefined?'GET':'POST',cache:'no-store',headers:payload===undefined?{}:{'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  const data=await response.json().catch(()=>({error:'Studio is temporarily unavailable.'}));
  if(!response.ok)throw Object.assign(new Error(data.error||'Studio could not finish this request.'),{status:response.status});return data;
}
