# Queue media validation

Completed 2026-11-01 (Africa/Lagos); preparation began 2026-10-31.

This event validation exercises Brisky's pre-existing BullMQ/PostgreSQL/FFmpeg indexing
foundation with the event Baseten adapter and owner-scoped local embeddings. It does
not present the queue engine as newly built for the hackathon.

## What passed

`node --env-file=.env scripts/check-drive-queue.cjs --live` uses the original-quality
playback copy of the real 53-second Drive source in a uniquely named temporary queue.
It constructs the production processor, scheduler, indexing service, unit service,
FFmpeg, Whisper and model adapters; it does not replace them with fixture providers.
No production-queue consumer is started and no Google files are uploaded.

- Seven processing units completed: two scene analyses, two embeddings, local speech,
  native video and finalization. Planning also ran through the queue.
- The two scenes produced 32 actual frame observations in nine image requests;
  a separate visual-video request completed the ten-call measured plan.
- Final scene text/vectors include overlapping native-video context and local speech.
- One injected interruption before processor/inference dispatch was retried successfully.
- Replaying a completed scene checkpoint performed no additional inference: ledger bytes
  before/after were identical. This is not a mid-request failure/billing recovery test.
- The 266 existing Google-vector segments were preserved. Temporary queue, asset and
  private derived files were removed; the earlier 12-segment saved pilot remains intact.

[Non-sensitive evidence](hackathon-evidence/2026-11-01-drive-queue-pilot.json).
The ten inference calls had about **$0.13744** in token estimates, not an invoice.
Total conservative ledger reservations are **$6.65 of the approved $8 cumulative ceiling**.
The ledger includes earlier failed/unknown attempts and was not reset.

## Corrections developed during validation

`apps/api/src/modules/queue/indexing.processor.ts` now waits for unfinished speech and
native-video units before generating a scene embedding. Queue order alone did not
guarantee this dependency. It combines only overlapping video context with frame text
and transcript, and persists enriched fields before completing the embed unit. Failed
upstream stages retain partial-index semantics. Owner-scoped embedding selection is
preserved; related SQL reads/updates explicitly include the owner.

The duplicate-index path now serializes pg-parsed keyframe arrays as JSON rather than
passing a JavaScript array directly to a JSONB parameter. Initial attempts exposed this
before inference. A force-reindex option was then used to exercise the full pipeline
rather than bypassing it through deduplication.

A subsequent checkpoint attribution correction explicitly writes the actual frame
provider/model instead of inheriting the schema's Google defaults. This correction and
the final owner-SQL predicates have offline regression/TypeScript validation; the live
queue run used the preceding processor version. No additional paid rerun was made solely
for these changes.

Five focused regressions cover pending dependencies, overlapping evidence/owner forwarding,
JSON serialization and model attribution. Broader streamed-preparation/scheduler suites
also pass; TypeScript passes.

## Still required before automatic sync

Update 2026-11-01: a separate full remote run now passed eight units, two scenes,
31 frame observations, native video, local speech/embeddings and derived preview upload/
cleanup. Real OAuth refresh persistence, timer/discovery dedup and Drive lifecycle
reconciliation also passed in separate scoped checks. See
[current validation and limits](drive-save-and-sync.md). The original local-source
results above remain historical evidence for that run, rather than cloud validation.
The checklist below records what was outstanding immediately after the local run.

- Remote Drive queue download/range/refresh and any connector-derived uploads. This run
  read the retained local source; it did not exercise those cloud paths through a worker.
- Interrupted in-flight inference, source changes and partial failure/recovery, with
  explicit admission for retries and no duplicate model charges assumed away.
- Labelled speech, fine-text, temporal and retrieval accuracy evaluation. Valid JSON,
  plausible model output and complete checkpoints alone are not measured accuracy.
- Longer inputs, bounded windows, model sampling/output limits and local-embedding text
  truncation/coverage; this test does not establish GB-scale operation.
- Save & sync feedback, polling/cursors, new-file/change/delete cycles and deduplication.

The production worker, broad sync and polling remain off. Direct Meta is not selected.
Continue with [the main ingestion checklist](media-ingestion-roadmap.md).
