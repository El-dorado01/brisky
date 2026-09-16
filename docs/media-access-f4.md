# Phase F4 — Ranged & Bounded Media Access Documentation

## 1. Overview & Core Philosophy
Phase F4 of the Brisky Ephemeral Media Factory implements the architectural principle:
> **"The factory does not need the whole file on disk to do useful work. We keep the intelligence, not the tape."**

Rather than treating remote connectors as bulk file-downloaders, Brisky interacts with media via capability-aware connectors, bounded scratch quotas, ranged stream slicing, and immediate master disk purges.

---

## 2. Connector Capabilities Matrix
Every connector implementing `MediaConnector` and `Connector` explicitly declares its operational capabilities:

```typescript
export interface ConnectorCapabilities {
  can_read: boolean;
  can_write: boolean;
  can_stream: boolean;
  can_range_read: boolean;
  supports_webhooks: boolean;
  supports_signed_urls: boolean;
  supports_large_files: boolean;
}
```

| Provider | `can_read` | `can_write` | `can_stream` | `can_range_read` | `supports_webhooks` | `supports_signed_urls` | `supports_large_files` | Scope Notes |
|---|---|---|---|---|---|---|---|---|
| **Google Drive** (`google_drive`) | ✅ `true` | ✅ `true` | ✅ `true` | ✅ `true` | ✅ `true` | ❌ `false` | ✅ `true` | Write restricted to `drive.file` scope (Brisky folder) |
| **Upload / Local** (`upload`) | ✅ `true` | ❌ `false` | ✅ `true` | ✅ `true` | ❌ `false` | ❌ `false` | ✅ `true` | Local POSIX byte offsets (`fs.createReadStream`) |

---

## 3. Bounded Scratch Quota
To prevent worker nodes from running out of disk space:

1. **`WORKER_SCRATCH_MAX_MB`** (default: 512) — cap for *working buffers* (ranged clip slices, temp files). This is **not** applied to a full-file Drive download. A 600 MB lecture must still be indexable while index_asset uses full download.
2. **`WORKER_FULL_DOWNLOAD_MAX_MB`** (default: 16384) — hard cap for a single full-file connector download. Raise this if you index huge masters. Exceeding it fails with `scratch_exhausted` and the `WORKER_FULL_DOWNLOAD_MAX_MB` name in the error.
3. **Master purge timing**: Gemini native video analysis needs the master file on disk. The worker runs `analyzeVideo` **while the file exists**, then unlinks it. Transcription uses extracted audio; frame analysis uses durable keyframes. Transcribe-only jobs still purge the master immediately after audio demux.

---

## 4. Ranged Media Access & Container Fallback Mechanics
When extracting video subclips (`job_type: 'extract_clip'`) from remote masters (e.g. 10 GB source videos):

1. **Ranged Slice Attempt**:
   - If connector has `can_range_read = true`, duration and file size are known from the parent media asset.
   - The worker calculates the estimated byte range with safety padding:
     $$\text{startByte} = \max(0, \lfloor(\text{startS} - 5) \times \text{byteRate}\rfloor)$$
     $$\text{endByte} = \min(\text{fileSize}, \lceil(\text{endS} + 5) \times \text{byteRate}\rceil)$$
   - A stream slice is fetched via `connector.getByteRange(auth, remoteId, startByte, length)`.
   - FFmpeg decodes the subclip from the ranged slice.
   - On success, `access_mode = 'range_read'` is recorded along with `bytes_read` (typically orders of magnitude smaller than full file size, e.g. 70 MB vs 10,240 MB).

2. **Transparent Fallback**:
   - If the video container requires metadata not present in the slice (e.g. MP4 with `moov` atom at EOF without faststart header), FFmpeg rejects the slice.
   - The worker logs an explicit warning (`[Phase F4] Ranged clip extraction failed for asset X; falling back to full download`).
   - The worker cleanly falls back to downloading the full master into scratch, cuts the subclip, purges the master video immediately, and records `access_mode = 'full_download'`.

---

## 5. Observability & Timings
Every indexing, proxy, clip, and transcribe job persists execution metrics to the `indexing_jobs` table:
- `access_mode`: `'range_read'`, `'full_download'`, or `'local'`.
- `bytes_read`: Total master bytes fetched from connector or local disk.
- `timings`: Stage breakdowns including download duration, transfer speed (`mbPerSec`), and `peakScratchBytes` footprint.

---

## 6. Audio-First & Transcribe-Only Pipeline (§587)
For jobs targeting spoken intelligence only (`job_type: 'transcribe'` or `'extract_audio'`):
1. The worker pulls only what is required to extract `audio.wav`.
2. As soon as audio is demuxed, the master video file is **purged immediately** before transcription begins.
3. Transcription executes against the lightweight audio stream, leaving 0 MB of full-file leftovers on disk after completion.
