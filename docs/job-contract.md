# Media Factory Job Contract & Worker Lifecycle (Phase F1)

## Overview
This document specifies the versioned contract for Ephemeral Media Factory jobs within Brisky, detailing envelope structure, lifecycle states, workspace isolation, and cooperative cancellation.

---

## 1. FactoryJobEnvelope Specification

All jobs dispatched to BullMQ (`indexing-queue`) adhere to `FactoryJobEnvelope`.

```typescript
export type JobType =
  | 'index_asset'       // Alias for plan_asset (legacy envelopes)
  | 'plan_asset'        // Probe, scenes, durable keyframes, enqueue child units
  | 'extract_audio'     // Audio extraction only
  | 'transcribe'        // Whisper / cloud speech-to-text (one per asset)
  | 'analyze_frames'    // Keyframe visual perception for one scene window
  | 'gemini_video'      // Coarse native-video understanding
  | 'embed'             // Embedding for one scene/segment
  | 'finalize_asset'    // Mark indexed / partially_indexed after units finish
  | 'generate_proxy'    // Web-safe 720p H.264 proxy creation
  | 'extract_clip';     // Ephemeral sub-clip rendering

export type JobPriority = 'interactive' | 'normal' | 'batch';

export interface JobSource {
  provider: string;               // 'upload' | 'google_drive' | 'dropbox' | etc.
  connectorAccountId?: string;    // Account ID for remote OAuth context
  remoteId?: string;              // Provider external file/asset ID
  sourcePath?: string;            // Local path if direct upload
  originalFilename?: string;      // User-facing filename
  checksum?: string;              // MD5/SHA checksum for deduplication
  fileSize?: number;              // Bytes on source disk
}

export interface JobSegment {
  start_s: number;
  end_s: number;
}

export interface JobProcessingConfig {
  analysisVersion?: number;
  model?: string;
  embeddingModel?: string;
  forceReindex?: boolean;
}

export interface FactoryJobEnvelope {
  job_id?: string;
  job_type: JobType;
  asset_id: string;
  user_id: string;
  source: JobSource;
  segment?: JobSegment | null;
  priority: JobPriority;
  attempt?: number;
  processing_config?: JobProcessingConfig;
}
```

### Priority Mapping
In BullMQ, lower numerical priority values are processed earlier:
- `interactive` -> `1` (Immediate user-facing demand, e.g., active clip rendering or re-index click)
- `normal` -> `5` (Default priority for standard background indexing)
- `batch` -> `10` (Connector batch sync discovery)

---

## 2. Ephemeral Scratch Isolation

Workers maintain complete file-level isolation to prevent cross-job collisions during concurrent or multi-stage processing.

1. **Workspace Path**:
   `storage/scratch/{job_id}/` (falling back to `{asset_id}` only if `job_id` is unset).
2. **Subdirectories**:
   - `storage/scratch/{job_id}/source.mp4` (downloaded master if remote)
   - `storage/scratch/{job_id}/frames/` (extracted scene keyframes)
   - `storage/scratch/{job_id}/audio.mp3` (demuxed audio stream)
3. **Durable Artifacts**:
   - Keyframes intended for persistent search inspection are copied directly to `storage/keyframes/{asset_id}/` before scratch purging.
   - Web proxies are written directly to `storage/proxies/{asset_id}.mp4`.
   - Thumbnails are written directly to `storage/thumbnails/{asset_id}.jpg`.
4. **Purging Guarantees**:
   - On **Success**: Ephemeral scratch workspace is unlinked completely (`fs.rmSync(scratch, { recursive: true, force: true })`).
   - On **Failure**: Ephemeral scratch workspace is unlinked completely before re-throwing the error to BullMQ.
   - On **Cancellation**: Ephemeral scratch workspace is unlinked immediately.

---

## 3. Worker Lifecycle & Cooperative Cancellation

### Job States
- `waiting`: In BullMQ queue awaiting an available worker.
- `active`: Currently being processed by a worker process.
- `completed`: Successfully processed; intelligence and proxies persisted.
- `failed`: Failed after exhausting all retry attempts.
- `cancelled`: Aborted via user cancellation request.

### Cancellation Endpoint
`POST /api/v1/indexing/jobs/:id/cancel` (requires user authentication).

### Cancellation Mechanics
1. **Waiting Jobs**:
   - BullMQ job is removed directly via `job.remove()`.
   - `indexing_jobs.status` is set to `'cancelled'`.
   - `media_assets.status` is set to `'cancelled'`.
2. **Active Jobs**:
   - `indexing_jobs.cancel_requested` flag is set to `true`.
   - The worker checks `checkCancelled(jobId, assetId, scratch)` at stage boundaries:
     - Checkpoint 1: After checksum deduplication check, before remote download.
     - Checkpoint 2: After metadata probe and keyframe extraction.
     - Checkpoint 3: After proxy encoding and audio extraction.
     - Checkpoint 4: After multimodal AI analysis.
   - When detected:
     - Pipeline halts immediately.
     - Ephemeral scratch workspace is deleted.
     - Job status in `indexing_jobs` is marked `'cancelled'` and finished.
     - Worker returns cleanly without throwing, preventing BullMQ from scheduling unwanted retry attempts.
