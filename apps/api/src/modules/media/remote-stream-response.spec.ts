import fastify from 'fastify';
import { Readable } from 'stream';
import { remoteStreamResponse } from './remote-stream-response';
import { MediaService } from './media.service';

describe('original connector playback',()=>{
  function source(){return {size:10,version:'v1',mime:'video/mp4',validate:jest.fn().mockResolvedValue(undefined),
    read:jest.fn(async(start:number,length:number)=>({status:206,contentRange:`bytes ${start}-${start+length-1}/10`,stream:Readable.from(Buffer.from('0123456789').subarray(start,start+length))}))};}
  it('supports full, bounded and suffix reads without a local media file',async()=>{
    const remote=source(),app=fastify();app.get('/video',(req,res)=>remoteStreamResponse(remote,req,res,new AbortController().signal));
    try{
      expect((await app.inject('/video')).body).toBe('0123456789');
      const range=await app.inject({url:'/video',headers:{range:'bytes=2-5'}});
      expect(range.statusCode).toBe(206);expect(range.body).toBe('2345');expect(range.headers['content-range']).toBe('bytes 2-5/10');
      const suffix=await app.inject({url:'/video',headers:{range:'bytes=-2'}});expect(suffix.body).toBe('89');
      expect(remote.validate).toHaveBeenCalledTimes(3);
    }finally{await app.close();}
  });
  it('answers HEAD and invalid ranges without downloading source bytes',async()=>{
    const remote=source(),app=fastify();app.head('/video',(req,res)=>remoteStreamResponse(remote,req,res,new AbortController().signal));app.get('/video',(req,res)=>remoteStreamResponse(remote,req,res,new AbortController().signal));
    try{const head=await app.inject({method:'HEAD',url:'/video'});expect(head.statusCode).toBe(200);expect(head.headers['content-length']).toBe('10');expect(head.body).toBe('');
      expect((await app.inject({url:'/video',headers:{range:'bytes=20-'}})).statusCode).toBe(416);expect(remote.read).not.toHaveBeenCalled();
    }finally{await app.close();}
  });
  it('rejects ignored/mismatched upstream ranges before sending media',async()=>{
    const remote=source(),stream=Readable.from('0123456789');remote.read.mockResolvedValue({status:200,contentRange:'',stream});const app=fastify();app.get('/video',(req,res)=>remoteStreamResponse(remote,req,res,new AbortController().signal));
    try{expect((await app.inject('/video')).statusCode).toBe(500);expect(stream.destroyed).toBe(true);}finally{await app.close();}
  });
  it('rejects a changed source before piping it',async()=>{
    const remote=source();remote.validate.mockRejectedValue(Error('changed'));const app=fastify();app.get('/video',(req,res)=>remoteStreamResponse(remote,req,res,new AbortController().signal));
    try{expect((await app.inject('/video')).statusCode).toBe(500);}finally{await app.close();}
  });
  function service(rows:any[]){const instance=Object.create(MediaService.prototype);const remote=source();Object.assign(instance,{db:{query:jest.fn().mockResolvedValue({rows})},connectorsService:{getAuthContext:jest.fn().mockResolvedValue({})},connectorRegistry:{get:()=>({openReadSession:jest.fn().mockResolvedValue(remote)})}});return {instance,remote};}
  const asset={source_type:'google_drive',connector_account_id:'account',external_file_id:'remote',file_size:10,source_version:'v1',original_filename:'video.mp4'};
  it('scopes original access to both the source owner and connector owner',async()=>{
    const {instance}=service([]);expect(await instance.getRemotePlaybackSource('asset','foreign',new AbortController().signal)).toBeNull();expect(instance.connectorsService.getAuthContext).not.toHaveBeenCalled();
    expect(instance.db.query.mock.calls[0][1]).toEqual(['asset','foreign']);expect(instance.db.query.mock.calls[0][0]).toContain('c.user_id=a.user_id');
  });
  it('refuses stale source versions and sizes rather than playing different footage',async()=>{
    for(const row of [{...asset,source_version:'old'},{...asset,file_size:11}]){
      const {instance}=service([row]);await expect(instance.getRemotePlaybackSource('asset','owner',new AbortController().signal)).rejects.toThrow(/source changed|confirm the indexed source identity/);
    }
  });
  it('returns a versioned read session for an owned indexed original',async()=>{
    const {instance}=service([asset]);expect(await instance.getRemotePlaybackSource('asset','owner',new AbortController().signal)).toMatchObject({size:10,mime:'video/mp4'});
    expect(instance.connectorsService.getAuthContext).toHaveBeenCalledWith('account','owner');
  });
  it('allows metadata-only version changes only when the content checksum still matches',async()=>{
    const checksum='a'.repeat(32),{instance}=service([{...asset,source_version:'old',checksum}]);
    const getAsset=jest.fn().mockResolvedValue({size:10,md5Checksum:checksum});
    instance.connectorRegistry={get:()=>({openReadSession:async()=>source(),getAsset})};
    expect(await instance.getRemotePlaybackSource('asset','owner',new AbortController().signal)).toMatchObject({size:10});
    getAsset.mockResolvedValue({size:10,md5Checksum:'b'.repeat(32)});
    await expect(instance.getRemotePlaybackSource('asset','owner',new AbortController().signal)).rejects.toThrow('source changed');
  });
});
