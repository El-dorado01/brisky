# API and ingestion readiness review

Date: 2026-10-27. Static review of the current working tree. No live provider requests, paid inference,
model downloads, deployment checks or new load tests. Existing passing tests do not establish public
API readiness. Findings below describe code paths, not observed production incidents.

## Verdict

Follow-up: [authentication and request admission](authentication-and-request-admission.md) implements
the first batch: required private secrets, strict session claims, development-only opt-in demo setup,
targeted runtime input validation and process-local IP request limits. The table below records the
review snapshot; remaining deployment and developer-platform work is tracked in that follow-up.

Second batch: [durable clip operations](clip-operations-api.md) now adds owner-scoped job lookup,
result pointers, keyed submission, recoverable delivery and atomic result publication for new clips.
General contract/schema documentation, pagination, developer credentials and corrected usage reporting
remain follow-up work.

Third batch (2026-10-28): [API contract and pagination](api-contract-and-pagination.md) adds a served
OpenAPI inventory/core schemas, cursor pages, public errors/request IDs and scoped economics counts.
Unmeasured costs/cache hits are now explicitly unknown. Developer keys, attributed usage events and
fully specified schemas for the remaining GenericObject responses still need work.

The capabilities are sufficient to start designing and building a first-party SaaS client. The API is
not yet ready to offer as a stable, self-service developer platform. Build the SaaS against the same
documented public contract developers will use; avoid moving intelligence or connector secrets into
the frontend. Production authentication, validation and operation tracking should precede launch.

Existing strengths: versioned route prefix; owner checks at controller/service boundaries; cloud account
connection and folder selection; indexing status/retry/cancel; progressive retrieval and verification;
partial-result preservation; source inspection limits; clip extraction, playback and lineage. These
are substantial product capabilities. They do not replace a stable integration contract.

## Priority findings

| Priority | Finding and source | Consequence / next action |
| --- | --- | --- |
| P0 before public deployment | `auth/auth.service.ts:31` falls back to a source-visible signing secret; module initialization unconditionally seeds a demo account with a fixed password | Fail startup without a strong deployment secret; explicitly gate demo seeding to development. Whether the current deployment uses the fallback was not checked. Existing seeded accounts also need a deployment policy. |
| P0 before public deployment | `auth/auth.service.ts:77` checks a signature and compares expiry but does not validate required payload fields/types; `auth.guard.ts` passes `sub` through; many services omit owner predicates when the caller's user ID is absent | Fail closed on missing/invalid subject or expiry and require identity in public service methods. A missing expiry can evade the numeric comparison; an absent subject can reach optional-scope queries. This is a conditional vulnerability, not evidence of an observed exploit. |
| P1 | Controllers use TypeScript body types without runtime schemas; `main.ts` has no global validation setup | Malformed values can become 500s or be silently coerced. Validate bounded search text, phase enums, folder entries, clip bounds and auth inputs before work begins. Reject invalid requests with stable 4xx codes. |
| P1 | `media.service.ts:699` coerces clip values with `Number(...) || ...`; the clip route does not validate its body | Invalid or zero values can select unintended defaults. Enforce finite numeric bounds, positive span, supported duration and source bounds explicitly. |
| P1 | No application-level request/login throttling, request quotas or developer credential lifecycle found; the AI ledger and worker slots solve different problems | Add bounded request admission and per-tenant quotas. For external developers, scoped/revocable keys and projects are needed; BYOK remains a proposal and configuration is process-wide today. |
| P1 | Clip submission returns a job ID, but there is no `GET indexing/jobs/:id` or durable job-to-result-asset response; recent jobs are only the latest 50 | Integrations cannot reliably track a specific operation over time or resolve its clip output. Add owner-scoped operation status, result asset ID, timestamps and stable failure codes. Polling is sufficient initially; webhooks can follow. |
| P1 | Clip requests use time-derived job IDs; retries can create new clips; frame/video observation inserts and completed-unit writes are separate | Provide request idempotency and atomic output/checkpoint publication. Completed-unit reuse does not protect the gap after inference/output writes but before marking completion. A crash there can cause repeat inference or duplicate observations. |
| P1 | `media.service.ts:2390` counts all verification cache rows; cost is fixed at $0.00015 per row and cache hit rate becomes 0.85 whenever any row exists | Economics are neither tenant-isolated verification metrics nor measured billing. Scope aggregates through owned assets; distinguish estimates, unknowns, actual usage and cache-hit events. Do not use this endpoint for customer billing or judge cost claims. |
| P1 | `media.controller.ts:284` parses Range using a simple split and does not validate suffix, malformed or out-of-bounds ranges | Some valid playback requests are unsupported and invalid inputs can reach filesystem streams. Implement deliberate single-range support, correct suffix behavior and 416 responses with tests. |
| P1 | `GET /media` returns the whole library; job list exposes a fixed latest-50 window and raw job rows | Add cursor pagination and explicit response DTOs; avoid coupling clients to database columns or internal error/source fields. |
| P1 | No OpenAPI document, shared runtime contract or uniform error/request-ID envelope found | Publish request/response schemas, enum meanings, examples, retry semantics and limits. Add contract tests before generating SDKs. A `/v1` prefix alone does not provide compatibility guarantees. |
| P2 | Login tokens are accepted in query strings for all guarded routes; CORS reflects origins with credentials | Use short-lived media-specific playback tickets; limit query credentials to playback. Configure allowed SaaS origins and an intentional developer-origin policy. Query credentials can appear in logs/history. |
| P2 | Benchmarks and bulk reindex controls share ordinary user routes; `reindex-matching` defaults to `MADE EASY` | Gate expensive maintenance workflows and remove dataset-specific defaults from the consumer contract. Define bulk-operation confirmation and quotas without burdening normal search. |

P0 means resolve before public exposure, not that live configuration was inspected. This review is
not an exhaustive security audit. No production behavior was changed as part of the review.

## Remaining full-download paths

| Path | Current behavior | Recommendation and accuracy limit |
| --- | --- | --- |
| On-demand proxy (`indexing.processor.ts`, `executeGenerateProxy`) | Downloads a remote original completely before FFmpeg; an existing proxy avoids regeneration | Use the existing versioned seekable reader for FFmpeg input. Full-duration proxy encoding may still read most/all bytes; the benefit is removing the staging barrier and scratch copy, not guaranteed bandwidth savings. Validate source identity and output before publishing. |
| Whole-video model job (`executeGeminiVideo`) | Complete remote source download followed by provider file upload; source size/version checks when supported | Make this an explicit analysis policy rather than unconditional work. Do not substitute a random short window or lower-resolution video and claim equivalent context. Adapter-specific upload requirements must remain clear. |
| Scene/audio preparation without a connector read session, or with streaming disabled | Uses whole-source fallback; default audio extraction still completes a WAV before transcription | Keep an explicitly bounded compatibility fallback. Scene/audio window modes are opt-in pending accuracy evaluation. A streamed full scan can still transfer the full video or reread bytes. |
| Clip extraction when ranged access is unavailable | Uses bounded full-source fallback; normal capable connectors use the reader | Preserve small-file compatibility and fail clearly when limits disallow a large fallback. Do not return to byte-to-time estimates. |
| Remote derived preview/thumbnail hydration (`media.service.ts`, `hydrateRemoteDerivedFile`) | Downloads the complete derived artifact before serving it | This is not downloading the master. Add artifact-specific byte limits, atomic temp-file publication and coalescing of concurrent hydrations; consider ranged forwarding for previews when worthwhile. |

The whole-download connector checks/progress tracking are not equivalent to enforcing a byte ceiling
while streaming. Worker preflight estimates can become stale or be unknown. Full-download paths need
runtime byte limits, cancellation, partial-file cleanup and source-version validation consistently;
proxy and derived hydration currently provide weaker checks than the seekable evidence reader.

## Overlapping indexing work

`ProcessingUnitsService.planUnits` always schedules per-scene frame analysis and a whole-video model
pass, plus audio when present. Their information can overlap, but removing either without evaluation
could reduce accuracy. More importantly, the split-job whole-video path currently stores
`gemini_segment` observations and analysis metadata, while `executeFinalize` only finalizes counts and
status. It does not merge those video observations into `media_segments`. Normal candidate retrieval
searches those segments and transcript observations. Whole-video analysis can be inspected through
asset intelligence, but its contribution to ordinary search is not demonstrated by this path. The
older monolithic merger's use of video segments does not establish use in split jobs.

Recommended order:

1. Add stage provenance and integration coverage showing which stored observations feed retrieval.
2. Expose analysis policy internally: scene evidence baseline, optional whole-video enrichment. Retain
   current defaults until the deferred accuracy/cost comparison supports changing them.
3. If whole-video enrichment is retained, deliberately merge useful output into searchable segments
   and update dependent embeddings, with source/model provenance and atomic checkpoints.
4. Compare incremental gains on identical labelled footage before eliminating either analysis pass.

Per-scene embedding is not visibly doubled in the split path: scene publication creates a segment
without an embedding, and the embedding job populates it later. However, that job waits for visual
completion, not explicitly for completed transcription. If transcription arrives later, transcript
search can work lexically while that scene's vector remains based on earlier text. Define dependency
or refresh policy rather than assuming all modalities were embedded together.

Crash recovery remains a source of repeat work: successful provider calls may be repeated if the
process dies before a durable result checkpoint. Source-window checkpoints reduce local decoding
repetition; they do not make remote inference exactly-once.

## Smallest useful foundation before SaaS launch

1. Authentication fail-closed behavior, gated demo setup, runtime input validation and request limits.
2. Stable operation status/result lookup, clip idempotency, atomic publication and playback ranges.
3. OpenAPI and response/error DTOs, library/job pagination and tenant-scoped usage reporting.
4. First-party SaaS on that contract. Add scoped developer keys and per-project quotas before opening
   the API to third-party consumers. Add BYOK only with encrypted storage, tenant routing and separate
   budget attribution; do not accept secrets in arbitrary search bodies or browser storage.

Webhooks, official SDKs, team roles and a full billing system can follow. A durable polling contract
can support the initial SaaS without building all of them first. Live validation and the paid pilot
remain deferred; no new SaaS or Meta functionality is claimed by this review.
