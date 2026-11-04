import { byteRange,streamResponse } from './stream-response';
import fastify from 'fastify';
import { mkdtempSync,writeFileSync,rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SaaS source byte streaming',()=>{
  it('handles bounded, open and suffix ranges and rejects invalid values',()=>{
    expect(byteRange(undefined,10)).toBeNull();
    expect(byteRange('bytes=2-5',10)).toEqual({start:2,end:5});
    expect(byteRange('bytes=8-',10)).toEqual({start:8,end:9});
    expect(byteRange('bytes=-3',10)).toEqual({start:7,end:9});
    expect(byteRange('bytes=2-999',10)).toEqual({start:2,end:9});
    for(const value of ['bytes=10-','bytes=3-2','bytes=-0','bytes=-','bytes=0-1,3-4','bytes=9007199254740993-','nope'])expect(byteRange(value,10)).toBe(false);
  });
  it('sends exact bytes, HEAD metadata and 416 without disclosing a filesystem path',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'brisky-playback-')),file=join(dir,'test.mp4');writeFileSync(file,'0123456789');
    const app=fastify();app.get('/video',(req,res)=>streamResponse(file,req,res));
    try{
      const full=await app.inject('/video');expect(full.statusCode).toBe(200);expect(full.body).toBe('0123456789');
      const range=await app.inject({url:'/video',headers:{range:'bytes=2-5'}});expect(range.statusCode).toBe(206);expect(range.body).toBe('2345');expect(range.headers['content-range']).toBe('bytes 2-5/10');expect(range.headers['cache-control']).toBe('private, no-store');
      const suffix=await app.inject({url:'/video',headers:{range:'bytes=-2'}});expect(suffix.body).toBe('89');
      const head=await app.inject({method:'HEAD',url:'/video'});expect(head.statusCode).toBe(200);expect(head.body).toBe('');expect(head.headers['content-length']).toBe('10');
      const invalid=await app.inject({url:'/video',headers:{range:'bytes=11-'}});expect(invalid.statusCode).toBe(416);expect(invalid.headers['content-range']).toBe('bytes */10');expect(invalid.body).not.toContain(file);
    }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
  });
});
