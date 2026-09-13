import {
  framesPerWindow,
  computeFrameTimestamps,
  flattenSceneKeyframes,
  unique,
  aggregateFrameObservations,
  parseKeyframePaths,
  narrowResultWindow,
} from './scene-sampling';

describe('scene-sampling', () => {
  it('framesPerWindow: short windows get 1 frame', () => {
    expect(framesPerWindow(4, 3)).toBe(1);
    expect(framesPerWindow(6, 3)).toBe(1);
  });

  it('framesPerWindow: medium windows get 2 frames', () => {
    expect(framesPerWindow(8, 3)).toBe(2);
    expect(framesPerWindow(12, 3)).toBe(2);
  });

  it('framesPerWindow: long windows get up to 3, capped by maxFrames', () => {
    expect(framesPerWindow(15, 3)).toBe(3);
    expect(framesPerWindow(20, 3)).toBe(3);
    expect(framesPerWindow(15, 2)).toBe(2);
  });

  it('framesPerWindow: very long windows get maxFrames', () => {
    expect(framesPerWindow(45, 3)).toBe(3);
    expect(framesPerWindow(45, 5)).toBe(5);
  });

  it('computeFrameTimestamps: single frame lands at midpoint', () => {
    expect(computeFrameTimestamps(0, 12, 1)).toEqual([6]);
  });

  it('computeFrameTimestamps: multiple frames evenly spaced, avoiding exact boundaries', () => {
    const result = computeFrameTimestamps(0, 12, 3);
    expect(result).toEqual([3, 6, 9]);
    for (const t of result) {
      expect(t > 0 && t < 12).toBe(true);
    }
  });

  it('computeFrameTimestamps: works with non-zero start', () => {
    const result = computeFrameTimestamps(10, 14, 2);
    expect(result).toEqual([11.33, 12.67]);
  });

  it('flattenSceneKeyframes: concatenates and sorts by timestamp', () => {
    const scenes = [
      { keyframes: [{ timestamp: 5, path: 'b.jpg' }] },
      { keyframes: [{ timestamp: 1, path: 'a.jpg' }, { timestamp: 2, path: 'a2.jpg' }] },
    ];
    expect(flattenSceneKeyframes(scenes)).toEqual([
      { timestamp: 1, path: 'a.jpg' },
      { timestamp: 2, path: 'a2.jpg' },
      { timestamp: 5, path: 'b.jpg' },
    ]);
  });

  it('flattenSceneKeyframes: handles empty keyframes arrays', () => {
    expect(flattenSceneKeyframes([{ keyframes: [] }])).toEqual([]);
  });

  it('unique: dedupes case-insensitively and trims, preserves first-seen casing', () => {
    expect(unique(['Car', ' car ', 'CAR', 'bike'])).toEqual(['Car', 'bike']);
  });

  it('unique: drops empty/whitespace-only entries', () => {
    expect(unique(['', '  ', 'dog'])).toEqual(['dog']);
  });

  it('aggregateFrameObservations: unions fields across multiple frames', () => {
    const result = aggregateFrameObservations([
      { objects: ['car'], activity: ['sitting'], onScreenText: [] },
      { objects: ['car', 'person'], activity: ['walking'], onScreenText: ['STOP'] },
    ]);
    expect(result.objects).toEqual(['car', 'person']);
    expect(result.activity).toEqual(['sitting', 'walking']);
    expect(result.onScreenText).toEqual(['STOP']);
  });

  it('aggregateFrameObservations: empty input returns empty arrays', () => {
    const result = aggregateFrameObservations([]);
    expect(result).toEqual({ objects: [], activity: [], onScreenText: [] });
  });

  it('parseKeyframePaths: parses a JSON string array', () => {
    const raw = JSON.stringify([{ timestamp: 1.5, path: '/a.jpg' }, { timestamp: 3, path: '/b.jpg' }]);
    expect(parseKeyframePaths(raw)).toEqual([
      { timestamp: 1.5, path: '/a.jpg' },
      { timestamp: 3, path: '/b.jpg' },
    ]);
  });

  it('parseKeyframePaths: parses an already-parsed array (JSONB from pg)', () => {
    const raw = [{ timestamp: 2, path: '/c.jpg' }];
    expect(parseKeyframePaths(raw)).toEqual([{ timestamp: 2, path: '/c.jpg' }]);
  });

  it('parseKeyframePaths: returns empty array for null/undefined/malformed input', () => {
    expect(parseKeyframePaths(null)).toEqual([]);
    expect(parseKeyframePaths(undefined)).toEqual([]);
    expect(parseKeyframePaths('not json')).toEqual([]);
    expect(parseKeyframePaths('{}')).toEqual([]);
  });

  it('parseKeyframePaths: filters out malformed entries', () => {
    const raw = [{ timestamp: 1, path: '/ok.jpg' }, { path: '/missing-timestamp.jpg' }, { timestamp: 2 }];
    expect(parseKeyframePaths(raw)).toEqual([{ timestamp: 1, path: '/ok.jpg' }]);
  });

  it('narrowResultWindow: no matchedTimestamp returns window unchanged', () => {
    expect(narrowResultWindow(0, 14, undefined)).toEqual({ startTime: 0, endTime: 14 });
  });

  it('narrowResultWindow: matched timestamp in the middle narrows symmetrically', () => {
    expect(narrowResultWindow(0, 14, 7)).toEqual({ startTime: 5.5, endTime: 8.5 });
  });

  it('narrowResultWindow: clamps to the original window near the start boundary', () => {
    expect(narrowResultWindow(0, 14, 1)).toEqual({ startTime: 0, endTime: 2.5 });
  });

  it('narrowResultWindow: clamps to the original window near the end boundary', () => {
    expect(narrowResultWindow(0, 14, 13)).toEqual({ startTime: 11.5, endTime: 14 });
  });

  it('narrowResultWindow: matchedTimestamp outside the window returns window unchanged', () => {
    expect(narrowResultWindow(5, 10, 20)).toEqual({ startTime: 5, endTime: 10 });
  });
});
