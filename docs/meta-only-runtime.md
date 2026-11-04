# Meta-only engine profile

This is an event-developed configuration and integration extension to the
pre-existing Brisky engine. It does not reclassify the engine as new event work.
The original Gemini, MiniLM, Whisper and YuNet/SFace implementations are retained
for development after the event; they must not execute in this profile.

## Setup on the engine host

Install the normal repository dependencies, PostgreSQL/pgvector, Redis and FFmpeg
as described in the root README. Use Python 3.11–3.14. From the repository root:

```sh
pnpm setup:mms
pnpm setup:meta-embeddings
pnpm setup:mms --check
pnpm setup:meta-embeddings --check
```

The second setup uses the CPU Torch environment created by the first and downloads
approximately 180 MB of official Meta LASER2 files. Both downloads are explicitly
requested; API startup does not download weights. File hashes are pinned from
official downloads, not claimed as independently published upstream checksums.
LASER's BSD notice is in `services/meta-embeddings/LICENSE.LASER`. MMS weights
have separate CC-BY-NC 4.0 terms; see the voice documentation.

Set these root `.env` values, alongside the normal database/Redis/storage settings,
your own `META_API_KEY` and a positive, explicitly priced AI budget:

```dotenv
META_ONLY_RUNTIME=true
AI_PROVIDER=meta
EMBEDDING_PROVIDER=meta-local
TRANSCRIPTION_PROVIDER=ai
VOICE_CONVERSATION_MODE=meta-mms
FACE_RECOGNITION_ENABLED=false
FACE_ARCHIVE_WORKER_ENABLED=false
META_MODEL=muse-spark-1.3
META_VIDEO_MODEL=muse-spark-1.2
META_AUDIO_MODEL=muse-spark-1.2
META_VOICE_MODEL=muse-wonder-1.0
```

Nonempty `META_*_FALLBACK_MODELS` lists must also contain allowed Meta model IDs.
Startup rejects incompatible settings. The owner-scoped MiniLM opt-in is ignored
in this profile. Google provider construction, Google speech and Whisper execution
are blocked. Manual people tags remain available; automatic face matching is
disabled, not replaced by an unvalidated identity model.

Optional CPU settings: `META_EMBEDDING_THREADS=4`,
`META_EMBEDDING_MODEL_DIR=storage/meta-embeddings`, and
`META_EMBEDDING_PYTHON_PATH` (defaults to the platform's `.venv-mms` interpreter).
Do not use `setup:faces` or enable face workers for the event runtime.

## Existing indexed collections

LASER2 produces a separate 1024-dimensional vector space. Never compare it to
MiniLM's 384 or Gemini's 3072 dimensions. The additive migration leaves those
original vectors untouched. Model ID and source-text fingerprint prevent stale
LASER vectors from being used after the indexed text changes.

Build the API, then run the owner-scoped local backfill. Substitute a real account
UUID; never copy the development owner's identifier into another installation:

```sh
pnpm build:api
node --env-file=.env scripts/backfill-meta-embeddings.cjs --owner YOUR-USER-UUID
node --env-file=.env scripts/backfill-meta-embeddings.cjs --owner YOUR-USER-UUID --apply
```

The first command is a dry run. `--apply` installs the additive schema and fills
missing/current-model vectors using local CPU inference, with a source-text
comparison before each write. It can be rerun after an interruption. No media is
uploaded and no paid model call is made by this script. New indexing jobs write
the Meta vector directly; duplicate segments inherit the same model provenance.

## Full application versus standalone event runner

The separate `brisky-meta-hackathon` repository's sample runner does not include
real Drive indexing or playback and has a simplified UI. For the real Brisky UI
and media workflow, install this declared original engine repository and follow
the three-app READMEs. Web login needs Brevo configuration; Drive needs the
judge's own Google OAuth application and media. Private development footage and
credentials are not distributed. No claim is made that judges will reproduce
the same answers without the same source material.

## Validation scope

2026-11-04: API build and 21 embedding/profile regression checks passed. All 32
existing development segments were locally backfilled, preserving original
vectors. The model setup `--check` passed. A generated four-sentence smoke check
produced finite 1024-dimensional vectors; related text was closer than unrelated
text. This is not a calibrated retrieval benchmark or proof of MiniLM-equivalent
accuracy. End-to-end retrieval results and judge bootstrap verification must be
recorded separately when completed.

Live owner-library checks: the exam quote was found despite an unrelated kitchen
selection (31.101s, complete). Kitchen dancing was confirmed by moving-video
evidence at 1.5?9.5s (23.464s); that response retained searchStatus=incomplete,
so this is a verified match, not proof of exhaustive catalogue coverage. The
backfill rerun updated zero and skipped all 32 existing current vectors.
