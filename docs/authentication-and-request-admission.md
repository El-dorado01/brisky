# Authentication and request admission

Implemented 2026-10-27 as the first batch from the API readiness review. This is not a complete public
developer API or security audit. Live provider checks and the paid pilot remain deferred.

## Authentication

- `JWT_SECRET` is required on API and worker startup: at least 32 characters, with known development
  and placeholder prefixes rejected. Generate a private random secret; length alone does not ensure
  entropy. The previous source-visible fallback is rejected.
- Local `.env` received a generated secret because its existing value was missing or unsafe; provider
  credentials were preserved. Sessions signed with a prior secret must log in again.
- Session verification requires the expected JWT header, a constant-time signature comparison, a
  non-empty subject/email, integer issued-at/expiry values, sensible time ordering and unexpired
  credentials. Malformed signed claims cannot enter guarded routes with an absent user ID.
- Demo seeding defaults to off. Explicit use requires `NODE_ENV=development`,
  `ENABLE_DEMO_ACCOUNT=true` and `DEMO_ACCOUNT_PASSWORD` of at least 12 characters. The browser no longer
  embeds demo credentials or offers an automatic shared-account login.
- Existing demo accounts/passwords are not deleted or rotated by startup. Before public deployment,
  review any earlier seeded account deliberately. The destructive development `clean-slate.js` utility
  still contains legacy demo provisioning and must not be used as production provisioning.
- New registration requires a 12–256 character password. Login retains compatibility with existing
  shorter passwords but caps input length. Email/name values have type/length checks.

The current session format/lifetime remains; refresh/revocation, project API keys, media-specific
playback tickets, issuer/audience policy and a full internal optional-owner audit remain follow-ups.

## Runtime request checks

Requests fail with HTTP 400 and `code: INVALID_REQUEST` for invalid search, clip, folder, feedback,
bulk-reindex and credential inputs validated by the shared helper. Auth controller missing-field
errors retain the existing Nest 400 shape. Full response/error standardization remains pending.

| Input | Admission rule |
| --- | --- |
| Search | Non-empty string, at most 2,000 characters; optional asset ID at most 128; phase retrieve/verify |
| Clip | Numeric finite start/end, start >= 0, end > start, span <= 600 seconds, end <= 7 days; known source duration also enforced |
| Folder selection | At most 100 entries with non-empty bounded ID/name; duplicate IDs rejected; empty list allowed |
| Feedback | Positive/negative enum; bounded query/IDs/notes; optional timestamp finite and non-negative |
| Bulk reindex | Explicit non-empty pattern at most 200 characters; removed dataset-specific default |
| JSON body | 64 KiB maximum at the normal API bootstrap; multipart retains its separate upload limit |

Clip validation also runs in the service before enqueueing. Zero is retained as a valid start; strings,
missing bodies and other invalid values no longer silently select a default interval. These targeted
checks do not replace a future OpenAPI/runtime schema contract for every route and response.

## Request limits

The API entrypoint installs a bounded in-memory fixed-window admission hook before request handlers:

- `AUTH_REQUESTS_PER_MINUTE=10`: login/register requests combined per IP, including failed attempts.
- `API_REQUESTS_PER_MINUTE=120`: other requests combined per IP.
- Rejections return HTTP 429, `code: RATE_LIMITED` and `Retry-After` seconds.
- State is capped at 10,000 active IP/category buckets. New buckets are refused at capacity until
  expired entries can be reclaimed. State expires after one minute and resets on process restart.

This is not per-user billing, concurrent-inference admission, distributed quota enforcement or a
provider-spend ceiling. Playback requests and UI polling count toward the general limit. Behind a
proxy, the current untrusted-proxy configuration sees its connecting IP, so clients may share a bucket.
Configure a trusted gateway and shared quotas deliberately before public multi-instance deployment;
do not trust arbitrary forwarded IP headers. CORS policy remains a separate readiness item.

## Validation

The full API suite passed (54 suites / 294 tests), including correctly signed malformed-token
rejection before guard admission, disabled demo seeding, malformed-body rejection before work
dispatch, and actual Fastify HTTP admission/Retry-After checks. API and web type checks pass. No new
live database/provider checks or browser checks were run for this batch.

Follow-up implemented: [durable clip operations](clip-operations-api.md) now provides owner-scoped job
lookup, result IDs and keyed requests. Next: contract/error schemas, pagination and measured
tenant-scoped usage. See [readiness review](api-and-ingestion-readiness-review.md).
