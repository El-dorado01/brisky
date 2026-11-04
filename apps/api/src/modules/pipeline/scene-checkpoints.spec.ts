import { ProcessingUnitsService } from './processing-units.service';

describe('owner scoped scene checkpoint transactions', () => {
  function setup(owner: boolean, fingerprint?: string) {
    const client = { query: jest.fn(async (sql: string) => ({ rows: sql.startsWith('SELECT id') ? owner ? [{ id: 'asset' }] : [] :
      sql.startsWith('SELECT metadata') && fingerprint ? [{ metadata: { fingerprint } }] : [] })), release: jest.fn() };
    const service = new ProcessingUnitsService({ getClient: async () => client } as any);
    return { client, service };
  }
  it('refuses another owner before reading or writing checkpoints', async () => {
    const { client, service } = setup(false);
    await expect(service.saveSceneWindow('asset', 'other', 'v1')).rejects.toThrow('belong');
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'SELECT id FROM media_assets WHERE id=$1 AND user_id=$2 FOR UPDATE', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalled();
  });
  it('rolls back mismatched source fingerprints and releases its connection', async () => {
    const { client, service } = setup(true, 'v1');
    await expect(service.saveSceneWindow('asset', 'owner', 'v2', 'scene_window_000000', [])).rejects.toThrow('reindex');
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
  it('commits the source-bound checkpoint in the owner lock transaction', async () => {
    const { client, service } = setup(true, 'v1');
    await service.saveSceneWindow('asset', 'owner', 'v1', 'scene_window_000000', []);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});
