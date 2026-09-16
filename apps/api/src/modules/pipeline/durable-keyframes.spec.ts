import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { persistDurableKeyframes } from './durable-keyframes';

describe('Durable Keyframes Seam (Phase F0)', () => {
  let tempRoot: string;
  let scratchDir: string;
  let durableDir: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-kf-test-'));
    scratchDir = path.join(tempRoot, 'scratch', 'test_asset');
    durableDir = path.join(tempRoot, 'keyframes');
    fs.mkdirSync(scratchDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('persists keyframes to durable storage that survive scratch directory deletion', () => {
    // 1. Create a scratch frame JPEG
    const scratchFrame1 = path.join(scratchDir, 'frame_001.jpg');
    fs.writeFileSync(scratchFrame1, 'fake-jpeg-data-1');
    const scratchFrame2 = path.join(scratchDir, 'frame_002.jpg');
    fs.writeFileSync(scratchFrame2, 'fake-jpeg-data-2');

    const inputKeyframes = [
      { timestamp: 1.5, path: scratchFrame1 },
      { timestamp: 4.2, path: scratchFrame2 },
    ];

    // 2. Persist keyframes to durable storage
    const durableKeyframes = persistDurableKeyframes('test_asset', durableDir, inputKeyframes);

    expect(durableKeyframes.length).toBe(2);
    expect(durableKeyframes[0].timestamp).toBe(1.5);
    expect(durableKeyframes[0].path).toContain(path.join('keyframes', 'test_asset'));
    expect(fs.existsSync(durableKeyframes[0].path)).toBe(true);
    expect(fs.readFileSync(durableKeyframes[0].path, 'utf8')).toBe('fake-jpeg-data-1');

    // 3. Simulate scratch purge (Phase 4 core thesis)
    fs.rmSync(scratchDir, { recursive: true, force: true });
    expect(fs.existsSync(scratchDir)).toBe(false);

    // 4. Verify durable keyframes STILL EXIST post-purge (Stage-2 search requirement)
    expect(fs.existsSync(durableKeyframes[0].path)).toBe(true);
    expect(fs.existsSync(durableKeyframes[1].path)).toBe(true);
    expect(fs.readFileSync(durableKeyframes[0].path, 'utf8')).toBe('fake-jpeg-data-1');
  });

  it('handles empty or missing keyframes gracefully', () => {
    expect(persistDurableKeyframes('test_asset', durableDir, [])).toEqual([]);
    expect(
      persistDurableKeyframes('test_asset', durableDir, [
        { timestamp: 2.0, path: path.join(scratchDir, 'non_existent.jpg') },
      ]),
    ).toEqual([{ timestamp: 2.0, path: path.join(scratchDir, 'non_existent.jpg') }]);
  });
});
