import { ConfigService } from '@nestjs/config';
import { MediaService } from './media.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('embedding cache space isolation',()=>{
  it('does not reuse a local vector for another owners Google corpus',async()=>{
    const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-embedding-cache-'));
    const config=new ConfigService({STORAGE_ROOT:root,EMBEDDING_PROVIDER:'gemini',LOCAL_EMBEDDING_USER_IDS:owner});
    const ai={isConfigured:()=>true,getEmbeddingModel:()=> 'google-space',generateEmbedding:jest.fn().mockResolvedValue({values:Array(3072).fill(0)})};
    const local={isAvailable:()=>true,generateEmbedding:jest.fn().mockResolvedValue({values:Array(384).fill(1)})};
    const service=new MediaService(config,{} as any,{} as any,ai as any,local as any,{} as any);
    try{
      expect(await (service as any).getCachedOrGenerateEmbedding('Same query',owner)).toHaveLength(384);
      expect(await (service as any).getCachedOrGenerateEmbedding('Same query',other)).toHaveLength(3072);
      expect(await (service as any).getCachedOrGenerateEmbedding('Same query',owner)).toHaveLength(384);
      expect(ai.generateEmbedding).toHaveBeenCalledTimes(1);expect(local.generateEmbedding).toHaveBeenCalledTimes(1);
    }finally{service.onModuleDestroy();expect(path.dirname(root)).toBe(os.tmpdir());expect(path.basename(root)).toMatch(/^brisky-embedding-cache-/);fs.rmSync(root,{recursive:true,force:true});}
  });
});
