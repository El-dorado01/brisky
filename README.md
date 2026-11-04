# Brisky

Brisky helps people find, understand and connect moments in their media collections.
Search results retain source timestamps; Spaces hold conversations, saved moments and
shortlists. Processing uses cloud connectors, FFmpeg, speech and configurable AI adapters.

## Three applications

```text
apps/
  api/       NestJS/Fastify engine API and shared processing modules
  workers/   Standalone BullMQ workers; no HTTP listener
  web/       Next.js SaaS UI and server-side SaaS API routes
```

The web app handles email-code sessions and workspace routes. It calls the engine for
media/connector operations. The engine submits jobs through Redis; workers process them
and persist results in PostgreSQL. Workers reuse engine modules from `apps/api`.

| App | Local address | Instructions |
| --- | --- | --- |
| API | `http://localhost:3001/api/v1` | [API README](apps/api/README.md) |
| Workers | No HTTP port | [Workers README](apps/workers/README.md) |
| Web | `http://localhost:3000` | [Web README](apps/web/README.md) |

## Setup

Use Node.js 20 or newer, Corepack/pnpm, and Docker for PostgreSQL/pgvector and Redis.
Media processing additionally needs FFmpeg/FFprobe. Local speech/embeddings need Python
and the dependencies under `services/whisper-transcriber`.

Streaming Meta voice uses a separate optional CPU runtime (Python 3.11–3.14):

```sh
pnpm setup:mms
pnpm setup:mms --check
```

It downloads about 145 MB of checksum-verified Meta MMS English weights plus CPU
dependencies; API startup never downloads models. Set root
`VOICE_CONVERSATION_MODE=meta-mms` for Meta streaming transcription/dialogue and
local speech. Gemini Live remains available through the explicit `live` mode.
See [judge setup, model licence and validation limits](docs/meta-mms-voice.md).

Optional local face matching has a separate, explicit setup command (Python 3.10+):

```sh
pnpm setup:faces
pnpm setup:faces --check
```

Setup creates `.venv-face`, installs OpenCV dependencies and downloads about 39 MB
of checksum-verified face models with their licence notices. `--check` only verifies
readiness. API/worker startup never downloads these files automatically. The current
user-triggered face scan runs on the **API host**, so a worker-only machine does not
need this optional runtime yet. See [face matching](docs/local-face-matching.md).

From the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --dir apps/web install --frozen-lockfile
```

API/workers use the root workspace and lockfile. Web retains its own workspace, lockfile
and pinned package-manager version, so install it separately.

For a new checkout, copy `.env.example` to `.env` and `apps/web/.env.example` to
`apps/web/.env.local`. Keep existing configured files.

| File | Purpose |
| --- | --- |
| Root `.env` | Engine/workers: database, Redis, AI providers/budget, storage and Drive OAuth |
| `apps/web/.env.local` | SaaS server: database, engine bridge, Brevo SMTP and session settings |

Never commit secrets or expose them in `NEXT_PUBLIC_*` variables. See
[environment configuration](docs/environment-configuration.md) and [budget controls](docs/ai-budget-controls.md).

## Run locally

Turn Docker on when database/queue work is needed, then start infrastructure:

```sh
docker compose up -d postgres redis
```

Run each application in a separate terminal, from the repository root:

```sh
pnpm dev:api
```

```sh
pnpm dev:web
```

Start workers only when queued jobs should be processed; this can trigger paid AI calls:

```sh
pnpm dev:worker
```

`pnpm dev` starts only the API. Web login needs PostgreSQL and configured email delivery;
engine operations need the API, and indexing needs Redis plus workers. Engine health:
`http://localhost:3001/api/v1/health`.

## Build and checks

```sh
pnpm build:api
pnpm build:workers
pnpm build:web
pnpm --filter @brisky/api test
```

Worker build checks its Node entry point; the API build compiles its shared engine modules.
Private media, caches and the durable AI journal live under ignored `storage/`. Generated
test fixtures should use automatically cleaned temporary directories.

## Scope and documentation

Baseten is the active testing host; direct Meta remains inactive. One confirmed Drive
account has owner-approved worker processing and 120-second polling enabled under the
controlled budget/profile; other accounts remain paused. See [controlled sync](docs/controlled-sync.md).
Completed protocol tests do not establish recognition
accuracy or unattended library readiness. Priorities: accuracy, then cost, then speed.

- [TODO](TODO.md) and [ingestion/provider checklist](docs/media-ingestion-roadmap.md)
- [Developer API](docs/api-contract-and-pagination.md) and [OpenAPI](docs/openapi.json)
- [Drive validation](docs/drive-save-and-sync.md)
- [Hackathon brief](docs/hackathon-agent-brief.md) and [contributions](docs/hackathon-contributions.md)

The Brisky engine predates the hackathon. The contribution record distinguishes existing
functionality, event-developed changes and planned or unverified work.

Optional local archive face matching uses the existing workers app. Run
`pnpm setup:faces` on API/face-worker hosts, build the API, then use
`pnpm --filter @brisky/workers start --faces-only` for local face work without
indexing consumers. Enable per-person library matching in People & Entities.
Matches require review; cross-recording quality is still limited. See
[scope, measured results and setup](docs/face-archive-processing.md).
