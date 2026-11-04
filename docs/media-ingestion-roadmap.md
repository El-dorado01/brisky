# Media ingestion and provider transition checklist

Updated 2026-11-01. Priority: accuracy > cost > speed. Unchecked items are planned or
unverified, not implemented promises. This checklist extends pre-existing Brisky queues,
connectors, FFmpeg, Whisper, indexing and retrieval. Event changes are attributed in
[the contribution record](hackathon-contributions.md).

## Current validation

- [x] Baseten text/image and synthetic video/silent-audio checks pass.
- [x] Isolate provider credentials, endpoints, model IDs and billing attribution.
- [x] Explicit Baseten media opt-in; visual-only video rejects invented dialogue.
- [x] Separate media body limit: 8 MiB default, configurable up to 100 MiB, including
  base64/JSON; text-only requests retain 128 KiB. Reject before budget reservation.
- [x] Offline cached MiniLM text-pair and Whisper silence checks pass.
- [x] Owner reports successful Google consent/folder saving; metadata confirms one
  53.033-second, 4,182,700-byte video in the latest selected account.
- [x] Original 53-second video component preflight passes: source integrity, seven timed
  local Whisper cues, 12 Baseten visual segments covering the recording, no invented
  dialogue. This is processing validation, not labelled speech/visual accuracy.
  [Evidence](hackathon-evidence/2026-10-31-drive-media-preflight.json).
- [x] Controlled native-video/local-speech pilot persisted 12 segments and 384-dimensional
  embeddings. Actual retrieval, cited SaaS reply, JPEG thumbnail, source byte ranges,
  shortlist/reload and retry without inference pass. Temporary session/space deleted.
  [Evidence](hackathon-evidence/2026-10-31-persisted-drive-integration.json).
- [x] Validate the production queue processor/services with retained real Drive media
  in an isolated Redis queue: seven units, two scenes, 32 frame observations and one
  pre-inference retry passed. See [queue scope](queue-media-validation.md).
- [ ] Validate remote Drive queue access and automatic sync; the isolated local-source
  run did not download/upload through a connector or start a production queue consumer.
- [x] Real Drive range reads and local speech now pass through the isolated queue and
  production connector/auth services, including checkpoint replay without inference.
  [Evidence](hackathon-evidence/2026-11-01-drive-remote-audio-queue.json).
- [x] Validate forced OAuth refresh persistence, remote scene/video units and derived
  uploads in isolated checks. The remote full queue completed eight units and 31 frame
  observations; its test preview was deleted. Real timer/discovery dedup also passes.
  See [current sync evidence](drive-save-and-sync.md); broad activation remains off.

## First bounded Drive pilot

- [x] Scope execution to the confirmed owner/account/file; verify folder membership,
  byte count, checksum/source version and duration before paid analysis.
- [x] PostgreSQL/Redis were healthy for the queue run; no Docker startup was needed.
- [x] Measured the queue plan: two scenes, 32 frames, nine frame batches and one video
  request. Owner approved an **$8 cumulative** ceiling for the $2.50 new reservations.
  Preserve
  all ledger reservations; sponsor balances are not authorization to spend them.
- [ ] Retain original quality when it fits; bound scratch usage and clean up private files.
- [ ] Check transcript, source offsets, visual details and temporal order against footage.
- [x] Keep query/index embeddings consistent using `LOCAL_EMBEDDING_USER_IDS` for the
  pilot owner only. Query caches include embedding space/model; 266 older Google-vector
  segments are preserved. No global embedding-provider switch was performed.
- [x] Persist native-video observations, timed speech, local vectors and source frames
  atomically for the controlled pilot; retain a private playback copy under ignored storage.
- [x] Completed scene checkpoint replay made no model call; injected pre-inference
  interruption retried successfully through BullMQ. In-flight inference recovery is separate.
- [ ] Validate interrupted in-flight requests/source changes and partial queue recovery.
- [x] Verify retrieval -> natural reply -> citation playback/thumbnail -> shortlist -> reload.
- [ ] Record non-sensitive evidence and costs; keep footage/transcripts out of Git.

## Large files and connector libraries

- [ ] Define provider profiles for body/file bytes, durations, formats, image counts,
  sampling, audio semantics, context/output budgets and account rate limits.
- [ ] Verify discovery pagination, selected subfolders, changes, deletes/moves and owner
  isolation. Investigate the saved legacy account's HTTP 400 separately.
- [ ] Split oversized/long recordings, including >1 GiB files, into bounded temporal
  windows with overlap, original offsets, deduplication and cross-window context.
- [ ] Track coverage of every required window; never silently truncate a recording.
- [ ] Bound download/AI concurrency, CPU threads, memory, scratch disk and queue growth;
  do not base64-buffer gigabyte originals or entire libraries in Node.
- [ ] Prefer range/seek access where compatible; retain bounded full-download fallback
  for containers/codecs/connectors that require it.
- [ ] Preserve originals/audio; use proxies for discovery and original detail for checks.
- [ ] Resume interrupted windows and invalidate stale work when source versions change.
- [ ] Meter retries, rate-limit backoff and cancellation; enforce per-owner fairness.
- [ ] Evaluate long media, >1 GiB media, multiple files, interrupted/restarted processing,
  source changes, cross-owner denial, fine text, fleeting actions and real speech.

## Direct Meta switch after Baseten validation

- [ ] Confirm accessible exact model IDs, supported modalities, pricing and credit terms.
- [ ] Validate Meta's actual request envelope, timestamps, output limits and billing;
  do not assume Baseten encodings or video/audio semantics are identical.
- [ ] Implement Files API upload, reuse/reference and cleanup/expiration. Inline-video
  adapter support alone does not implement this lifecycle.
- [ ] Scope remote file IDs to owner/source version; handle failed uploads, disconnects,
  deletion and files still referenced by active jobs.
- [ ] Run equivalent offline contracts and live speech/video/citation checks on Meta.
- [ ] Configure dedicated root Meta key/model/pricing; select `AI_PROVIDER=meta` only
  at the planned switch. Restart services, preserve ledger and embedding space, and
  verify attribution/rollback without implicit key or provider fallback.

Meta documents 50 MB per inline file, 1 GiB per Files API upload and 100 GiB stored per
team. These are not a promise of exhaustive video coverage. Baseten documents a 100 MiB
body limit for Muse Spark Open, with separate sampling/duration/audio restrictions.
Sources: [Meta files](https://dev.meta.ai/docs/file-handling),
[Meta media](https://dev.meta.ai/docs/video-understanding),
[Baseten vision](https://docs.baseten.co/inference/model-apis/vision).

## Enable continuous sync after the pilot

- [x] Combine Save & sync into one primary action with durable saved selection and
  explicit complete/failed/paused responses. Retain unsaved-change/disconnect confirmations.
  Service/SQL fixtures and actual paused Next/engine HTTP pass; [scope](drive-save-and-sync.md).
- [x] Guard folder boundaries, checksum drift, scan cursor ordering and simultaneous
  manual/poll sync; PostgreSQL fixture changes/locking tests pass.
- [x] Run the full remote frame/video/preview queue check under the owner-approved
  $10 cumulative ceiling. Passed; preserved reservations total $9.15.
- [x] Validate forced refresh, timer-driven polling, cursor persistence and deduplication
  on a temporary connector; production polling remains off.
- [ ] Show accurate paused/queued/partial/error status and recovery actions.
- [x] Verify real new-file/change/delete/move cycles reconcile only affected assets;
  enqueue captured, separate full queue validation above. No broad library run claimed.
- [x] Admit complete-file work within remaining budget for the controlled Baseten/local
  profile; account/size gates and pooled retries apply. See [activation](controlled-sync.md).
  Owner-approved successful-usage settlement now frees old successful holds; preserve
  failed/unknown holds and journal history. The cached strict-frame rerun passed eight
  units and all 32 prepared/observed frames. Owner-approved worker/polling now runs for
  one account; a live unchanged-source tick made no AI calls. Broad activation remains off.
- [ ] Update TODO, contribution status and demo evidence after each milestone.

People recognition, custom objects, voice mode and Studio outputs remain tracked in
[TODO](../TODO.md); this checklist does not mark those proposals complete.
