# Brisky — Factory Architecture Gap Assessment & Execution Plan

**Document type:** Independent engineering assessment + agent execution plan  
**Date:** 2026-09-14  
**Status:** Current operating plan for implementation agents  
**Assessed against:** `Brisky — Media Intelligence & Ephemeral Media Factory Architecture.md`  
**Also read:** `phase-plan.md`, `01-project-brief.md`, `02-development-direction.md`, `03-media-storage-brief.md`, `README.md`, `honest-assessment.md`, and the live source under `apps/`, `services/`, `infra/`.

**How to use this file**

- The architecture document is the **product/infrastructure north star**.
- `phase-plan.md` is the **historical build order**. We are in **Phase 4** of that plan.
- **This file wins on what to do next.** It reconciles the two, records what the code actually does, and sequences the remaining work so an agent does not invent a third roadmap.

If a later investigation proves a cheaper or more reliable implementation of the same principle, update this file. Do not silently ignore the architecture principles.

---

## 0. Verdict in one page

Brisky today is a **working local media-intelligence product with a first Google Drive connector bolted onto a monolith**. It is **not** yet a Media Factory.

| Layer | Score | One-line reality |
| :--- | :---: | :--- |
| Intelligence pipeline (understand one video) | **Strong** | Hybrid FFmpeg + Whisper + Gemini + merge + embeddings is real and searchable. |
| Search quality (timestamped moments) | **Strong / incomplete** | Hybrid RRF + query understanding + gated Stage-2 exist. IDF is still missing. Stage-2 is weakened by scratch purge. |
| Media Registry (know where media lives) | **Partial** | `media_assets` + Drive IDs + lineage exist. Not a full registry. `phash` is unused. |
| Connectors (Drive as source of truth) | **F6 100% Met** | Initial sync establishes `sync_cursor`. Continuous living index via `ConnectorPollerService` (default 120s, backlog stampede guard `MAX_WAITING_BATCH_JOBS=50`, `IS_WORKER` exclusion, slot-aware `priority: 'batch'`, concurrency guarded). Incremental sync processes added, modified (checksum drifted = batch re-index), renamed/moved (intelligence retained), and deleted (`availability = 'offline'`). Dashboard UI displays live sync status, error alerts, and manual sync-changes trigger. |
| Ephemeral Media Factory | **F7 100% Met** | `MediaFactory` universal interface (`dispatch`, `cancel`, `getStatus`, `getCapacity`) implemented by `BullmqMediaFactory` and wired into `IndexingService`. Worker image (`Dockerfile.worker`) and `docker-compose.yml` decoupled from host volume mounts (PostgreSQL + Redis only contract). Previews served via database-backed `thumbnail_data` (zero shared disk access). Derived proxies and clips uploaded to user's Drive (`Brisky/proxies/` and `Brisky/clips/`) with `proxy_remote_id` and hydrated on-demand across hosts. VPS deployment runbook in `docs/vps-deployment.md`. |
| Demand-driven derived media | **F3 Met** | Eager proxy stopped during indexing (`proxy_status = 'none' \| 'skipped'`). On-demand interactive `generate_proxy` + LRU cache cap (`PROXY_CACHE_MAX_GB`) + `extract_clip` sub-clip job with Drive `Brisky/clips/` persistence. |
| Scheduler / slots / global capacity | **F5 100% Met** | Atomic slot claiming via PostgreSQL advisory transaction locks (`pg_advisory_xact_lock`) eliminating multi-container concurrency races. Config-driven scheduler (`GLOBAL_MAX_ACTIVE_JOBS`, `DEFAULT_USER_SLOTS`, `INTERACTIVE_RESERVED_SLOTS`) with crash-safe `releaseSlot`, priority classes, and queue telemetry. |
| Segment jobs / checkpoint / independent retry | **Absent** | One BullMQ job = one whole video. Failure restarts the asset. |
| Collections / clip extract / public API | **Partial** | Derived clips extracted and uploaded to Drive `Brisky/clips/`. Collections/public API intentionally later. |

**North-star sentence from the architecture doc, vs today:**

> Media stays with the user. Processing happens in a temporary factory. Intelligence stays with Brisky.

**Today:**

> Media stays with the user *after* a full download. Processing happens inside the API process (or an optional sibling Node process) on a local disk. Intelligence stays with Brisky. A permanent local proxy is kept for every asset.

That last sentence is the largest architectural debt.

---

## 1. What “Phase 4” actually means right now

`phase-plan.md` Phase 4 goal:

> Kill upload. First real connector: Google Drive (web). Media stays in Drive. We store intelligence, thumbnails, and short-lived scratch.

### 1.1 Phase 4 exit criteria — honest status

| Exit criterion | Status | Evidence |
| :--- | :--- | :--- |
| User connects Drive, picks a folder, searches without uploading | **Met (F0 Completed)** | `ConnectorsModal`, OAuth, folder select, `POST /connectors/:id/sync`, search UI. Upload is flag-gated off (`ENABLE_DEV_UPLOAD=false`, `VITE_ENABLE_DEV_UPLOAD=false`). Delete button in player is gated behind dev flag. |
| New file in that folder becomes searchable without a full rescan | **Met (F6 Completed)** | Initial sync establishes and persists `sync_cursor`. `syncAccountChanges` consumes change stream via `getChanges()`. `ConnectorPollerService` continuously sweeps active accounts at batch priority. |
| Deleted Drive file disappears from search | **Met (F0 Completed)** | `syncAccount` marks missing files `availability = 'offline'` keying off `external_file_id`. Search excludes offline. Rename/move retains intelligence. |
| Original video is not retained on our disk after a successful index (proxy/thumb only) | **Met (F3 stops proxy warehouse)** | Ephemeral scratch is purged. Durable keyframes preserved in `storage/keyframes/{assetId}/`. Indexing stores no eager proxy; 720p proxy is generated only on-demand and LRU cache-managed. |
| Drive rate limits and a multi-GB file have been tested | **In Progress (F4)** | Drive connector has 429/503 retry. Full download metrics (`bytesRead`, duration) now tracked on job timings. Range ingest scheduled in F4. |

### 1.2 Phase 4 upload teardown checklist

| Checklist item (`phase-plan.md` §3) | Status |
| :--- | :--- |
| Onboarding copy is “Connect your media” | **Met** — Header primary CTA is **Connect Media**. |
| Library has no upload button | **Met by default** — upload button only if `VITE_ENABLE_DEV_UPLOAD=true`. |
| `UploadConnector` is flag-only or deleted | **Partial** — still registered in `ConnectorRegistry`. Upload API 403s unless flagged. |
| `storage/uploads` wiped | **Operational, not enforced** — leftover test files may exist. No automated wipe. |
| `source_type=upload` assets retired or migrated | **Not done**. |
| CI tests rewritten off upload | **In progress** — Connectors and worker tests decoupled from upload. |
| Playback never assumes original bytes on disk | **Partial** — stream endpoint plays **local proxy only**. If the proxy is missing, playback dies even if Drive still has the original. Demand-driven proxies scheduled in F3. |

**Phase F0 is closed and verified.** Next is Phase F1 (Job contract & worker process isolation).

---

## 2. What has already been built (keep this)

Do not rebuild these. Agents should treat them as the intelligence core the factory must call, not replace.

### 2.1 Application skeleton — done

- pnpm monorepo: `apps/api` (NestJS 11 + Fastify, `/api/v1`) + `apps/web` (React 18 + Vite + Tailwind).
- Docker Compose: PostgreSQL 16 + pgvector, Redis 7. **Not** API/worker containers.
- Auth: email/password, JWT-ish session in localStorage, `AuthGuard`, per-user isolation on assets/search/jobs.
- Health endpoint, env/config, schema applied at API boot from `apps/api/src/modules/database/schema.sql`.

### 2.2 Hybrid intelligence pipeline — done

Implemented as **one ordered worker pipeline** in `apps/api/src/modules/queue/indexing.processor.ts`:

1. Probe metadata (FFmpeg)
2. Scene/shot detection + multi-frame keyframe extraction (`ffmpeg-pipeline.service.ts`, `scene-sampling.ts`)
3. Thumbnail + audio extract + **eager local proxy**
4. Transcription: faster-whisper by default (`services/whisper-transcriber/transcribe.py`), Gemini fallback
5. Visual frame analysis + Gemini native video analysis in parallel
6. Intelligence merge (`intelligence-merger.service.ts`, `ANALYSIS_VERSION = 3`)
7. Embeddings (default Gemini 3072-d; optional local 384-d MiniLM)
8. Persist `media_segments` + raw `media_observations`
9. Purge scratch on success

This is the hybrid pipeline the briefs demanded. It is the thing the factory must keep running, just **not inside the API process, not as one uninterruptible video job, and not with a mandatory local proxy**.

### 2.3 Search — done enough to demo, not finished

Exists in `apps/api/src/modules/media/media.service.ts`:

- Heuristic query parse (`query-parse.ts`) + Gemini query understanding with `query_understanding_cache`.
- Hybrid retrieval: Postgres FTS (`ts_rank_cd`) + pgvector cosine, fused with RRF `k=60`.
- Separate transcript word-boundary path over `media_observations`.
- Modifier gating (substitute for unimplemented IDF).
- Compound/multi-topic interleave.
- Gated Stage-2 Gemini verification + `verified_queries` cache.
- Relevance feedback **stored**, not used for ranking.
- Benchmarks (per-asset + library) and unit-economics dashboard.

Known search defects that factory work will make worse if ignored:

- After a successful index, scratch (including keyframe JPEGs) is deleted. Stage-2 then often falls back to the **asset thumbnail**, not the candidate scene.
- Corpus-aware IDF from Phase 3 is still not implemented.

### 2.4 Media Registry — partial, usable

Tables that exist and are used:

- `users`
- `media_assets` (source, checksum, status, proxy/thumb paths, Drive IDs, cost, availability)
- `media_segments` (windows, transcript, objects, actions, OCR text, dual embeddings)
- `media_observations` (raw frame / transcript / gemini JSON)
- `indexing_jobs` (asset-level observability)
- `asset_relationships` (duplicate/lineage)
- `connector_accounts` (encrypted OAuth tokens)
- `search_feedback`, `verified_queries`, `query_understanding_cache`

Dedup by checksum + clone intelligence is real. Lineage UI exists.

Missing registry fields vs architecture §15: perceptual fingerprint is a column (`phash`) and is **never written**. No first-class MIME column beyond filename/codec. No entity graph.

### 2.5 Connector abstraction — partial, right shape

Canonical interface: `apps/api/src/modules/connector/media-connector.interface.ts`

Registered providers: `upload`, `google_drive`.

Google Drive connector is a real implementation:

- OAuth (`drive.readonly` + `drive.file` + userinfo)
- Tokens encrypted AES-256-GCM (`token-crypto.service.ts`)
- Folder list, video discovery, full download, Range GET, upload into `Brisky/`, `watchChanges`, `getChanges`, 429/503 retry
- Originals are not modified (read-only scope for user files)

Dead or leftover:

- Older `connector.interface.ts` still in tree
- `getByteRange` never called by the processor
- `watchChanges` / `getChanges` never called by sync
- `deleteAsset` on Drive would delete user files if anyone called it — do not wire it to indexing

### 2.6 Queue — durable enough for a single machine

- Redis + BullMQ `indexing-queue`
- Job name: `index-video`
- 3 attempts, exponential backoff 4s
- Priority ≈ file size in MB (smaller first)
- Stalled-job reconciliation on API boot
- Manual retry endpoint
- Stage/progress/cost/timings persisted on `indexing_jobs` and `media_assets`

This is **a queue**, not **a factory scheduler**.

### 2.7 Worker process — optional sibling, not a factory

- `apps/api/src/worker.ts` exists (`IS_WORKER=true`, no HTTP).
- `pnpm dev:worker` works.
- `QueueModule` still registers `IndexingProcessor` inside the API unless `RUN_WORKER_IN_API=false`.
- Default: **API process does the heavy FFmpeg/AI work**.
- No worker Dockerfile. Compose does not run a worker. No `brisky/media-worker` image.

### 2.8 UI — Phase 4 surface exists

- Connect Media modal (Google Drive OAuth, folders, Sync Now)
- Library with Drive badge + “open original in Drive”
- Search, player, observability, artifacts, benchmark, lineage
- Upload hidden behind env flag
- Player streams `GET /api/v1/media/:id/stream` (local proxy, HTTP Range)

---

## 3. What is not built, mapped to the architecture document

Grouped the way an agent should think about it. Section numbers refer to `Brisky — Media Intelligence & Ephemeral Media Factory Architecture.md`.

### 3.1 P0 — must change before calling this a factory

| Architecture requirement | Current code | Gap |
| :--- | :--- | :--- |
| **Split Brisky App from Media Factory** (§5–7, §70) | Same Nest `AppModule`. Processor lives in `queue.module.ts` and is on by default in the API. | Separate worker **process** exists; separate worker **service/image/contract** does not. |
| **Workers are disposable / no local worker state as source of truth** (§8, §68) | Job state is in Postgres + Redis (good). Pipeline also depends on local `storage/proxies`, `storage/scratch`, and leftover frames. | Worker cannot vanish and be replaced unless the next machine has the same disk. |
| **Durable jobs with segment id, status, attempts, priority, errors** (§17, §83 P0) | `indexing_jobs` is one row per **asset**. Status: waiting/active/completed/failed/retrying. | No `segment_id`. No job types (`INDEX_VIDEO` vs `EXTRACT_AUDIO` vs `GENERATE_PROXY`). No interactive/normal/batch priority classes. |
| **Bounded temporary workspace + cleanup** (§9, §83 P0) | Per-asset scratch dir. Success: full recursive delete. Failure: only tries to unlink `source.mp4` (wrong if the file is `.mov`). | Not bounded (whole file lands on disk). Failure leaks scratch. |
| **Do not materialize the entire source file** (§10, §11) | `downloadAsset` writes the full remote file to `scratch/{id}/source{ext}`. | Range API exists and is unused. No decoder-fed bounded buffer. |
| **No permanent server-side proxy store** (§29, §30, §83 P0) | Every index run writes `storage/proxies/{assetId}.mp4` and that is the only playback source. | This is the opposite of demand-driven proxies. Drive `Brisky/proxies/` is a copy the player never uses. |
| **Segment-level checkpointing** (§23, §25) | Segments are written to Postgres **at the end** of the whole-video job (`DELETE` old segments, then insert all). | Kill the worker at 80% and the video restarts from download. |
| **Retry failed segments, not the whole video** (§23, §24) | BullMQ retries the **asset** job. | A Gemini blip on scene 40 re-downloads and re-encodes everything. |
| **Time-based / GOP-aware processing units, not 50–100 MB slices** (§11) | Scenes exist as analysis windows, not as jobs. | Need jobs keyed by timestamp/GOP, with range reads underneath. |

### 3.2 P1 — required to make Drive real at library scale

| Architecture requirement | Current code | Gap |
| :--- | :--- | :--- |
| **Streaming / ranged media access** (§10, §38, §83 P1) | `GoogleDriveConnector.getByteRange` implemented. | Processor, FFmpeg, and stream endpoint never call it. |
| **Audio-first when video bytes are not needed** (`phase-plan.md` Phase 4) | Audio is extracted only after the full file is local. | Spoken-only indexing still pays for a full download + proxy encode. |
| **Queue + scheduler with global and per-user concurrency** (§18–20, §45) | `concurrency: 1` on the processor. Gemini semaphore default 2. | No `MAX_GLOBAL_WORKERS`. No plan slots. One large library can occupy the only worker forever. |
| **Processing slots, not dedicated machines** (§18, §44) | None. No plans/billing tables. | Do not hardcode plan names. Add a slot counter with a config default of 1. |
| **Queue priority: interactive / normal / batch** (§20) | Size-based priority only. | A “play this moment” proxy job cannot jump a 5 TB batch index. |
| **Factory benchmarks** (§21, §59, §83 P1) | Per-asset cost JSON and stage timings exist. | Missing: Drive MB/s, decode speed, worker startup, temp-disk high-water mark, time-to-first-intelligence, time-to-searchable. |
| **Continuous indexing** (§16) | Manual Sync Now. | No cursor poller, no webhook, no overnight consistency. |
| **Source-changed / source-deleted while processing** (§55) | Not checked mid-job. | Worker can finish indexing a file the user already deleted. |
| **Cancellation** (§54) | No cancel API. | User cannot stop a runaway library index. |
| **Failure taxonomy** (§24) | Generic error string. | Rate limit, revoked token, corrupt media, unsupported codec, source deleted are not distinguished. |

### 3.3 P2 — factory provider independence

| Architecture requirement | Current code | Gap |
| :--- | :--- | :--- |
| **Worker Docker image with a stable contract** (§49, §67) | None. | Need `brisky/media-worker` that receives a job, reports status, exits. |
| **`MediaFactory` abstraction** (§72) | None. | App talks to BullMQ directly. |
| **VPS as first remote factory** (§71) | Local host only. | After the contract is stable, not before. |
| **Provider-agnostic later (Cloud Run / Modal / RunPod)** (§48, §73) | None, correctly. | Do not pick a vendor now. |
| **Resource classes (CPU vs GPU)** (§50–51) | None. Whisper is a host Python sidecar. | FFmpeg must not be billed as GPU work later. |

### 3.4 P3 — demand-driven remote media and developer surface

| Architecture requirement | Current code | Gap |
| :--- | :--- | :--- |
| **On-demand proxy / preview** (§30–33, §75) | Eager proxy at index time, adaptive height (`proxy-scaling.ts`). | Adaptive scaling is good. **When** we generate is wrong. |
| **On-demand clip extraction** (§34, §75) | Drive `Brisky/clips/` folder created. No extract job, no API, no UI. | Highest-leverage derived-media feature after search. |
| **Remote playback from source if accessible** (§36) | Player only knows local proxy. | Phone/web cannot play a Drive file unless we already transcoded it onto *our* disk. |
| **Write derived media back to the user’s connector when useful** (§32) | Best-effort upload of proxy+thumb after every index. | Writes too early, and then we still keep a local copy. |
| **Developer API / webhooks / API keys** (§39–43, §76) | Internal `/api/v1` the web app already uses. | No keys, docs, webhooks, usage meters. Correctly later — but keep routes clean. |
| **BYO-AI** (§42) | Env switches for transcription/embeddings only. Visual path is Gemini-hardcoded. No `AIProvider`. | Abstraction can wait; do not spread more Gemini-only calls into the factory contract. |

### 3.5 Explicitly later — do not start

From architecture §79 and `phase-plan.md` “never enters an early phase”:

- Dropbox / OneDrive / S3 / NAS as product connectors
- Desktop agent / Tauri
- Collections product UI (until factory + Drive thesis are real)
- Full editor, NLE roundtrip
- Entity knowledge graph / people identity
- Organizations, billing product, BYOK
- Cross-media (images, PDFs)
- Q&A / automation / creative assistant
- Kubernetes, dedicated vector DB

---

## 4. Conflicts the agent must not paper over

These are real contradictions between documents and code. Resolve them as stated here.

### Conflict A — Proxies

- **Old `phase-plan.md` Phase 1–4:** always produce a web-playable proxy so the browser can play after the master is deleted.
- **New architecture §29–30:** do **not** auto-generate proxies for every connected asset; generate on demand.
- **Code:** always generates a local adaptive proxy; also copies it to the user’s Drive; playback requires the local file.

**Decision for agents:** follow the **new architecture**. Thumbnails stay eager (tiny, needed for search cards). Full proxies become an on-demand job. Until that job exists, do not delete existing local proxies of already-indexed assets.

### Conflict B — Where derived media lives

- **`03-media-storage-brief.md`:** write proxies/clips into the user’s `Brisky/` folder.
- **Architecture §32:** same, *if the connector can write*; capabilities must be explicit.
- **Code:** writes to **both** local disk (canonical for playback) and Drive (unused for playback).

**Decision:** local disk is a **cache**, not the archive. Canonical derived-media references belong in the registry (`representation_type`, `parent_asset_id`, connector locator). Playback should be: local cache → else generate → else stream source range if the browser can use it.

### Conflict C — Worker location

- **Architecture:** factory is independent of the app.
- **Code:** `RUN_WORKER_IN_API` defaults to on, so `pnpm dev` still does FFmpeg in the API process.

**Decision:** default must flip to **API does not run the processor**. Local dev uses `pnpm dev:api` + `pnpm dev:worker`. Compose later grows a worker service. Do not wait for Cloud Run to make this split real.

### Conflict D — Two phase numbering systems

- `phase-plan.md` Phases 0–8 (product sequence).
- Architecture §§70–78 (factory sequence).

**Decision:** this document’s **F-phases below** are the only sequence agents execute now. They absorb remaining `phase-plan.md` Phase 4 + architecture P0–P3.

### Conflict E — Stage-2 vs scratch purge

- Architecture: discard temporary media; keep intelligence.
- Code: keyframe JPEGs are treated as temp and deleted, but search Stage-2 needs them.

**Decision:** representative keyframes are **intelligence artifacts**, not temp media. Persist a small durable set (the same frames already extracted, or a copy under `storage/keyframes/{assetId}/`) **or** re-extract on demand via a factory job. Do not keep the original video to serve Stage-2.

---

## 5. Current data flow (as implemented)

```text
User
  → Web app
  → Nest API  (also runs IndexingProcessor unless disabled)
  → connector_accounts (encrypted Drive tokens)
  → POST /connectors/:id/sync     [manual]
  → media_assets row
  → BullMQ index-video            [one job per file]
  → download ENTIRE file → storage/scratch/{id}/source.ext
  → FFmpeg scenes, audio, thumbnail, LOCAL PROXY
  → optional upload proxy/thumb to Drive/Brisky/
  → Whisper + Gemini
  → media_segments + media_observations
  → delete scratch
  → player reads storage/proxies/{id}.mp4 via API Range
```

Target data flow (architecture §14 + §81):

```text
User
  → Brisky App (API, auth, registry, search, connectors)
  → durable job (typed, segment-aware, priority)
  → scheduler (user slots + global cap)
  → Media Factory worker (disposable)
       → range/stream from connector into bounded buffer
       → decode / sample / transcribe / analyze
       → persist intelligence immediately
       → discard temp bytes
       → exit
  → search over intelligence
  → play: source / on-demand preview / extracted clip
```

---

## 6. Phase-by-phase execution plan

Rules for every phase:

1. One phase at a time. Do not staff Dropbox, desktop, or collections in parallel “to save time.”
2. The intelligence pipeline stages stay the same; only **where they run, how jobs are cut, and what is stored** change.
3. Every phase must leave search working on already-indexed assets.
4. Do not generate new permanent copies of user originals.
5. Prefer extending `MediaConnector` over Drive-specific branches in the processor.
6. Write tests for the new contract (job payload, cleanup, range read, scheduler limits). Do not add a new UI theme.
7. Update this file’s status table when a phase’s exit criteria are met.

---

### Phase F0 — Close Phase 4 without becoming a storage product

**Goal:** Drive ingest is the real product path, upload stays a hidden scaffold, and we stop lying about “no retained masters.”

**Do**

1. **Default-split processes in local dev**
   - Set `RUN_WORKER_IN_API=false` in `.env.example`.
   - `pnpm dev` should start API + web; document `pnpm dev:worker` as required for indexing.
   - Fail loudly in the API if a job is queued and no worker is connected (or show it in observability).

2. **Finish upload teardown as a product path, keep code behind the flag**
   - Keep `ENABLE_DEV_UPLOAD` / `VITE_ENABLE_DEV_UPLOAD` default false.
   - Hide “delete original” in the player unless the asset is `source_type=upload` **and** the flag is on.
   - Stop documenting drag-and-drop upload in `README.md` as the primary loop. Primary loop is Connect Drive → Sync → Search.

3. **Fix Drive sync correctness bugs that make Phase 4 feel fake**
   - Empty folder selection must **not** mean “entire Drive.” Require at least one folder, or an explicit “index My Drive root” confirmation.
   - Deletion/offline marking must key off `external_file_id`, not `original_path = ANY(folderIds)` (that comparison is wrong: `original_path` stores a parent folder id, but only for newly discovered files, and the SQL is easy to get wrong on mixed libraries).
   - Persist Drive `md5Checksum` as `checksum` (already done when present) and skip re-index when checksum is unchanged even if `modifiedTime` ticks.
   - Distinguish **moved/renamed** (same `external_file_id`) from new files. Keep intelligence.

4. **Durable keyframes**
   - After extraction, copy representative keyframes to a durable path (e.g. `storage/keyframes/{assetId}/`) and store those paths on `media_segments.keyframe_paths`.
   - Scratch purge must not delete the durable set.
   - Stage-2 must read those files, never `readdir` of a purged scratch dir.

5. **Failure cleanup**
   - On failure, delete the whole `scratch/{assetId}` directory, not only `source.mp4`.
   - Never leave a half-downloaded master on disk after the job is dead-lettered.

6. **Token encryption**
   - Refuse to start connectors if `CONNECTOR_ENCRYPTION_KEY` is missing. The in-memory random key is a footgun.

7. **Observability for Drive**
   - Record `bytes_read`, download duration, and whether the job was a full download, on `indexing_jobs.timings` / `cost`.
   - Surface connector last-error and `last_synced_at` on the Connectors modal (field exists, UI is thin).

**Do not**

- Add Dropbox.
- Add change webhooks yet (that is F4).
- Delete the proxy encoder. You will need it for on-demand jobs in F3.
- Start generating *more* proxies.

**Exit criteria**

- A user can connect Drive, pick a folder, sync, search, and play from the current proxy path.
- Upload is not visible in the default UI.
- Worker can run as a separate process; API does not FFmpeg by default.
- Stage-2 still has keyframes after scratch purge.
- Failed jobs do not leak masters into `storage/scratch/`.
- README matches the Drive-first loop.

**Files likely touched:** `.env.example`, `README.md`, `queue.module.ts`, `package.json` scripts, `indexing.processor.ts`, `connectors.service.ts`, `ConnectorsModal.tsx`, `VideoPlayer.tsx`, `media.service.ts` (Stage-2 paths), `token-crypto.service.ts`.

---

### Phase F1 — Worker contract, job types, and process isolation

**Goal:** The application submits work. A worker executes work. The worker is replaceable.

This is architecture §70 and §67. It is the real start of the factory.

**Do**

1. **Define a versioned job envelope** (shared types, even if they live in `apps/api` for now):

```text
{
  job_id,
  job_type,          // index_asset | transcribe | analyze_frames | embed | generate_proxy | extract_clip | ...
  asset_id,
  user_id,
  source: { provider, connector_account_id, remote_id },
  segment: { start_s, end_s } | null,   // null = whole asset (legacy)
  priority: "interactive" | "normal" | "batch",
  attempt,
  processing_config: { analysis_version, models, ... }
}
```

2. **Keep one queue name initially** (`indexing-queue`) but switch `job.name` from a single `index-video` to the `job_type` values above. One processor module with a switch is fine. Separate deployables come later.

3. **Worker lifecycle**
   - Validate job
   - Resolve source via `MediaConnector` (no Drive imports in the pipeline core)
   - Create `scratch/{job_id}/` (not only `{asset_id}/`, so retries do not collide)
   - Process
   - Persist results to Postgres
   - Report status
   - `rmSync` the job workspace
   - Exit/return

4. **Status reporting**
   - `queued | processing | completed | failed | retrying | cancelled`
   - Persist `last_error`, `attempt_count`, `started_at`, `finished_at` (mostly exists).
   - Add `job_type`, `segment_start`, `segment_end`, `priority`, `bytes_read`.

5. **Cancel**
   - `POST /api/v1/indexing/jobs/:id/cancel`
   - Removes waiting BullMQ jobs; cooperative cancel flag for the active job (check between stages).
   - Persist completed intelligence; clean temp.

6. **Compose**
   - Add an optional `worker` service that runs `node dist/worker` with the same env as the API, **sharing the `storage/` volume for now**. Volume sharing is a transitional sin; F3/F6 remove the need for shared proxy disk.

**Do not**

- Introduce Cloud Run, Modal, or Kubernetes.
- Split FFmpeg/Whisper/Gemini into three microservices.
- Change search ranking in this phase.

**Exit criteria**

- API with `RUN_WORKER_IN_API=false` can enqueue; only `worker.ts` processes.
- Killing the worker leaves job state in Postgres/Redis; restarting the worker resumes or retries safely.
- A cancelled waiting job never starts.
- Job payload schema is documented in this file or a short `docs/job-contract.md`.

---

### Phase F2 — Segment jobs, checkpoints, independent retry

**Goal:** A 40-minute video is many durable units. One failed unit does not rewind the rest.

Architecture §§22–25, §52, §83 P0.

**Do**

1. **Planning stage (cheap, CPU)**  
   New job type `plan_asset`:
   - Range-read or probe enough to get duration + scene/GOP boundaries (full download still allowed here if range-probe is not ready; F3 replaces it).
   - Write `media_processing_units` (new table): `asset_id`, `unit_id`, `start_s`, `end_s`, `status`, `index_version`.
   - Enqueue child jobs per unit for: `extract_audio` (can be one per asset, not per scene), `analyze_frames` (per scene window), `gemini_video` (per coarse window or whole asset if the API requires it), `embed` (per segment).

2. **Persist as you go**
   - After each unit succeeds, insert/upsert that unit’s `media_observations` and, when a segment is complete enough to search, upsert `media_segments`.
   - Search already allows partial libraries (`status=indexed` per asset). Add `status=partially_indexed` **or** flip the asset to searchable when the first N segments exist, and keep `stage` honest.

3. **Retry**
   - Failed unit: increment attempts; dead-letter that unit after N tries; do not re-run completed units.
   - Manual retry retries failed units only.

4. **Gemini video understanding**
   - Do not naively slice Gemini native video into arbitrary 100 MB chunks (architecture §11). Keep Gemini video as a **coarse** job (whole asset or long GOP-aligned windows). Frame analysis is the parallelizable unit.

**Suggested first cut of units for an asset**

```text
plan_asset
  ├─ extract_audio + transcribe          (one, whole timeline)
  ├─ detect_scenes + extract_keyframes   (one planner, writes units)
  ├─ analyze_frames[scene_i]             (N, parallelizable later)
  ├─ gemini_video                        (one, or few long windows)
  ├─ merge_and_embed[segment_i]          (N)
  └─ finalize_asset                      (marks indexed, cleanup)
```

Concurrency: still 1 asset globally is acceptable in F2; **units of the same asset** may run sequentially first. Parallelism is F5.

**Do not**

- Parallelize 20 Gemini calls per video yet (rate limits).
- Byte-split files.

**Exit criteria**

- Kill the worker during `analyze_frames` of scene 12; restart; scenes 1–11 are not redone; search already contains them if they were merged.
- A corrupt tail of a file can fail its last units while the rest of the video is searchable.
- `indexing_jobs` (or a new `processing_jobs` table) has one row per unit.

---

### Phase F3 — Demand-driven derived media (stop the proxy warehouse)

**Goal:** Indexing produces intelligence + a thumbnail. Playback and clips are separate jobs.

Architecture §§29–34, §75, §83 P0/P3.

**Do**

1. **Stop encoding a proxy inside the index pipeline.**
   - Index still produces: metadata, scenes, durable keyframes, thumbnail, transcript, embeddings.
   - `proxy_status` becomes `none | queued | processing | ready | skipped | failed`.

2. **Playback policy, in order**
   1. If a local (or connector-cached) preview exists and is web-safe → stream it.
   2. Else enqueue `generate_proxy` with **interactive** priority; UI shows “Preparing preview…”.
   3. Optional fast path: if source is already H.264 MP4 and Drive can Range, **proxy-through** Range from Drive for short files. Do not pretend this works for all codecs.

3. **Keep adaptive scaling** (`proxy-scaling.ts`). Before storing a proxy, if it is not smaller/more playable than the source, skip (`proxy_status=skipped`) and play source if possible.

4. **Cache location**
   - Local `storage/proxies/` is an LRU **cache**, not an archive. Record size + last_access. Cap total cache bytes with an env (`PROXY_CACHE_MAX_GB`).
   - If Drive write is enabled, a generated proxy **may** be uploaded to `Brisky/previews/` and the registry stores `proxy_remote_id`. Playback may download from there into cache on another machine.

5. **Clip extraction job** `extract_clip`
   - Input: `asset_id`, `start_s`, `end_s`.
   - Worker pulls only the needed range (F4 makes this cheap; until then, it may still download, but only when the user asked).
   - Output: derived asset, relationship `derived_from`, download URL.
   - If connector can write, put it in `Brisky/clips/`.

6. **UI**
   - Player: if `proxy_status=none`, button/auto “Prepare preview” rather than a broken `<video>`.
   - Search result: “Extract this moment” enqueues `extract_clip`. A minimal download is enough; no collections UI yet.

**Do not**

- Transcode the whole library in a migration.
- Leave index jobs encoding 720p “just in case.”

**Exit criteria**

- Newly indexed Drive videos have **no** `storage/proxies/{id}.mp4` until someone plays.
- First play generates a proxy (or streams source), then subsequent plays hit cache.
- User can extract a 10-second clip from a search hit without indexing a second copy of the master.
- Thumbnail + search still work with zero proxy.

---

### Phase F4 — Ranged / bounded media access

**Goal:** The factory does not need the whole file on disk to do useful work.

Architecture §§10–12, §38, §83 P1.

**Do**

1. **Use `getByteRange` for real**
   - Probe: read header + a small tail (or Drive `files.get` metadata + ffprobe on a partial, with a fallback to full download if the container needs it).
   - Audio-first: if the job is `transcribe` only, extract audio via ffmpeg from a pipe/range when the container allows it; otherwise download audio stream only.
   - Clip extract: `-ss` / `-t` with ranged input.

2. **Bounded scratch**
   - Per-job cap (`WORKER_SCRATCH_MAX_MB`, start at e.g. 512).
   - If a step would exceed the cap, spill in rolling chunks or fail with `scratch_exhausted` (retryable on a bigger resource class later).
   - Never keep the full master after the step that needed it.

3. **Capability flags on connectors**

```text
can_read, can_write, can_stream, can_range_read,
supports_webhooks, supports_signed_urls, supports_large_files
```

Drive: `can_range_read=true`, `can_write=true` (only `drive.file`), `supports_webhooks=true` (unused until F6).

4. **Fallback**
   - If range/pipe decode fails (common with some MP4s), fall back to full download **for that job**, record `access_mode=full_download` in timings, and still delete after.

5. **Measure**
   - MB/s from Drive, bytes_read vs file_size, decode time, peak scratch bytes. Store on the job. This is the benchmark architecture §83 P1 asked for.

**Do not**

- Assume every codec is streamable.
- Implement a custom demuxer. FFmpeg is the decoder.

**Exit criteria**

- At least one real Drive video (not a 20 MB toy) is transcribed **without** a full-file leftover on disk after the job.
- Jobs record `access_mode` and `bytes_read`.
- Clip extract of a 15s window reads substantially less than 100% of a large file when the container cooperates; otherwise the fallback is logged, not hidden.
- Multi-GB behavior is tested at least once and written into `docs/` or this file (what happened, what fallback fired).

---

### Phase F5 — Scheduler: slots, global cap, priorities

**Goal:** The factory has a brain. Plans grant slots. The platform has a ceiling.

Architecture §§18–20, §44–45, §74.

**Do**

1. **Config, not a billing product**

```text
GLOBAL_MAX_ACTIVE_JOBS=2          # local default; raise in prod
DEFAULT_USER_SLOTS=1
INTERACTIVE_RESERVED_SLOTS=1      # never let batch eat the last slot
```

2. **Scheduler in the API (or a small module the API owns)**
   - Before moving a job from waiting → active, check: user active count < user slots **and** global active < global max **and** if job is batch, leave reserved interactive capacity.
   - BullMQ rate limiter / worker concurrency can implement the global cap; user slots need a Postgres count of `processing` jobs per `user_id`.

3. **Priorities**
   - `interactive`: play/preview, clip extract, Stage-2 re-extract
   - `normal`: single new file
   - `batch`: first-time library sync
   - Interactive preempts starting new batch jobs. Do not kill an in-flight FFmpeg without cooperative cancel.

4. **Progress UI**
   - “12 / 40 videos indexed, 3 waiting for a free slot” — counts from jobs, not a fake single progress bar.

**Do not**

- Hardcode Free/Starter/Pro in the worker.
- Build Stripe.

**Exit criteria**

- Two users cannot each run 10 FFmpeg jobs on a machine with `GLOBAL_MAX_ACTIVE_JOBS=2`. **(Met)** — `FactorySchedulerService` checks active count per user against `DEFAULT_USER_SLOTS` and global active count against `GLOBAL_MAX_ACTIVE_JOBS`.
- A preview job starts while a batch library sync is queued. **(Met)** — `INTERACTIVE_RESERVED_SLOTS` blocks batch jobs from taking the last slot while interactive jobs (priority 1) run immediately.
- Observability shows why a job is waiting: `user_slot` vs `global_capacity`. **(Met)** — `waiting_reason` column in `indexing_jobs`, telemetry in `IndexingStats`, badges in `ObservabilityTab` and factual slot progress in `PipelineStatusBar`.

---

### Phase F6 — Continuous Drive intelligence (old Phase 5, factory-aware)

**Goal:** The index is living memory, not a button.

Architecture §16, `phase-plan.md` Phase 5.

**Do**

1. **Poller first, webhooks second**
   - Store and use `sync_cursor` (`changes.list` via existing `getChanges`).
   - Interval poll (e.g. 2–5 minutes) per connected account, as a `discover` job with `batch` priority, slot-aware.
   - Webhooks (`watchChanges`) only if polling is proven; they are an optimization.

2. **Change handling**
   - Added → create asset + `plan_asset`
   - Modified + checksum changed → re-plan; **selective reprocess** (re-transcribe without Gemini if only needed)
   - Deleted/trashed → `availability=offline`, drop from active search, keep intelligence per a retention comment in code
   - Moved/renamed → update path/name, keep `external_file_id` and intelligence

3. **Index versioning**
   - `index_version` / `analysis_version` already on assets/segments. Use them so a new pipeline version can reprocess units without guessing.

4. **Connector status on the dashboard**
   - `last_synced_at`, last error, currently scanning, revoked token.

**Do not**

- Add a second cloud vendor in the same phase (`phase-plan.md` Phase 5 wanted one of Dropbox/OneDrive — **defer that to F9**). Getting Drive continuous-sync right matters more than a second OAuth.

**Exit criteria**

- Leave the app overnight against a real Drive folder; morning state matches adds/deletes/renames without clicking Sync Now. **(Met)** — `ConnectorPollerService` periodically scans active connected accounts (`CONNECTOR_POLL_INTERVAL_SEC`, default 120s) with in-memory anti-stampede concurrency guard.
- Replacing bytes of a file re-indexes; renaming does not. **(Met)** — `syncAccountChanges` checks `md5Checksum`: if identical, updates filename/path while retaining segments and observations; if checksum changed, updates media asset to queued and enqueues with `forceReindex: true, priority: 'batch'`. Deletions mark `availability = 'offline'`.
- Poller is slot-aware and cannot stampede Gemini. **(Met)** — All changes enqueued by poller use `priority: 'batch'`, which respects Phase F5 scheduler constraints (`INTERACTIVE_RESERVED_SLOTS` and `DEFAULT_USER_SLOTS`), preventing starvation of user actions.

---

### Phase F7 — Factory image and VPS (still one provider: “our Docker host”)

**Goal:** The worker is a container with a contract. It can run on a VPS. The app does not care which VM.

Architecture §§47, §49, §71–72.

**Do**

1. **Dockerfile for `brisky/media-worker`**
   - Node worker + FFmpeg + ffprobe + Python whisper deps.
   - Reads jobs from Redis, talks to Postgres, calls Gemini, uses connector tokens **only on the worker** (already the case if the API does not process).
   - Ephemeral disk = container workspace. No requirement that `storage/proxies` is a shared bind-mount. Proxies, if generated, upload to object cache or user’s Drive and the registry stores locators.

2. **`MediaFactory` interface in the API**

```text
dispatch(job)
cancel(job)
getStatus(job)
getCapacity()
```

First implementation: `BullmqMediaFactory` / `VpsMediaFactory` wrapping the existing queue.

3. **Move a worker container to a modest VPS** when local contract is boringly stable. Measure startup time, Drive MB/s from that VPS region, cost per indexed hour.

**Do not**

- Implement CloudRunMediaFactory / ModalMediaFactory until F8 has numbers.
- Put the API and Postgres on the same “ephemeral” box as a long-term plan. API+DB stay stable; workers stay cattle.

**Exit criteria**

- `docker run brisky/media-worker` on a second machine processes a Drive job end-to-end with **no shared filesystem** except Postgres/Redis. **(Met)** — Universal `MediaFactory` interface (`media-factory.interface.ts`) decoupled from BullMQ directly; `Dockerfile.worker` and `docker-compose.yml` use isolated named scratch `factory-scratch:/app/storage/scratch` without host volume mounts. Thumbnails stored directly in database as base64 data URIs (`thumbnail_data`) and served with zero shared disk access.
- Intelligence appears in the web app running elsewhere. **(Met)** — All assets, segments, keyframe records, and metadata persist directly to PostgreSQL; queue dispatches and telemetry route through Redis via `MediaFactory`.
- Temp files are gone after the container exits. **(Met)** — Ephemeral scratch space purged per-job in `IndexingProcessor.cleanupJobScratch` on complete, cancel, and failure.

---

### Phase F8 — Evaluate ephemeral providers (do not commit)

**Goal:** Pick a scale-out target using Brisky’s own timings, not blog posts.

Architecture §§48, §73, §83 P2.

**Do**

- Benchmark the **same worker image** on: current VPS, Cloud Run (CPU), and one GPU-ish option only if local Whisper/vision needs it.
- Compare: cold start, max runtime, ephemeral disk, egress, concurrency, price per indexed hour, failure modes.
- Write the comparison into `docs/factory-provider-evaluation.md`.
- Keep `MediaFactory` as the only app integration point.

**Do not**

- Rewrite the pipeline for a vendor API.
- Assume every stage needs a GPU. FFmpeg and most Gemini calls are CPU + network.

**Exit criteria**

- A written recommendation with Brisky-measured numbers.
- A second factory adapter can be added without touching search or the registry.

---

### Phase F9 — Second connector (one only)

**Goal:** Prove the factory and registry are not Drive-shaped.

Architecture §77, `phase-plan.md` Phase 5 “one of Dropbox or OneDrive.”

**Do**

- Implement **one** of Dropbox or S3-compatible (S3 is often cleaner for range reads; Dropbox is closer to the ICP). Choose based on a one-paragraph note in this file when F9 starts.
- Same `MediaConnector`. Same jobs. Same factory.
- Capability flags must be honest (`can_range_read` may be false → full download fallback already built in F4).

**Exit criteria**

- Adding the connector does not fork `indexing.processor.ts`.
- A Drive asset and a second-connector asset appear in one search for one user.

---

### Phase F10 — Collections, clip packs, then public API

Only after F3 clips work and F6 Drive sync feels alive.

**F10a — using moments** (`phase-plan.md` Phase 7)

- Save result, collections of moments, in/out on the player, extract (already a job), optional concat.

**F10b — developer surface** (`phase-plan.md` Phase 8, architecture §76)

- API keys, docs for the routes the web app already uses, webhooks `asset.indexed` / `asset.failed`, usage meters.
- Developers must not see the factory.

**Still later:** desktop (old Phase 6), images/PDFs, Q&A, billing, BYOK, entity graph.

---

## 7. Suggested near-term sequence for the next agent

If you are the coding agent reading this in a fresh session, do **Phase F0**, then **F1**. Stop and report. Do not “also start ranged downloads and clip extract” in the same PR.

```text
F0  Close Phase 4 honestly (process split, sync bugs, durable keyframes, cleanup)
F1  Job contract + worker isolation + cancel
F2  Segment/unit jobs + checkpoints
F3  Demand-driven proxy + clip extract
F4  Range/bounded access + multi-GB measurement
F5  Slots + global cap + priorities
F6  Drive poller / living index
F7  Worker image + VPS
F8  Provider evaluation
F9  Second connector
F10 Collections + public API
```

That order matches architecture §83 (P0 → P1 → P2 → P3) while finishing the Phase 4 product thesis without a proxy warehouse.

---

## 8. Agent implementation notes (concrete)

### 8.1 Do not put Drive SDKs in the pipeline

`indexing.processor.ts` already goes through `ConnectorRegistry` for download. Keep it that way. `ensureBriskyStructure` / `uploadAsset` should be called via connector capabilities, not `as any` Drive casts.

### 8.2 Two connector interfaces

Delete or wrap the leftover `connector.interface.ts` (`Connector`) once nothing imports it. `MediaConnector` is the contract.

### 8.3 Gemini coupling

There is no `AIProvider`. Accept that for F0–F5. When adding factory job config, pass `model` / `provider` as data on the job so a later provider swap does not rewrite the queue.

### 8.4 Whisper

`services/whisper-transcriber/` is a host Python sidecar, not a factory. For F7, bake it into the worker image. Do not make the API shell out to Python.

### 8.5 Search IDF

Still missing from Phase 3. It is **not** a factory blocker. If a search-quality PR is needed, keep it off the factory branch. Do not mix retrieval experiments with worker-contract refactors.

### 8.6 Schema additions likely needed (do not invent extra ones)

- `processing_jobs` or extra columns on `indexing_jobs`: `job_type`, `priority`, `segment_start`, `segment_end`, `bytes_read`, `access_mode`, `cancel_requested`
- `media_processing_units` (F2)
- Connector capability / `sync_cursor` actually used (F6)
- Derived-media registry fields: `representation_type`, `cache_last_access_at` (F3)
- Durable keyframe dir (F0)

### 8.7 Tests that must exist before F1 is “done”

- Worker not registered in API when `RUN_WORKER_IN_API=false`
- Scratch recursive delete on failure, including non-mp4 extensions
- Stage-2 reads durable keyframes after a simulated scratch purge
- Sync does not treat empty folder list as “whole Drive”
- Offline assets stay out of search (already has `search-availability.spec.ts` — keep it)

---

## 9. Scorecard vs architecture principles (§80)

| Principle | Status |
| :--- | :--- |
| 1. Brisky is not storage | **F3 Met** (Eager proxy warehouse stopped; preview proxies are demand-driven and managed by LRU disk cache capped by `PROXY_CACHE_MAX_GB`) |
| 2. Original remains source of truth | **F6 Met** (Read-only Drive scope; continuous poller tracks additions, modifications, renames, and moves without modifying user storage) |
| 3. Intelligence is persistent | **F6 Met** (Renamed/moved files preserve all existing segments, observations, and embeddings; deleted Drive files marked offline without destroying historical intelligence) |
| 4. Workers are disposable | **F0, F1 & F7 Met** (API decouples worker; container image decoupled from API filesystem; communicates strictly over Postgres + Redis; zero shared host volume mounts; scratch purged per-job) |
| 5. Jobs are durable | **F1 Met** (Typed `FactoryJobEnvelope` in Redis + Postgres `indexing_jobs` tracking `job_type`, `priority`, `bytes_read`, cooperative cancellation) |
| 6. Processing is resumable | **F2 Met** (Durable `media_processing_units` checkpointing; completed units skipped on restart/retry; partial segments searchable) |
| 7. Temporary media is bounded | **Not honored** (full file in scratch) |
| 8. Prefer streaming/range | **Interface only** |
| 9. Proxies are demand-driven | **F3 Met** (Indexing produces intelligence without eager proxy; `generate_proxy` triggers on-demand with interactive priority and HTTP 202; `extract_clip` extracts sub-clips as derived assets) |
| 10. Plans control concurrency | **F5 Met** (Processing slots per user via `DEFAULT_USER_SLOTS`, throttling excess user concurrent work) |
| 11. Global capacity protects the platform | **F5 Met** (`GLOBAL_MAX_ACTIVE_JOBS` limits total platform work; `INTERACTIVE_RESERVED_SLOTS` reserves capacity for interactive jobs) |
| 12. Speed / time-to-first-intelligence | **Partial** (library is searchable as videos finish; a single video is not) |
| 13. Factory is provider-independent | **F7 Met** (Universal `MediaFactory` interface decouples `IndexingService` from BullMQ/local queue; default `BullmqMediaFactory` wraps Redis queue; standalone worker container deployed on VPS Docker host) |
| 14. API and web share the same core | **Honored** (`/api/v1`) |

---

## 10. What a successful F0+F1 looks like to a human

1. Start Postgres/Redis.
2. Start API **without** a worker: connecting Drive and clicking Sync queues jobs that sit in `waiting`.
3. Start the worker: jobs run; API stays responsive.
4. After index, `storage/scratch/` is empty; `storage/keyframes/` has small JPEGs; search Stage-2 can still inspect a scene.
5. Upload button is not in the UI.
6. Observability shows job type, attempts, bytes downloaded, and errors that mean something.

Only then is it worth cutting videos into units and deleting eager proxies.

---

## 11. Document control

- Architecture north star: `Brisky — Media Intelligence & Ephemeral Media Factory Architecture.md`
- Historical product sequence: `phase-plan.md` (Phase 4 in progress; this file supersedes its remaining Phase 4 *implementation details* where they conflict, especially mandatory eager proxies)
- Product thesis: `01-project-brief.md`, `02-development-direction.md`
- Connector/proxy product rules: `03-media-storage-brief.md`
- This assessment is based on the codebase as of 2026-09-14, not on README claims.

When F0 is complete, update §1.1 and §9 in this file rather than creating a third plan.
