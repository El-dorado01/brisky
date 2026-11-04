# Decoder-driven cloud reads

Implemented 2026-10-27 for selected-moment extraction and search evidence. Scene/audio preparation now
also uses this reader; see [streamed-indexing.md](streamed-indexing.md). Independently scheduled windows
and streaming the whole-video model upload remain unfinished.

## What runs now

`MediaConnector.openReadSession` supplies a source size/version, byte-range reads carrying HTTP status
and Content-Range, and a post-decoding version check. Google Drive implements this contract with
`files.get`. The source must have a known safe-integer size and a version. Metadata size must match the
indexed asset. SDK retries are disabled for these session operations; a failed inspection can be
continued through the existing search recovery flow.

`seekable-media-source.ts` opens a private HTTP endpoint on loopback with a random per-session path.
FFmpeg reads the original container and chooses its own byte offsets from the container index.
No timestamp-to-byte approximation is used. The bridge fetches one bounded block at a time per
HTTP reader, checks the exact 206/Content-Range and body length, then forwards the validated block.
Backpressure prevents unlimited local buffering. Sources are not staged as complete local files.

The Drive adapter checks the file's version and size again after decoding, before evidence can be
verified or a clip registered. An observed source change rejects the output. This checks that the
source remained stable during the session; it does not pin an immutable provider revision or prove
that a stale library index describes the current source. Existing incremental synchronization
remains responsible for updating the index.

## Wiring and limits

- Search prefers local originals/previews. Small cloud sources retain the request-shared whole-file
  fallback. Larger sources use a request-shared seekable reader when their connector supports it.
- Range reservations count against the existing per-search `SEARCH_CLOUD_TOTAL_MB` allowance,
  default 32 MB. Repeated/overlapping reads count again. Reaching the allowance preserves related
  search results as unconfirmed through existing recovery behavior.
- Clip export prefers a local preview, otherwise uses a seekable session when supported. Its transfer
  allowance is the lower of `WORKER_CLIP_SOURCE_MAX_MB` (default 256 MB) and the worker full-download
  limit. The original itself may be larger. Connectors without sessions retain the small complete-file
  fallback, using that same source-size admission limit.
- Each reader allows two simultaneous decoder HTTP requests, blocks at most 1 MB, at most 256 backend
  block reads and 512 decoder requests, with a 120-second lifetime. Search cancellation can end it sooner.
  These are default interactive reader limits, not a process-wide decoder/memory limit. Indexing readers
  use separately documented transfer, lifetime and request limits.
- Failed/oversized/truncated range responses are destroyed; they cannot silently become successful
  evidence. Reservations are conservative: an interrupted block still consumes its reserved allowance.
  Provider transport buffering can deliver some bytes before cancellation takes effect.
- Closing a search releases its reader after outstanding evidence leases finish. Closing a reader
  aborts upstream work and closes sockets. Worker clip readers close on completion/error or deadline;
  BullMQ cancellation polling during an active export is still follow-up work.

Output clips/frames still use temporary files. Existing evidence limits bound accepted output, rather
than guaranteeing a hard encoder-output or decoder-memory ceiling. There is no cross-request source
cache or in-memory range-block cache yet; repeated seeks may retransmit bytes.

## Validation

Unit tests cover exact ranges, malformed/ignored/truncated/oversized responses, transfer ceilings,
invalid requests, version changes, cancellation, owner-scoped search wiring and shared reader cleanup.
Worker tests cover session-based exports, output rejection on source changes and fallback admission.
The full API regression run passed 46 suites / 242 tests. A subsequent additional search-context budget
test passed with all ten reader tests; the final API TypeScript check also passed.

`node scripts/check-clip-timestamps.cjs` uses real bundled FFmpeg and FFprobe against synthetic
VBR H.264 footage with a long GOP. MP4 metadata at both the beginning and end is exercised. Both range
outputs must match local-original decoding across every decoded frame of the requested one-second
interval. The check also asserts that extraction finishes before transferring the entire source.

One local run used 56,403 bytes and 36,864 bytes respectively from 241,208-byte fixtures; read-ahead
and repeated seeks affect these values. This is correctness/partial-transfer evidence for the local
fixtures, not a production latency, memory or cost benchmark. Tiny files can transfer more bytes than
their size because of overlapping requests.

Live authenticated Google Drive range headers, version behavior, large production codecs and media,
network interruption recovery and full-library indexing have not been validated by these fixtures.
No model calls or Docker are needed for the local checks.

## Next: progressive indexing

Feed a version-checked seekable source into metadata probing, scene analysis and audio extraction,
with per-job transfer limits rather than interactive-search limits. Emit checkpointed scene/audio
windows as they become available and let downstream units consume them with bounded concurrency.
Handle global timeline offsets, GOP overlap, audio boundaries, cancellation and durable retries before
claiming full-index streaming support. The existing complete-file paths remain the current indexing
implementation.

Provider references: [Drive partial downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
and [Drive file version semantics](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).
