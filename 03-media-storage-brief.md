Absolutely. Here’s a **short agent brief** you can drop directly into the project context.

# Media Storage, Remote Access & Connector Architecture Brief

## 1. Core Principle

The product should **not become a media-storage company**.

Users should be able to connect existing media storage—Google Drive, Dropbox, OneDrive, S3, etc.—and keep their original media there.

Our platform primarily stores:

* asset metadata
* extracted intelligence
* embeddings
* transcripts
* detected entities
* scenes/moments
* relationships
* timestamps
* asset/connector references

**The user's media remains in their own storage whenever possible.**

> **Storage belongs to the user. Intelligence belongs to us.**

---

## 2. Two Primary Media Access Modes

### Mode A — Intelligence Only

User connects a storage source or indexes media locally.

```text
User Media
    ↓
Indexer / Desktop Agent
    ↓
Frame + Video Analysis
    ↓
Media Intelligence
    ↓
Our Database
```

The original media is **not permanently uploaded to our infrastructure**.

The user can access their intelligence from any device:

> Phone → Search → Find relevant moment → See timestamp/metadata.

However, if the source device/storage isn't remotely accessible, the actual video cannot be played from the new device.

This is acceptable and should be an intentional product behavior.

---

### Mode B — Remote Media Access

Users can optionally make media remotely accessible.

**Do NOT automatically generate/upload proxies for the entire library.**

Instead use an **adaptive, demand-driven system**.

Possible representations:

1. Original/reference
2. Thumbnail/preview
3. Low-resolution preview
4. Adaptive proxy
5. Extracted/derived clip
6. Original-quality file when explicitly required

The user should not need to understand the technical concept of "proxy."

The UX should be something like:

> **Make available remotely**

rather than:

> **Sync 720p proxy**

---

# 3. Proxy System

The current fixed:

```text
4K/1080p → 720p
```

approach is insufficient.

A 360p video may actually become **larger** after being transcoded to 720p, as demonstrated during testing.

Therefore proxy generation must be **adaptive**.

Example:

```text
4K       → 720p
1080p    → 720p/480p
720p     → 480p
480p     → 360p
360p     → 360p/240p or original
Highly compressed → potentially original
```

Before storing/syncing a proxy, compare:

* original size
* proxy size
* resolution
* bitrate
* codec
* duration
* expected quality

If the proxy doesn't provide meaningful size savings:

> **Don't create/sync it.**

A proxy means **optimized remote representation**, not automatically "720p."

---

# 4. Demand-Driven Media Sync

The most important optimization:

### Don't sync everything.

Example:

User has:

> 20 GB / 500 videos

They search:

> "Find videos of me playing football."

The intelligence layer finds:

```text
match.mp4
01:42:13 – 01:42:27
```

If the user wants it remotely:

```text
Extract only 01:42:13–01:42:27
             ↓
Upload derived clip
             ↓
User accesses it remotely
```

Instead of:

```text
20 GB
 ↓
Generate 20 GB of proxies
 ↓
Upload 20 GB
```

This makes bandwidth/storage usage proportional to **what the user actually needs**.

---

# 5. Generated Assets Should Never Modify Originals

Never overwrite the user's source media by default.

Instead, create a dedicated area:

```text
User Storage
│
├── Original media
│
└── Brisky/
    ├── previews/
    ├── proxies/
    ├── clips/
    └── exports/
```

Generated assets remain clearly distinguishable from source assets.

Where a provider supports an application-specific/private folder, prefer that.

---

# 6. Connectors

Connectors are a fundamental part of the architecture, not an afterthought.

### Initial connector priorities

**P0**

* Google Drive
* Dropbox
* OneDrive
* Amazon S3 / S3-compatible storage

**P1**

* Box
* Google Cloud Storage
* Cloudflare R2
* pCloud
* deeper Microsoft/SharePoint support

Later:

* NAS/WebDAV
* SFTP
* Google Photos
* iCloud
* Vimeo
* Frame.io
* other media-specific platforms

---

# 7. Connector Abstraction

Do not build application logic specifically around Google Drive/Dropbox/etc.

Create a common connector interface:

```text
MediaConnector

├── authenticate()
├── listAssets()
├── getAsset()
├── getMetadata()
├── downloadAsset()
├── uploadAsset()
├── createFolder()
├── deleteAsset()
├── watchChanges()
└── getChanges()
```

Then implement:

```text
GoogleDriveConnector
DropboxConnector
OneDriveConnector
S3Connector
BoxConnector
...
```

The intelligence layer should not care where an asset lives.

It should reference something like:

```text
asset_id
connector_id
provider
provider_asset_id
path/location
version
metadata
intelligence
```

---

# 8. Change Detection Is Critical

The connector system must detect:

* new files
* modified files
* deleted files
* moved/renamed files where possible
* permission changes
* unavailable/offline sources

Example:

```text
Monday
video.mp4
hash = ABC
size = 2GB
       ↓
Indexed

Wednesday
video.mp4
hash = XYZ
size = 2.4GB
       ↓
Asset changed
       ↓
Re-index
```

The system should **not blindly reprocess everything**.

---

# 9. Remote Access Hierarchy

Think of remote access as four levels:

```text
LEVEL 0
Intelligence
↓
Search / Q&A / metadata / moments

LEVEL 1
Preview
↓
Thumbnails / lightweight visual representations

LEVEL 2
Remote Media
↓
Adaptive proxy or selected derived clip

LEVEL 3
Original
↓
Original-quality asset/download where accessible
```

This allows the product to remain useful even when it doesn't possess the actual media.

---

# 10. Future: Source-Device Streaming

A future desktop agent could act as an authenticated media gateway.

```text
Phone
  ↓
Brisky
  ↓
Desktop Agent
  ↓
Local original
  ↓
Requested timestamp/segment
  ↓
Phone
```

This could allow remote playback **without permanently uploading the video to our infrastructure**.

However, this is **not an MVP requirement**. It introduces NAT traversal, security, connectivity, offline-device and bandwidth complexity.

---

# 11. Product Philosophy

The architecture should ultimately enable:

> **Your media can live anywhere. Brisky understands it everywhere.**

The user shouldn't have to migrate their library into our ecosystem.

Google Drive, Dropbox, OneDrive, S3, a NAS, or a local computer are simply different **media sources**.

Our competitive advantage is the intelligence layer sitting above them.

### The key architectural principle:

> **Storage is replaceable. Intelligence is portable.**

This should guide all decisions around indexing, proxies, derived clips, remote access and connectors.
