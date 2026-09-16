# VPS & Factory Worker Deployment Runbook (Phase F7)

This runbook documents the deployment of the Brisky Media Factory worker as a standalone container on a VPS or dedicated Docker host.

---

## 1. Architecture Overview

Under **Phase F7 ("Factory image and VPS: still one provider: 'our Docker host'")**, the factory worker is fully decoupled from the API filesystem:

- **Zero-Shared-Filesystem Contract**: Worker and API communicate strictly through **PostgreSQL** and **Redis**. No shared NFS, EFS, or host volume bind-mount is required.
- **Direct Remote Media Ingestion**: The worker streams or downloads media directly from cloud providers (e.g., Google Drive) into container-local ephemeral scratch space (`/app/storage/scratch`).
- **Database-Backed Previews**: Thumbnails extracted during indexing (320x180 JPEG, ~5–15 KB) are encoded as base64 data URIs and stored directly in PostgreSQL (`media_assets.thumbnail_data`). The remote API server serves thumbnails via `GET /api/v1/media/:id/thumbnail` without needing local disk access.
- **Auto-Purged Ephemeral Scratch**: All scratch files are strictly cleaned up upon job completion, cancellation, or failure. Master video files are purged immediately after analysis.

```
+-------------------+           +------------------+
|    Web / Client   |           |   Google Drive   |
+---------+---------+           +--------+---------+
          |                              | (direct download/upload)
          v                              v
+---------+---------+           +--------+---------+
|     API Host      |           | Factory Worker   |
| (Zero Shared Disk)|           | (VPS / Container)|
+----+---------+----+           +----+--------+----+
     |         |                     |        |
     |         +-------+     +-------+        |
     v                 v     v                v
+----+------+      +---+-----+--+       +-----+-----+
| PostgreSQL|      | Redis Queue|       | Container |
| (Metadata |      | (BullMQ    |       | Ephemeral |
| + Thumbs) |      | Scheduling)|       | Scratch   |
+-----------+      +------------+       +-----------+
```

---

## 2. VPS System Requirements

### Recommended Hardware Specs
- **CPU**: 2–4 vCPUs (FFmpeg audio extraction and frame sampling benefit from multi-core).
- **RAM**: 4 GB minimum (8 GB recommended for concurrent 4K media handling).
- **Disk**: 30–50 GB NVMe/SSD. The worker uses isolated ephemeral scratch space capped by `WORKER_FULL_DOWNLOAD_MAX_MB`.
- **OS**: Ubuntu 22.04 LTS / Debian 12 / Rocky Linux 9.

### Software Prerequisites
- **Docker Engine**: version 24.0+
- **Docker Compose**: version 2.20+

---

## 3. Environment Variables

Create `/opt/brisky/.env` on the VPS host:

```env
# Application Mode
NODE_ENV=production
IS_WORKER=true
RUN_WORKER_IN_API=false

# Database & Queue Connectivity (Points to your DB/Redis host)
DATABASE_URL=postgresql://postgres:<password>@<db-host>:5432/brisky
REDIS_HOST=<redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>

# AI Services
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_MODEL=gemini-2.5-flash

# Worker concurrency & scratch (must match apps/api env names)
GLOBAL_MAX_ACTIVE_JOBS=2
DEFAULT_USER_SLOTS=1
INTERACTIVE_RESERVED_SLOTS=1
WORKER_SCRATCH_MAX_MB=512
WORKER_FULL_DOWNLOAD_MAX_MB=16384
STORAGE_ROOT=/app/storage
ENABLE_CONNECTOR_POLLING=false
```

---

## 4. Container Build & Run

### Option A: Running via Docker Compose (Recommended)

In the repository root on the VPS:

```bash
# Build and launch the factory worker container using the "factory" profile
docker compose --profile factory up -d --build worker

# Check logs
docker compose logs -f worker
```

### Option B: Running as Standalone Container

```bash
# Build image
docker build -f Dockerfile.worker -t brisky/media-worker:latest .

# Run container
docker run -d \
  --name brisky-worker \
  --restart unless-stopped \
  --env-file /opt/brisky/.env \
  -v factory-scratch:/app/storage/scratch \
  brisky/media-worker:latest
```

---

## 5. Verification & Telemetry

### 1. Verify Worker Connectivity
Inspect the container logs to verify database connection and BullMQ queue registration:
```bash
docker logs --tail 50 -f brisky-worker
```
Expected output:
```text
[Nest] LOG [WorkerBootstrap] Media Factory Worker started in standalone process.
[Nest] LOG [BullModule] Successfully connected to redis://...
[Nest] LOG [IndexingProcessor] Worker registered for queue: indexing-queue
```

### 2. Verify Capacity Snapshot via API
From your API host or monitoring tool, query the indexing stats endpoint:
```bash
curl -H "Authorization: Bearer <token>" https://api.brisky.app/api/v1/indexing/stats
```
Expected response:
```json
{
  "activeWorkers": 1,
  "globalMaxSlots": 2,
  "defaultUserSlots": 1,
  "activeSlots": 0,
  "availableSlots": 2,
  "waitingForSlot": 0
}
```

### 3. Verify Zero-Shared-Disk Thumbnail Delivery
When a new asset is indexed by the remote worker:
1. Worker generates a 320x180 JPEG in local scratch.
2. Worker saves base64 data to `media_assets.thumbnail_data`.
3. The API server instantly serves the thumbnail via:
   ```bash
   GET /api/v1/media/:assetId/thumbnail
   ```
   No file exists on the API host disk; the image is streamed directly from database memory with `image/jpeg` content type and HTTP caching headers.

---

## 6. Maintenance & Troubleshooting

### Stalled Job Auto-Reconciliation
If the worker container or VPS restarts unexpectedly while jobs are active:
- The API's `IndexingService.reconcileStalledJobs()` automatically detects non-active jobs on boot and marks them as `failed` with actionable error text ("Interrupted by server restart. Click Retry to re-index.").
- Ephemeral scratch directories created for interrupted jobs are purged automatically on the next startup or through container cleanup.

### Scratch Space Exceeded
If an uncompressed file exceeds `WORKER_FULL_DOWNLOAD_MAX_MB`:
- The worker halts processing before downloading, logs `scratch_exhausted`, and fails the job gracefully.
- Adjust `WORKER_FULL_DOWNLOAD_MAX_MB` in `/opt/brisky/.env` if your workflow expects larger files.
