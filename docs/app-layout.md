# Application layout and small-source reads

Updated 2026-11-01. This event work reorganizes existing Brisky applications and extends
the pre-existing connector/decoder pipeline; it does not introduce a new media engine.

`apps/api` owns the HTTP engine and shared processing modules. `apps/workers` owns the
standalone queue bootstrap and depends on the API package for those modules. The API's
old worker scripts forward to the new app. Worker role flags are set before imports;
the worker uses a Nest application context without an HTTP listener. Runtime import
validation (`--check`) does not start consumers. Shared modules are still physically
inside API; extracting them into a separate library remains possible future work.

The previous `frontend` directory, including its private `.env.local`, moved to
`apps/web`. Its existing independent workspace/lockfile and package-manager version are
preserved and excluded from root workspace installation. Maintained scripts and docs
use the new path; the Spaces migration now resolves the sibling API schema correctly.
The historical Vite prototype also used `apps/web` before retirement; the path now holds
the current Next.js SaaS, not that prototype.

The root README and each app README describe installation, configuration, startup and
build/check commands. API/workers use root `.env`; Next.js uses `apps/web/.env.local`.
Provider selection, OAuth redirect URLs and database names are unchanged by the move.

`scheduler-processor.spec.ts` created root `test-storage-f5` each time it constructed a
processor. It now uses `os.tmpdir()` plus `mkdtempSync` and removes that unique directory
after each test. The old empty generated directory was removed. Private diagnostics and
legacy generated test storage are ignored; this does not hide application source.

Indexing decoder sessions now cache sources of at most 8 MiB by default, within their
existing transfer limit. `INDEX_SMALL_FILE_CACHE_MB=0` restores range-only operation;
the configurable cap cannot exceed 64 MiB. Each source is read in bounded blocks, checked
for exact byte ranges/lengths and validated before/after caching and after processing.
Subsequent decoder seeks use the same cached bytes. Larger files retain the prior range
path; this does not promise GB-scale throughput or distributed cache behavior.

Validation: 28 decoder/scheduler/streamed-indexing regressions, API build/TypeScript,
web TypeScript, frozen offline root lockfile validation, worker syntax/import check and
actual moved-web `/login` HTTP 200 passed. Live no-inference Drive caching decoded all
32 samples with zero missing frames and read exactly 4,182,700 cloud bytes.
[Cached-source evidence](hackathon-evidence/2026-11-01-frame-coverage-cached.json).
The earlier uncached strict queue checks timed out or rejected a missing required frame;
they are not full passes. The cached full queue check passed eight units, all 32
prepared/observed frames, speech/embeddings, native video, retry and checkpoint replay.
Its temporary queue/asset/private files and one derived upload were removed; existing
vectors remained. [Full evidence](hackathon-evidence/2026-11-01-drive-remote-full-queue-strict-frames.json).
Docker worker image and production deployment have not been built/validated here.
