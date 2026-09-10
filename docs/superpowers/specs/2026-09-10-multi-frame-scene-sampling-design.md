# Multi-frame scene sampling + sub-scene timestamp refinement

**Status:** Approved for implementation
**Companion to:** `phase-plan.md` (Phase 3 prep), `honest-assessment.md`
**Author:** Coding agent, in collaboration with project owner

## Problem

`honest-assessment.md` self-scores the current pipeline at 35–45/100 on "fast b-roll / rapid montage" and "the slightest detail" queries. Reading `ffmpeg-pipeline.service.ts` confirms the mechanism: `detectScenesAndExtractFrames` extracts exactly **one** representative keyframe per scene window, and scene windows target ~14 seconds (`SCENE_TARGET_SECONDS`). Anything that happens between that single frame and the window boundaries — a 0.4s gesture, a background object, a rapid cut — is structurally invisible to Stage 1, independent of query quality or Stage-2 verification, because it was never captured.

Separately, `applyStage2Verification` in `media.service.ts` has a latent scoping bug: it resolves verification frames via `fs.readdirSync(framesDir)` and takes the first 3 files in filename-sort order, which are the first 3 scenes of the *whole asset*, not the candidate segment being verified. Stage-2 is currently verifying most candidates against frames from the start of the video. This must be fixed as part of this work because multi-frame sampling requires per-segment frame lookup anyway.

## Goals

1. Capture more than one visual sample per scene window, scaled to window length, bounded by a cost cap.
2. Fix Stage-2 verification to look up frames belonging to the actual candidate segment.
3. When Stage-2 verification identifies which specific frame/timestamp matched, narrow the reported result window from the full scene (~14s) to a tight window around that timestamp (±1.5s).
4. No backfill required — additive schema change, existing indexed assets keep working until reindexed.

## Non-goals

- Real OCR pipeline (separate follow-up, approach B from the brainstorm).
- Corpus-aware IDF weighting (separate follow-up, approach C).
- Any frontend changes — the API response shape for `SearchResult.startTime`/`endTime` is unchanged; only the values get tighter.
- Migrating/reprocessing already-indexed assets.

## Design

### 1. Frame extraction — `ffmpeg-pipeline.service.ts`

Add a pure function:

```ts
function framesPerWindow(lengthSec: number, maxFrames: number): number {
  if (lengthSec <= 6) return 1;
  if (lengthSec <= 12) return 2;
  if (lengthSec <= 20) return Math.min(3, maxFrames);
  return maxFrames;
}
```

`maxFrames` comes from a new env var `MAX_FRAMES_PER_SCENE` (default `3`), read via `ConfigService`, same pattern as `SCENE_TARGET_SECONDS` etc.

`detectScenesAndExtractFrames` calls `framesPerWindow` per window, extracts that many frames evenly spaced across `[startTime, endTime]` (not just the midpoint), and populates a new field on `SceneBoundary`:

```ts
keyframes: { timestamp: number; path: string }[]
```

`keyframePath` (singular) is preserved as the first frame's path — nothing else reading it needs to change.

Each frame extraction keeps using the existing `extractFrame` + try/catch-and-warn pattern (a failed frame is skipped, not fatal to the scene).

### 2. Frame analysis — `gemini-intelligence.service.ts` `analyzeFrames`

Input changes from "one frame per `SceneBoundary`" to a flattened list of `{timestamp, path}` across all scenes' `keyframes` arrays. Batching (16 images/call) is unchanged. Output shape (`FrameObservation[]`) is unchanged — it's already timestamp-keyed and scene-agnostic.

### 3. Intelligence merge — `intelligence-merger.service.ts`

Currently:
```ts
const nearestFrame = frameObs[0] || /* nearest-by-distance fallback */;
```
and only `nearestFrame`'s objects/actions/onScreenText feed the segment.

Change: aggregate **all** `frameObs` within `[start - 0.05, end + 0.05]` — union `objects`, `activity`, `onScreenText` across every frame in the window (dedup via existing `unique()` helper), not just the first. Keep `nearestFrame` (closest to `representativeTimestamp`) for the segment's `description` (avoid multiple descriptions producing a garbled sentence — union the concept lists, but keep one coherent description).

Also collect all in-window frame paths (with timestamps) into a new field on `UnifiedSegment`:
```ts
keyframePaths: { timestamp: number; path: string }[]
```

### 4. Persistence — `schema.sql` + `indexing.processor.ts`

```sql
ALTER TABLE media_segments ADD COLUMN IF NOT EXISTS keyframe_paths JSONB DEFAULT '[]';
```

Stored as JSONB (array of `{timestamp, path}`) rather than a plain `TEXT[]` since we need the timestamp alongside each path, not just the path.

`persistToDatabase` in `indexing.processor.ts` inserts `seg.keyframePaths` (JSON-stringified) into the new column alongside the existing insert.

Bump `ANALYSIS_VERSION` from `2` to `3` in `pipeline.types.ts` so future selective-reprocessing tooling can distinguish old single-frame segments from new multi-frame ones.

### 5. Stage-2 verification — `media.service.ts`

`applyStage2Verification` candidates already carry `segmentId`. Add `keyframe_paths` (renamed camelCase in the row mapping) to the segment SELECT that produces `SearchResult`s in `searchSegments`, or do a targeted follow-up query by `segmentId` at verification time — whichever keeps `searchSegments`' existing query shape cleaner. Recommendation: fetch by `segmentId` inside `applyStage2Verification` itself (`SELECT keyframe_paths FROM media_segments WHERE id = $1`), since verification only runs on the top 3 candidates, not the full result set — this avoids widening the hot search query for a value only needed occasionally.

Remove the `fs.readdirSync(framesDir)` fallback-to-whole-directory behavior; keep the thumbnail-only fallback only if `keyframe_paths` is empty (e.g. pre-migration segments).

Extend `verifyCandidate`'s prompt to ask Gemini which supplied frame (by timestamp) actually shows the match, and extend its return type:

```ts
{ matched: boolean; confidence: number; explanation: string; matchedTimestamp?: number }
```

In `enrichVerifiedHit`, when `matchedTimestamp` is present and falls within the candidate's `[startTime, endTime]`, narrow the result:
```ts
startTime: Math.max(candidate.startTime, matchedTimestamp - 1.5)
endTime: Math.min(candidate.endTime, matchedTimestamp + 1.5)
```
(clamped to the original scene bounds — never widen past what was actually indexed).

### 6. Cost control

`PipelineCost.framesAnalyzed` already exists and is tracked — it will now reflect the real (higher) frame count automatically. No new tracking needed, but worth confirming the benchmark run reports the before/after cost-per-minute delta, not just accuracy delta.

## Testing

- Unit test `framesPerWindow` (pure function, easy to isolate: boundary values at 6s/12s/20s, cap enforcement).
- Re-run `LIBRARY_BENCHMARK_30` (`getLibraryBenchmarkQueries`) before and after on the same real library; compare `recallAt5`, `medianTimestampErrorSec`, and cost-per-minute. This is the existing instrument, no new query authoring required.
- Manually verify on one known "fast b-roll" or micro-detail asset that a previously-missed detail is now captured.

## Rollout

Additive-only: new column, new config var with a safe default, existing single-frame segments continue to work (empty `keyframe_paths` falls back to thumbnail-only Stage-2 verification, same as today's degraded path). No reprocessing of existing assets required; new indexing runs pick up the new behavior automatically.
