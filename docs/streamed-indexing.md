# Streamed source preparation and retries

Opt-in per-window transcription is now documented in [resumable-audio-windows.md](resumable-audio-windows.md).
The full-audio/full-scene paths described below remain the defaults. Opt-in
[resumable scene preparation](resumable-scene-windows.md) now checkpoints individual scene windows;
independent scene-window job scheduling remains pending.

Implemented 2026-10-27. Scene scanning/keyframe extraction, metadata probing, thumbnail preparation
and local audio extraction can read through the validated decoder endpoint without first downloading
the complete cloud video into scratch. FFmpeg decodes bytes as bounded ranges arrive. This extends
the selected-moment reader described in [seekable-cloud-media.md](seekable-cloud-media.md).

## Execution boundary

`STREAM_INDEX_SOURCE=true` is the default. Connectors exposing `openReadSession` use range reads;
other connectors retain complete-file preparation. Setting the flag to `false` restores the previous
local preparation path. An invalid range session is not silently replaced by an unbounded download.

Metadata, scene scanning and thumbnail generation share a reader during the planning job. Audio
extraction opens its own version-checked reader, closes it after producing the local audio file,
then transcribes that file. Reader reservations limit transferred bytes, including repeated seeks;
they do not imply that a full scan transfers less than the original source.

`INDEX_RANGE_MAX_MB` defaults to the worker's existing full-download allowance when unset (16 GB
under the example configuration). `INDEX_RANGE_TIMEOUT_MS` defaults to 900,000 ms; accepted values are
positive integers up to 3,600,000 ms. The byte allowance must be positive and no greater than 64 GB.
Indexing readers permit at most 65,536 decoder requests and a bounded number of 1 MB range reads.
Interactive search/export retain their shorter default reader limits. Existing decoder-operation
timeouts still apply separately, including the scene-detection command timeout.

## Checkpoint ownership

After scene decoding and source-version validation, durable scene/keyframe metadata is saved in the
existing `media_processing_units` table as a completed internal `source_preparation` unit. No schema
migration is required. Its fingerprint covers source identity, version, size, duration, scene settings
and preparation policy. Source/settings changes require reindexing instead of reusing stale evidence.

A retry can reuse those scenes when their durable files or inline keyframes remain available.
Preparation without available evidence is rebuilt. Small inline frames support retry on another
worker without a shared filesystem; larger frames still depend on accessible durable files or
re-extraction. Ordinary completed analysis and transcription units continue to be skipped.

`source_preparation` is not dispatched as an AI task and does not block finalization once completed.
Force-reindex resets units on the first BullMQ attempt; its retries retain preparation from that attempt.
Both full sync and incremental sync request force-reindex when content changes, so an old preparation
checkpoint does not prevent normal content refresh. Rename-only sync behavior is unchanged.
Audio and whole-video model passes reject source versions differing from prepared scenes. The
whole-video pass additionally validates source size/version after its complete download, before inference.

## What this does not complete

The current asset-wide worker lock deliberately serializes jobs for a video. This change does not
remove that lock or schedule overlapping per-window scene/audio jobs. The scene pass still returns its
full scene list before downstream tasks are queued. Default transcription still waits for the extracted
audio file. The separate opt-in audio and scene paths now checkpoint individual completed windows.

Whole-video multimodal reasoning still requires a complete local video for the current upload adapter.
It has not been removed or silently replaced by a lower-context windowed analysis. On-demand preview
generation also retains its existing complete-source path. Therefore the entire pipeline is not yet
fully windowed or independent of complete-file downloads.

Reader closure is guaranteed on job completion/error, with transfer/lifetime limits. Worker cancellation
is still checked at stage boundaries; cancellation polling during a decoder operation and Whisper
process cancellation remain follow-up work. Local audio, thumbnails and evidence outputs still consume
disk space. This is not a measured guarantee of peak memory, CPU, total transfer or source-wide accuracy.

## Verification

Worker fixtures exercise reader-based scene/audio preparation, checkpoint reuse, changed-source
rejection, source changes before transcription/inference, reader cleanup, inline-frame recovery and
force-reindex retries. They do not call live Whisper or AI providers.

`scripts/check-clip-timestamps.cjs` uses real FFmpeg/FFprobe for local versus range-backed scene
boundaries, keyframe timestamps and JPEG bytes, video-interval decoding, and full-timeline audio
extraction. The fixtures include long-GOP VBR H.264 and both MP4 metadata placements. Synthetic files
are deleted afterward. These checks do not validate authenticated Drive behavior or production footage.

`scripts/check-search-integration.cjs` additionally verifies preparation checkpoint insert/update/load
and that the completed internal checkpoint does not block finalization against disposable PostgreSQL.
Workers, polling and paid inference remain disabled during that integration check.

The full API run passed 47 suites / 251 tests. The subsequent full-sync refresh change passed the
targeted full/incremental sync suites, and API TypeScript passed. Native fixture and disposable-database
checks passed. The native check also rejects invalid streamed media instead of caching fallback scene
windows from a failed decoder. Temporary validation containers were removed; original containers were
left running. No paid inference, model downloads or live Whisper/Drive calls ran in this batch.

Next: scene/transcript-boundary evaluation and safe scheduler coordination
before enabling parallel downstream processing for one video; then bounded live Drive validation and
the labelled accuracy/cost pilot. Meta adapter work remains separate.
