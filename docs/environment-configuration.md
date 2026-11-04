# Environment configuration

Meta voice: `VOICE_CONVERSATION_MODE=meta-mms` selects Meta streaming ASR/dialogue
and resident MMS TTS, including saved-response read-aloud and previews. Run
`pnpm setup:mms` on the API host first. `META_VOICE_MODEL`, `MMS_MODEL_DIR`, optional
`MMS_PYTHON_BIN`, `MMS_CPU_THREADS` (default 4, range 1–8) and `MMS_CACHE_DIR`
configure this path. No Gemini fallback is used. See [voice setup](meta-mms-voice.md).

Voice development: root `VOICE_CONVERSATION_MODE=live` selects the Gemini Live
relay; `turn-based` restores the existing recorded-turn pipeline. Configure
`VOICE_LIVE_MODEL`, `VOICE_LIVE_PUBLIC_URL`, `VOICE_LIVE_APP_ORIGIN` and explicit
`google-live` session pricing. No browser key is required. This is not the planned
Meta-only judge profile; see [voice transition](voice-provider-transition.md).

Factory concurrency: `GLOBAL_MAX_ACTIVE_JOBS` controls worker concurrency and the
scheduler's total active-job cap; `DEFAULT_USER_SLOTS` limits each user's normal jobs.
Both are now 5 under the owner's subsequent instruction. `FACTORY_INGEST_SLOTS=2`
and `FACTORY_CONTINUATION_SLOTS=3` partition that capacity into source preparation
(fetch/scenes planning) and follow-up jobs (speech, understanding, embeddings/finalization).
Both partition values 0 retain unpartitioned behavior. Restart API/workers after changes. Per-asset
locking still serializes a file's jobs. AI request scheduling is separate; increasing
these settings does not bypass model concurrency, budget or source-size controls.

Updated 2026-11-01. Actual credentials are private; examples contain no usable secrets.

The root `.env` configures the **engine and worker**. Next.js uses
`apps/web/.env.local` for the **SaaS server**. Provider keys, Google OAuth secrets and
connector encryption keys must never be put in `NEXT_PUBLIC_*` or browser bundles.

| Root group | Purpose |
| --- | --- |
| Engine HTTP | Port 3001, host and runtime mode; Next.js occupies port 3000 |
| Engine authentication | Developer JWT signing and development upload gate; separate from SaaS email sessions |
| PostgreSQL | `DATABASE_URL` is the actual connection source, including database credentials |
| Redis | Queue connection host/port |
| Storage/media tools | Root storage, upload/search scratch overrides, FFmpeg/FFprobe executables |
| AI selection/budget | Active host, cumulative allowance, pricing and durable usage ledger |
| Baseten | Sponsor key, exact model, separate text/media body limits and media opt-in |
| Gemini | Preserved keys/models for restoration and existing Google-vector corpora |
| Direct Meta | Blank dedicated credential/model placeholders, still inactive |
| Embeddings | Global provider plus explicit owner-scoped local-vector selection |
| Local speech | Whisper model, CPU/device/precision and language/task |
| Scene sampling | Scene detection and sampling controls |
| Google Drive | OAuth client/callbacks and stable encryption key for saved tokens |
| SaaS/background work | Replies, sync, polling and worker activation switches |

Current local choices: Baseten generation, media opt-in, owner-scoped local embeddings
and SaaS replies. Direct Meta is not selected. Global embedding selection is unchanged.
Broad sync remains off. The owner-approved controlled account has manual sync and a
standalone worker enabled; 120-second polling is restricted to that same account.
`INDEX_BUDGET_PLAN_ENABLED`, `SAAS_DRIVE_SYNC_ACCOUNT_IDS` and
`INDEX_ALLOWED_CONNECTOR_ACCOUNT_IDS` define this restricted profile; see
[controlled sync](controlled-sync.md). The cumulative testing
ceiling is **$10** (owner approved 2026-11-01), including existing reservations; do not reset the ledger.
Successful reported usage now replaces its hold; failed/unknown/in-flight attempts retain
reservations. This is estimated allowance accounting, not the provider's actual balance.

The active SaaS Google callback is `http://localhost:3000/api/connectors/google-drive/callback`.
The separate `GOOGLE_REDIRECT_URI` setting is for the legacy engine OAuth flow; it is
retained for compatibility, not used by the Next.js connector flow. The Google Console
must authorize whichever callback is actually used.

Removed from root `.env` and `.env.example` after checking runtime references:
`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (unused aliases),
`PROXY_DIR`, `THUMBNAIL_DIR` (derived from `STORAGE_ROOT`), `OPENAI_API_KEY`
(no adapter consumes it), and `VITE_ENABLE_DEV_UPLOAD` (retired UI).
`UPLOAD_DIR`, `SCRATCH_DIR`, sampling settings and inactive-but-supported provider
credentials remain because current code or the planned provider transition uses them.

Existing retained values were compared before/after with Node's dotenv parser; only
the engine port intentionally changed to 3001, matching the already-running split setup.
Explicit background-work switches now match the existing disabled process settings.
Baseten media opt-in is recorded after the validated media/queue tests, independently
of enabling workers or sync. New Meta credential/model placeholders remain blank.

A private pre-cleanup `.env` backup is in ignored `storage/config-backups/`; it contains
credentials and must remain private. The retired Vite source, including uncommitted
edits, was archived in ignored `storage/retired-apps/` before `apps/web` was deleted.
Dependency links/build output were not archived. Historical Git/contribution references
are retained for attribution.

Restart the engine/worker when changing root configuration. Restart Next.js for its
server environment changes. Never change `CONNECTOR_ENCRYPTION_KEY` casually: it is
needed to decrypt existing saved connector tokens.

Optional local face matching runs on the API host. `pnpm setup:faces` installs its
isolated environment/models; `pnpm setup:faces --check` verifies them offline. Set
`FACE_RECOGNITION_ENABLED=true` only after setup. `FACE_PYTHON_BIN` overrides the
default `.venv-face` Python. Models use `STORAGE_ROOT/face-models`. Startup never
downloads weights. See [limits and setup](local-face-matching.md).

## Speech and current test settings (2026-11-02)

`TRANSCRIPTION_PROVIDER=ai` uses the active `AI_PROVIDER` audio adapter; `whisper`
selects local speech. Meta uses `META_AUDIO_MODEL`, Baseten uses its pinned sponsor
model with `BASETEN_MEDIA_ENABLED=true`, and Google uses its configured Gemini model
cascade. Audio access/credits are still required. AI failures are surfaced instead of
silently switching to Whisper. Local Whisper window checkpoints apply only to Whisper;
AI adapters do their own bounded audio chunking. New controlled file plans reserve
speech chunks/retries as well as visual calls, with all used model IDs allowlisted.
The active profile is Meta with Muse Spark 1.2 audio; other provider routing passed
offline checks, not new live speech accuracy comparisons.

The owner raised `AI_BUDGET_USD` to 30 cumulatively; the existing journal is preserved.
`SEARCH_DEADLINE_MS=60000` allows bounded source verification. SaaS orchestration allows
110 seconds for planning/search/answering, with a 125-second web bridge timeout.
Restart the API and worker when changing root settings. Credentials remain server-only.

Gemini interactive speech is separate from archive transcription and `AI_PROVIDER`.
Enable `VOICE_ENABLED` and configure the `VOICE_*` variables in the root engine
environment; optional `GEMINI_VOICE_API_KEY` overrides the existing Google key.
The `.env.example` includes `google-speech` pricing examples; verify current prices
before reuse (the shown 3.8 TTS rate applies through 2026-12-31). Voice Settings
selection needs no new secret or engine restart. Current default is Kore.
See [voice operation and remaining latency](saas-voice.md).

`VOICE_TTS_FALLBACK_MODEL=gemini-3.8-flash-lite-tts` is the explicitly priced
speech-only fallback for provider quota responses. `VOICE_TTS_MODEL` stays the
preferred model; named voice selection is preserved. A quota response pauses
preferred-model attempts until its retry time. Generic acknowledgement assets
are shipped public files and remain available without model quota.
