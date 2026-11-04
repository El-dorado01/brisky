import { parsePage, pageResult } from './pagination';

describe('keyset cursor admission', () => {
  const rows = [{ id: 'b', cursor_created_at: '2030-01-01T00:00:00.123457Z' }, { id: 'a', cursor_created_at: '2030-01-01T00:00:00.123456Z' }];
  it('keeps microseconds and binds cursors to the resource and user', () => {
    const result = pageResult(rows, { limit: 1 }, 'assets', 'owner', (row) => row.id);
    expect(result.items).toEqual(['b']);
    expect(parsePage('1', result.nextCursor, 'assets', 'owner').after?.createdAt).toBe(rows[0].cursor_created_at);
    expect(() => parsePage('1', result.nextCursor, 'assets', 'other')).toThrow();
    expect(() => parsePage('1', result.nextCursor, 'jobs', 'owner')).toThrow();
    expect(pageResult(rows, { limit: 2 }, 'assets', 'owner', (row) => row).nextCursor).toBeNull();
  });
  it.each(['0','101','-1','1.5','1e2','',[],{}])('rejects invalid limits %j', (limit) => {
    expect(() => parsePage(limit, undefined, 'assets', 'owner')).toThrow();
  });
  it('rejects missing identities and invalid calendar dates before SQL', () => {
    expect(() => parsePage(undefined, undefined, 'assets', '')).toThrow();
    const invalid = Buffer.from(JSON.stringify({ v: 1, resource: 'assets', owner: 'owner', id: 'a', createdAt: '2030-02-30T00:00:00.123456Z' })).toString('base64url');
    expect(() => parsePage('1', invalid, 'assets', 'owner')).toThrow();
  });
});
