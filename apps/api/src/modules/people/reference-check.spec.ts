import {promises as fs} from 'fs';
import * as childProcess from 'child_process';
import * as seekable from '../pipeline/seekable-media-source';
import {BadRequestException,ConflictException,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import {FaceMatchingService} from './face-matching.service';
import {referenceAssetSql,referenceCheckInput,referenceCheckResult} from './reference-check';

const owner='11111111-1111-4111-8111-111111111111',person='22222222-2222-4222-8222-222222222222';
const input={assetId:'fixture',frame_s:1,box:[.1,.1,.3,.3]};
describe('reference preflight boundary',()=>{
  it('rejects injected ownership, invalid coordinates and nonfinite times',()=>{
    for(const value of [null,[],{...input,owner},{...input,frame_s:NaN},{...input,frame_s:-1},{...input,assetId:'../source'},{...input,box:[.9,0,.2,.3]},{...input,box:[0,0,0,.2]},{...input,box:[0,0,Infinity,.2]}])expect(()=>referenceCheckInput(value)).toThrow(BadRequestException);
    expect(referenceCheckInput(input)).toEqual(input);
  });
  it('accepts only advisory statuses and bounds a proposed selection',()=>{
    expect(referenceCheckResult({status:'adjust_selection',suggestedBox:input.box})).toEqual({status:'adjust_selection',suggestedBox:input.box});
    for(const value of [{status:'ready',identity:'someone'},{status:'adjust_selection'},{status:'adjust_selection',suggestedBox:[0,0,2,2]},{status:'ready',suggestedBox:input.box},{status:'recognized'},null])expect(()=>referenceCheckResult(value)).toThrow(ServiceUnavailableException);
  });
});

describe('reference preflight service',()=>{
  afterEach(()=>jest.restoreAllMocks());
  function setup(){
    const asset={duration:10,checksum:'v1'},db={query:jest.fn().mockResolvedValue({rows:[asset]})};
    const config={get:(key:string,fallback?:string)=>key==='FACE_RECOGNITION_ENABLED'?'true':fallback};
    const service=new FaceMatchingService(db as any,{} as any,{} as any,config as any);
    const source=jest.spyOn(service as any,'source').mockResolvedValue({path:'generated-source',version:'v1',validate:jest.fn().mockResolvedValue(undefined),close:jest.fn().mockResolvedValue(undefined)});
    const frame=jest.spyOn(service as any,'frame').mockResolvedValue(Buffer.from('generated frame'));
    jest.spyOn(fs,'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs,'mkdtemp').mockResolvedValue('fixture-check-directory');
    jest.spyOn(fs,'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs,'stat').mockResolvedValue({size:100} as any);
    jest.spyOn(fs,'readFile').mockResolvedValue(JSON.stringify({status:'no_face_detected'}) as any);
    const cleanup=jest.spyOn(fs,'rm').mockResolvedValue(undefined);
    const child=jest.spyOn(childProcess,'execFile').mockImplementation(((...args:any[])=>{args[args.length-1](null);return {} as any;}) as any);
    return {service,db,source,frame,cleanup,child};
  }
  it('checks owner/person/source twice, creates no tags and removes temporary frames',async()=>{
    const {service,db,cleanup}=setup();
    expect(await service.checkReference(owner,person,input)).toEqual({status:'no_face_detected'});
    expect(db.query).toHaveBeenCalledTimes(2);
    for(const call of db.query.mock.calls){expect(call).toEqual([referenceAssetSql,[owner,person,'fixture',1]]);expect(call[0]).not.toMatch(/INSERT|UPDATE|DELETE/);}
    expect(referenceAssetSql).toContain('p.user_id=a.user_id AND p.id=$2');
    expect(referenceAssetSql).toContain('a.user_id=$1');
    expect(cleanup).toHaveBeenCalledWith('fixture-check-directory',{recursive:true,force:true});
  });
  it('denies an unavailable or foreign source/person before reading any frames',async()=>{
    const {service,db,source,frame}=setup();db.query.mockResolvedValue({rows:[]});
    await expect(service.checkReference(owner,person,input)).rejects.toBeInstanceOf(NotFoundException);
    expect(source).not.toHaveBeenCalled();expect(frame).not.toHaveBeenCalled();
  });
  it('rejects changed source versions and always releases its busy lock',async()=>{
    const {service,source,cleanup}=setup();
    const validate=jest.fn().mockRejectedValueOnce(new ConflictException('changed')).mockResolvedValue(undefined),close=jest.fn().mockResolvedValue(undefined);
    source.mockResolvedValue({path:'generated-source',version:'v1',validate,close});
    await expect(service.checkReference(owner,person,input)).rejects.toBeInstanceOf(ConflictException);
    expect(close).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(await service.checkReference(owner,person,input)).toEqual({status:'no_face_detected'});
  });
  it('fails closed on detector errors and prevents overlapping scans/checks',async()=>{
    const {service,child,cleanup}=setup();
    (service as any).scanning=true;
    await expect(service.checkReference(owner,person,input)).rejects.toBeInstanceOf(ConflictException);
    expect(child).not.toHaveBeenCalled();(service as any).scanning=false;
    child.mockImplementation(((...args:any[])=>{args[args.length-1](new Error('fixture failure'));return {} as any;}) as any);
    await expect(service.checkReference(owner,person,input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(cleanup).toHaveBeenCalledTimes(1);expect((service as any).scanning).toBe(false);
  });
});


describe('connector-backed face source',()=>{
  afterEach(()=>jest.restoreAllMocks());
  it('uses one bounded versioned lease without requiring a retained preview',async()=>{
    const signal=AbortSignal.timeout(1000),session={size:1234,version:'content-v1'},validate=jest.fn(),close=jest.fn();
    const media={getStreamInfo:jest.fn().mockResolvedValue({status:'pending'}),getRemotePlaybackSource:jest.fn().mockResolvedValue(session)};
    const bridge=jest.spyOn(seekable,'openSeekableMediaSource').mockResolvedValue({url:'http://127.0.0.1/fixture',bytesRead:0,validate,close});
    const service=new FaceMatchingService({} as any,media as any,{} as any,{} as any);
    const source=await (service as any).source(owner,'fixture',signal);
    expect(media.getRemotePlaybackSource).toHaveBeenCalledWith('fixture',owner,signal);
    expect(bridge).toHaveBeenCalledWith(session,expect.objectContaining({signal,maxBytes:200*1024*1024}));
    await source.validate();await source.close();
    expect(validate).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);
    expect(media.getRemotePlaybackSource).toHaveBeenCalledTimes(1);
  });
  it('rejects unavailable and oversized originals before opening a bridge',async()=>{
    const media={getStreamInfo:jest.fn().mockResolvedValue({status:'pending'}),getRemotePlaybackSource:jest.fn().mockResolvedValue(null)};
    const bridge=jest.spyOn(seekable,'openSeekableMediaSource');
    const service=new FaceMatchingService({} as any,media as any,{} as any,{} as any);
    await expect((service as any).source(owner,'fixture')).rejects.toBeInstanceOf(ConflictException);
    media.getRemotePlaybackSource.mockResolvedValue({size:101*1024*1024} as any);
    await expect((service as any).source(owner,'fixture')).rejects.toBeInstanceOf(BadRequestException);
    expect(bridge).not.toHaveBeenCalled();
  });
});
