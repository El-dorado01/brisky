import { planVideoChunks } from './video-chunks';
describe('budgeted video windows',()=>{
  it('preserves short inline sources and bounds long sources without gaps',()=>{
    expect(planVideoChunks(10,1000,50_000_000)).toEqual([{start:0,end:10,original:true}]);
    expect(planVideoChunks(200,1000,50_000_000)).toEqual([
      {start:0,end:90,original:false},{start:90,end:180,original:false},{start:180,end:200,original:false}]);
    expect(planVideoChunks(10,100_000_000,50_000_000)).toEqual([{start:0,end:10,original:false}]);
  });
  it('rejects unbounded or invalid planning inputs',()=>{
    expect(()=>planVideoChunks(Infinity,1000,50_000_000)).toThrow();
    expect(()=>planVideoChunks(10,1000,50_000_000,301)).toThrow();
    expect(()=>planVideoChunks(90*4097,1000,50_000_000)).toThrow('4096');
  });
});
