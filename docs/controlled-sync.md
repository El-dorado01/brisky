# Controlled Drive sync activation

Updated 2026-11-01. Event extension of existing Brisky connectors, queues and AI ledger.

Subsequent owner approval explicitly covers the newly saved folder's supported media,
including later additions, being processed through direct Meta. The scoped worker is
now running with the original account/32 MiB/$10 limits. Standalone startup defers Bull
registration until all Nest initialization/reconciliation completes, fixing a live
connector-registration race. Four specific interrupted small assets were retried through
existing services; two larger assets remain blocked. Live Drive/decoder retries are
observed; completion is not yet verified. Factory's owner-scoped status reads now prefer
fresh active child-job progress when the parent metadata still says queued. API build,
worker lifecycle/import checks and eleven connector/worker-role tests pass.

Direct Meta follow-up: the controlled worker still rejected Meta after the API switch.
The guard now admits explicit Meta or Baseten with the same owner/local speech,
account, 32 MiB and concurrency limits. File plans list configured frame/video models,
reserve using the largest per-attempt hold, and reject unlisted models/providers or
changed resumed plans. Existing single-model journal entries remain compatible.
34 ledger/streamed-indexing regressions and API build pass. Worker startup was blocked
by automatic approval review because prior ongoing-folder transfer approval covered
Baseten, not Meta. No worker started; folder-wide Meta transfer needs owner approval.
Historical Baseten-only descriptions below refer to the original activation.

The owner explicitly approved persistent worker processing and automatic sync for the
previously confirmed Drive account, including supported media added later being sent to
Baseten, under the unchanged $10 cumulative ceiling. Other accounts are excluded.

## Controls

- `SAAS_DRIVE_SYNC_ENABLED=true` plus `SAAS_DRIVE_SYNC_ACCOUNT_IDS` permits manual sync
  only for the configured account. Other accounts can still save folders but remain paused.
- `INDEX_BUDGET_PLAN_ENABLED=true` plus `INDEX_ALLOWED_CONNECTOR_ACCOUNT_IDS` restricts
  worker inputs to that account and known source sizes of at most 32 MiB.
- The controlled profile requires Baseten, owner-scoped local embeddings and local speech.
  Direct Meta remains inactive. Other provider profiles need their own plan validation.
- After decoding scenes, before preview generation/analysis dispatch, the ledger atomically
  holds allowance for per-scene batches of four frames plus one video request. Default
  `INDEX_PLAN_ATTEMPTS_PER_CALL=2` provides a pooled retry allowance. Retries beyond that
  allowance stop; a plan does not guarantee unlimited retries or provider pricing accuracy.
- Attempt reservations consume their file's hold, rather than charging that hold twice.
  Successful reported usage replaces each attempt's hold. Finalization/cancellation or a
  permanent processing error releases unused plan funds; failed/unreported attempts keep
  their reservations. Crashes retain unused funds for safe resumption/reconciliation.
- Async request context binds each indexing job to its owner/asset plan. Plans are durable
  across local API/worker restarts sharing the same ledger; another file cannot borrow them.
- `ENABLE_CONNECTOR_POLLING=true` polls every 120 seconds in the API, restricted by the
  same configured account list in controlled mode. Workers do not run a second poller.
  Worker concurrency admission is limited to one active job for this profile.

The current ledger is local shared-disk coordination, not a multi-host billing service.
Keep the same durable journal mounted for API/workers. Do not delete it to gain allowance.

## User flow and recovery

Factory -> Connectors -> Manage -> Save & sync persists folders before discovery.
Existing selections can use Sync selected folders. A successful response reports files
found/queued, not completed indexing. Repeated unchanged-source sync reuses indexed work.
Failed assets can be requeued by manual sync even if their checksum did not change.
Paused, queued, processing and needs-attention states are shown separately.

Live UI testing exposed a continuous JavaScript spinner loop that made the management
interaction unresponsive. Factory's Hugeicon spinner now uses CSS rotation and respects
reduced motion; other animated icons retain their existing trigger system.

## Validation and limits

Fifty admission/ledger/connector/checkpoint regressions and eight poller regressions pass.
API TypeScript/build, web TypeScript and targeted lint pass. The live isolated queue held
$5, completed ten requests, all eight units and all 32 frames, then released unused funds.
Its reported usage estimate was $0.13066925. Test media, temporary records and its preview
upload were removed. Existing Google/local vectors were preserved.
[File-plan evidence](hackathon-evidence/2026-11-01-file-plan-queue.json).

Background Chrome tested the real Factory session -> Manage -> Sync -> Drive discovery
path. One existing file was found and zero queued, verifying unchanged-source reuse and
visible feedback without more AI. The temporary session/browser was removed.
[UI evidence](hackathon-evidence/2026-11-01-controlled-sync-ui.json).

The standalone worker is running after owner approval. The live 120-second polling check
passed: only the confirmed account's sync time advanced, the other account stayed unchanged,
and the usage journal did not change. The main queue remains idle; its two previously
failed jobs were not retried. [Polling evidence](hackathon-evidence/2026-11-01-controlled-polling.json).
Existing provider body/duration/format limits still apply within the 32 MiB source cap;
that cap is not a promise that every smaller file is supported. This is controlled account activation, not broad sync,
large-file readiness, labelled recognition accuracy or a direct Meta provider switch.
