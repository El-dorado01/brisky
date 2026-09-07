# Recommended Phase Plan

**Status:** Execution sequence. Companion to `project-brief.md`, not a replacement.

**How to use this file:**
- `project-brief.md` is the product thesis and architectural principles.
- This file is the build order. If the two conflict, **this file wins on sequence and scope**.

**Non-negotiable product rule:**
The product is **not** an upload-and-store media library.

Upload exists in early phases as a **test scaffold** so we can prove the intelligence layer in a local browser without fighting Drive APIs, NAS paths, or desktop sandboxing.

After the intelligence layer is proven:

1. Web app → Google Drive and other cloud connectors. No user upload of masters.
2. Desktop app → local disks, NAS, and other local sources. No user upload of masters.
3. Upload path is removed from the product.

---

## 0. What we are actually proving, in order

| Order | Question | If the answer is no |
| :--- | :--- | :--- |
| 1 | Can we understand **one** video well enough to jump to the right second? | Stop. Do not build connectors, desktop, or a platform. |
| 2 | Does that still work across **many** videos, asynchronously, with visible progress? | Fix the pipeline and queue. Do not add Drive. |
| 3 | Is search good enough on real messy footage, at a cost we can survive? | Change models, sampling, or retrieval. Do not scale ingest. |
| 4 | Can we index media **without keeping the original**? | The product thesis is dead. Do not pretend connectors are a later polish. |
| 5 | Can Drive (web) stay in sync as files appear, change, and disappear? | Then the product is still a one-shot importer. |
| 6 | Can a desktop agent index local/NAS libraries the same way? | Then we only have a cloud-connector app, not the full thesis. |

Do not skip ahead because the UI looks empty. An empty UI with a working moment-search loop is a product. A full dashboard with mediocre search is not.

---

## 1. Hard rules for every phase

### 1.1 Upload is a connector, not the product

Implement ingest behind a connector interface from day one:

```text
Connector
  discover()
  getSourceLocator(asset)   // local path, upload key, signed URL, later Drive
  getByteRange(asset, start, length)
  onChanged / onDeleted     // no-op for upload
```

The first implementation is `UploadConnector`.

When we rip upload out, we delete that connector and its storage bucket/folder. We do **not** rewrite search, segments, embeddings, or the worker pipeline.

### 1.2 Masters are not our business

Even during the upload test:

- Treat uploaded files as **scratch input**, not a media archive.
- Always produce a web-playable proxy/thumbnail for the browser.
- Preview goes through our streaming endpoint, never through “this file lives in our product storage forever.”
- Intelligence (segments, transcripts, observations, embeddings) is the durable layer.
- Original upload bytes may be deleted after a successful index. Do this for at least some test assets before Phase 4 so the “no master storage” muscle is real.

### 1.3 Hybrid pipeline is the thing being tested

Do not “just send the video to Gemini” because upload makes that easy.

Every indexed video in Phase 1+ must run:

```text
FFmpeg metadata
  → scene / shot detection
  → representative frames
  → cheap visual analysis
  → transcription
  → Gemini native video understanding
  → intelligence merge
  → embeddings
  → search
```

The point of early phases is to **measure** which path is cheaper, faster, and more accurate for which query types — not to pick a winner in advance.

### 1.4 One beachhead

Do not customize the app for every ICP in `project-brief.md`.

Default test library: **event / wedding / small-agency footage** (talking-head + b-roll + crowd + some speech). Sports-academy “find John celebrating” is deferred until we have person identity as an explicit later capability.

### 1.5 What never enters an early phase

- Kubernetes
- Dedicated vector DB
- Desktop app
- Drive / Dropbox / OneDrive / NAS
- Developer API, API keys, usage billing
- BYOK
- Organizations / team permissions
- Media graph / duplicate registry
- Rights management
- Full editor
- Face identity as a product feature
- Mobile apps

---

## 2. Target architecture (all phases, even when most of it is dormant)

```text
Browser (later: Desktop)
        │
        ↓
   NestJS API
        │
        ├─ Auth (from Phase 2)
        ├─ Search
        ├─ Connectors          ← Upload now, Drive next, Local later
        └─ Jobs
              │
              ↓
         Redis + BullMQ
              │
              ↓
           Workers
              │
      FFmpeg / Whisper / Vision / Gemini
              │
              ↓
     Postgres + pgvector
       assets, segments, observations,
       transcripts, embeddings, jobs
```

Frontend stays React + Vite + Tailwind. No Next.js.

The consumer app talks to `/api/v1/...` from the start so a public API is a later exposing exercise, not a rewrite.

---

## Phase 0 — Runway

**Goal:** A repo that can run locally with one command and do nothing impressive.

### Build

- Monorepo or simple `apps/api` + `apps/web` layout
- Docker Compose: PostgreSQL (pgvector) + Redis
- NestJS + Fastify skeleton
- React + Vite + Tailwind skeleton
- Env/config, `/api/v1` prefix, database migrations
- Health endpoints
- FFmpeg available to the worker process (container or documented host install)

### Do not build

- Auth
- Upload UI
- Search
- Job UI
- Connector framework beyond an empty module

### Exit criteria

- `docker compose up` brings up Postgres + Redis
- API boots and serves a health check
- Web app boots against the API
- A worker process can spawn FFmpeg and print `ffmpeg -version`

---

## Phase 1 — One video, find the moment

**Goal:** Prove the intelligence layer.

This is the most important phase. Upload is allowed **only** because it is the fastest way to get a file from a local browser into the pipeline.

### User loop

```text
Open local web app
  → upload one video
  → wait until it is indexed
  → type “find the person sitting in a car”
  → see a result with timestamp
  → click it and the player jumps there
```

### Build

**Ingest**

- Single-file upload to local disk or a local object folder (`storage/uploads/`)
- `UploadConnector` implementing the connector interface
- Asset row with `source_type = upload`, checksum, metadata, status

**Pipeline (can be one worker with ordered stages)**

1. Probe metadata (duration, codec, size, resolution)
2. Scene/shot detection
3. Representative frame extraction (on scene changes, not 1 fps)
4. Cheap frame analysis → raw observations JSON
5. Audio extract + transcription with word/segment timestamps
6. Gemini native video analysis → raw observations JSON
7. Intelligence merge into `media_segments` (visual scenes as the primary time windows; speech/OCR projected in)
8. Embeddings for each segment
9. Store provider/model/version on every AI write

**Playback**

- Generate a web-safe H.264 (or similar) proxy if the source codec will not play in Chrome
- Thumbnail at a representative frame
- `GET /api/v1/media/:id/stream` with range requests
- Player that accepts `start_time` and seeks

**Search (deliberately simple)**

- Natural-language query
- Vector search over segment embeddings **and** full-text search over transcript
- Return: asset, start, end, thumbnail, description, score
- No re-ranking model yet

**Benchmark harness (required, not optional)**

For the test video, record:

| Query | Expected time | Result time | Hit? | Path that found it (transcript / visual / gemini / fusion) | Index cost | Index duration |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |

Run at least **8 queries**: 3 visual, 3 spoken, 2 mixed.

Also record:

- Minutes of source vs minutes to index
- Cost per minute of source, broken down by stage
- Frames actually sent to vision models
- Timestamp error in seconds

Keep raw outputs on disk for the first video (`metadata.json`, `scenes.json`, `transcript.json`, `visual.json`, `gemini.json`, `segments.json`). This is the `/test-video` experiment, just sitting behind an upload button.

### Do not build

- Accounts
- Multi-file queue UI
- Collections
- Clip export
- OCR as a dedicated subsystem (only if it falls out of the vision pass)
- Drive
- “Delete original after index” as a product setting — but **manually** delete the original of one successful asset and confirm search + proxy playback still work

### Exit criteria

A stranger can use the local app, upload a 2–5 minute video they have never tagged, search in plain language, and land on the right second.

Plus, on paper:

1. Timestamp error usually ≤ 2–3 seconds for clear queries
2. Spoken queries are solved primarily by transcript, not Gemini
3. We know Stage-1 cost per minute of video
4. We know whether Gemini native video, the frame pipeline, or transcript won each query class
5. Search still works after the original upload bytes are deleted, using proxy + intelligence only

### Kill / pivot criteria

Stop and redesign the pipeline if:

- We cannot reliably hit obvious moments on a clean test video
- Stage-1 cost is high enough that a 200-hour archive would be absurd
- Gemini-only is the only thing that works **and** it is too expensive to run on a library

Do not “fix” this by starting Drive.

---

## Phase 2 — A library, still upload, still local

**Goal:** The intelligence loop survives more than one file, and the product starts to feel like a library rather than a demo script.

Upload is still the only ingest path. That is intentional.

### User loop

```text
Create an account
  → upload a handful of videos (10–50, not 4,000)
  → see discovery / queued / processing / indexed / failed
  → search across the whole library
  → play hits without waiting for the entire library
  → retry a failed file
```

### Build

- Auth (email/password or a single OAuth provider — keep it boring)
- Multi-file upload
- BullMQ job per asset, stage-level job progress
- Media library page: thumbnail, filename, duration, source, status
- Indexing dashboard: discovered / indexed / processing / failed / remaining
- “Searchable content is available now” — do not block search on full completion
- Dead-letter + manual retry
- Job observability: job id, asset, stage, provider, model, timings, error, retry count, cost if available
- Simple user isolation (`user_id` on assets). No organizations yet.

### Processing rules

- Never index inside the HTTP request
- Prioritize smaller / recently uploaded files first
- Cap concurrent FFmpeg and AI calls
- Persist raw observations **and** merged segments

### Do not build

- Collections
- Clip extraction
- Connectors other than upload
- Organizations
- Billing
- Fancy query interpretation

### Exit criteria

- 20+ videos can be uploaded and indexed without babysitting
- A failure on one file does not stall the queue
- Search returns timestamped hits from more than one asset
- Progress is honest
- Re-uploading the same file (same checksum) does not blindly re-spend AI budget

---

## Phase 3 — Search quality and unit economics

**Goal:** Decide whether this is a product or a demo that got lucky.

Still no Drive. Still upload. Use a **real** messy library (mixed codecs, long interviews, event b-roll, noisy audio), not a perfect 2-minute sample.

### Build

- Query interpretation (visual vs speech vs metadata vs mixed)
- Hybrid retrieval with Reciprocal Rank Fusion:
  - lexical / BM25-style search on transcripts (and OCR text if present)
  - vector search on segment embeddings
  - hard filters: duration, date, status
- Optional Stage-2: only for low-confidence or explicitly visual-hard queries, run deeper Gemini/frame verification on candidate segments and re-rank
- OCR as a real stage if the test library has slides, signs, or screen recordings that users will search for
- Relevance feedback in the UI: “this is the moment” / “wrong” — store it. Do not build ML on it yet.
- Cost dashboard per asset and per stage (internal is enough)

### Benchmark set

Freeze a set of 30–50 queries against a known library with expected assets + timestamps. Re-run after every retrieval change.

Measure:

- Recall@5 at timestamp tolerance (e.g. overlap with expected window)
- Median timestamp error
- Cost per hour indexed (Stage 1 vs Stage 2)
- p50 / p95 query latency

### Do not build

- Connectors
- Desktop
- Editor
- Public API

### Exit criteria

- Spoken queries are consistently good
- Visual queries are useful often enough to demo without cherry-picking one clip
- We have a written Stage-1 cost per hour and a Stage-2 policy
- We know which pipeline stages are mandatory vs optional
- A second person can sit down, search their own uploaded footage, and not feel tricked

If this phase fails, we still have not wasted a Drive integration.

---

## Phase 4 — Kill upload. First real connector: Google Drive (web)

**Goal:** The product thesis starts. Media stays in Drive. We store intelligence, thumbnails, and short-lived scratch.

Upload is removed from the product UI in this phase, or hidden behind an internal flag for pipeline debugging only.

### Why Drive second, not first

Drive is where bandwidth, OAuth, rate limits, and “we still have to read the bytes” get real. Doing it before search works would have mixed two unsolved problems. Doing it now tests the architecture we already have:

```text
Connector.discover()
  → media_assets (external_file_id, no master copy)
  → worker fetches bytes ephemerally
  → intelligence + proxy/thumb
  → purge scratch
  → search
```

### Build

- Google Drive OAuth
- Connector account storage: tokens encrypted at rest, never sent to the frontend after auth
- File discovery, media-type filter, folder selection
- Incremental foundation: create / modify / delete / move using Drive file ids
- Workers pull via signed URL / download into scratch, process, delete scratch
- Prefer range requests and **audio-first** when a query class does not need video bytes yet
- Deletion: mark asset deleted, remove from active search, keep raw intelligence according to a retention rule
- Same library, search, and player UX as Phase 2 — source column now says Drive
- Re-index only when content actually changed (checksum / Drive version / size+mtime heuristic)

### Upload teardown

- Remove upload from onboarding and library
- Keep `UploadConnector` code behind a flag only if it still helps pipeline tests
- Delete uploaded masters from test storage
- Confirm every playback path works from proxy + Drive-sourced scratch, never from “our copy of the original”

### Do not build

- Dropbox / OneDrive / NAS
- Desktop
- Full change-webhook sophistication if polling is enough for the first Drive slice
- Team Drive permission mazes

### Exit criteria

- User connects Drive, picks a folder, and searches without uploading
- New file in that folder becomes searchable without a full rescan
- Deleted Drive file disappears from search
- Original video is not retained on our disk after a successful index (proxy/thumb only)
- Drive rate limits and a large file (multi-GB) have been tested, not just a 20MB mp4

---

## Phase 5 — Continuous intelligence on web connectors

**Goal:** It feels like a living index, not a one-time import.

### Build

- Drive change notifications or a robust poller with cursors
- Modified-file detection that does not re-embed unchanged media
- Index versioning (`index_version`, `analysis_version`)
- Selective reprocessing: e.g. re-transcribe without re-running Gemini
- Connector plugin shape documented with a second connector — **one** of Dropbox or OneDrive, not both
- Per-connector sync status and last-error on the dashboard

### Do not build

- Desktop
- Five more connectors
- Media graph

### Exit criteria

- Leave the app overnight against a real Drive folder; morning state matches reality
- A renamed/moved file keeps its intelligence
- A replaced file (same name, new bytes) is re-indexed
- Adding the second cloud connector does not fork the worker pipeline

---

## Phase 6 — Desktop: local disks, then NAS

**Goal:** The professional library. This is where “no upload” becomes true for the people with RAID cages and wedding-season SSDs.

Web stays connector-based. Desktop is a new client that hosts a local worker, not a browser pretending it can read `D:\Card1`.

### Why desktop is here, not in Phase 1

The browser cannot see local professional storage. Shipping local-folder indexing as a web feature would have been a fake version of Jumper. We needed the intelligence layer and the connector interface first so the desktop agent is another connector + worker, not a second product.

### Build

- Desktop shell (Tauri preferred over Electron unless we hit a wall)
- User grants folders; OS-native folder picker
- `LocalFolderConnector` with file watch + periodic scan
- Same job pipeline, either:
  - local worker writes intelligence to the same backend, or
  - fully local mode later — **start hybrid:** process locally or on LAN, store intelligence in the existing API
- Local playback of originals via the desktop player when the file is present
- Offline-tolerant index: search still works if the drive is disconnected; playback says the volume is offline
- Web-safe proxy still generated for the web app, if the same library is visible there
- NAS as “a local folder on a network volume” first, not a custom NAS appliance

### Do not build

- Windows service / always-on indexing appliance as v1
- Premiere / Resolve plugins
- Custom GPU stack

### Exit criteria

- Point the desktop app at a real folder of camera footage and search it without copying files into our cloud
- Unplug the drive: search results remain; play shows offline
- Reconnect: play works, new files queue
- A Drive-indexed asset and a locally-indexed asset appear in one search for one user

---

## Phase 7 — From finding to using

**Goal:** The moment is useful, not just visible.

Only start this when Phases 3 and 4 (search quality + at least one no-upload source) already feel good.

### Build

- Save a result
- Collections of moments (not folders of files)
- In/out trim on the player
- Extract clip (FFmpeg, async job, download)
- Optional: concatenate a handful of clips to a rough export

### Do not build

- Timeline editor
- Captions/aspect-ratio studio
- “Make me a Reel from my product launch”
- NLE roundtrip (EDL/XML/Premiere) — that is a later integration, likely desktop-first

### Exit criteria

- User finds three moments, saves them, exports one clip, without thinking about filenames

---

## Phase 8 — Developer surface (late on purpose)

**Goal:** The same APIs the app already uses, cleaned up and documented.

### Build

- API keys
- Public docs for search / connectors / media / collections
- Webhooks for index-complete / index-failed
- Usage meters (not necessarily billing)

### Still later than this phase

- BYOK
- SDKs
- Marketplace
- Organization billing

### Exit criteria

- A third party can connect a source (or use ours) and call `POST /api/v1/search` to get timestamped hits
- Our web app uses the same documented routes

---

## 3. Upload teardown checklist (do not improvise this)

When Phase 4 starts, upload must die as a product path:

1. Onboarding copy changes from “Upload your videos” to “Connect your media.”
2. Library has no upload button.
3. `UploadConnector` is flag-only or deleted.
4. Object storage / `storage/uploads` is wiped.
5. `source_type=upload` assets are either migrated to a connector or marked retired.
6. Every test in CI that indexed via upload is rewritten against a fixture connector or Drive sandbox.
7. Playback tests never assume the original bytes are on our disk — only proxy, or a connector locator.

If we cannot complete this checklist, we accidentally became a storage product.

---

## 4. Suggested calendar (small team, honest)

These are order-of-magnitude, not commitments.

| Phase | What “done” feels like | Rough duration |
| :--- | :--- | :--- |
| 0 | Repo runs | A few days |
| 1 | One video, right second, cost sheet | 1–2 weeks |
| 2 | 20+ videos, async, progress | 2–3 weeks |
| 3 | Search is actually good | 2–4 weeks of iteration |
| 4 | Drive, no upload, no retained masters | 3–5 weeks |
| 5 | Continuous sync + second cloud connector | 2–4 weeks |
| 6 | Desktop local/NAS | 4–8 weeks |
| 7 | Collections + clip extract | 2–3 weeks |
| 8 | Public API | when the app is stable |

If Phase 1 or 3 slips, later phases wait. They do not get staffed in parallel “to save time.”

---

## 5. Immediate next actions (Phase 0 → 1)

1. Scaffold the repo and Compose stack.
2. Add `UploadConnector` and a single-file upload page.
3. Implement the hybrid pipeline as one worker with explicit stages.
4. Pick **one** representative test video (speech + visual cut + a searchable object/scene).
5. Ship the search box + timestamp player.
6. Fill the benchmark table before writing any Drive code.
7. Delete the original bytes of that test asset and confirm the product still works.

That last step is the whole company in miniature: **we kept the intelligence, not the tape.**
