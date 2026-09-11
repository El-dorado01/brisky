# Multi-Frame Scene Sampling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract more than one keyframe per detected scene window (scaled to window length), aggregate all in-window frame observations into each segment, fix a Stage-2 verification bug that reads frames from the wrong location, and narrow the reported result window to the matched frame's timestamp when Stage-2 identifies it.

**Architecture:** All new deterministic logic (frame-count math, timestamp spacing, list flattening/aggregation, JSON parsing, window narrowing) lives in one new pure-function module (`scene-sampling.ts`) with no NestJS decorators, so it can be unit-tested directly with Node's built-in test runner without pulling in `reflect-metadata`/DI. Each existing service then imports and calls these functions at the one or two call sites that need to change. The DB/FFmpeg/Gemini-API-touching code around those call sites is unchanged in shape — only the data flowing through it gets richer (multiple frames instead of one).

**Tech Stack:** NestJS + TypeScript (existing), `node:test` + `node:assert` run via `ts-node/register` (new — repo has zero existing tests; `ts-node` is already a devDependency), PostgreSQL/JSONB (existing), FFmpeg (existing), Gemini API (existing).

**Spec:** `docs/superpowers/specs/2026-09-10-multi-frame-scene-sampling-design.md`

## Global Constraints

- Default `MAX_FRAMES_PER_SCENE` is `3` (from the spec's cost cap).
- Frame count thresholds are exactly: ≤6s → 1 frame, ≤12s → 2 frames, ≤20s → `min(3, maxFrames)`, >20s → `maxFrames`.
- Sub-scene narrowing padding is exactly ±1.5 seconds around a matched timestamp, clamped to the candidate's original `[startTime, endTime]`.
- Schema changes are additive only (`ADD COLUMN IF NOT EXISTS`) — no backfill, no destructive migration.
- No frontend changes. `SearchResult` shape is unchanged; only `startTime`/`endTime` values get tighter when Stage-2 identifies a match.
- `keyframePathsJson` is stored as JSONB: an array of `{ "timestamp": number, "path": string }` objects.

---

## File Structure

- **Create** `apps/api/src/modules/pipeline/scene-sampling.ts` — all new pure functions (frame count math, timestamp spacing, list flatten/aggregate/dedupe, JSON parsing, window narrowing). No decorators, no I/O, no NestJS imports.
- **Create** `apps/api/src/modules/pipeline/scene-sampling.spec.ts` — full unit test suite for the above.
- **Modify** `apps/api/src/modules/pipeline/pipeline.types.ts` — extend `SceneBoundary` with `keyframes`, extend `UnifiedSegment` with `keyframePaths`, bump `ANALYSIS_VERSION`.
- **Modify** `apps/api/src/modules/pipeline/ffmpeg-pipeline.service.ts` — `detectScenesAndExtractFrames` extracts N frames per window instead of 1.
- **Modify** `apps/api/src/modules/pipeline/gemini-intelligence.service.ts` — `analyzeFrames` consumes a flattened frame list; `verifyCandidate` gains `matchedTimestamp` in its response.
- **Modify** `apps/api/src/modules/pipeline/intelligence-merger.service.ts` — aggregates all in-window frame observations instead of just the first; removes its now-duplicate private `unique()` in favor of the shared one.
- **Modify** `apps/api/src/modules/database/schema.sql` — add `media_segments.keyframe_paths JSONB DEFAULT '[]'`.
- **Modify** `apps/api/src/modules/queue/indexing.processor.ts` — persist `keyframePaths` into the new column.
- **Modify** `apps/api/src/modules/media/media.service.ts` — `applyStage2Verification` fetches frames by `segmentId` instead of directory-listing the whole asset; `enrichVerifiedHit` narrows the result window using the matched timestamp.

---

### Task 1: Pure scene-sampling helpers

**Files:**
- Create: `apps/api/src/modules/pipeline/scene-sampling.ts`
- Test: `apps/api/src/modules/pipeline/scene-sampling.spec.ts`

**Interfaces:**
- Produces (used by every later task):
  ```ts
  export function framesPerWindow(lengthSec: number, maxFrames: number): number;
  export function computeFrameTimestamps(startTime: number, endTime: number, count: number): number[];
  export interface FlatFrame { timestamp: number; path: string }
  export function flattenSceneKeyframes(scenes: Array<{ keyframes: FlatFrame[] }>): FlatFrame[];
  export function unique(values: string[]): string[];
  export interface AggregatableFrame { objects: string[]; activity: string[]; onScreenText: string[] }
  export interface AggregatedFrameFields { objects: string[]; activity: string[]; onScreenText: string[] }
  export function aggregateFrameObservations(frameObs: AggregatableFrame[]): AggregatedFrameFields;
  export interface RawKeyframeEntry { timestamp: number; path: string }
  export function parseKeyframePaths(raw: unknown): RawKeyframeEntry[];
  export function narrowResultWindow(
    startTime: number,
    endTime: number,
    matchedTimestamp: number | undefined,
    paddingSec?: number,
  ): { startTime: number; endTime: number };
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/pipeline/scene-sampling.spec.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && node --require ts-node/register --test src/modules/pipeline/scene-sampling.spec.ts`
Expected: FAIL with `Cannot find module './scene-sampling'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/pipeline/scene-sampling.ts

export function framesPerWindow(lengthSec: number, maxFrames: number): number {
  if (lengthSec <= 6) return 1;
  if (lengthSec <= 12) return 2;
  if (lengthSec <= 20) return Math.min(3, maxFrames);
  return maxFrames;
}

export function computeFrameTimestamps(startTime: number, endTime: number, count: number): number[] {
  const span = endTime - startTime;
  const timestamps: number[] = [];
  for (let i = 1; i <= count; i++) {
    const t = startTime + (span * i) / (count + 1);
    timestamps.push(Number(t.toFixed(2)));
  }
  return timestamps;
}

export interface FlatFrame {
  timestamp: number;
  path: string;
}

export function flattenSceneKeyframes(scenes: Array<{ keyframes: FlatFrame[] }>): FlatFrame[] {
  const flat: FlatFrame[] = [];
  for (const scene of scenes) {
    for (const kf of scene.keyframes || []) {
      flat.push(kf);
    }
  }
  return flat.sort((a, b) => a.timestamp - b.timestamp);
}

export function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = (value || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export interface AggregatableFrame {
  objects: string[];
  activity: string[];
  onScreenText: string[];
}

export interface AggregatedFrameFields {
  objects: string[];
  activity: string[];
  onScreenText: string[];
}

export function aggregateFrameObservations(frameObs: AggregatableFrame[]): AggregatedFrameFields {
  return {
    objects: unique(frameObs.flatMap((f) => f.objects || [])),
    activity: unique(frameObs.flatMap((f) => f.activity || [])),
    onScreenText: unique(frameObs.flatMap((f) => f.onScreenText || [])),
  };
}

export interface RawKeyframeEntry {
  timestamp: number;
  path: string;
}

export function parseKeyframePaths(raw: unknown): RawKeyframeEntry[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (f): f is RawKeyframeEntry =>
          Boolean(f) && typeof f.path === 'string' && f.path.length > 0 && typeof f.timestamp === 'number',
      )
      .map((f) => ({ timestamp: f.timestamp, path: f.path }));
  } catch {
    return [];
  }
}

export function narrowResultWindow(
  startTime: number,
  endTime: number,
  matchedTimestamp: number | undefined,
  paddingSec = 1.5,
): { startTime: number; endTime: number } {
  if (matchedTimestamp === undefined || matchedTimestamp < startTime || matchedTimestamp > endTime) {
    return { startTime, endTime };
  }
  return {
    startTime: Number(Math.max(startTime, matchedTimestamp - paddingSec).toFixed(2)),
    endTime: Number(Math.min(endTime, matchedTimestamp + paddingSec).toFixed(2)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && node --require ts-node/register --test src/modules/pipeline/scene-sampling.spec.ts`
Expected: PASS, all 21 tests green

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pipeline/scene-sampling.ts apps/api/src/modules/pipeline/scene-sampling.spec.ts
git commit -m "feat: add pure scene-sampling helpers for multi-frame extraction"
```

---

### Task 2: Extend types + wire frame count/spacing into FFmpeg extraction

**Files:**
- Modify: `apps/api/src/modules/pipeline/pipeline.types.ts:11-17` (`SceneBoundary`)
- Modify: `apps/api/src/modules/pipeline/ffmpeg-pipeline.service.ts:246-293` (`detectScenesAndExtractFrames`)

**Interfaces:**
- Consumes: `framesPerWindow(lengthSec, maxFrames)`, `computeFrameTimestamps(startTime, endTime, count)` from Task 1.
- Produces: `SceneBoundary.keyframes: { timestamp: number; path: string }[]` — consumed by Task 3 (`flattenSceneKeyframes`) and Task 4 (merger aggregation).

- [ ] **Step 1: Extend `SceneBoundary`**

In `apps/api/src/modules/pipeline/pipeline.types.ts`, replace:

```ts
export interface SceneBoundary {
  sceneId: number;
  startTime: number;
  endTime: number;
  representativeTimestamp: number;
  keyframePath: string;
}
```

with:

```ts
export interface SceneBoundary {
  sceneId: number;
  startTime: number;
  endTime: number;
  representativeTimestamp: number;
  keyframePath: string;
  keyframes: { timestamp: number; path: string }[];
}
```

- [ ] **Step 2: Wire multi-frame extraction into `detectScenesAndExtractFrames`**

In `apps/api/src/modules/pipeline/ffmpeg-pipeline.service.ts`, add the import at the top of the file:

```ts
import { framesPerWindow, computeFrameTimestamps } from './scene-sampling';
```

Replace the body of `detectScenesAndExtractFrames` (currently lines ~263-287, the loop that extracts exactly one frame per window) with:

```ts
    const maxFramesPerScene = Number(this.configService.get('MAX_FRAMES_PER_SCENE', 3));

    const scenes: SceneBoundary[] = [];
    for (let i = 0; i < windows.length; i++) {
      if (onProgress) {
        onProgress(i + 1, windows.length);
      }
      const { startTime, endTime } = windows[i];
      const representativeTimestamp = Number(((startTime + endTime) / 2).toFixed(2));

      const windowLength = endTime - startTime;
      const frameCount = framesPerWindow(windowLength, maxFramesPerScene);
      const frameTimestamps =
        frameCount === 1 ? [representativeTimestamp] : computeFrameTimestamps(startTime, endTime, frameCount);

      const keyframes: { timestamp: number; path: string }[] = [];
      for (let f = 0; f < frameTimestamps.length; f++) {
        const ts = frameTimestamps[f];
        const keyframeFile = `scene_${String(i + 1).padStart(3, '0')}_f${String(f + 1).padStart(2, '0')}.jpg`;
        const keyframePath = path.join(framesOutputDir, keyframeFile);
        try {
          await this.extractFrame(videoPath, keyframePath, ts, '640x?');
          keyframes.push({ timestamp: ts, path: keyframePath });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed extracting keyframe ${f + 1}/${frameTimestamps.length} for scene ${i + 1}: ${message}`);
        }
      }

      scenes.push({
        sceneId: i + 1,
        startTime,
        endTime,
        representativeTimestamp,
        keyframePath: keyframes[0]?.path || '',
        keyframes,
      });
    }
```

Note: this replaces the single `extractFrame` call and its `try/catch` (previously producing one `keyframePath`) with a loop producing `keyframes[]`; `keyframePath` (singular) is kept on the scene object as `keyframes[0]?.path`, preserving compatibility with any code still reading the singular field (e.g. thumbnail generation elsewhere in the same file, which calls `generateThumbnail` separately and does not read `scene.keyframePath` — verify this stays true after the edit by checking other reads of `.keyframePath` in the file).

- [ ] **Step 3: Verify no other code path in this file breaks**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new type errors referencing `ffmpeg-pipeline.service.ts` or `pipeline.types.ts`. (Other files that read `SceneBoundary.keyframePath` still compile since the field still exists; files that will need updating for `.keyframes` are handled in later tasks.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/pipeline/pipeline.types.ts apps/api/src/modules/pipeline/ffmpeg-pipeline.service.ts
git commit -m "feat: extract multiple keyframes per scene window, scaled to window length"
```

---

### Task 3: Wire flattened frame list into Gemini frame analysis

**Files:**
- Modify: `apps/api/src/modules/pipeline/gemini-intelligence.service.ts:376-451` (`analyzeFrames`)

**Interfaces:**
- Consumes: `flattenSceneKeyframes(scenes)` from Task 1; `SceneBoundary.keyframes` from Task 2.
- Produces: `analyzeFrames` still returns `{ observations: FrameObservation[]; usage: ModelUsage }` — unchanged shape, so `indexing.processor.ts` (the caller) needs no changes for this task.

- [ ] **Step 1: Add the import**

In `apps/api/src/modules/pipeline/gemini-intelligence.service.ts`, add:

```ts
import { flattenSceneKeyframes } from './scene-sampling';
```

- [ ] **Step 2: Replace the frame-selection logic at the top of `analyzeFrames`**

Currently:

```ts
    const frames = scenes.filter((s) => s.keyframePath && fs.existsSync(s.keyframePath));
    if (frames.length === 0) {
      return { observations: [], usage: this.emptyUsage('frame_analysis') };
    }
```

Replace with:

```ts
    const flattened = flattenSceneKeyframes(scenes);
    const frames = flattened.filter((f) => f.path && fs.existsSync(f.path));
    if (frames.length === 0) {
      return { observations: [], usage: this.emptyUsage('frame_analysis') };
    }
```

- [ ] **Step 3: Update the batch-building loop to use `frame.timestamp`/`frame.path` instead of `frame.representativeTimestamp`/`frame.keyframePath`**

Currently (inside the `for (const frame of batchFrames)` loop):

```ts
      for (const frame of batchFrames) {
        const data = fs.readFileSync(frame.keyframePath).toString('base64');
        parts.push({ text: `Frame at ${frame.representativeTimestamp.toFixed(2)}s:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
      }
```

Replace with:

```ts
      for (const frame of batchFrames) {
        const data = fs.readFileSync(frame.path).toString('base64');
        parts.push({ text: `Frame at ${frame.timestamp.toFixed(2)}s:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
      }
```

The rest of `analyzeFrames` (batching, prompt text, response parsing, final `.sort((a, b) => a.timestamp - b.timestamp)`) is unchanged — it already treats frames generically by timestamp, which is why this task is a small, localized change.

- [ ] **Step 4: Type-check**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `gemini-intelligence.service.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pipeline/gemini-intelligence.service.ts
git commit -m "feat: analyze all scene keyframes, not just one per scene"
```

---

### Task 4: Aggregate all in-window frame observations in the merger

**Files:**
- Modify: `apps/api/src/modules/pipeline/pipeline.types.ts:80-98` (`UnifiedSegment`)
- Modify: `apps/api/src/modules/pipeline/intelligence-merger.service.ts:1-249`

**Interfaces:**
- Consumes: `aggregateFrameObservations`, `unique` from Task 1.
- Produces: `UnifiedSegment.keyframePaths: { timestamp: number; path: string }[]` — consumed by Task 5 (persistence).

- [ ] **Step 1: Extend `UnifiedSegment`**

In `apps/api/src/modules/pipeline/pipeline.types.ts`, add a field to `UnifiedSegment` (after `keyframePath?: string;`):

```ts
  keyframePath?: string;
  keyframePaths: { timestamp: number; path: string }[];
```

- [ ] **Step 2: Replace the import and remove the duplicate `unique()`**

In `apps/api/src/modules/pipeline/intelligence-merger.service.ts`, replace the import block's tail:

```ts
import { GeminiIntelligenceService } from './gemini-intelligence.service';
import { LocalEmbeddingService } from './local-embedding.service';
```

with:

```ts
import { GeminiIntelligenceService } from './gemini-intelligence.service';
import { LocalEmbeddingService } from './local-embedding.service';
import { aggregateFrameObservations, unique } from './scene-sampling';
```

Delete the file's own `function unique(...)` definition at the bottom (currently the last ~12 lines of the file, after the closing `}` of the `IntelligenceMergerService` class) — it's now imported from `scene-sampling.ts` instead.

- [ ] **Step 3: Aggregate all in-window frames instead of just `nearestFrame`**

Currently, inside the `for (let i = 0; i < scenes.length; i++)` loop:

```ts
      const frameObs = visual.filter(
        (obs) => obs.timestamp >= start - 0.05 && obs.timestamp <= end + 0.05,
      );
      const nearestFrame =
        frameObs[0] ||
        visual.reduce<FrameObservation | undefined>((best, obs) => {
          if (!best) return obs;
          return Math.abs(obs.timestamp - scene.representativeTimestamp) <
            Math.abs(best.timestamp - scene.representativeTimestamp)
            ? obs
            : best;
        }, undefined);

      const overlappingTranscript = transcript
        .filter((cue) => cue.start_time < end && cue.end_time > start && (cue.text || '').trim())
        .map((cue) => cue.text.trim())
        .join(' ');

      const overlappingGemini = (gemini.segments || []).filter(
        (seg) => seg.start_time < end && seg.end_time > start,
      );

      const objects = unique([
        ...(nearestFrame?.objects || []),
        ...overlappingGemini.flatMap((g) => g.visual_objects || []),
      ]);
      const actions = unique([
        ...(nearestFrame?.activity || []),
        ...overlappingGemini.flatMap((g) => g.actions || []),
      ]);
      const onScreenText = unique([
        ...(nearestFrame?.onScreenText || []),
        ...overlappingGemini
          .flatMap((g) => [g.title || ''])
          .filter((t) => /overlay|caption|text/i.test(t)),
      ]);
```

Replace with:

```ts
      const frameObs = visual.filter(
        (obs) => obs.timestamp >= start - 0.05 && obs.timestamp <= end + 0.05,
      );
      const nearestFrame =
        frameObs[0] ||
        visual.reduce<FrameObservation | undefined>((best, obs) => {
          if (!best) return obs;
          return Math.abs(obs.timestamp - scene.representativeTimestamp) <
            Math.abs(best.timestamp - scene.representativeTimestamp)
            ? obs
            : best;
        }, undefined);

      const aggregated = aggregateFrameObservations(
        frameObs.map((obs) => ({
          objects: obs.objects || [],
          activity: obs.activity || [],
          onScreenText: obs.onScreenText || [],
        })),
      );

      const overlappingTranscript = transcript
        .filter((cue) => cue.start_time < end && cue.end_time > start && (cue.text || '').trim())
        .map((cue) => cue.text.trim())
        .join(' ');

      const overlappingGemini = (gemini.segments || []).filter(
        (seg) => seg.start_time < end && seg.end_time > start,
      );

      const objects = unique([
        ...aggregated.objects,
        ...overlappingGemini.flatMap((g) => g.visual_objects || []),
      ]);
      const actions = unique([
        ...aggregated.activity,
        ...overlappingGemini.flatMap((g) => g.actions || []),
      ]);
      const onScreenText = unique([
        ...aggregated.onScreenText,
        ...overlappingGemini
          .flatMap((g) => [g.title || ''])
          .filter((t) => /overlay|caption|text/i.test(t)),
      ]);
```

(`nearestFrame` is kept, unchanged, for `title`/`description` a few lines below — only the list fields switch from single-frame to aggregated-across-window.)

- [ ] **Step 4: Populate `keyframePaths` on the pushed segment**

Currently, the `segments.push({...})` call includes `keyframePath: scene.keyframePath,`. Add the new field immediately after it:

```ts
        keyframePath: scene.keyframePath,
        keyframePaths: scene.keyframes,
```

- [ ] **Step 5: Type-check**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `intelligence-merger.service.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/pipeline/pipeline.types.ts apps/api/src/modules/pipeline/intelligence-merger.service.ts
git commit -m "feat: aggregate all in-window frame observations into each segment"
```

---

### Task 5: Persist `keyframe_paths` — schema + processor

**Files:**
- Modify: `apps/api/src/modules/database/schema.sql`
- Modify: `apps/api/src/modules/queue/indexing.processor.ts:474-516` (`persistToDatabase`)

**Interfaces:**
- Consumes: `UnifiedSegment.keyframePaths` from Task 4.
- Produces: `media_segments.keyframe_paths` column, readable by Task 6 as `row.keyframe_paths`.

- [ ] **Step 1: Add the column**

In `apps/api/src/modules/database/schema.sql`, add a new line directly after the existing:

```sql
ALTER TABLE media_observations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
```

add:

```sql
ALTER TABLE media_segments ADD COLUMN IF NOT EXISTS keyframe_paths JSONB DEFAULT '[]';
```

- [ ] **Step 2: Insert the new column's value**

In `apps/api/src/modules/queue/indexing.processor.ts`, the segment insert currently is:

```ts
      await this.db.query(
        `INSERT INTO media_segments (
           id, asset_id, user_id, start_time, end_time, title, description,
           visual_objects, actions, transcript_text, on_screen_text,
           keyframe_path, sources, provider, model, embedding, embedding_384, embedding_dim, analysis_version
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16::vector, $17::vector, $18, $19
         )`,
        [
          seg.id,
          assetId,
          userId,
          seg.startTime,
          seg.endTime,
          seg.title || '',
          seg.description || '',
          seg.visualObjects || [],
          seg.actions || [],
          seg.transcriptText || '',
          seg.onScreenText || [],
          seg.keyframePath || '',
          seg.sources || [],
          seg.provider || 'google',
          seg.model || 'gemini-2.5-flash',
          is3072 ? embeddingStr : null,
          is384 ? embeddingStr : null,
          dim || 3072,
          seg.analysisVersion || 2,
        ],
      );
```

Replace with (adds `keyframe_paths` column + `$20` placeholder + the JSON-stringified value):

```ts
      await this.db.query(
        `INSERT INTO media_segments (
           id, asset_id, user_id, start_time, end_time, title, description,
           visual_objects, actions, transcript_text, on_screen_text,
           keyframe_path, sources, provider, model, embedding, embedding_384, embedding_dim, analysis_version,
           keyframe_paths
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16::vector, $17::vector, $18, $19,
           $20::jsonb
         )`,
        [
          seg.id,
          assetId,
          userId,
          seg.startTime,
          seg.endTime,
          seg.title || '',
          seg.description || '',
          seg.visualObjects || [],
          seg.actions || [],
          seg.transcriptText || '',
          seg.onScreenText || [],
          seg.keyframePath || '',
          seg.sources || [],
          seg.provider || 'google',
          seg.model || 'gemini-2.5-flash',
          is3072 ? embeddingStr : null,
          is384 ? embeddingStr : null,
          dim || 3072,
          seg.analysisVersion || 2,
          JSON.stringify(seg.keyframePaths || []),
        ],
      );
```

- [ ] **Step 3: Verify the schema applies cleanly**

Run: `docker compose up -d postgres` (or however the local Postgres container is normally started per `docker-compose.yml`), then start the API once (`cd apps/api && npm run dev` briefly, or however schema is normally applied per `DatabaseService`'s startup hook), then check:

Run: `docker compose exec postgres psql -U postgres -d media_intel -c "\d media_segments"` (adjust user/db name to match `docker-compose.yml`)
Expected: `keyframe_paths | jsonb | ... default '[]'::jsonb` appears in the column list.

- [ ] **Step 4: Type-check**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `indexing.processor.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/database/schema.sql apps/api/src/modules/queue/indexing.processor.ts
git commit -m "feat: persist all scene keyframe paths per segment"
```

---

### Task 6: Fix Stage-2 verification to use the candidate's own segment frames

**Files:**
- Modify: `apps/api/src/modules/media/media.service.ts:699-777` (`applyStage2Verification`)

**Interfaces:**
- Consumes: `parseKeyframePaths` from Task 1; `media_segments.keyframe_paths` column from Task 5.

- [ ] **Step 1: Add the import**

In `apps/api/src/modules/media/media.service.ts`, add:

```ts
import { parseKeyframePaths } from '../pipeline/scene-sampling';
```

- [ ] **Step 2: Replace the directory-listing frame lookup**

Currently, inside `applyStage2Verification`'s `candidatesToVerify.map(async (candidate) => { ... })`:

```ts
          // 2. Locate keyframe files on disk
          const framesDir = path.join(this.scratchDir, candidate.assetId, 'frames');
          let framePaths: string[] = [];
          if (fs.existsSync(framesDir)) {
            framePaths = fs
              .readdirSync(framesDir)
              .filter((f) => f.endsWith('.jpg') || f.endsWith('.png'))
              .map((f) => path.join(framesDir, f));
          }
          if (framePaths.length === 0) {
            const thumb = path.join(this.thumbnailDir, `${candidate.assetId}.jpg`);
            if (fs.existsSync(thumb)) framePaths = [thumb];
          }

          if (framePaths.length === 0) return candidate;
```

Replace with (fetches the candidate's own segment row instead of scanning the whole asset's frame directory):

```ts
          // 2. Locate this candidate's own keyframes (not the whole asset's frame directory)
          let framePaths: string[] = [];
          const segRow = await this.db.query<{ keyframe_paths: unknown }>(
            `SELECT keyframe_paths FROM media_segments WHERE id = $1`,
            [candidate.segmentId],
          );
          if (segRow.rows.length > 0) {
            framePaths = parseKeyframePaths(segRow.rows[0].keyframe_paths)
              .map((f) => f.path)
              .filter((p) => p && fs.existsSync(p));
          }
          if (framePaths.length === 0) {
            const thumb = path.join(this.thumbnailDir, `${candidate.assetId}.jpg`);
            if (fs.existsSync(thumb)) framePaths = [thumb];
          }

          if (framePaths.length === 0) return candidate;
```

(Note: `candidate.segmentId` values coming from `searchTranscriptPhrases` look like `cue_${assetId}_${i}`, not a real `media_segments.id` — the `SELECT ... WHERE id = $1` will simply return zero rows for those, and the code falls through to the thumbnail fallback exactly as before. This is correct and requires no special-casing.)

- [ ] **Step 3: Type-check**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `media.service.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/media/media.service.ts
git commit -m "fix: Stage-2 verification uses the candidate segment's own keyframes"
```

---

### Task 7: Sub-scene timestamp refinement from Stage-2 verification

**Files:**
- Modify: `apps/api/src/modules/pipeline/gemini-intelligence.service.ts:581-636` (`verifyCandidate`)
- Modify: `apps/api/src/modules/media/media.service.ts:699-808` (`applyStage2Verification`, `enrichVerifiedHit`)

**Interfaces:**
- Consumes: `narrowResultWindow` from Task 1.
- Produces: `verifyCandidate` return type gains `matchedTimestamp?: number`, consumed by `enrichVerifiedHit`.

- [ ] **Step 1: Extend `verifyCandidate`'s prompt and return type**

In `apps/api/src/modules/pipeline/gemini-intelligence.service.ts`, change the method signature:

```ts
  async verifyCandidate(
    framePaths: string[],
    query: string,
    transcriptSnippet?: string,
  ): Promise<{ matched: boolean; confidence: number; explanation: string; usage?: ModelUsage }> {
```

to:

```ts
  async verifyCandidate(
    framePaths: string[],
    query: string,
    transcriptSnippet?: string,
  ): Promise<{ matched: boolean; confidence: number; explanation: string; matchedTimestamp?: number; usage?: ModelUsage }> {
```

Update the early-return branches to match the new shape (add `matchedTimestamp: undefined` is not required since the field is optional — the existing `return { matched: false, confidence: 0, explanation: '...' };` lines remain valid as-is under the new type).

- [ ] **Step 2: Tag each frame with its timestamp in the prompt, and ask for the matched one back**

Currently the prompt text (inside the `parts` array) ends with:

```
Return JSON only:
{
  "matched": true | false,
  "confidence": <number between 0.00 and 1.00>,
  "explanation": "<one concise sentence explaining why this matches or does not match the search query>"
}`,
```

Replace with:

```
Each attached frame is captioned with its timestamp in seconds before the image.
If matched, identify which single attached frame's timestamp best shows the match.

Return JSON only:
{
  "matched": true | false,
  "confidence": <number between 0.00 and 1.00>,
  "matchedTimestamp": <the timestamp in seconds of the single best-matching attached frame, or null if not matched>,
  "explanation": "<one concise sentence explaining why this matches or does not match the search query>"
}`,
```

Then, in the loop that attaches images (`for (const framePath of existingFrames.slice(0, 3))`), the frames currently have no timestamp caption — add one. Since `verifyCandidate` only receives `framePaths: string[]` (not timestamps), and Task 6 already resolves timestamped entries via `parseKeyframePaths`, change the loop to caption using a parallel array. Update the method to accept richer input: change the parameter from `framePaths: string[]` to `frames: { timestamp: number; path: string }[]`, and update the loop:

```ts
    for (const frame of existingFrames.slice(0, 3)) {
      try {
        const data = fs.readFileSync(frame.path).toString('base64');
        parts.push({ text: `Frame at ${frame.timestamp.toFixed(2)}s:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
      } catch (readErr) {
        this.logger.warn(`Could not read frame for verification: ${frame.path}`);
      }
    }
```

and the existence filter above it from `framePaths.filter((p) => p && fs.existsSync(p))` to:

```ts
    const existingFrames = frames.filter((f) => f.path && fs.existsSync(f.path));
```

Update the method's parsing of the response:

```ts
      const parsed = this.parseJson<{ matched?: boolean; confidence?: number; explanation?: string; matchedTimestamp?: number | null }>(result.text);
      return {
        matched: Boolean(parsed.matched),
        confidence: Number(parsed.confidence ?? (parsed.matched ? 0.85 : 0.2)),
        explanation: String(parsed.explanation ?? ''),
        matchedTimestamp: typeof parsed.matchedTimestamp === 'number' ? parsed.matchedTimestamp : undefined,
        usage: this.usageFromGenerate('stage2_verification', result),
      };
```

- [ ] **Step 3: Update `applyStage2Verification`'s call site**

In `apps/api/src/modules/media/media.service.ts`, after Task 6's edit, `framePaths` is a plain `string[]` derived from `parseKeyframePaths(...)`. Change that block to keep the timestamped entries instead of mapping to paths only:

```ts
          // 2. Locate this candidate's own keyframes (not the whole asset's frame directory)
          let frames: { timestamp: number; path: string }[] = [];
          const segRow = await this.db.query<{ keyframe_paths: unknown }>(
            `SELECT keyframe_paths FROM media_segments WHERE id = $1`,
            [candidate.segmentId],
          );
          if (segRow.rows.length > 0) {
            frames = parseKeyframePaths(segRow.rows[0].keyframe_paths).filter((f) => f.path && fs.existsSync(f.path));
          }
          if (frames.length === 0) {
            const thumb = path.join(this.thumbnailDir, `${candidate.assetId}.jpg`);
            if (fs.existsSync(thumb)) frames = [{ timestamp: candidate.startTime, path: thumb }];
          }

          if (frames.length === 0) return candidate;
```

and update the call:

```ts
          // 3. Call Gemini VLM verification
          const ver = await this.geminiService.verifyCandidate(
            frames,
            parsed.cleaned,
            candidate.transcriptSnippet,
          );
```

Update the cache-write call below it (previously wrote `ver.matched, ver.confidence, ver.explanation` — unchanged, `matchedTimestamp` is not persisted to the `verified_queries` cache table; it's only used transiently to narrow this response, matching the spec's non-goal of no schema change beyond `keyframe_paths`).

- [ ] **Step 4: Narrow the window in `enrichVerifiedHit`**

In `apps/api/src/modules/media/media.service.ts`, add the import:

```ts
import { narrowResultWindow } from '../pipeline/scene-sampling';
```

Change `enrichVerifiedHit`'s signature and the verified branch. Currently:

```ts
  private enrichVerifiedHit(
    candidate: SearchResult,
    isVerified: boolean,
    confidence: number,
    explanation: string,
  ): SearchResult {
    if (isVerified && confidence >= 0.5) {
      return {
        ...candidate,
        score: Number(Math.max(candidate.score, 0.88 + confidence * 0.10).toFixed(3)),
        matchQuality: 'direct',
        winningPath: 'visual',
        stage2Verified: true,
        verificationConfidence: confidence,
        verificationExplanation: explanation,
        whyPicked: 'Stage-2 visual verification confirmed',
        queryRelation: explanation || candidate.queryRelation,
      };
    } else if (!isVerified) {
```

Replace with:

```ts
  private enrichVerifiedHit(
    candidate: SearchResult,
    isVerified: boolean,
    confidence: number,
    explanation: string,
    matchedTimestamp?: number,
  ): SearchResult {
    if (isVerified && confidence >= 0.5) {
      const narrowed = narrowResultWindow(candidate.startTime, candidate.endTime, matchedTimestamp);
      return {
        ...candidate,
        startTime: narrowed.startTime,
        endTime: narrowed.endTime,
        score: Number(Math.max(candidate.score, 0.88 + confidence * 0.10).toFixed(3)),
        matchQuality: 'direct',
        winningPath: 'visual',
        stage2Verified: true,
        verificationConfidence: confidence,
        verificationExplanation: explanation,
        whyPicked: 'Stage-2 visual verification confirmed',
        queryRelation: explanation || candidate.queryRelation,
      };
    } else if (!isVerified) {
```

Update both call sites of `enrichVerifiedHit` inside `applyStage2Verification` (the cache-hit branch and the fresh-verification branch) to pass the extra argument:

```ts
            return this.enrichVerifiedHit(candidate, row.is_verified, row.confidence, row.explanation, undefined);
```
(cache-hit branch — the cache table has no `matched_timestamp` column, so this stays `undefined`, which `narrowResultWindow` already handles by returning the window unchanged)

```ts
          return this.enrichVerifiedHit(candidate, ver.matched, ver.confidence, ver.explanation, ver.matchedTimestamp);
```
(fresh-verification branch)

- [ ] **Step 5: Type-check**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/pipeline/gemini-intelligence.service.ts apps/api/src/modules/media/media.service.ts
git commit -m "feat: narrow result timestamp to the Stage-2 matched frame"
```

---

### Task 8: Version bump + end-to-end verification

**Files:**
- Modify: `apps/api/src/modules/pipeline/pipeline.types.ts:124` (`ANALYSIS_VERSION`)

- [ ] **Step 1: Bump the analysis version**

In `apps/api/src/modules/pipeline/pipeline.types.ts`, change:

```ts
export const ANALYSIS_VERSION = 2;
```

to:

```ts
export const ANALYSIS_VERSION = 3;
```

- [ ] **Step 2: Full type-check across the API app**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, zero errors

- [ ] **Step 3: Run the full pure-function test suite one more time**

Run: `cd apps/api && node --require ts-node/register --test src/modules/pipeline/scene-sampling.spec.ts`
Expected: PASS, all tests green

- [ ] **Step 4: Manual end-to-end verification against a real video**

Start the stack per the existing local dev flow (`docker compose up -d`, then `npm run dev` and `npm run dev:worker` in `apps/api`, per `phase-plan.md`'s Phase 0/1 setup). Upload one video that previously scored poorly on a visual/micro-detail query. After indexing completes, inspect its `media_segments` rows:

Run: `docker compose exec postgres psql -U postgres -d media_intel -c "SELECT id, start_time, end_time, jsonb_array_length(keyframe_paths) AS frame_count FROM media_segments WHERE asset_id = '<assetId>' ORDER BY start_time;"`
Expected: at least some rows with `frame_count > 1` for scenes longer than 6 seconds.

- [ ] **Step 5: Before/after benchmark comparison**

Using the existing `LIBRARY_BENCHMARK_30` harness (`getLibraryBenchmarkQueries()` in `apps/api/src/modules/media/benchmark-queries.ts`, exercised via whatever controller route/UI tab currently runs it — check `BenchmarkTab.tsx` / `media.controller.ts` for the exact entry point), run the library benchmark against the same indexed library used before this change (re-index is required for old assets to pick up multi-frame data, since this is additive-only with no backfill). Record `recallAt5`, `medianTimestampErrorSec`, and cost-per-minute before and after. Confirm `medianTimestampErrorSec` improves on visual-type queries and that cost-per-minute increase stays roughly proportional to the frame-count increase (not runaway).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/pipeline/pipeline.types.ts
git commit -m "chore: bump ANALYSIS_VERSION to 3 for multi-frame segments"
```

---

## Self-Review Notes

- **Spec coverage:** Frame extraction scaling (Task 2), Stage-2 bug fix (Task 6), sub-scene refinement (Task 7), schema addition (Task 5), `ANALYSIS_VERSION` bump (Task 8), unit test for the pure math (Task 1), benchmark re-run instructions (Task 8) — every section of the spec has a corresponding task.
- **Placeholder scan:** No TBD/TODO markers; every step has real code or a real, runnable command.
- **Type consistency:** `SceneBoundary.keyframes`, `UnifiedSegment.keyframePaths`, `verifyCandidate`'s new `frames` parameter and `matchedTimestamp` return field, and `enrichVerifiedHit`'s new parameter are used with matching names and shapes across every task that touches them.
