# Brisky workers

Standalone worker application consuming BullMQ `indexing-queue` and optional
PostgreSQL face-archive jobs. It opens **no HTTP port**.
Starting workers can process existing jobs and trigger paid AI requests.

From the repository root:

```sh
pnpm install --frozen-lockfile
docker compose up -d postgres redis
pnpm dev:worker
```

Development startup builds the API shared modules, then watches the worker entry point.
After changing shared engine code, rebuild/restart the worker.

For a built deployment:

```sh
pnpm build:api
pnpm build:workers
pnpm --filter @brisky/workers start
```

After building the API, check runtime imports without consuming jobs:

```sh
node apps/workers/src/main.cjs --check
```

Configuration comes from the root `.env`. The entry point sets `IS_WORKER=true` before
loading modules and sets `RUN_WORKER_IN_API=false`. It reuses the API's Nest modules and
dependencies via `@brisky/api`; this is a separate executable, not duplicated engine code.
Queue consumers start after application initialization, connector registration and startup
reconciliation complete. Verify this lifecycle without infrastructure using
`node --test apps/workers/src/main.test.cjs` from the repository root.

Face recognition is optional and is **not downloaded on worker startup**. Manual
scans run on the API host; automatic library scans run here after per-person opt-in.
Prepare the isolated runtime on each host performing face work:

```sh
pnpm setup:faces
pnpm setup:faces --check
```

The command installs dependencies and verifies/downloads the model files; no manual
model hunting is needed. See [face setup](../../docs/local-face-matching.md).

For only local face jobs, with indexing consumers and connector polling disabled:

```sh
pnpm build:api
pnpm --filter @brisky/workers start --faces-only
```

Requires `FACE_RECOGNITION_ENABLED=true`. `FACE_ARCHIVE_WORKER_ENABLED=false`
pauses archive consumption globally. Enable each person in the People panel;
default opt-in is off. Review is required before suggestions become searchable tags.
See [archive scope, results and limits](../../docs/face-archive-processing.md).

Optional container:

```sh
docker compose --profile factory up --build worker
```

API/workers need the same database, Redis and durable usage journal. Do not reset the
journal to gain allowance. Multi-host storage/budget coordination remains separate work.
See [root setup](../../README.md) and [budget controls](../../docs/ai-budget-controls.md).
