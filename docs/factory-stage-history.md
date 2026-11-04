# Factory stage visibility — 2026-11-02

## Current scheduler: two preparation slots plus three continuation slots

The owner subsequently requested a five-job partition. Root global/per-user caps are
now 5, with `FACTORY_INGEST_SLOTS=2` and `FACTORY_CONTINUATION_SLOTS=3`.
`plan_asset`/legacy `index_asset` occupy preparation capacity (including fetch and
scenes); other jobs occupy downstream capacity. The same atomic PostgreSQL advisory
lock enforces lane, global and user caps across workers. These are strict caps with
no borrowing; a lane can be idle when no eligible work exists. Per-asset locks remain.

Queue priority now prefers continuation prerequisites (speech and frame/video analysis)
then embeddings/finalization over starting another normal source. Interactive requests
remain first and batch work remains below normal work. Embedding/finalization with
pending prerequisites defer before claiming capacity; the checks inside execution remain
to protect against races. Active jobs are not preempted, and Meta transport serialization
is independent of the five job slots. No promise of immediate movement or five parallel
model requests is made.

Validation: 38 targeted scheduler/factory/retry/dependency tests and API build pass.
`scripts/check-factory-scheduling.cjs` creates an isolated temporary SQL schema and Redis
queue, proves concurrent admission caps 2/3/5, and verifies a ready continuation starts
before a fresh source while another file overlaps. Fixtures are removed; no inference
or production queue is used by the check. The owner-requested fourth reset removed only
the current seven source assets, 25 associated jobs and six exclusive local artifact
paths; 50 unrelated assets/originals/profiles/journal remain. Fresh full media acceptance
is still pending. Historical configurations and earlier checks follow.

## Five-file presentation and requested clean retry

At the owner's request, stage cards show at most five distinct files across active and
recent rows, panels show only five recent file groups (no expand-all file list), and
Overview shows only five recent journeys. Substeps remain expandable within one file.
The owner-scoped file list sorts by latest effective asset/live-job update time.
Web TypeScript/targeted lint, API build and real SQL state/progress checks pass.
A third explicit reset cleared the current seven source assets, 25 related queue jobs
and five exclusive local artifact paths; 50 unrelated assets, original Drive media,
profiles and journal remain. Two-slot configuration is retained; automatic polling
stays paused in the API runtime until manual resync acceptance. No new real-media
accuracy or browser-layout claim is made.

## Measured progress and two independent files

The owner subsequently requested two files progressing independently. Root runtime
configuration now sets `GLOBAL_MAX_ACTIVE_JOBS=2` and `DEFAULT_USER_SLOTS=2`.
Worker queue concurrency follows the global limit; atomic scheduler admission still
enforces the global/per-user caps and per-asset locks prevent simultaneous mutation
of one file. Different files may be in different stages. Model transport scheduling,
CPU and network can still limit throughput; two jobs are not a promise of double speed.
The $10 cumulative allowance, selected account and 32 MiB cap are unchanged.

Native scene extraction now plans its exact required frames and reports completed frames
only after a successful nonempty decode. Failed attempts do not advance progress.
Factory stores completed/total counts separately from legacy overall job milestones;
stage percentages derive from those measured counts. For example 8/24 frames is 33%.
Windowed transcription publishes completed/total windows. Operations without a measured
denominator display Working; no fabricated AI-request percentage is shown. Existing
unmeasured histories do not acquire invented progress. Tests: 45 targeted frame/sampling/
telemetry/scheduler checks, API build, web type/lint and rollback-only PostgreSQL checks
verify 1/4 frames becomes 25% and an unmeasured job milestone stays indeterminate.
This extends event-developed Factory visibility on the existing decoder/worker foundation.
After draining and restart, the API health check returned HTTP 200 and the queue was
resumed. A real database snapshot confirmed two different assets simultaneously admitted
as active frame-analysis jobs. This does not imply simultaneous requests inside the shared
Meta transport, which retains its own serialization. The previously stalled-looking source
had advanced through scene preparation and completed local transcription before restart.

## Follow-up after user resync

Activity is grouped once per file; substeps expand on demand, with five files visible
initially. An inactive card says "No active files", never that the whole stage/pipeline
has completed. Intermediate scratch cleanup is hidden from final Purge until the asset
reaches indexed/partially-indexed state. It remains recorded internally.

Live status now comes from fresh active jobs; waiting jobs yield queued, and a parent
left processing with no live/pending job yields needs attention. Connector and Overview
share this read. Worker retries restore waiting state instead of marking retryable
errors terminal; normal dependency delays do not count as failures. Tests: 25 targeted
regressions plus API build, web types/lint and real rollback-only PostgreSQL state checks.

Observed source errors were two 32 MiB cap blocks, two 15-second metadata timeouts and
one missing keyframe; none of those messages was budget exhaustion. The retry-state
correction does not itself establish decoder success. A second user-requested reset
cleared the same seven current test sources and 18 jobs, preserving 50 unrelated assets.
Automatic polling is paused in the running API's environment (root `.env` unchanged)
to keep the clean reset until manual Save & sync. Resume polling after the next accepted
manual flow. Fresh browser/media completion is still an acceptance check.

Event-developed visibility on the pre-existing worker/indexing pipeline. The previous
frontend hard-coded missing metrics, only mapped current parent status and polled every
ten seconds. Fast completed stages had no history and several job names were unmapped.

The worker now records owned stage runs for source access/probing, scenes, local
transcription, visual/video understanding, embeddings/finalization and real scratch
cleanup. History is durable in `factory_stage_runs`, linked by composite owner/asset
foreign key. Completion/failure duration is measured around actual execution; deferred
jobs do not count as failures. Telemetry write failures do not fail media processing.
Worker-loss running rows appear interrupted when no fresh active job remains. Replay
of completed unit checkpoints is labelled reused; duplicate-index cloning is explicitly
recorded as `reused_index`. No dummy model calls or artificial stage delays are added.

Factory polls every 2.5 seconds without overlapping timer refreshes. Active stage files
and recent completed/failed files appear on canvas cards. The panel shows current work,
recorded activity and actual daily counters. Overview adds expandable per-file journeys.
Definitions: daily completed/failed totals count distinct files; average duration uses
completed recorded runs; success rate is completed/(completed+failed) runs, including
retries. Lagos day boundaries apply. A file can count as both failed and completed if
it failed then succeeded. Job progress is not presented as a newly measured stage
percentage. Up to 100 recent activities per stage feed journeys; older/missing events
are labelled not recorded, never invented as completed.

The canvas now represents dependencies as a fork: Fetch ? Scenes ? Understand and
Transcribe ? Index ? Purge. Understanding and transcription can finish in either order;
Index joins the available results. The per-asset mutation lock still applies, so this
layout does not promise simultaneous jobs on the same file. Retries, checkpoint reuse,
audio-less files and partial failures can change which work actually executes.
Generated previews and durable frame evidence can remain after scratch cleanup.

Validation: 21 telemetry/connector/streamed-indexing tests, standalone worker lifecycle
test, API build, web TypeScript and targeted lint pass. `scripts/check-factory-stages.cjs`
uses real PostgreSQL with rollback-only fixture rows to verify live activity, retained
fast completion and owner isolation. No personal media, worker or inference is used
by that fixture. Full browser presentation and a fresh user sync remain acceptance checks.

The owner requested a reset after removing the test folder from sync. Exactly its seven
known assets, 18 associated Redis jobs and two exclusive local artifact paths were
removed. Cascading knowledge/checkpoint rows were cleared; 50 unrelated assets, connection,
people profiles, originals and append-only usage journal were preserved. Unused file
holds were released through the ledger rather than deleting history. Shared or unrelated
preview files were retained. Existing matching copies elsewhere can still legitimately
provide reused knowledge on the next sync. The 32 MiB/$10 scope remains unchanged.
After reset, the API was restarted (health HTTP 200) and the updated worker started
in standby. The queue had zero active/waiting/prioritized/delayed jobs; two unrelated
historical failures were left intact. The owner can now reselect the test folder.

2026-11-02 layout validation: web TypeScript and targeted ESLint passed. Browser
presentation of the branched layout remains unverified. The current Drive video
`v14044g50000d94kshvog65r9vpm82vg.mp4` reported a required keyframe missing at
14.7 seconds in scene 2 (container duration 14.72 seconds). This is a frame extraction
failure, not a size/budget rejection. Local ffprobe/FFmpeg reproduction confirmed
that audio lasts 14.72s, the video stream lasts 14.70s, and its last frame PTS is
14.666667s. The original sampler's 14.7s seek produced no image. Frame extraction
now retries successful empty decodes within 0.25s of the scene end at seeks 0.05s
and 0.15s earlier, staying inside the same scene and recording the successful seek
timestamp. It does not use this recovery for timeouts/network failures or silently
accept missing evidence. This is bounded recovery, not a general corrupt-video repair.
Actual source extraction passed (two scenes; recovered seek 14.65s), as did 30 focused
frame-coverage/sampling tests and the API build. No AI calls were needed for diagnosis.

After draining and stopping the worker, the owner-requested current-batch reset
removed exactly seven assets, 25 queue jobs and four exclusive local artifact paths.
50 unrelated assets, people profiles, shared donor previews, Drive originals and the
append-only usage ledger remain. Unused file-plan holds were released through the
ledger. Evidence: ignored `storage/factory-folder-reset-fifth-2026-11-02.json`.
