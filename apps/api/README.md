# Brisky engine API

NestJS/Fastify engine endpoints for media retrieval, connectors and indexing dispatch.
The separate SaaS API lives in `apps/web`. Shared processing modules remain in this
package and are reused by `apps/workers`.

From the repository root:

```sh
pnpm install --frozen-lockfile
docker compose up -d postgres redis
pnpm dev:api
```

Configure the root `.env` from `.env.example`. Default port: **3001**.
For optional face-match scans, run `pnpm setup:faces` from the repository root,
then `pnpm setup:faces --check`. Set `FACE_RECOGNITION_ENABLED=true` only after
setup passes. This runtime lives in `.venv-face`; it is separate from Whisper.
See [setup, limits and validation](../../docs/local-face-matching.md).
Health: `http://localhost:3001/api/v1/health`. Keep `IS_WORKER=false` and
`RUN_WORKER_IN_API=false`; start workers separately when processing is intended.

Streaming voice uses the same API process and an authenticated WebSocket upgrade
on port 3001; no worker or extra app is required. The `meta-mms` profile uses
Meta transcription/dialogue and a resident local MMS child process provisioned
with `pnpm setup:mms`. The explicit `live` option retains Gemini Live.
See [Meta voice setup](../../docs/meta-mms-voice.md) and
[provider boundary](../../docs/voice-provider-transition.md).

```sh
pnpm build:api
pnpm --filter @brisky/api run start:prod
pnpm --filter @brisky/api test
```

See [root setup](../../README.md), [environment groups](../../docs/environment-configuration.md)
and [API contract](../../docs/api-contract-and-pagination.md).
