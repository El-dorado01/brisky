import * as path from 'path';
import { resolveStorageLocator, toStorageLocator } from './storage-paths';

describe('storage locators (portable proxy_path)', () => {
  const root = path.resolve('/opt/brisky/storage');

  it('stores paths relative to STORAGE_ROOT', () => {
    const abs = path.join(root, 'proxies', 'vid_1.mp4');
    expect(toStorageLocator(abs, root)).toBe('proxies/vid_1.mp4');
  });

  it('maps a worker container absolute path onto the local storage root', () => {
    const resolved = resolveStorageLocator('/app/storage/proxies/vid_1.mp4', root);
    expect(resolved).toBe(path.resolve(root, 'proxies', 'vid_1.mp4'));
  });

  it('resolves relative locators', () => {
    expect(resolveStorageLocator('clips/clip_abc.mp4', root)).toBe(
      path.resolve(root, 'clips', 'clip_abc.mp4'),
    );
  });

  it('does not return a foreign absolute path that has no known subdirectory', () => {
    expect(resolveStorageLocator('/tmp/evil.mp4', root)).toBeNull();
  });

  it('maps a worker clip path onto local clips/', () => {
    const resolved = resolveStorageLocator('/app/storage/clips/clip_abc.mp4', root);
    expect(resolved).toBe(path.resolve(root, 'clips', 'clip_abc.mp4'));
  });
});
