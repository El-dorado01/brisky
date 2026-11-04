import {BadRequestException,UnprocessableEntityException,ServiceUnavailableException} from '@nestjs/common';
import {FaceArchiveService} from './face-archive.service';
import {archiveProfile} from './face-archive.sql';

const owner='11111111-1111-4111-8111-111111111111',person='22222222-2222-4222-8222-222222222222';
const job={id:'33333333-3333-4333-8333-333333333333',lease_token:'44444444-4444-4444-8444-444444444444',user_id:owner,person_id:person,asset_id:'fixture',asset_checksum:'a'.repeat(64),reference_revision:'r1',profile:archiveProfile,start_s:60,end_s:120,source_duration:180,attempts:1};
function fixture(){const db={query:jest.fn()},faces={scan:jest.fn().mockResolvedValue({suggested:0,framesScanned:24})},config={get:(_key:string,fallback?:string)=>fallback};return {db,faces,service:new FaceArchiveService(db as any,faces as any,config as any)};}

describe('archive face worker controls',()=>{
  afterEach(()=>jest.restoreAllMocks());
  it('never starts a background timer in the HTTP API role',()=>{const {service}=fixture(),timer=jest.spyOn(global,'setInterval');service.onApplicationBootstrap();expect(timer).not.toHaveBeenCalled();});
  it('rejects unrecognised settings and injected ownership',async()=>{const {service,db}=fixture();for(const body of [{enabled:true,owner},[],{enabled:'true'},null])await expect(service.configure(owner,person,body)).rejects.toBeInstanceOf(BadRequestException);expect(db.query).not.toHaveBeenCalled();});
  it('pauses only the owner/person and invalidates running leases without confirming appearances',async()=>{
    const {service,db}=fixture();db.query.mockResolvedValue({rows:[{enabled:false}],rowCount:1});jest.spyOn(service,'status').mockResolvedValue({enabled:false} as any);
    await service.configure(owner,person,{enabled:false});expect(db.query.mock.calls[1][1]).toEqual([owner,person]);expect(db.query.mock.calls[1][0]).toContain("state IN ('queued','running')");expect(db.query.mock.calls[1][0]).toContain('lease_token=NULL');expect(db.query.mock.calls.some(([sql])=>/INSERT INTO person_appearances/.test(sql))).toBe(false);
  });
  it('runs one bounded window and fences completion by lease',async()=>{
    const {service,db,faces}=fixture();db.query.mockResolvedValueOnce({rows:[{revision:'r1'}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValue({rows:[],rowCount:1});
    await service.run(job);expect(faces.scan).toHaveBeenCalledWith(owner,person,{assetId:'fixture'},expect.objectContaining({startS:60,endS:120,jobId:job.id,leaseToken:job.lease_token}));
    const completion=db.query.mock.calls.at(-1)!;expect(completion[0]).toContain("lease_token=$2 AND state='running'");expect(completion[1]).toEqual([job.id,job.lease_token,'completed',null,0,24,null]);
  });
  it('cancels stale enrollment before decoding any media',async()=>{const {service,db,faces}=fixture();db.query.mockResolvedValueOnce({rows:[{revision:'new'}]}).mockResolvedValue({rowCount:1});await service.run(job);expect(faces.scan).not.toHaveBeenCalled();expect(db.query.mock.calls.at(-1)![1][2]).toBe('cancelled');});
  it('reuses checksum-equivalent windows only through scoped suggestion copying',async()=>{
    const {service,db,faces}=fixture();db.query.mockResolvedValueOnce({rows:[{revision:'r1'}]}).mockResolvedValueOnce({rows:[{id:'donor',asset_id:'same-content',frames_scanned:24}]}).mockResolvedValueOnce({rowCount:2}).mockResolvedValue({rowCount:1});
    await service.run(job);expect(faces.scan).not.toHaveBeenCalled();expect(db.query.mock.calls[2][0]).toContain("s.status!='rejected'");expect(db.query.mock.calls[2][1]).toEqual([job.id,job.lease_token,owner,person,'same-content',60,120]);expect(db.query.mock.calls.at(-1)![1]).toEqual([job.id,job.lease_token,'completed',null,2,24,'donor']);
  });
  it('does not treat provider timestamps or fallback identifiers as content hashes',async()=>{
    const {service,db,faces}=fixture();db.query.mockResolvedValueOnce({rows:[{revision:'r1'}]}).mockResolvedValueOnce({rows:[{id:'donor',asset_id:'other',frames_scanned:24}]}).mockResolvedValue({rowCount:1});
    await service.run({...job,asset_checksum:'provider_remote_id_timestamp'});expect(faces.scan).toHaveBeenCalledTimes(1);expect(db.query.mock.calls.at(-1)![1][6]).toBeNull();
  });
  it('blocks unusable references and bounds retryable runtime failures',async()=>{
    for(const [error,attempts,state,code] of [[new UnprocessableEntityException(),1,'blocked','no_reference'],[new ServiceUnavailableException(),1,'queued','local_runtime_unavailable'],[new ServiceUnavailableException(),3,'failed','local_runtime_unavailable']] as const){
      const {service,db,faces}=fixture();db.query.mockResolvedValueOnce({rows:[{revision:'r1'}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValue({rowCount:1});faces.scan.mockRejectedValue(error);await service.run({...job,attempts});
      const call=db.query.mock.calls.at(-1)!;if(state==='queued'){expect(call[0]).toContain("state='queued'");expect(call[1][2]).toBe(code);}else{expect(call[1][2]).toBe(state);expect(call[1][3]).toBe(code);}
    }
  });
  it('prevents overlapping ticks in one worker',async()=>{
    const {service,db}=fixture();let release!:()=>void;db.query.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({rows:[]});})).mockResolvedValue({rows:[]});jest.spyOn(service,'discover').mockResolvedValue();
    const first=service.tick();await service.tick();expect(db.query).toHaveBeenCalledTimes(1);release();await first;expect(db.query).toHaveBeenCalledTimes(2);
  });
});
