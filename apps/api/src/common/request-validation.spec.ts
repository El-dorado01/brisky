import { MediaController } from '../modules/media/media.controller';
import { validateClip, validateCredentials, validateFolders, validateSearch } from './request-validation';

describe('runtime request admission', () => {
  it.each([undefined, null, [], {}, { start_s: '0', end_s: 10 }, { start_s: 0, end_s: 0 },
    { start_s: -1, end_s: 10 }, { start_s: 0, end_s: Infinity }, { start_s: 0, end_s: 601 }])('rejects invalid clip input %j', (body) => {
    expect(() => validateClip(body)).toThrow();
  });
  it('allows zero start and bounded fractional timestamps without coercion', () => {
    expect(() => validateClip({ start_s: 0, end_s: 0.5 })).not.toThrow();
    expect(() => validateFolders([])).not.toThrow();
  });
  it('rejects expensive malformed searches and folder lists', () => {
    expect(() => validateSearch({})).toThrow();
    expect(() => validateSearch('a'.repeat(2001))).toThrow();
    expect(() => validateSearch('find a dog', undefined, 'anything')).toThrow();
    expect(() => validateFolders([{ id: 'folder', name: 'a' }, { id: 'folder', name: 'b' }])).toThrow();
    expect(() => validateFolders([null])).toThrow();
    expect(() => validateCredentials('no-email', 'long-password-123')).toThrow();
  });
  it('does not dispatch search or clip work for malformed bodies', async () => {
    const service = { searchDetailed: jest.fn(), enqueueClipExtraction: jest.fn() };
    const controller = new MediaController(service as any, {} as any);
    await expect(controller.searchMoments({ query: 42 } as any, { user: { id: 'owner' } }, {} as any)).rejects.toThrow();
    await expect(controller.extractClip('asset', undefined as any, { user: { id: 'owner' } })).rejects.toThrow();
    expect(service.searchDetailed).not.toHaveBeenCalled();
    expect(service.enqueueClipExtraction).not.toHaveBeenCalled();
  });
});
