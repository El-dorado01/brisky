import {faceReferenceCandidates} from './face-references';

describe('bounded face enrollment candidates',()=>{
  it('keeps fallback tags across three source files instead of only the newest file',()=>{
    const rows=[...Array.from({length:12},(_,i)=>({id:`a${i}`,asset_id:'a'})),
      {id:'b0',asset_id:'b'},{id:'b1',asset_id:'b'},
      {id:'c0',asset_id:'c'},{id:'d0',asset_id:'d'}];
    expect(faceReferenceCandidates(rows).map(row=>row.id)).toEqual(['a0','b0','c0','a1','b1','a2']);
    expect(rows[0].id).toBe('a0');
  });
  it('caps the pool at nine and preserves newest-first order within each source',()=>{
    const rows=Array.from({length:30},(_,i)=>({id:i,asset_id:String(i%3)}));
    expect(faceReferenceCandidates(rows).map(row=>row.id)).toEqual([0,1,2,3,4,5,6,7,8]);
    expect(faceReferenceCandidates([])).toEqual([]);
  });
});
