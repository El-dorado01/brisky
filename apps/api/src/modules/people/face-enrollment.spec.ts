import {promises as fs} from 'fs';
import * as childProcess from 'child_process';
import {ConflictException} from '@nestjs/common';
import {FaceMatchingService} from './face-matching.service';

describe('face enrollment service preparation',()=>{
  afterEach(()=>jest.restoreAllMocks());
  it('prepares bounded fallback references, skips unavailable sources, and preserves owner/manual scoping',async()=>{
    const owner='11111111-1111-4111-8111-111111111111',person='22222222-2222-4222-8222-222222222222';
    const refs=Array.from({length:9},(_,i)=>({id:`ref-${i}`,asset_id:`source-${i%3}`,frame_s:1,box:[.1,.1,.3,.3],version:'v1',checksum:'v1'}));
    const db={query:jest.fn().mockResolvedValueOnce({rows:[{id:'target',duration:12,checksum:'v1'}]}).mockResolvedValueOnce({rows:refs}).mockResolvedValue({rows:[]})};
    const config={get:(key:string,fallback?:string)=>key==='FACE_RECOGNITION_ENABLED'?'true':fallback};
    const service=new FaceMatchingService(db as any,{} as any,{} as any,config as any);
    const validate=jest.fn().mockResolvedValue(undefined),close=jest.fn().mockResolvedValue(undefined);
    const source=jest.spyOn(service as any,'source').mockImplementation(async(_owner,id)=>{
      if(id==='source-1')throw new ConflictException('Preview not ready');
      return {path:`generated-${id}`,version:'v1',validate,close};
    });
    const frame=jest.spyOn(service as any,'frame').mockResolvedValue(Buffer.from('generated fixture frame'));
    jest.spyOn(fs,'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs,'mkdtemp').mockResolvedValue('fixture-scan-directory');
    const writes=jest.spyOn(fs,'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs,'stat').mockResolvedValue({size:100} as any);
    jest.spyOn(fs,'readFile').mockResolvedValue(JSON.stringify({referenceCount:2,framesScanned:24,facesDetected:0,matches:[]}) as any);
    const cleanup=jest.spyOn(fs,'rm').mockResolvedValue(undefined);
    jest.spyOn(childProcess,'execFile').mockImplementation(((...args:any[])=>{args[args.length-1](null);return {} as any;}) as any);
    expect(await service.scan(owner,person,{assetId:'target'})).toEqual({suggested:0,framesScanned:24,facesDetected:0,sampled:true});
    const manifest=JSON.parse(String(writes.mock.calls.find(([name])=>String(name).endsWith('input.json'))![1]));
    expect(manifest.references).toHaveLength(6);
    expect(new Set(manifest.references.map((r:any)=>r.sourceId))).toEqual(new Set(['source-0','source-2']));
    expect(frame).toHaveBeenCalledTimes(30);
    expect(source.mock.calls.filter(([,id])=>id==='source-1')).toHaveLength(1);
    expect(db.query.mock.calls[1][0]).toContain("r.origin='manual'");
    expect(db.query.mock.calls[1][0]).toContain('r.user_id=$1 AND r.person_id=$2');
    expect(db.query.mock.calls[1][1]).toEqual([owner,person]);
    expect(validate).toHaveBeenCalledTimes(3);expect(close).toHaveBeenCalledTimes(3);
    expect(cleanup).toHaveBeenCalledWith('fixture-scan-directory',{recursive:true,force:true});
  });
});
