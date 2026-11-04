# Save & sync and change-stream boundaries

Implemented 2026-11-01 as event work extending Brisky's existing Drive sync engine.

The manager's primary action now sends `{folders,sync:true}` to the existing owner/session-
protected folder endpoint. It saves first, then attempts discovery/enqueue in the same
request when `SAAS_DRIVE_SYNC_ENABLED=true`. It reports `complete`, `failed`, `paused`
or `not_requested` explicitly. A failed sync preserves the saved selection; the existing
Sync action retries discovery. This does not mean indexing is finished when jobs are queued.
The old folders-only payload still works. The proxy allows 90 seconds for this combined
operation. Existing unsaved-change and disconnect confirmations are preserved.

Before this change, full sync captured its cursor after enumeration, and incremental
sync could accept missing/outside folder parents or reindex a source moved outside the
selection. The service now:

- Captures the full-scan start cursor before listing, so concurrent changes are replayed.
- Refuses incomplete discovery before treating unseen files as deleted.
- Rejects empty folder selections; new files must have a known selected direct parent.
  Individual subfolders must be explicitly selected, as the manager explains.
- Marks moved-out tracked files offline without indexing them, and restores unchanged
  files moved back into scope. Rename-only changes retain intelligence.
- Treats changed checksums as changed content even without a newer timestamp.
- Scopes existing-source reads by connector account as well as owner/file ID.
- Serializes manual/poll sync by owner/account using a PostgreSQL session advisory lock,
  with a process-local duplicate guard. The lock connection is released on every path;
  failed unlock destroys the connection. No transaction spans network calls.

Validation: 24 targeted service/controller regressions passed; engine and frontend
TypeScript and targeted frontend lint passed. The rollback-only real PostgreSQL check
in `scripts/check-drive-sync-state.cjs` passed discovery/dedup, checksum change, rename,
move out/back, delete, cross-instance locking, combined save and save surviving a sync
failure. Its connector events and queue dispatch are fixtures, not live Drive mutations.
[Database evidence](hackathon-evidence/2026-11-01-drive-sync-state.json).
An actual Next/session/engine/PostgreSQL HTTP check passed save persistence with an
explicit paused response, with the temporary account/session deleted afterward.
[HTTP evidence](hackathon-evidence/2026-11-01-save-sync-http.json).

The full remote frame/video/derived-preview queue check passed: eight units, two scenes,
31 frame observations, local speech/embeddings, native video, retry and checkpoint replay.
Its one derived test upload was deleted; shared Brisky app folders remain. Existing
vectors were preserved. [Remote evidence](hackathon-evidence/2026-11-01-drive-remote-full-queue.json).
This is operational validation, not labelled recognition or transcript accuracy.

Subsequent no-inference coverage investigation reproduced a real streamed-frame
15-second timeout: the old extractor logged failures and continued. Event correction in
`ffmpeg-pipeline.service.ts` now allows 60 seconds per streamed attempt, retries once,
requires a nonempty frame file and rejects incomplete preparation. The exclusive scene
endpoint is no longer sampled, avoiding an EOF frame request. Focused regressions cover
transient recovery, exhausted retries, empty decoder output and endpoint ownership.
Preparation fingerprints were advanced so old partial sampling checkpoints cannot be
reused as verified preparation. A real 0.05-second Drive frame that timed out previously
decoded to a nonempty JPEG with the longer timeout, without inference.
[Frame diagnostic](hackathon-evidence/2026-11-01-frame-coverage.json),
[live timeout check](hackathon-evidence/2026-11-01-streamed-frame-timeout.json).
The paid remote queue run predates this correction; its successful unit status alone
does not prove every intended sample was captured. The subsequent cached rerun below
passed all 32 prepared/observed frames with the strict guard enabled.

Real Drive fixture creation, quick rename, content replacement, move out/back and deletion
also passed with enqueue captured and no inference. Quick edits may appear in Drive's
`added` collection, so both added and modified records now use the same reconciliation.
Only script-created files/folders were removed.
[Lifecycle evidence](hackathon-evidence/2026-11-01-drive-live-changes.json).
Forced OAuth refresh persisted a changed encrypted token, and the real ten-second poller
timer discovered the scoped fixture account; the next poll did not duplicate enqueueing.
[Poller evidence](hackathon-evidence/2026-11-01-drive-poller.json).

**Update: scoped polling and a standalone worker are now enabled for one owner-approved
account. Broad sync remains disabled.** See [current activation](controlled-sync.md). The owner
approved a **$10 cumulative** ceiling. The original hold-only accounting reached $9.15.
The owner subsequently approved counting successful reported estimates instead of those
holds, while retaining failed/unknown reservations. Before the strict-frame rerun this
counted $0.761764 ($0.361764 estimated usage plus $0.40 uncertain holds), leaving $9.238236.
The cached strict-frame rerun passed eight units and all 32 prepared/observed frames
under the unchanged ceiling. Its one preview upload and all temporary fixtures were
removed. [Evidence](hackathon-evidence/2026-11-01-drive-remote-full-queue-strict-frames.json).
These separate scoped checks do
not establish unattended production throughput or large-library safety.
After the completed rerun, reported usage estimates total $0.602636; allowance accounting
counts $1.002636 including $0.40 retained uncertain holds, leaving $8.997364 of $10.
No attempts remain unsettled. These figures are not provider invoice reconciliation.

Continue with [the ingestion checklist](media-ingestion-roadmap.md). Do not describe
fixture changes or a paused save as proof of automatic syncing or real-media accuracy.
