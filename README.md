# Brisky — AI Media Intelligence Platform

> **Connect your media once. We continuously understand it, so you can find any moment by simply describing what you remember.**

An intelligence layer that continuously analyzes and indexes video archives, enabling sub-second natural language retrieval to the exact timestamp—combining **Whisper speech transcription**, **FFmpeg scene/keyframe analysis**, and **Gemini multimodal video reasoning** into a unified PostgreSQL + pgvector knowledge store.

---

## 🏛️ Core Architectural Principle

> **"We keep the intelligence, not the tape."**

Unlike traditional media tools that duplicate and hoard massive camera master files:
1. Originals stay in the user's storage (Google Drive today). Brisky downloads them only into ephemeral scratch.
2. Indexing produces intelligence + a thumbnail. **720p proxies are generated on demand**, not for every file.
3. After a successful index, scratch (including the downloaded master) is deleted. Search, transcripts, and durable keyframes remain.

---

## 📁 Repository Layout

This is a **pnpm monorepo**. Please use `pnpm`, not `npm` or `yarn`.

```text
brisky/
├── apps/
│   ├── api/                 # NestJS 11 + Fastify API & BullMQ worker (/api/v1)
│   └── web/                 # React 18 + Vite + Tailwind CSS dashboard
├── infra/
│   └── postgres/init.sql    # First-boot PostgreSQL initialization (pgvector)
├── storage/                 # Local filesystem storage roots (ephemeral & proxies)
│   ├── uploads/             # Dev-only upload scaffold (disabled by default)
│   ├── proxies/             # On-demand preview cache (LRU, not an archive)
│   ├── thumbnails/          # Cover thumbnails
│   ├── keyframes/           # Durable Stage-2 inspection frames
│   ├── clips/               # Extracted moment cache
│   └── scratch/             # Ephemeral per-job workspace (purged after each job)
├── docker-compose.yml       # PostgreSQL 16 (pgvector) + Redis 7
├── project-brief.md         # Product thesis & architectural principles
├── phase-plan.md            # Phased execution plan (Phase 0 -> Phase 8)
└── package.json             # Root monorepo workspace scripts
```

---

## ⚡ Prerequisites

Ensure your system has the following installed before starting:

1. **Node.js**: `v20.x` or higher (`node -v`)
2. **pnpm**: `v9.x` or `v10.x` (`corepack enable && pnpm -v`)
3. **Docker & Docker Compose**: Required for PostgreSQL + pgvector & Redis (`docker compose version`)
4. **FFmpeg & FFprobe**: Required on system PATH for video decoding, scene cut detection, and proxy generation:
   - **macOS:** `brew install ffmpeg`
   - **Ubuntu/Debian:** `sudo apt update && sudo apt install -y ffmpeg`
   - **Windows:** `winget install Gyan.FFmpeg` or `choco install ffmpeg`
   - *Verify by running:* `ffmpeg -version` and `ffprobe -version`
5. **Google Gemini API Key**: Required for multimodal frame/video analysis and text embeddings.
   - Obtain a key from [Google AI Studio](https://aistudio.google.com/).

---

## 🚀 Quickstart Guide

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd brisky

# Install all monorepo dependencies
pnpm install
```

### 2. Configure Environment Variables

Copy the example environment template:

```bash
cp .env.example .env
```

Open `.env` in your editor and set your **Gemini API Key**:

```env
# AI Keys (Required for video indexing and vector search)
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001

# Database & Redis (defaults match docker-compose.yml)
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/brisky
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 3. Start PostgreSQL + Redis (Docker)

```bash
pnpm infra:up
```

*This spins up:*
- **PostgreSQL 16 with pgvector** on `localhost:5432` (database: `brisky`).
- **Redis 7** on `localhost:6379` (BullMQ async queue).

### 4. Run the Development Servers

Brisky implements an **independent Media Factory architecture**: the API and Web applications run independently from heavy video/AI compute workers.

```bash
# Terminal 1: Web Dashboard & Backend API
pnpm dev

# Terminal 2: Standalone Indexing Worker (consumes the queue)
pnpm dev:worker
```

- **Web Dashboard:** [http://localhost:5173](http://localhost:5173)
- **API Health Check:** [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health)

*(Optional) Running services individually:*
```bash
pnpm dev:api     # API server only
pnpm dev:web     # Web dashboard only
pnpm dev:worker  # Worker process only
```

---

## 🔑 Authentication & Demo Credentials

When opening [http://localhost:5173](http://localhost:5173), an authentication dialog will appear.

### Option A: One-Click Quick Demo Login
Click the **"Quick Demo: Sign In as Demo Creator"** button at the bottom of the login modal.

### Option B: Pre-seeded Credentials
- **Email:** `demo@brisky.local`
- **Password:** `demopassword123`

### Option C: Register a New Account
You can register new isolated user accounts directly in the modal. All assets, search results, and observation logs enforce strict per-user multi-tenancy.

---

## 🎬 How to Test the Platform

Once logged into the dashboard, follow this end-to-end walkthrough:

### 1. Connect Cloud Media (Google Drive)
- Click the **"Connect Media"** button in the top navigation bar.
- Authorize your Google Drive account.
- Select the folder(s) containing video footage you wish to monitor.
- Click **"Sync Now"**: Brisky discovers video assets directly without transferring permanent master storage onto Brisky servers.
*(Note: Drag-and-drop direct upload is a development-only scaffold disabled by default via `ENABLE_DEV_UPLOAD=false`).*

### 2. Observe the Asynchronous Indexing Pipeline
- Ensure your worker is running (`pnpm dev:worker`).
- Click over to the **Job Observability** tab.
- Watch real-time, stage-by-stage progress:
  1. **Connector Fetch & Metadata Probe:** Ephemeral download/stream and shot boundary detection via FFmpeg.
  2. **Speech Extraction & Transcription:** Whisper speech-to-text with word-level timestamps.
  3. **Visual Frame Analysis:** Representative keyframe selection & object/action detection.
  4. **Gemini Contextual Video Reasoning:** Macro-narrative and temporal event understanding.
  5. **Intelligence Merge & Vector Embeddings:** Consolidated `media_segments` with pgvector embeddings.
  6. **Ephemeral Scratch Purge:** Downloaded master video bytes are discarded; durable keyframes & vector intelligence persist.

### 3. Natural Language Moment Search
Navigate to the **Search** tab and try different query classes:
- **Spoken Queries:** *"when did they talk about the budget"*, *"any mention of pricing"*
- **Visual Actions:** *"person getting into a car"*, *"goal celebration"*, *"wearing a black jacket"*
- **On-Screen Text / OCR:** *"presentation slide with charts"*, *"text on screen"*
- **Thematic Concepts:** *"awkward silence"*, *"team excitement"*

**Search Features:**
- Sub-50ms local execution via PostgreSQL Full-Text (BM25) + pgvector (HNSW) Reciprocal Rank Fusion.
- Modality badges clearly indicate how the match was found (`Speech`, `Visual`, `Semantic`, or `Fusion`).
- **Click any result card** $\to$ The player seeks to that second. If no preview exists yet, generate one on demand (or extract the moment as a clip).

### 4. Inspect Asset Lineage & Deduplication
- Sync the same Drive file twice (or enable the hidden upload scaffold).
- Matching checksums reuse existing transcripts, keyframes, and embeddings.
- Click **"Lineage"** on an asset card to view the relationship graph.

### 5. Run the Automated Benchmark Suite
- Open the **Benchmark** tab and click **"Run 8-Query Benchmark"**.
- Evaluates 3 visual, 3 spoken, and 2 mixed multimodal queries against your indexed assets, verifying timestamp accuracy, retrieval speed, and match calibration.

### 6. Verify "Kept the Intelligence, Not the Tape"
- After a Drive index finishes, `storage/scratch/` for that job should be gone.
- Search still finds the moments. Thumbnails and durable keyframes remain.
- Playback: if no proxy is cached, the player shows **Generate 720p Preview** (on-demand job). It does not require the original master on Brisky's disk.

---

## 🛠️ Common Troubleshooting

### 1. `ffmpeg` or `ffprobe` not found
- Ensure FFmpeg is installed and accessible from your terminal (`ffmpeg -version`).
- If using non-standard binary paths, specify `FFMPEG_PATH` and `FFPROBE_PATH` in `.env`.

### 2. Docker Port Conflicts (5432 or 6379)
- If you already have a local PostgreSQL or Redis server running, stop them or update `DB_PORT` and `REDIS_PORT` in `.env` and `docker-compose.yml`.

### 3. Gemini API 503 / 429 Errors
- If you encounter rate limits on Gemini, verify that `GEMINI_MODEL=gemini-2.5-flash` is set in `.env` (it has higher rate limits and lower latency than experimental models).
- The pipeline includes built-in retry backoff and concurrency throttling (`GEMINI_MAX_CONCURRENCY=2`).

### 4. Stopping Background Infrastructure
To shut down the Docker database and queue containers:

```bash
pnpm infra:down
```

To also delete database volumes and start fresh:

```bash
docker compose down -v
```

---

## 📜 Monorepo NPM Scripts Reference

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Starts API and Web dev servers in parallel |
| `pnpm dev:api` | Starts only the Fastify + NestJS backend (`http://localhost:3000`) |
| `pnpm dev:web` | Starts only the Vite React frontend (`http://localhost:5173`) |
| `pnpm dev:worker` | Starts the standalone BullMQ indexing worker process |
| `pnpm build` | Compiles both API and Web packages for production |
| `pnpm infra:up` | Boots PostgreSQL (pgvector) and Redis in Docker |
| `pnpm infra:down` | Stops PostgreSQL and Redis containers |
