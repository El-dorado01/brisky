import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  framesPerWindow,
  computeFrameTimestamps,
  flattenSceneKeyframes,
  unique,
  aggregateFrameObservations,
  parseKeyframePaths,
  narrowResultWindow,
} from './scene-sampling';

test('framesPerWindow: short windows get 1 frame', () => {
  assert.equal(framesPerWindow(4, 3), 1);
  assert.equal(framesPerWindow(6, 3), 1);
});

test('framesPerWindow: medium windows get 2 frames', () => {
  assert.equal(framesPerWindow(8, 3), 2);
  assert.equal(framesPerWindow(12, 3), 2);
});

test('framesPerWindow: long windows get up to 3, capped by maxFrames', () => {
  assert.equal(framesPerWindow(15, 3), 3);
  assert.equal(framesPerWindow(20, 3), 3);
  assert.equal(framesPerWindow(15, 2), 2);
});

test('framesPerWindow: very long windows get maxFrames', () => {
  assert.equal(framesPerWindow(45, 3), 3);
  assert.equal(framesPerWindow(45, 5), 5);
});

test('computeFrameTimestamps: single frame lands at midpoint', () => {
  assert.deepEqual(computeFrameTimestamps(0, 12, 1), [6]);
});

test('computeFrameTimestamps: multiple frames evenly spaced, avoiding exact boundaries', () => {
  const result = computeFrameTimestamps(0, 12, 3);
  assert.deepEqual(result, [3, 6, 9]);
  for (const t of result) {
    assert.ok(t > 0 && t < 12);
  }
});

test('computeFrameTimestamps: works with non-zero start', () => {
  const result = computeFrameTimestamps(10, 14, 2);
  assert.deepEqual(result, [11.33, 12.67]);
});

test('flattenSceneKeyframes: concatenates and sorts by timestamp', () => {
  const scenes = [
    { keyframes: [{ timestamp: 5, path: 'b.jpg' }] },
    { keyframes: [{ timestamp: 1, path: 'a.jpg' }, { timestamp: 2, path: 'a2.jpg' }] },
  ];
  assert.deepEqual(flattenSceneKeyframes(scenes), [
    { timestamp: 1, path: 'a.jpg' },
    { timestamp: 2, path: 'a2.jpg' },
    { timestamp: 5, path: 'b.jpg' },
  ]);
});

test('flattenSceneKeyframes: handles empty keyframes arrays', () => {
  assert.deepEqual(flattenSceneKeyframes([{ keyframes: [] }]), []);
});

test('unique: dedupes case-insensitively and trims, preserves first-seen casing', () => {
  assert.deepEqual(unique(['Car', ' car ', 'CAR', 'bike']), ['Car', 'bike']);
});

test('unique: drops empty/whitespace-only entries', () => {
  assert.deepEqual(unique(['', '  ', 'dog']), ['dog']);
});

test('aggregateFrameObservations: unions fields across multiple frames', () => {
  const result = aggregateFrameObservations([
    { objects: ['car'], activity: ['sitting'], onScreenText: [] },
    { objects: ['car', 'person'], activity: ['walking'], onScreenText: ['STOP'] },
  ]);
  assert.deepEqual(result.objects, ['car', 'person']);
  assert.deepEqual(result.activity, ['sitting', 'walking']);
  assert.deepEqual(result.onScreenText, ['STOP']);
});

test('aggregateFrameObservations: empty input returns empty arrays', () => {
  const result = aggregateFrameObservations([]);
  assert.deepEqual(result, { objects: [], activity: [], onScreenText: [] });
});

test('parseKeyframePaths: parses a JSON string array', () => {
  const raw = JSON.stringify([{ timestamp: 1.5, path: '/a.jpg' }, { timestamp: 3, path: '/b.jpg' }]);
  assert.deepEqual(parseKeyframePaths(raw), [
    { timestamp: 1.5, path: '/a.jpg' },
    { timestamp: 3, path: '/b.jpg' },
  ]);
});

test('parseKeyframePaths: parses an already-parsed array (JSONB from pg)', () => {
  const raw = [{ timestamp: 2, path: '/c.jpg' }];
  assert.deepEqual(parseKeyframePaths(raw), [{ timestamp: 2, path: '/c.jpg' }]);
});

test('parseKeyframePaths: returns empty array for null/undefined/malformed input', () => {
  assert.deepEqual(parseKeyframePaths(null), []);
  assert.deepEqual(parseKeyframePaths(undefined), []);
  assert.deepEqual(parseKeyframePaths('not json'), []);
  assert.deepEqual(parseKeyframePaths('{}'), []);
});

test('parseKeyframePaths: filters out malformed entries', () => {
  const raw = [{ timestamp: 1, path: '/ok.jpg' }, { path: '/missing-timestamp.jpg' }, { timestamp: 2 }];
  assert.deepEqual(parseKeyframePaths(raw), [{ timestamp: 1, path: '/ok.jpg' }]);
});

test('narrowResultWindow: no matchedTimestamp returns window unchanged', () => {
  assert.deepEqual(narrowResultWindow(0, 14, undefined), { startTime: 0, endTime: 14 });
});

test('narrowResultWindow: matched timestamp in the middle narrows symmetrically', () => {
  assert.deepEqual(narrowResultWindow(0, 14, 7), { startTime: 5.5, endTime: 8.5 });
});

test('narrowResultWindow: clamps to the original window near the start boundary', () => {
  assert.deepEqual(narrowResultWindow(0, 14, 1), { startTime: 0, endTime: 2.5 });
});

test('narrowResultWindow: clamps to the original window near the end boundary', () => {
  assert.deepEqual(narrowResultWindow(0, 14, 13), { startTime: 11.5, endTime: 14 });
});

test('narrowResultWindow: matchedTimestamp outside the window returns window unchanged', () => {
  assert.deepEqual(narrowResultWindow(5, 10, 20), { startTime: 5, endTime: 10 });
});
