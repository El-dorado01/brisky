# Brisky: cost and accuracy audit

Date: 2026-10-26. Static source review; no Docker, inference requests, model downloads, or credits used. Findings describe inspected paths, not measured production behavior. No runtime configuration or application behavior changed.

## Implementation progress (after the audit)

2026-10-27: opt-in [resumable scene preparation](resumable-scene-windows.md) now preserves completed
windows and adds boundary-spanning evidence. Live provider validation and the accuracy/cost pilot are
deferred at the owner's request. An improved SaaS application is a separate planned product phase;
no SaaS features or Meta adapter are claimed as implemented by this change.

First correctness batch implemented on 2026-10-26:

- Verification distinguishes evaluated responses, insufficient evidence, and operational errors. Only valid evaluated responses enter the cache.
- Both standard/detail paths require scene-specific evidence; asset thumbnails are no longer substituted.
- Cache identity includes model cascade, prompt/policy version, actual frame bytes/timestamps, scene bounds, transcript context, and query. Matched timestamps are stored in a JSON envelope in the existing explanation field and reused on cache hits. Old entries are intentionally bypassed; no schema migration required.
- Model response booleans/confidences/timestamps are validated. Rejected results no longer carry stage2Verified=true, and model confidence no longer artificially inflates retrieval scores.
- Explicit visual/detail queries no longer bypass verification because of high/low retrieval scores. Existing candidate and frame limits remain; this can increase calls for these requests, so do not begin live trials before metering/budget work.
- The detail prompt no longer claims denser frames were extracted.

Still pending: richer evidence escalation, temporal constraints, candidate expansion, calibrated acceptance thresholds (the legacy 0.5 threshold remains), usage/budget controls, cancellation, persistent local embeddings, and measured indexing-pass tradeoffs. New result status is available in the API; dedicated UI presentation remains follow-up work. Correctness tests use mocked providers/databases and temporary fixture files, not live infrastructure.

Second batch: attempt-level inference accounting and reservation admission controls are implemented; see [AI budget controls](ai-budget-controls.md). Generation and embedding attempts, including retries and model fallback, now reserve against a durable shared local journal. Remote inference defaults to disabled until a positive budget and explicit per-model rates/reservations are configured. Unknown charges stay unknown and retain reservations. SDK-internal retries are disabled; output caps and HTTP timeouts are explicit. Search preserves lexical retrieval if embeddings fail. No active `.env` configuration was changed and no model calls were made. This is not a guaranteed provider billing ceiling or a distributed multi-host budget system. Provider reconciliation, UI/dashboard integration, and the end-to-end search cancellation deadline remain pending.

Provider naming follow-up: application callers now use `AiIntelligenceService` / `ai-intelligence.service.ts` and the `AiIntelligenceProvider` contract; the current SDK implementation moved to `providers/google-ai.provider.ts`. `GeminiVideoAnalysis` is now `VideoAnalysis`. Source references below describe the original audit snapshot. Existing stored stage names/observation types are retained for compatibility. The root assessment document is now `ai-provider-assessment.md`; model-specific media storage directories are not renamed. The user authorized migration of actual `.env` names and selected a $3 pilot budget; that migration is complete with credentials preserved. Unverified model pricing remains unset and no inference was run.

Evidence inspection batch: [bounded source inspection and candidate expansion](search-evidence-inspection.md) are implemented. Original request constraints survive query rewriting. Detail checks can inspect twelve source-resolution samples, sequence/exclusion checks use actual clips, source ownership is checked, temporary evidence is cleaned up, and sequence timestamps are mapped back to the source without clipping away the action context. Retrieval and display counts are separate, with inspection expansion capped at fifteen candidates per topic. Uninspected results cannot claim direct verification. This implementation uses available local originals/previews; cloud-only source-window retrieval, crops, adjacent windows, persistent embeddings, full search cancellation, UI states, and live evaluation remain pending. No Docker, model downloads, or paid inference were needed.

Local execution batch: [persistent embeddings and search deadlines](local-embeddings-and-deadlines.md) are implemented. The local ONNX worker can retain its loaded model between requests and releases it after an idle period. Deadlines block new inference attempts, abort supported SDK calls/retry waits, and stop local workers/FFmpeg. Expired searches report incomplete status in the API and web view. Local vector failures no longer silently select another embedding space. Live model performance, database cancellation, HTTP disconnect propagation, remote source-range access, and the real-footage experiment remain pending.

Recovery UX batch: [progressive search and bounded cloud fallback](search-recovery-ux.md) are implemented. The web view displays provisional candidates before verification, the server retains candidates/completed checks at timeout, and continued checking reuses successful verification caches. Initial retrieval has one quiet transient HTTP/network retry; verification is not blindly replayed automatically. Budget-blocked checking is distinguished from temporary failure. Small cloud originals can be staged under per-file and per-search byte limits; large-master seekable source-window access remains pending. Live browser/cloud/database validation has not been run.

## Current execution map

| Stage | Current path | Remote call conditions |
| --- | --- | --- |
| Metadata, scene boundaries, frame extraction | FFmpeg pipeline | Local computation; connector access may still download footage |
| Audio transcription | indexing.processor.ts:501 | Whisper first; failure/unavailability falls back to Gemini |
| Scene descriptions | indexing.processor.ts:1360 | Every unfinished analyze_frames unit invokes Gemini |
| Whole-video reasoning | processing-units.service.ts:74; indexing.processor.ts:1415 | Planner always creates a gemini_video unit, in addition to scene analysis; completed units are reused |
| Segment embeddings | intelligence-merger.service.ts:266 | Defaults to Gemini; local configuration can fall back remotely on failure |
| Query interpretation | media.service.ts:905 | Cache first; single-word heuristic avoids model; other uncached queries call Gemini if configured |
| Query embedding | media.service.ts:128 | In-memory cache first; defaults to Gemini, local optional with remote fallback |
| Candidate retrieval | media.service.ts:1086 | Transcript and hybrid retrieval in parallel; vector creation can still require API |
| Candidate verification | media.service.ts:1140 | Score/intent heuristics gate inspection; up to five standard or eight detail candidates per single-topic search |
| Verification evidence | gemini-intelligence.service.ts:743 | At most first three existing frames, including in detail mode |
| Playback/extraction | Existing connector and FFmpeg paths | Media I/O and local computation; not inherently LLM work |

Compound queries can multiply per-topic embedding and verification work. Counts above describe logical operations, not HTTP attempt counts. Provider retries and job retries can add attempts. Current code is tied to Gemini service names and methods; a provider adapter should preserve task contracts while allowing capability differences. Changing generation providers does not justify changing the embedding space.

## Findings, in priority order

### 1. Retrieval score bypasses evidence checks for detailed queries

media.service.ts:1152 skips all verification when topScore > 0.85 or every result is below 0.6. Within the remaining detail branch, any score > 0.75 skips detail verification. A high retrieval score is not proof of a fine visual detail. Low scores also do not establish that verification cannot help.

Recommendation: choose verification from the evidence required by the request. Do not let an uncalibrated retrieval score waive a visual/action constraint. Keep exact spoken-phrase retrieval inexpensive when speech is what the user asked for.

### 2. Detail mode changes the prompt, not the evidence

gemini-intelligence.service.ts:710 claims micro-keyframes every two seconds, but both callers reuse persisted frames or a thumbnail; :743 sends only the first three frames. The inspected detail path does not extract denser frames, crops, or a short source clip. It cannot reliably establish fleeting events or action order.

Recommendation: describe actual supplied timestamps honestly; use existing frames first, then bounded source-window extraction at suitable resolution. Test frame cadence and crops against known small/fleeting details. Two-second sampling itself cannot guarantee capture of a subsecond event.

### 3. Operational errors can become persistent negative evidence

verifyCandidate catches failures and returns matched=false with zero confidence (:776). Callers cache this like a successful negative observation (media.service.ts:1264, :1383). Missing files inside the verifier also return a negative. A temporary failure can therefore suppress a real match on later searches.

Recommendation: separate match, no match, insufficient evidence, and error. Cache completed evidence evaluations only; never equate transport failure with absence.

### 4. Thumbnail fallback is not scene evidence

Both verification callers fall back to an asset-wide thumbnail and label it with the candidate scene start. Standard mode avoids using the returned timestamp for narrowing, but still permits match confirmation using unrelated evidence. Detail mode also uses the fallback.

Recommendation: require scene-specific evidence; otherwise report inspection unavailable and attempt bounded source retrieval. Never label an asset cover as a sampled scene frame.

### 5. Verification cache loses precision and provenance

Standard verification narrows with matchedTimestamp on fresh results, but cache INSERT/SELECT omit it. Detail enrichment ignores it entirely. Cache identity includes cleaned query and segment (detail uses a prefix), without provider/model, prompt version, evidence fingerprint, or index version.

Recommendation: preserve evidence timestamps and scope cached results to model, prompt, query constraints, index version, and actual evidence. Fresh and cached results should agree. Database changes require separate implementation review and database skill instructions.

### 6. Retrieval truncates before verification and does not expand after misses

media.service.ts:1138 takes the response limit before inspection. Verification checks only the first five/eight of those candidates; the inspected path does not expand retrieval when they fail. This sets a recall ceiling independent of model quality.

Recommendation: separate retrieval candidate budget from display count, include neighbouring windows where justified, and permit bounded expansion. Measure candidate recall before adjusting verifier prompts.

### 7. Confidence and verification labels overstate what is established

Both enrichment methods promote a matched=true response at confidence >= 0.5 to direct, with a score around 0.93 or higher. Negative results also get stage2Verified=true. Detail sorting puts any inspected result ahead of uninspected ones, including rejected matches. JSON decoding uses Boolean(parsed.matched), so a malformed string "false" becomes true; confidence is not range-checked.

Recommendation: strict output validation, explicit verification status, and independently evaluated thresholds. Model confidence and retrieval score are not calibrated probabilities. Preserve uncertainty and distinguish inspected from confirmed.

### 8. Cost accounting does not cover the current call paths reliably

Frame, whole-video, and embedding unit handlers receive usage but do not persist it in their completion metadata. Verification callers ignore ver.usage; query understanding discards usage. Configured Gemini price estimates use shared rates even when fallback models differ. generateContent returns only successful-attempt token counts and duration, not total retry latency/attempt accounting. It has no explicit output-token cap in the request.

Recommendation: record every attempt with request/task ID, provider, actual model, modality input size, usage, estimated charge, elapsed wall time, retries, and cache status. Reconcile totals against the provider dashboard; unknown charges must remain unknown rather than zero. Introduce output caps, deadlines, spend reservations, and explicit fallback policy.

### 9. A search timeout does not stop the underlying request

media.service.ts:937 races query understanding against 3.5 seconds; it does not cancel the inference. A timed-out request can continue occupying shared semaphore capacity and may still incur cost. Indexing and verification use the same Gemini service limiter within a process.

Recommendation: propagate provider-supported cancellation/deadlines, account for in-flight work, and distinguish interactive concurrency from background work. Treat cancellation as best effort for billing.

### 10. Local embedding cost and speed need qualification

LocalEmbeddingService spawns Python for each call. embed.py loads the tokenizer and ONNX session in that process, so globals do not persist across calls. Its ~3ms description is not an end-to-end measurement. The tokenizer truncates at 256 tokens, risking loss of later details in a combined scene description/transcript. LOCAL_EMBEDDING_MODEL is advertised, but embed.py hardcodes MiniLM repositories.

Recommendation: measure process start/model load separately; consider a persistent local worker and batching. Evaluate text chunking. Keep query and corpus vectors in the same model/version space; local failure must not silently switch a query to an incompatible or incompletely indexed corpus. Different dimensions already have separate storage paths, but that does not guarantee both are populated.

### 11. Whole-video and per-scene analysis are both planned

This is potentially valuable complementary evidence, not automatically waste. However, always scheduling both means indexing spend grows before any search. Remote stages can also download source footage independently, adding I/O and energy cost.

Recommendation: measure their separate contributions. Compare frame-only indexing against frame-plus-video indexing on action-sequence recall before making the video pass optional. Do not remove it solely to lower cost.

## Recommended execution policy

1. Keep FFmpeg, Whisper, and compatible local retrieval/embeddings as the inexpensive foundation.
2. Use local parsing/cache for simple requests; escalate genuinely ambiguous constraints to Meta.
3. Retrieve a broader candidate pool than the display count; retain provenance and neighbouring windows.
4. Verify evidence-sensitive queries with Meta using scene-specific frames; escalate temporal questions to short clips and detail questions to adequate-resolution evidence.
5. Expand candidates/evidence within an explicit request budget. Report insufficient evidence if exhausted; do not claim corpus-wide absence.
6. Cache versioned completed evaluations including timestamps. Use SAM only when localization serves the request or makes evidence inspectable; segmentation is not proof of an action sequence.

## Small experiment: maximum $15 in API charges

This is a proposed experiment, not an automated runner or a claim of measured performance. Enforce the ceiling through available provider limits plus conservative local reservation accounting before enabling model calls. Reserve up to $3 for initial metering, $7 for the main paired comparison, $3 for evidence escalation, and $2 for reconciliation/retries. Stop admitting new calls before the ceiling; include in-flight reservations. No automatic paid fallback to a different provider.

### Dataset and labels

- Choose 12-20 permissioned clips, 20-40 minutes total, including clutter, similar objects, brief events, speech, and action sequences. Keep some events within continuous shots rather than only at cuts.
- Write 30 queries: six spoken/exact-topic, six visible object/color, six small/background/fleeting details, six temporal/negation/relationship requests, six deliberately absent or confusing near-matches.
- Manually label valid source intervals, required evidence, acceptable timestamp tolerance per query, and absent cases before running. Include correct moments with weak descriptions to test candidate recall.
- Use ten queries for tuning and keep twenty held out. This small set gives directional evidence, not production-wide accuracy guarantees.

### Comparisons

A. Existing pipeline, with actual configured providers recorded.

B. Same corpus/index and candidate settings, Meta verification instead of current verification. Keep original query constraints available. This isolates verifier changes.

C. Same as B plus adaptive evidence/expanded candidates. Report incremental cost and accuracy separately.

D. If the first three fit the budget, index a subset without the whole-video pass and compare candidate recall. Reuse checkpoints; do not reindex everything merely to change a search-time verifier.

Do not compare B's new evidence policy against A and attribute all gains to model choice. Use identical saved candidate/evidence sets for a direct provider comparison where useful. Pin model/version and cache namespace. Run cold and warm searches separately and repeat only targeted unstable cases within remaining budget.

### Record and report

- Candidate recall@5, @15, @30 before verification, on positive queries.
- Final precision@1 and success@5, split by query category.
- False confirmations on absent queries; insufficient-evidence and error rates separately.
- Timestamp error against labelled intervals, plus accepted-window duration to expose overly broad results.
- API charge per indexed media hour and per cold/warm search; p50/p95 search wall time with sample count.
- Local compute wall time, peak memory where available, downloaded bytes, frame/clip counts/resolutions, API attempts/retries, cache hits, and unknown/unreconciled usage.
- Fresh versus cached result/timestamp consistency.

Advance based on accuracy first: inspect every false confirmation and candidate miss. Prefer the least expensive configuration among those meeting the agreed accuracy target, then compare latency. Establish a baseline before choosing numeric accuracy targets; do not publish invented scores or pennies-per-hour claims.

## Work order and Docker timing

Docker stays off for static review, provider contract design, fixture/label preparation, output validation, request-budget logic, and isolated unit checks with mocked dependencies. Model calls and model downloads are separate, explicitly metered steps, not implied by Docker startup.

Before live trials, implement error/status handling, honest evidence metadata, verification gating, timestamp-preserving cache behavior, and usage accounting. Keep changes focused and reviewable. Revisit persistent embeddings and optional whole-video indexing after the baseline.

Docker is needed when exercising PostgreSQL/Redis-backed retrieval, durable caches, queues, checkpoint reuse, and the end-to-end benchmark. At that point ask the user to start it; run one bounded verification session, report results, and say when infrastructure can be stopped. Starting Docker alone must not imply permission for an unbounded background indexing run; inspect polling and queued jobs before starting the API/worker.
