# Bounded whole-video understanding

This event-developed extension closes the oversized-inline-video gap in the
Meta and Baseten adapters. It extends the pre-existing FFmpeg/indexing engine;
the engine itself is not new hackathon work. Google's retained path is unchanged.

`AI_VIDEO_CHUNK_SECONDS=90` controls whole-video analysis windows (1–300 seconds).
A short source already within the inline allowance uses the existing native path.
Long sources use contiguous windows; an oversized short source is re-encoded into
one bounded window. FFmpeg produces H.264/AAC MP4 with the source dimensions and
a bitrate calculated below the file allowance. It does not truncate using `-fs`.
Re-encoding is lossy: very fine detail and low-level audio can change; this is not
a guarantee of recognition accuracy or unchanged visual quality.

Each window is size-checked and its decoded duration must match its intended
interval within 250 ms before sending. Returned segments must cover that window
without gaps, then receive its source-time offset exactly once. Per-window summaries
are labelled with their intervals and joined locally; no extra synthesis call is
made. Themes and usage totals are aggregated. Only a completely successful run
returns full-video analysis. Later failure retains the usage journal and does not
report partial coverage as complete. Completed remote windows are not checkpointed
individually yet: retrying this processing unit can repeat calls, still subject to
the budget ledger. The original video is not deleted by the adapter.

Only one prepared window is retained at a time; the exact temporary directory is
removed on success or failure. Existing search deadlines/FFmpeg cancellation and
request byte bounds still apply. The plan rejects invalid inputs and more than
4096 windows. This is a bounded implementation, not unlimited source support.

The controlled indexing plan and adapter use the same window planner, so video
requests are reserved per window, including the configured retry multiplier,
before dispatch. More windows can require more credits and CPU time. Unknown
account scope, source-resource ceilings and the owner's cumulative budget are
unchanged. No inference is free merely because preparation happens locally.

Meta's separate Files API upload/reference path remains unimplemented; splitting
now provides an alternative for whole-video analysis. Other media operations keep
their existing bounded paths and provider-specific limits.

## Verification

- Offline provider/window/indexing tests cover native short inputs, long intervals,
  oversized short inputs, exact source offsets, usage aggregation, cleanup,
  preparation failure, invalid bounds and per-window budget reservations.
- A generated-only actual FFmpeg check produced a 99,529-byte MP4 with audio:
  requested source interval 0.5–1.75 seconds, measured output 1.28 seconds.
  Source dimensions and the original fixture were retained. No API calls.
- Real FFmpeg preparation through the compiled adapter also passed with generated
  three-second media and stubbed inference: three one-second windows mapped to
  0–1, 1–2 and 2–3 source seconds, usage summed across three calls, original
  retained and temporary windows removed. These were not actual provider calls.
- No real large Drive source or live multi-window Meta accuracy check has been
  performed for this extension. A local decoder fixture and stubbed inference
  cannot establish production throughput, accent recognition or boundary-action
  accuracy. Events crossing windows have no added overlap in this version.

Implementation: `pipeline/video-chunks.ts`, `FfmpegPipelineService.prepareAnalysisWindow`,
`MetaAiProvider.analyzeVideo` (shared by Baseten), and the indexing budget planner.
