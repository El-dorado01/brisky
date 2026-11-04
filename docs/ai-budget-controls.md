# Remote AI usage and budget controls

2026-11-01 current update: owner approved replacing successful reservations with
recorded usage estimates. The append-only journal is preserved. Successful settlements
with a finite estimate now count that estimate, including values above the hold.
Failed, unsettled and missing-usage attempts retain at least the original reservation.
This is estimated allowance accounting, not provider invoice reconciliation. Baseten is
currently active; direct Meta remains inactive. The cumulative ceiling is $10.

Implemented 2026-10-26 for the current Gemini adapter. On 2026-10-30, the dormant Meta
adapter was wired to the same per-attempt journal; Gemini remains active and live Meta
inference has not been run. See [adapter scope](meta-adapter.md).

## Provider-neutral application configuration

The application uses `AiIntelligenceService` in `ai-intelligence.service.ts` and the
`AiIntelligenceProvider` interface in `ai-provider.ts`. Google SDK code lives in
`providers/google-ai.provider.ts`; the dormant Meta implementation lives in
`providers/meta-ai.provider.ts`. `AI_PROVIDER=google` remains selected. Future Meta
selection also needs dedicated Meta credentials, explicit modality-specific model
IDs, positive allowance and verified `meta/<model>` pricing entries. Unsupported
providers fail explicitly. No Meta keys are inferred from Google credentials.

Use `AI_API_KEY` / `AI_API_KEYS`, `AI_MODEL`, `AI_FALLBACK_MODEL` / `AI_FALLBACK_MODELS`, `AI_EMBEDDING_MODEL`, and `AI_MAX_CONCURRENCY`. Existing `GEMINI_*` deployment settings remain fallback aliases inside the Google adapter. Model identifiers and provider pricing keys remain provider-specific. Embeddings must stay compatible with the indexed corpus; changing generation providers must not silently change the embedding space.

The local `.env` has been migrated to the neutral names, preserving credentials and selected models, and its pilot allowance is $3 as requested. Pricing remains unset where no verified per-model entries exist, so those calls remain blocked. No provider calls were made to verify prices or test credentials. The example environment keeps a zero budget for new installations.

## Behavior

Controlled indexing also supports durable `plan_reserved`/`plan_released` events:
whole-file planned requests reserve funds atomically before analysis dispatch. Each
attempt consumes its own plan's allowance; unused plan funds are released separately
from unknown/failed attempt holds. Plans are not counted twice. See
[controlled indexing](controlled-sync.md) for the validated profile and retry limits.

Remote generation and embedding attempts require a positive `AI_BUDGET_USD` and explicit per-model entries in `AI_MODEL_PRICING_JSON`. The default budget is zero, so existing keys alone no longer enable inference. No `.env` secrets or active configuration were changed.

Each application attempt appends a durable reservation before calling the SDK. API and worker processes using the same local file share that budget, including after restarts. Failed, aborted, interrupted, or unreported requests keep their reservations. Settlements record reported input/output tokens, thinking output tokens where returned, elapsed attempt time, provider, model, stage, logical request ID, and estimate. Prompts, media, transcripts, API keys, and raw error messages are not written to the journal.

Every retry consumes another reservation, as does every model fallback. Models without explicit pricing/reservation entries are blocked before inference. The SDK's built-in retries are disabled; Brisky's existing bounded retry loop remains. Generation has an output cap and HTTP timeout. Aborting/timing out a client does not guarantee server cancellation or eliminate charges.

Missing usage metadata is `estimatedUsd: null` in the journal. Embedding responses in the installed SDK do not expose token counts, so their journal charge remains unknown; the legacy per-stage usage object retains a labelled character-based estimate. Generation usage objects are marked reported/unknown. The journal, not the existing economics dashboard, is the attempt-level source for this phase: the dashboard does not yet reconcile retries, reservations, or unknown costs.

Embedding failures propagate as errors instead of free empty vectors. Search catches embedding failures and still runs local lexical retrieval. This fallback cannot provide semantic recall; do not interpret missing lexical results as proof that the library lacks the requested moment.

## Configure before live trials

1. Confirm the exact model IDs and provider pricing. Populate `AI_MODEL_PRICING_JSON` with an entry for each generation, embedding, and fallback model you intend to permit.
2. Every entry uses the key `google/<model-id>` or `meta/<model-id>` for its actual
   provider and fields `reservationUsd`, `inputUsdPerMillion`, and `outputUsdPerMillion`.
   All values must be finite nonnegative numbers; reservation must be positive.
   No prices are assumed from old shared Gemini rate settings.
3. Choose a conservative per-attempt reservation for the largest allowed input/output for that task. A successful call with reported usage replaces its reservation with that estimate; failed or unknown outcomes keep at least the hold. Pricing is currently per model, so different stages using one model share its reservation amount.
4. Set a small positive `AI_BUDGET_USD` for the first experiment and configure provider-side spending limits where available. `AI_MAX_OUTPUT_TOKENS` defaults to 4096 and `AI_REQUEST_TIMEOUT_MS` to 30000. Check output completeness on long transcription/video tasks; do not increase caps without reviewing reservations.
5. Ensure API and worker resolve `AI_USAGE_LEDGER_PATH` to the same durable file. Default: `storage/usage/ai-attempts.jsonl`. A host path and a container path are shared only if backed by the same mounted file. This is not a distributed budget service for separate disks or hosts; use a transactional central store before multi-host deployment.

These controls limit admitted reservations, **not the provider's actual dollar bill**. Reservations may underestimate multimodal pricing, reasoning, or unknown outcomes. When reported estimates exceed a reservation, accounting increases to the larger value for future admissions; already in-flight work cannot be undone. Historical usage before journal creation, other applications, provider storage fees, and media upload/processing operations are outside this inference ledger. Media upload preflights budget availability, but does not itself reserve inference budget; inference still reserves atomically afterward.

## Inspect without Docker

From the repository root:

```text
node scripts/summarize-ai-usage.cjs
node scripts/summarize-ai-usage.cjs <path-to-shared-ledger>
```

The report groups reservations and known estimates by provider/model/stage and counts errors, unknown charges, and unsettled attempts. A missing ledger means no recorded attempts, not proof of no historical provider usage.

The budget is cumulative over the journal, not daily and not reset at restart. Raising the configured budget explicitly permits more cumulative reservations. Do not delete the journal to make room. Reconcile unknown costs against the provider dashboard before changing the allowance.

## Lock and failure handling

Exclusive file locking serializes admission and append operations across processes sharing this filesystem. Lock contention, journal corruption, and write failures block new attempts. Writes are flushed before inference. Crashes can leave a `.lock` file and unsettled reservations; locks are never automatically stolen. Stop all API/worker processes and inspect/reconcile the journal before manually removing an abandoned lock. Preserve reservations and back up the journal; automatic refunds or recovery are deliberately absent.

No database migration or Docker is needed for these controls. Live accuracy/cost measurement, provider billing reconciliation, the full search deadline/cancellation path, richer media evidence, and UI cost/status presentation remain follow-up work.
