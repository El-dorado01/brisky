# API contract, pagination and honest usage reporting

Implemented 2026-10-28. The API is still a pre-launch contract under refinement; these changes do not
claim that project API keys, BYOK routing, tenant billing or every response schema are finished.

## Discovering the contract

`GET /api/v1/openapi.json` serves OpenAPI 3.1 without authentication. The same generated document is
[openapi.json](openapi.json); regenerate with `node scripts/generate-openapi.cjs`. The source is
`apps/api/src/common/api-contract.ts`. Inventory tests check every current controller route/method and
the generated artifact. Core auth, search, asset/job pagination, clip operations and economics have
named request/response schemas. Existing responses marked `GenericObject` are explicitly partial
contracts, not strict SDK-ready definitions. OpenAPI also cannot express all semantic admission rules:
the server separately checks clip start/end ordering, known duration and maximum span, whitespace-only
text and duplicate selected folders.

Binary playback/thumbnail responses, multipart development upload and the OAuth redirect are described
separately from JSON responses. Direct upload remains disabled by default. API-key authentication is
not advertised: use the implemented bearer session contract for now.

## Asset and job pages

```http
GET /api/v1/media?limit=50
GET /api/v1/indexing/jobs?limit=50
Authorization: Bearer <token>
```

Both return an envelope: `assets` or `jobs`, `count` (this page only), `hasMore`, and `nextCursor`.
Default limit is 50, minimum 1, maximum 100. Pass the returned opaque cursor unchanged to retrieve
the following page; stop when `nextCursor` is null. Cursors are scoped to the resource and authenticated
user. They are unsigned pagination state, not authorization tokens; every query still enforces ownership.
Malformed/wrong-resource/wrong-user cursors and invalid limits return HTTP 400 before SQL.

Ordering is `created_at DESC, id DESC`. Cursor timestamps retain PostgreSQL microseconds, rather than
rounding through JavaScript dates. A cursor contains its position, so deleting its anchor record does
not prevent following pages. Composite owner/time/ID indexes support keyset reads. Asset segment
counts use indexed per-asset subqueries rather than grouping the entire library before paging.

This is not a snapshot: concurrent inserts/updates/deletions can change a browsing session. Refresh
from the first page for newer items. API list responses are bounded; trusted internal library/benchmark
helpers retain their existing full-library behavior. List payloads do not expose raw internal job
errors or saved worker envelopes. Asset-list failures use a generic public message. Job lists use
the same queued/processing/dispatch_pending/completed/failed/cancelled vocabulary as job lookup.
Existing safe job timing/cost metadata remains visible, but those records are not provider invoices.

The web library now has Previous/Next navigation and refreshes its current page. Request ordering
prevents an older library request from replacing the latest page or a new session's results. Job
history displays the returned recent page; developer consumers can traverse its continuation cursor.
Browser interaction verification remains pending.

Compatibility changes to the pre-launch API: `/indexing/jobs` now returns the `jobs` envelope expected
by the web client instead of its prior raw array; `/media` defaults to a bounded page; unknown economics
values are null rather than numeric placeholders. Consumers must handle these changes deliberately.

## Error and correlation contract

Nest-handled JSON failures now use:

```json
{"statusCode":400,"code":"INVALID_REQUEST","message":"Invalid cursor for this user and resource","requestId":"server-generated-id"}
```

Existing specific request codes such as `IDEMPOTENCY_CONFLICT` are retained. Default codes cover
authentication, ownership, missing resources, conflicts, oversized payloads and request limits.
Unexpected server failures return a generic message without database/provider details. Adapter parser
errors with a valid 4xx status retain that class instead of becoming 500 errors. Request-limit failures
use the same basic envelope and provide `Retry-After`.

The normal bootstrap generates UUID request IDs and emits `X-Request-Id`; CORS exposes it and
`Retry-After`. Include the ID when investigating an issue. This filter does not standardize successful
binary responses, OAuth redirects or every custom successful payload. Gateway errors produced before
Brisky receives a request are outside its contract. Application code still controls which expected
4xx explanations are safe to disclose; this is not a comprehensive security audit.

## Economics without invented measurements

All economics queries require an authenticated user. Verification-cache counts join owned assets;
feedback and asset aggregates are likewise scoped. `cachedEvaluations` counts stored candidate-cache
entries, not requests, model attempts, successful matches or cache-hit events. The old
`totalQueriesVerified` field remains as a deprecated alias so consumers can migrate.

Verification `estimatedCostUsd`, `costPerQueryUsd` and `cacheHitRate` are null, with
`measurementStatus: not_measured`. Previously fixed per-row costs and the fixed 85% hit rate were not
measurements and have been removed. The dashboard displays **Not measured**, not $0 spent or an
invented hit rate.

Feedback with no responses likewise returns a null positive ratio and displays **No feedback**, instead
of the former default 100% satisfaction. Ratios with actual feedback use only that user's records.

Ingestion `costBasis: legacy_asset_estimates` identifies the existing stored aggregates. They are not
reconciled provider bills; zero may be a database default rather than evidence of free processing.
The legacy asset count/duration aggregates include tracked assets regardless of completion and can
include derivatives. Do not call their totals unique indexed source minutes. Rate calculation now
uses unrounded duration; rounded minutes are display-only. Cross-request tenant attribution for the
local AI attempt journal and measured cache-hit events remain future work. No global journal totals
are exposed as another user's consumption. The later accuracy/cost pilot must establish measured costs.

## Validation and rollout

Unit checks cover cursor input/scope and calendar validation, route inventory, artifact consistency and
safe error responses. The isolated PostgreSQL script `node scripts/check-clip-operations.cjs` now also
checks timestamp ties, microsecond continuation, deleted anchors, asset/job paging, tenant-isolated
economics, and core response-schema validation using Ajv. It creates and drops a temporary local
database and uses a controlled queue fixture. No real provider, Redis job dispatch or paid inference
runs in that check. The existing application tables remain untouched.

Restart/deploy API and web together for the response changes. Startup applies the additive page
indexes; production migration timing still needs deployment review. Live browser/cloud validation and
the paid pilot remain deferred. Next platform work: scoped developer credentials/project quotas,
attributed usage events and completing the remaining endpoint-specific schemas before SDK generation.

Final checks for this batch: 59 API suites / 320 tests passed, including dependency-free HTTP contract
checks. API/web type checks, the production web build and isolated PostgreSQL response/schema checks
passed. No paid calls or live browser checks were run.
