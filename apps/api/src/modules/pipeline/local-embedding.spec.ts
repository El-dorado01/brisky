import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { LocalEmbeddingService } from './local-embedding.service';
import { withSearchDeadline } from '../../common/search-deadline';

describe('persistent embedding worker', () => {
  let service: LocalEmbeddingService;
  let config: ConfigService;
  beforeEach(() => {
    config = new ConfigService({ LOCAL_EMBEDDING_TIMEOUT_MS: 10000, LOCAL_EMBEDDING_IDLE_MS: 60000 });
    service = new LocalEmbeddingService(config);
    jest.spyOn(service, 'getPythonBinary').mockReturnValue(process.execPath);
    jest.spyOn(service, 'getScriptPath').mockReturnValue(path.join(__dirname, 'fixtures', 'embedding-worker.cjs'));
  });
  afterEach(() => service.onModuleDestroy());
  it('reuses one process for single and batch requests with correctly routed replies', async () => {
    const first = await service.generateEmbedding('first');
    const pid = (service as any).worker.pid;
    const [second, batch] = await Promise.all([service.generateEmbedding('second'), service.generateBatchEmbeddings(['a', 'longer'])]);
    expect(first.values).toHaveLength(384);
    expect(second.values[0]).toBe(6);
    expect(batch.vectors.map((v) => v[0])).toEqual([1, 6]);
    expect((service as any).worker.pid).toBe(pid);
  });
  it('preserves multilingual input on the worker protocol',async()=>{
    const text='One, two, go! 中文';
    expect((await service.generateEmbedding(text)).values[0]).toBe(text.length);
    expect((service as any).worker.spawnargs).toBeDefined();
  });
  it('rejects malformed dimensions instead of indexing invalid vectors', async () => {
    await expect(service.generateEmbedding('__bad__')).rejects.toThrow('Invalid local embedding vectors');
  });
  it('restarts lazily after a worker crash without silently replaying work', async () => {
    await service.generateEmbedding('warm');
    const pid = (service as any).worker.pid;
    await expect(service.generateEmbedding('__crash__')).rejects.toThrow('worker failed');
    expect((await service.generateEmbedding('new')).values[0]).toBe(3);
    expect((service as any).worker.pid).not.toBe(pid);
  });
  it('kills stalled work at its deadline and permits a later clean restart', async () => {
    await service.generateEmbedding('warm');
    config.set('LOCAL_EMBEDDING_TIMEOUT_MS', 50);
    await expect(service.generateEmbedding('__hang__')).rejects.toThrow('deadline exceeded');
    expect((service as any).worker).toBeUndefined();
    config.set('LOCAL_EMBEDDING_TIMEOUT_MS', 10000);
    expect((await service.generateEmbedding('new')).values[0]).toBe(3);
  });
  it('stops local inference when its enclosing search expires', async () => {
    await service.generateEmbedding('warm');
    await expect(withSearchDeadline(50, () => service.generateEmbedding('__hang__'))).rejects.toThrow('Search deadline');
    expect((service as any).worker).toBeUndefined();
  });
  it('releases the worker after the idle period', async () => {
    config.set('LOCAL_EMBEDDING_IDLE_MS', 20);
    await service.generateEmbedding('warm');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((service as any).worker).toBeUndefined();
  });
  it('does not restart after application shutdown', async () => {
    service.onModuleDestroy();
    await expect(service.generateEmbedding('text')).rejects.toThrow('service stopped');
  });
});
