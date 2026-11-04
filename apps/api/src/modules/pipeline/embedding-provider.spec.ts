import { ConfigService } from '@nestjs/config';
import { embeddingProviderForUser } from './embedding-provider';
describe('owner-scoped embedding selection',()=>{
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  it('preserves the global space for other and unscoped callers',()=>{
    const config=new ConfigService({EMBEDDING_PROVIDER:'gemini',LOCAL_EMBEDDING_USER_IDS:owner});
    expect(embeddingProviderForUser(config,owner)).toBe('local');
    expect(embeddingProviderForUser(config,other)).toBe('gemini');
    expect(embeddingProviderForUser(config)).toBe('gemini');
  });
  it('retains global local selection and rejects malformed owner configuration',()=>{
    expect(embeddingProviderForUser(new ConfigService({EMBEDDING_PROVIDER:'local'}),other)).toBe('local');
    expect(()=>embeddingProviderForUser(new ConfigService({LOCAL_EMBEDDING_USER_IDS:'everyone'}),owner)).toThrow('Invalid');
  });
});
