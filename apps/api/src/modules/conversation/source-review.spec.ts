import {requestsSourceReview,reviewScopeIsClear,fairReviewEvidence,referencesSelectedSources} from './source-review';
import {SpaceEvidence} from '../pipeline/space-conversation';

describe('bounded source reasoning',()=>{
  it.each(['Explain this tutorial step by step','Brainstorm questions about this lesson',
    'Compare these two recordings','Summarize the whole video'])(
    'requests broader indexed context for %s',query=>expect(requestsSourceReview(query)).toBe(true));
  it.each(['Explain this moment from the tutorial','Suggest questions about this tutorial excerpt',
    'Hi Brisky','Find a hippo'])(
    'does not silently widen excerpt/chat/search scope for %s',query=>expect(requestsSourceReview(query)).toBe(false));
  it('does not guess which singular tutorial the user means among multiple sources',()=>{
    expect(reviewScopeIsClear('Explain this tutorial',2)).toBe(false);
    expect(reviewScopeIsClear('Compare both tutorials',2)).toBe(true);
    expect(reviewScopeIsClear('Explain this tutorial',1)).toBe(true);
  });
  it('expands temporal follow-ups but does not assume a new topic refers to the selected recording',()=>{
    expect(requestsSourceReview('What happened next?')).toBe(true);
    expect(referencesSelectedSources('What happened next?')).toBe(true);
    expect(referencesSelectedSources('Brainstorm questions about a tutorial on woodworking')).toBe(false);
    expect(referencesSelectedSources('Brainstorm questions about a tutorial that explains woodworking')).toBe(false);
    expect(referencesSelectedSources('Describe another whole clip')).toBe(false);
    expect(referencesSelectedSources('Summarize the whole video')).toBe(true);
  });
  it('budgets context across sources and assigns unique citation IDs',()=>{
    const item=(assetId:string,i:number)=>({id:'e1',assetId,startS:i,endS:i+1,title:'Fixture',filename:'fixture',transcript:'',description:'',status:'indexed'} as SpaceEvidence);
    const result=fairReviewEvidence([Array.from({length:20},(_,i)=>item('a',i)),[item('b',0)]]);
    expect(result).toHaveLength(20);expect(result[1].assetId).toBe('b');
    expect(new Set(result.map(e=>e.id)).size).toBe(20);
    expect(result.filter(e=>e.assetId==='a')).toHaveLength(19);
  });
});
