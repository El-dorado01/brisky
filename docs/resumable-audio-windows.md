# Resumable audio windows

Implemented 2026-10-27 behind `WINDOWED_TRANSCRIPTION=false` by default. This is an opt-in execution
path with fixture validation, not a claim of measured speech accuracy or production speedup.

## Workflow and intended benefit

The worker plans 60-second core windows with two seconds of context on either side, clipped at the
source boundaries. FFmpeg extracts mono 16 kHz PCM WAV directly from the source, retaining lossless
PCM after decoding rather than adding a lossy audio encoding stage. Windows may be configured between
10 and 300 seconds, with overlap between zero and ten seconds and less than half the core duration.

One extracted window is transcribed while at most one following window is being prepared. That
bounded overlap lets network/audio decoding proceed during local inference without unlimited queued
media files. Windows are cleaned after publication or failure. Local Whisper remains loaded in one
job-owned Python JSONL session; it is not restarted for every chunk. Model/session wall time is still
measured, including initialization on the first request. Checkpoint execution metadata records the
reported local provider/model, request wall time, language and estimated API charge; it does not
measure electricity or hardware cost.

Completed text is published immediately and can be retrieved while later windows are unfinished.
The job's progress reflects completed windows. The existing per-asset lock remains in place; this
feature overlaps work within one job rather than allowing conflicting jobs to mutate the same asset.

## Resume, consistency and ownership

The window fingerprint covers source identity/version, duration, window/overlap policy and Whisper
configuration. A changed fingerprint requires reindexing. Cloud mode requires a validated streamed
read session; local sources are checked against their size and modification time. There is no automatic
fallback from a failed local window to remote transcription or a different model.

`audio_windows` is an internal manifest. Each successful `audio_window_NNNNNN` stores its completed
checkpoint in the existing processing-unit table. Transcript observations, that checkpoint, manifest
publication state and partial-search availability are committed in one database transaction. The first
successful publication replaces prior transcript observations; merely starting a new attempt does
not remove the last available transcript. Replaying a window replaces its observations without
duplicating them. A failed transaction rolls back observation deletion and the resume marker together.

Transactions check asset ownership. The two final completion markers (`audio_windows` and
`audio_transcribe`) are updated atomically, avoiding a completed parent with an unfinished manifest.
Internal window records are not dispatched as visual AI jobs. Retry scheduling avoids duplicate root
audio tasks when both internal manifest and root transcription failed.

## Accuracy boundary

Whisper returns timestamps relative to the extracted context window. Brisky validates those timestamps,
adds the source offset, and assigns overlap ownership by cue midpoint. Whole cues are retained, including
words extending across a core boundary. This avoids deliberately chopping text at the exact boundary.
It does **not** prove that independently decoded windows produce identical segment boundaries or words.
Overlap can still yield duplicate/missing speech when model segmentation changes. Short-window language
detection and context-dependent recognition also need evaluation.

For that reason the feature is opt-in. Evaluate utterances crossing boundaries, quiet/fast/multilingual
speech, long pauses and timestamp alignment against the full-audio baseline before enabling it by
default. Check both word accuracy and phrase-search recall, not just successful completion. Real model
runtime, memory, energy and downloaded bytes still need measurement. Live local inference follows the
runtime's existing model/cache setup; the tests below do not initialize or download a real model.

## Configuration and remaining scope

Set `WINDOWED_TRANSCRIPTION=true`, `AUDIO_WINDOW_SECONDS=60` and
`AUDIO_WINDOW_OVERLAP_SECONDS=2` for an explicitly prepared trial. Local Whisper is required; remote
cloud media also requires `STREAM_INDEX_SOURCE=true` and a connector read session. Existing reader
transfer/deadline limits still apply across the job. A job exceeding them retains committed windows
for a later retry rather than claiming full transcription.

Fresh/force-reindexed transcription is needed to switch an already completed full-audio unit to this
path. The normal full-audio path is unchanged when the flag is false. Scene-window scheduling, a
persistent process shared across separate jobs, and bounded whole-video model uploads remain separate
work. Search deadlines do not automatically supply cancellation to worker jobs; cancellation is checked
between window operations, with in-flight local inference bounded by its request timeout.

## Verification

- Window fixtures cover timeline coverage, short final windows, overlap ownership, malformed timestamps,
  one-window prefetch, early publication, completed-window skipping and cleanup after failures.
- Worker fixtures interrupt a later window, preserve the earlier checkpoint, then resume without
  repeating successful inference. They verify source-time timestamps and absence of paid fallback.
- Actual child-process protocol tests use a small Node fixture to check process reuse, cancellation,
  response validation and shutdown. Python unit tests inject a fake model and verify one model load
  across multiple requests. Neither test runs Whisper inference.
- Disposable PostgreSQL/API checks prove early transcript searchability, account isolation,
  idempotent replay, fingerprint rejection, atomic completion and rollback after a failed publication.
- Real FFmpeg/FFprobe checks verify the window WAV codec, sample rate and duration alongside the
  existing range/local video and scene comparisons. Those checks do not measure recognition quality.

See [technical design for judges](technical-design-for-judges.md) for how these choices support the
accuracy-first, cost-second, speed-third goal and distinguish engineering evidence from product claims.

Validation recorded 2026-10-27: 49 API suites / 261 tests passed, API TypeScript passed, and the final
worker retry tests passed after adding progress/execution metadata. Two Python protocol tests passed.
Native FFmpeg window/scene/audio checks and disposable PostgreSQL publication/rollback/search checks
passed. No real Whisper model, model download, paid inference or live Drive access was used. Temporary
validation containers were removed; the original Brisky containers were left running.
