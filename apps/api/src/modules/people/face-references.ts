/** Rows arrive newest first. Keep a bounded fallback pool across source files. */
export function faceReferenceCandidates<T extends {asset_id:string}>(rows:T[]):T[]{
  const groups=new Map<string,T[]>();
  for(const row of rows){
    if(!groups.has(row.asset_id)){
      if(groups.size===3)continue;
      groups.set(row.asset_id,[]);
    }
    const group=groups.get(row.asset_id)!;
    if(group.length<3)group.push(row);
  }
  const candidates:T[]=[];
  for(let rank=0;rank<3;rank++)for(const group of groups.values())if(group[rank])candidates.push(group[rank]);
  return candidates;
}
