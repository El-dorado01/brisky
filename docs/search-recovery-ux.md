# Search recovery and progressive verification

Current selected-moment range access is documented in [Decoder-driven cloud reads](seekable-cloud-media.md).
The dated sections below retain the implementation history; full-index progressive processing is still pending.

Implemented 2026-10-26. No Docker, live cloud access, model downloads, or paid inference used during implementation.

## User experience

The web application first sends `phase: retrieve` to the existing POST search endpoint. This returns provisional candidates without running scene verification. They appear immediately after retrieval, while a second `phase: verify` request checks them. The UI displays “Checking the closest matches” and permits browsing while checks run. It does not claim missing modifiers or no direct matches during that provisional stage.

The API keeps request-scoped checkpoints of candidates and individual completed inspections. If the deadline expires, it returns those available results instead of discarding them. Confirmed inspections sort first; provisional results remain unconfirmed. This is a two-response flow, not token streaming or live updates for each individual checked result.

Incomplete checks retain the result list and offer “Continue checking.” That action skips the initial retrieval UI stage for the same search and requests verification again. Successful versioned verification-cache entries are reused; failures are not cached as negative matches. Retrieval is recomputed and local evidence is currently re-extracted to verify cache fingerprints. This is not a durable job/resume token and does not guarantee preservation across server restarts or reordered candidate pools.

Initial retrieval may retry once, after 600 ms, for a network failure or HTTP 502/503/504. Verification HTTP failures are not blindly replayed automatically, because the first server request may still be working. Existing provider-level bounded retries remain responsible for transient inference errors, with per-attempt budget reservations and the overall search deadline. The client never automatically loops on an incomplete response. Older search responses cannot overwrite a newer search in the UI.

AI budget/pricing blocks are distinguished internally from temporary failures. Available candidates remain visible, but the UI does not invite repeated checking when AI access is paused. Raw provider error messages are not shown as user-facing recovery copy. Detailed per-result recovery actions and client-disconnect propagation remain follow-up work.

## Cloud inspection fallback

When no local original or preview is available, Brisky can stage a small cloud original using the authorized asset's connector/account. Default limits are sixteen MB per source and thirty-two MB total reserved cloud bytes per verification request. Unknown-size and oversized sources are skipped. The limits can be reduced or disabled through `SEARCH_CLOUD_SOURCE_MAX_MB` and `SEARCH_CLOUD_TOTAL_MB`; maximum accepted settings are sixty-four and one hundred twenty-eight MB respectively.

The fallback reads from byte zero through the known file size; it is deliberately a bounded whole-file fetch for small sources. It does not infer video timestamps from proportional byte offsets. Actual stream bytes are capped even if the provider ignores the Range header, and the final byte count must match the known size. Shared originals are deleted when their search and active inspections finish; individual evidence files are deleted after inspection or failure. The search abort signal reaches Google Drive's initial range request, and late streams are destroyed. Auth-context acquisition itself may still complete after the deadline.

Large cloud-only masters still require correct seekable source-window access, or an explicitly generated/cached preview. The current fallback does not solve arbitrary large-video inspection. As of 2026-10-27, candidate inspections share one download per authorized source within each search, including concurrent and later candidate batches. Each source reserves cloud bytes once. Separate searches do not share files or failed download state.

## Validation and remaining work

Regression tests cover retained candidates/completed checks at timeout, retrieval without verification, paused-check messaging, cloud stream size enforcement, cleanup, and total cloud-byte reservations. API/web type checks and a production Vite build were used; the build requires `--configLoader runner` in this sandbox because the default config bundler cannot read an ancestor directory. Database/Redis integration validation is recorded below; live browser, Drive and model behavior remain unvalidated.

Next priorities: live browser UX checks; seekable cloud source windows for large masters; durable verification-job idempotency; then the labelled accuracy/cost experiment. Meta adapter work follows the foundation and measured baseline.

## Isolated integration validation, 2026-10-26

`node scripts/check-search-integration.cjs` exercises the application through Fastify HTTP injection with real PostgreSQL/pgvector and Redis. It requires disposable containers named `brisky-validation-postgres` (localhost:5547, database `brisky_validation`, postgres password `validation-only`) and `brisky-validation-redis` (localhost:6387). Never point this harness at an existing database: it applies the application schema and creates synthetic accounts/assets. AI credentials are explicitly blanked, the budget is zero, connector polling is disabled, and indexing workers are disabled. Storage uses a temporary directory removed after the run.

Passed checks: simultaneous schema application on a fresh database; authentication; SQL scene retrieval; account isolation; provisional search responses; persisted verification-cache reuse, timestamp preservation and evidence-change invalidation; retained candidates after an injected deadline; a subsequent verification request; Redis connectivity and absence of workers/indexing jobs. Cache checks substitute deterministic frame bytes and an inference result at the AI boundary; the timeout check substitutes slow search work. These checks do not measure real model accuracy, real video decoding, provider retries, or browser behavior.

Concurrent startup exposed a race in `CREATE EXTENSION IF NOT EXISTS`. Schema application now runs inside a transaction guarded by a shared transaction-level advisory lock, so API and worker startup cannot apply this schema concurrently. Existing schema statements are unchanged.

Live browser validation remains outstanding because the browser execution tool was unavailable in this session. Large cloud source windows remain outstanding; request-scoped staging reuse was added on 2026-10-27.

## Cancellation

Submitting a replacement search aborts the previous browser fetch. The Find button accepts a different query while an earlier search is running. Leaving the page, unmounting the app, or changing authentication also aborts active search requests. A restored page can offer continuation of checks paused on page exit. Existing sequence checks still prevent stale responses from replacing newer results.

POST and GET search routes listen for an aborted request or an unfinished response connection closing. A normally completed request body does not cancel its search. Disconnects propagate through nested search deadlines to existing provider requests, retry delays, evidence extraction and embedding work. Listeners are removed when work finishes. Cancellation remains best effort for provider calls already received and may not prevent charges.

Search SQL uses a checked-out connection and a separate cancellation pool (at most two additional lazy connections). An abort sends `pg_cancel_backend` for that search connection. It remains checked out until cancellation finishes, then is discarded, preventing a late cancellation from hitting a subsequent query on a reused connection. Timed-out pool checkouts do not send SQL after they eventually acquire a connection. Non-search queries retain the ordinary pool path. This targets direct PostgreSQL connections, as used by the Docker setup; transaction-mode database proxies require separate validation. Cancellation failure is logged and cannot guarantee immediate server-side termination.

The integration harness now also verifies that a ten-second PostgreSQL sleep stops after a search deadline, subsequent SQL remains healthy, and closing a real HTTP socket after sending the request body cancels active SQL. The API regression suite passes 212 tests across 43 suites; API and web type checks pass. Real-provider cancellation and browser UX remain separate validation items.

The web production build also passes with `--configLoader runner`. Chrome is installed, but two attempts to download a temporary Playwright runner failed with npm registry connection resets. Temporary download files and validation containers were removed; project dependencies were unchanged. Browser checks have not passed and must still be run.

## Shared cloud staging, 2026-10-27

The cache key includes storage root, current user, asset, connector type/account, external file identifier and expected byte count. Ownership is still checked in SQL for each candidate before accessing the cache. There is no cross-request or cross-user source cache. Failed downloads are remembered only within the current request to avoid duplicate concurrent retries; a later search can try again.

Individual inspections release a lease rather than deleting the shared source. Request completion closes the cache, and each source is deleted after its final inspection releases it. This also covers downloads that finish after cancellation, while preventing deletion during an active decoder read. Evidence files remain owned and cleaned by individual inspections. A whole-file download must match the known source size exactly; a truncated or changed source cannot be passed onward as complete evidence.

The connector range interface now accepts an optional abort signal. Search staging forwards its signal to Google Drive's initial HTTP request; a stream returned after cancellation is destroyed. Existing connector callers remain compatible. Auth-context acquisition itself is still outside this connector signal.

Large-master follow-up: provide validated HTTP status/Content-Range/total-size metadata at the connector boundary, then expose bounded seekable reads to a decoder. Validate real seeking against MP4 files with metadata at both the beginning and end, variable bitrate and long GOPs; enforce total transferred bytes, outstanding reads, deadline and source-version consistency. Preserve absolute timestamps and compare the extracted windows against local-original decoding. The current raw-stream-only connector API cannot prove correct remote offsets. No proportional timestamp-to-byte shortcut or broad limit increase has been added.

Validation for this batch: 45 API suites / 221 tests passed, plus the API TypeScript check. Added coverage uses synthetic streams and mocked connector/decoder boundaries to check deduplication, owner-scoped source lookup, sequential reuse, byte reservations, source-size mismatch, late completion cleanup, and Drive request cancellation. No live Drive, decoder-quality, Docker, or paid-model checks ran in this batch.

## Clip-export accuracy correction, 2026-10-27

The older worker clip-export path estimated source byte offsets from average bitrate and treated the
resulting byte slice as if it started at a known source timestamp. That assumption is invalid for
variable-bitrate media, container metadata and keyframe dependencies; successful decoding would not
prove that it extracted the requested interval. The approximation has been removed.

Exports still prefer an available local preview. Without one, a small complete remote source is
decoded at its original absolute timestamps. `WORKER_CLIP_SOURCE_MAX_MB` defaults to 256 MB, additionally
bounded by the existing worker full-download limit. Unknown/nonpositive sizes and sources exceeding
the limit are rejected before auth/download; large cloud-only masters require future seekable decoding
or a cached preview. This is a correctness safeguard, not completed large-master support. The existing
`downloadAsset` method still depends on provider size metadata for transfer admission; its stream is not
yet capped during transfer by this worker path. Actual search staging has its separate streaming cap.

A missing/empty decoder output cannot be registered as a successful derived clip. Regression fixtures
exercise absolute timestamps, no estimated range reads, transfer admission, preview reuse and output
presence. These mocked decoder tests do not establish frame-accurate extraction on real footage.

`node scripts/check-clip-timestamps.cjs` additionally passes with the real bundled FFmpeg/FFprobe:
synthetic VBR H.264 inputs, long GOPs and MP4 metadata at the beginning/end both produce the requested
one-second blue interval, checked across all ten decoded frames and output duration. This validates
these local fixtures, not remote seeking or arbitrary production footage. Synthetic files are deleted
after the check; no Docker, cloud storage or paid inference is involved.

Validation after the clip-export correction: both extraction suites pass (nine tests), API TypeScript
check passes, and the native FFmpeg check passes. An older extraction fixture was corrected to create
its synthetic output in an isolated temporary storage directory, matching the newly enforced output
requirement. The broader run had passed the other 44 suites before that fixture correction.
