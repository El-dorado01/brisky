# Durable clip operations

Implemented 2026-10-27. This foundation covers new clip submissions; it does not make every indexing
stage or search request exactly-once. No paid inference is involved in clip extraction.

Deploy/restart both API and worker with this version. The additive schema is applied at startup;
older workers do not implement the new operation publication contract and should not consume new clip
envelopes during a mixed-version rollout.

## Consumer contract

Authenticate with the existing bearer token. Submit:

```http
POST /api/v1/media/{assetId}/extract-clip
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: export-order-123

{"start_s": 10.5, "end_s": 25}
```

HTTP 202 returns `job_id`, `status`, `status_url`, `reused`, job timestamps/progress and
`result_asset_id` (null until completion). Send the same key on every network retry of the same
request. A key is optional for compatibility; omitting it intentionally creates a new operation on
each submission. Keys are case-sensitive, 1–128 visible ASCII characters and scoped to the user.
Only a SHA-256 hash is stored. Do not put API credentials or personal data in a key.

The same key and source asset/start/end/title return the original operation, including after completion
or failure. Reusing a key with different parameters returns HTTP 409 with `code: IDEMPOTENCY_CONFLICT`.
Changing a cloud source does not turn replay into a new request; use a new key for a deliberate new
export. Records currently remain until their source asset/account is deleted; there is no time-based
key expiry policy yet. No idempotency guarantee spans deletion of those records.

Poll the returned URL with the same bearer token, typically every 2–5 seconds:

```http
GET /api/v1/indexing/jobs/{jobId}
```

This lookup supports other existing job kinds too. It accepts a queue job ID or an indexing-row UUID,
uses the authenticated owner, and returns 404 for absent or other-owner jobs. It selects explicit
public fields, not raw database rows or provider/internal error messages. A failed operation currently
reports the generic `JOB_FAILED` code; richer failure classification remains contract work.

| Status | Meaning |
| --- | --- |
| `dispatch_pending` | Request committed; queue delivery is still being recovered |
| `queued` | Waiting for a worker/capacity, or an automatic retry |
| `processing` | Worker owns the job |
| `completed` | Processing completed; new clip operations expose their derived asset ID |
| `failed` | Processing attempts failed; explicit retry is available for a clip operation |
| `cancelled` | Cancelled; replaying submission does not create replacement work |

Use `result_asset_id` with the existing asset, lineage and playback endpoints. Polling `stage` and
`progress` is useful display information; clients should branch on `status`. Playback can still
return its separate preparing/unavailable state depending on artifact location and retention.

To retry a failed **new clip operation**, preserving its job/output identity:

```http
POST /api/v1/indexing/jobs/{jobId}/retry-operation
```

This endpoint is owner-scoped. Retrying an already queued, processing or completed operation returns
its current state. Cancelled operations cannot be revived through it; submit a new key for new work.
The older `jobs/{assetId}/retry` route retains its asset-indexing behavior. Cancellation continues
through `POST /api/v1/indexing/jobs/{jobId}/cancel`; cancelling a waiting clip does not cancel indexing
of its parent source asset. Active cancellation is cooperative, with a check before result publication.

## Design and recovery

One PostgreSQL transaction commits the request identity, saved worker envelope, reserved output ID and
waiting job row. A unique `(user_id, key_hash)` constraint resolves concurrent submissions; the job's
unique operation link prevents duplicate waiting rows. Runtime operation lookup has an owner/job index.

A short SQL retry lease claims pending delivery. Queue work runs outside SQL transactions, using a
stable BullMQ job ID. Dispatch runs on submission, startup and a five-second recovery loop. A failed
or ambiguous acknowledgement stays pending; another attempt becomes eligible after 30 seconds.
Retained BullMQ jobs are reused; an explicit failed-operation retry resets that job's attempt counters.
Separate clip operations for the same interval are no longer removed by general waiting-job dedup.
Pending recovery excludes cancelled, active and terminal jobs so they cannot starve delivery.

The worker reserves the same output asset ID across attempts. A completed operation replay skips
decoding. A busy source asset causes delay rather than silently discarding the clip request. Failed
clip attempts remain eligible for the remaining automatic attempts instead of blocking slot admission.

After extraction and source validation, a short transaction locks the owned operation and job, checks
the expected job/output identity and cancellation, inserts the derived asset and lineage, and commits
the result pointer/completed checkpoint together. Duplicate publication skips those writes. Failure
rolls them back. Error handling preserves an already committed completion, including an ambiguous
commit acknowledgement. No FFmpeg, cloud or queue call runs inside the publication transaction.

Guarantees apply to PostgreSQL result publication, not exactly-once decoding or cross-system atomic
storage. A crash before publication can require decoding again; unregistered output files may remain
until cleanup/retry. Worker-local artifact availability, retention and optional cloud write-back retain
their existing deployment limits. Best-effort cloud write-back occurs after publication; it is not a
durable upload outbox. External deletion of retained queue state also changes delivery recovery behavior.
Older clip jobs without an operation record do not acquire the new transactional guarantee retroactively.

## Validation

`node scripts/check-clip-operations.cjs` uses a newly created temporary database on local PostgreSQL and
drops it afterward. It applies the schema twice and checks eight concurrent keyed submissions, ownership,
conflicting parameters, atomic rollback/repeated publication, lost-ack recovery, explicit retry and
cancellation without changing parent indexing. The queue is a controlled in-memory fixture; no Redis,
provider, model or real cloud-media requests run in this check. Original application tables are untouched.

Unit/worker fixtures cover keyed replay, queue outages, retained identities, worker publication replay,
same-span queue isolation, busy-asset delay and automatic retry eligibility. Live authenticated cloud,
browser and accuracy/cost pilot validation remain deferred.

Next: formal request/response/error schemas, OpenAPI, pagination and tenant-scoped measured usage.
