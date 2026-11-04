import { MediaService } from './media.service';

describe('retrieval rewrites preserve verification constraints',()=>{
  function fixture(compound=false){
    const service=Object.create(MediaService.prototype) as any;
    service.getUnderstoodQuery=jest.fn().mockResolvedValue({cleanSearchPhrase:'hippo',coreSubject:'hippo',aliases:[],
      isCompound:compound,subQueries:compound?[{topic:'hippo',searchPhrase:'hippo'},{topic:'fruit',searchPhrase:'fruit'}]:[]});
    service.searchSingleTopic=jest.fn().mockResolvedValue([]);
    service.searchCompoundMultiTopic=jest.fn().mockResolvedValue([]);
    service.logger={log:jest.fn()};
    return service;
  }
  it('passes the complete request to the single-topic verifier despite simplified retrieval terms',async()=>{
    const service=fixture(),constraint='hippo, but not a watermelon';
    await service.searchWithinDeadline('hippo',undefined,12,'owner',constraint);
    expect(service.searchSingleTopic.mock.calls[0][0]).toBe('hippo');
    expect(service.searchSingleTopic.mock.calls[0][7]).toBe(constraint);
  });
  it('carries the original request across the public search boundary',async()=>{
    const service=fixture();service.searchWithinDeadline=jest.fn().mockResolvedValue({results:[],hasExactMatch:false,queryIntent:'mixed'});
    await service.searchDetailed('hippo',undefined,12,'owner','verify',undefined,undefined,'ONLY a woman; no unknown thrower');
    expect(service.searchWithinDeadline.mock.calls[0][4]).toContain('ONLY a woman; no unknown thrower');
    expect(service.searchWithinDeadline.mock.calls[0][4]).toContain('Resolved search: hippo');
  });
  it('keeps original constraints across every compound subquery',async()=>{
    const service=fixture(true),constraint='hippo and fruit, but no watermelon';
    await service.searchWithinDeadline('hippo and fruit',undefined,12,'owner',constraint);
    expect(service.searchCompoundMultiTopic.mock.calls[0][0]).toBe(constraint);
  });
});
