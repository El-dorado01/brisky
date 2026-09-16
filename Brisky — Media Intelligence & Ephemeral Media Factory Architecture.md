# Brisky — Media Intelligence & Ephemeral Media Factory Architecture

## 1. Purpose of This Document

This document defines the current architectural direction for Brisky's media intelligence platform, with particular focus on:

- cloud media connectors
- keeping original media in the user's storage
- temporary media processing
- the new **split application + Media Factory architecture**
- ephemeral workers
- streaming/bounded media buffering
- parallel processing
- worker concurrency and plan limits
- job queues and retries
- failure recovery
- on-demand proxy generation
- on-demand clip extraction
- remote media playback
- the Brisky developer/API platform
- scalability and cost control

This should be treated as the current architectural direction unless a later technical investigation proves a better implementation.

---

# 2. Product Principle

Brisky is **not a cloud storage product**.

The fundamental product idea is:

> **The user's media stays where it already lives. Brisky builds intelligence about it.**

Users should be able to connect sources such as:

- Google Drive
- Dropbox
- OneDrive
- S3-compatible storage
- Backblaze
- Wasabi
- NAS
- local/external storage where supported

The existing product architecture already defines this principle: Brisky primarily stores asset identity, metadata, intelligence, embeddings, transcripts, relationships, timestamps and source references rather than becoming the user's permanent media storage provider.

The core conceptual separation is:

```text
USER OWNS THE MEDIA

Google Drive
Dropbox
OneDrive
S3
NAS
External SSD
etc.

        ↓

BRISKY UNDERSTANDS THE MEDIA

Media Registry
Metadata
Transcripts
Visual intelligence
Embeddings
Entities
Relationships
Moments
Timestamps
Search index
```

A useful internal philosophy:

> **Storage belongs to the user. Intelligence belongs to Brisky.**

---

# 3. What Brisky Actually Sells

Brisky should not primarily be thought of as:

- an AI video editor
- a cloud storage service
- a video transcoding service
- a media upload platform
- a traditional media asset manager

The core product is:

> **A media intelligence layer that understands what exists inside a user's media library.**

The fundamental user problem is:

> **“I remember what I need, but I don't remember where I stored it.”**

Instead of searching by:

- filename
- folder
- date
- manual tags

the user searches by meaning.

Examples:

```text
Find videos where I'm driving.

Find the interview where the guest talks about AI.

Find every clip of this person.

Find the moment someone mentions pricing.

Find footage from our 2024 event.

Find the shots where the speaker is standing on stage.
```

The result should ultimately identify the **moment**, not merely the file:

```text
event_2024.mp4

02:14:32 → 02:15:07

CEO discusses expansion plans.
```

Timestamp-level retrieval is a core requirement.

---

# 4. The Critical Architectural Realization

There was an initial assumption that:

> If the user's media lives in Google Drive, Brisky should somehow process it while it physically remains inside Google Drive.

That is generally not how this works.

The connector provides access to the media. The actual computation still has to happen somewhere.

For previously unseen video, Brisky must ultimately read the media bytes somehow.

Therefore:

> **“The original media never becomes permanent Brisky storage” is the achievable principle — not “the media can never leave the connector.”**

The current Google Drive implementation downloads media into a scratch directory, processes it, then deletes it.

That behavior is **not fundamentally wrong**.

The problem is making that the long-term architecture without separating media processing from the main Brisky application.

---

# 5. The New Core Architecture: Split Brisky from the Media Factory

The preferred architecture is now:

```text
                    ┌──────────────────────────┐
                    │       BRISKY APP         │
                    │                          │
                    │ API                      │
                    │ Web application          │
                    │ Authentication           │
                    │ Billing / plans          │
                    │ Media Registry            │
                    │ Connectors                │
                    │ Search                    │
                    │ Intelligence DB           │
                    │ Developer API             │
                    └────────────┬─────────────┘
                                 │
                            Job Queue
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │      MEDIA FACTORY       │
                    │                          │
                    │ Ephemeral workers        │
                    │ Temporary buffers        │
                    │ FFmpeg                   │
                    │ Frame extraction         │
                    │ Audio extraction         │
                    │ Media analysis            │
                    │ AI processing             │
                    │ Proxy generation         │
                    │ Clip extraction          │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │    BRISKY INTELLIGENCE   │
                    │                          │
                    │ Metadata                 │
                    │ Transcripts              │
                    │ Embeddings               │
                    │ Moments                  │
                    │ Entities                 │
                    │ Relationships            │
                    │ Search index             │
                    └──────────────────────────┘
```

The Media Factory is **not Brisky storage**.

It is a disposable processing environment.

Its job is:

```text
Receive job
    ↓
Access referenced media
    ↓
Process media
    ↓
Persist useful intelligence/derived output
    ↓
Clean temporary data
    ↓
Terminate/release resources
```

---

# 6. The Media Factory Should Be Independent

The factory must not own:

- users
- subscriptions
- authentication
- billing
- application business logic
- permanent media libraries
- developer API authentication
- long-term media storage

The factory should receive a processing job and execute it.

For example:

```text
Job
{
    asset_id: "asset_123",
    source_id: "drive_456",
    operation: "index",
    segment: {...},
    priority: "normal"
}
```

The worker processes the job and reports:

```text
completed
failed
retrying
```

This separation allows the same worker container to run on:

- a VPS during early development
- Cloud Run
- Modal
- RunPod
- another container platform
- dedicated infrastructure
- eventually multiple providers

The application does not need to know which provider is currently executing the job.

---

# 7. Why This Is Better Than Putting Workers Inside the Main App

The main Brisky application should remain responsible for:

```text
Users
Accounts
Plans
Connectors
Media Registry
Search
API
Billing
Intelligence
```

The factory should be responsible for:

```text
Heavy media computation
```

This prevents FFmpeg/video processing from consuming the resources required for:

- API requests
- search
- authentication
- webhooks
- connector synchronization
- database operations

It also makes the factory independently scalable.

---

# 8. Ephemeral Workers

A worker should be disposable.

Conceptually:

```text
Job arrives
    ↓
Create worker
    ↓
Give worker temporary compute + workspace
    ↓
Read/process media
    ↓
Persist results
    ↓
Delete temporary media
    ↓
Destroy worker
```

This is an **ephemeral compute model**.

Cloud platforms already provide infrastructure that can support this pattern. For example, Cloud Run provides ephemeral disk attached to instances and supports workloads involving large files, while AWS Lambda provides configurable temporary `/tmp` storage. 

GPU-oriented platforms such as RunPod also provide serverless/containerized worker infrastructure capable of scaling GPU workloads according to demand. 

The exact provider should be evaluated separately. The architecture should remain provider-agnostic.

---

# 9. The Factory Is Not a Giant Storage Pool

A critical principle:

> **Temporary processing capacity should scale according to concurrent work, not according to the total size of all users' libraries.**

Suppose:

```text
1,000 users
```

each have:

```text
5 TB
```

That does NOT mean Brisky needs:

```text
5 PB
```

of temporary storage.

The system only needs enough temporary working capacity for the media being processed **right now**.

For example:

```text
200 concurrent workers
×
25 MB working buffer
=
5 GB active buffer capacity
```

The actual required capacity depends on the pipeline, decoder behavior, codec, buffering and concurrency, but the important architectural principle is:

```text
Temporary capacity
≈
Concurrent processing
×
bounded working memory/storage per worker
```

not:

```text
Temporary capacity
≈
total user media
```

---

# 10. Streaming / Bounded Buffering

The preferred media-processing model is not:

```text
Download entire 2 GB file
        ↓
Save 2 GB to disk
        ↓
Process
        ↓
Delete 2 GB
```

Instead, where technically supported:

```text
Remote connector
       ↓
stream/ranged read
       ↓
small bounded buffer
       ↓
decoder
       ↓
frames/audio
       ↓
analysis
       ↓
release buffer
       ↓
read more
```

Conceptually:

```text
Google Drive
     │
     ▼
  Media stream
     │
     ▼
┌───────────────┐
│ bounded       │
│ buffer        │
│ 10–50 MB etc. │
└───────┬───────┘
        ↓
     decoder
        ↓
    processing
        ↓
   intelligence
```

This means the factory does not need to materialize the entire source file.

---

# 11. Important: Do Not Treat 50–100 MB as a Video Segment Definition

The earlier idea was:

> 50–100 MB segment → worker

That is useful as a **working-storage/buffering concept**, but it should not necessarily become the definition of a video processing segment.

Video codecs have temporal dependencies.

Arbitrarily splitting:

```text
0–100 MB
100–200 MB
200–300 MB
```

may not correspond to clean decoding boundaries.

Instead, processing segments should preferably be based on things such as:

- timestamps
- keyframes
- GOP boundaries
- scene boundaries
- decoder-safe ranges
- audio boundaries

For example:

```text
Video
│
├── 00:00–02:00
├── 02:00–04:00
├── 04:00–06:00
└── ...
```

The worker can determine which bytes/ranges it needs to access.

Therefore:

> **Use bounded byte buffering internally, but use media-aware/time-based segmentation for jobs.**

---

# 12. Streaming Does Not Eliminate Network Transfer

This must remain clear.

Streaming means:

> We do not need to store the entire file before processing it.

It does NOT mean:

> The video bytes magically do not travel over the network.

If:

```text
Google Drive
        ↓
Brisky worker
```

then the media bytes still have to travel from Drive to the worker.

Physics still wins.

The optimization is:

```text
Avoid permanent storage
Avoid unnecessary duplication
Avoid downloading more than necessary
Avoid buffering the whole file
Process incrementally
```

---

# 13. The User's Internet Should Not Be Part of the Main Architecture

An alternative considered was:

```text
Cloud connector
      ↓
User's computer
      ↓
Brisky intelligence
```

This would avoid Brisky receiving the media directly, but it creates major UX problems:

- consumes the user's internet bandwidth
- requires the user's machine to be available
- requires the computer to stay awake/on
- requires local processing resources
- creates the "babysitting" problem
- indexing can stop when the computer disconnects

Therefore this should **not be the primary cloud connector processing architecture**.

It may eventually exist as an optional local/desktop indexing mode.

---

# 14. The Preferred Flow

For cloud-connected media:

```text
User
 ↓
Connect Google Drive
 ↓
Brisky discovers assets
 ↓
Media Registry records them
 ↓
Indexing jobs created
 ↓
Job Queue
 ↓
Media Factory
 ↓
Ephemeral Worker
 ↓
Read/stream media from connector
 ↓
Decode / sample / extract
 ↓
AI analysis
 ↓
Persist intelligence
 ↓
Discard temporary media
 ↓
Worker terminates
```

The original file remains in Google Drive.

Brisky keeps the knowledge.

---

# 15. Media Registry

Brisky should maintain a durable registry for every connected asset.

At minimum:

```text
Asset
├── id
├── source
├── source_file_id
├── path
├── filename
├── MIME type
├── size
├── duration
├── created_at
├── modified_at
├── hash
├── perceptual fingerprint
├── availability
├── indexing status
└── intelligence reference
```

This is already part of the intended architecture.

The registry should know:

> Where does this media live?

It should NOT need to own:

> The actual media bytes.

---

# 16. Continuous Indexing

Connecting a source is not a one-time import.

Brisky should maintain the relationship with the connector.

Example:

```text
Google Drive
     ↓
Initial discovery
     ↓
10,000 assets
     ↓
Index
     ↓
Intelligence
```

Later:

```text
New file
   ↓
Change detected
   ↓
Create indexing job
   ↓
Process only new asset
   ↓
Update intelligence
```

If a file is deleted:

```text
File deleted
     ↓
Change detected
     ↓
Registry updated
     ↓
Search result removed/marked unavailable
```

This creates persistent media memory.

---

# 17. Job Queue Is Essential

The Media Factory should not be invoked directly by random API requests.

Use a durable job queue.

```text
Connector
    ↓
Media Registry
    ↓
Job creation
    ↓
Queue
    ↓
Scheduler
    ↓
Worker
```

Examples of jobs:

```text
DISCOVER_ASSET
INDEX_VIDEO
EXTRACT_AUDIO
TRANSCRIBE
ANALYZE_FRAMES
GENERATE_EMBEDDINGS
GENERATE_PROXY
EXTRACT_CLIP
REPROCESS_SEGMENT
```

Each job should have a durable state.

Example:

```text
queued
processing
completed
failed
retrying
cancelled
```

---

# 18. Worker Concurrency Should Be Controlled by Processing Slots

Do not literally give users permanent workers.

Instead, plans define **maximum concurrent processing slots**.

Example:

```text
Free
1 concurrent processing slot

Starter
2

Pro
5

Business
10

Enterprise
custom
```

A "slot" means:

> This account is allowed to have this many processing jobs actively running at once.

It does NOT mean:

> This account owns five machines.

---

# 19. Global Capacity Must Also Exist

Plan limits alone are insufficient.

Imagine:

```text
1,000 Pro users
×
5 slots
=
5,000 theoretical concurrent jobs
```

Brisky may not want or be able to run 5,000 workers.

Therefore there must also be a **global capacity limit**.

Example:

```text
Brisky global capacity
=
200 concurrent workers
```

The scheduler enforces both:

```text
Per-user entitlement
        +
Global infrastructure capacity
```

So:

```text
User A: Free
allowed = 1

User B: Pro
allowed = 5

User C: Pro
allowed = 5
```

but the global scheduler determines how many can actually execute at the current moment.

Excess jobs remain queued.

---

# 20. Queue Priority

The scheduler should eventually support priorities.

For example:

### Interactive

```text
User searched for something
↓
Needs a preview immediately
```

### Normal

```text
Regular library indexing
```

### Batch

```text
Index my entire 5 TB library
```

Interactive work should generally be prioritized over enormous background indexing jobs.

Otherwise one large library could consume the entire factory.

---

# 21. Speed Matters as Much as Cost

Avoid optimizing only for:

> "We don't use the user's internet."

A system that doesn't consume the user's bandwidth but takes several days to index a library is not a great product.

The objective is:

> **Fast enough indexing at sustainable cost.**

Speed depends on:

```text
Connector throughput
+
network throughput
+
video decoding
+
frame extraction
+
AI inference
+
worker concurrency
+
queue scheduling
+
database writes
```

The system should measure these independently.

---

# 22. Parallel Processing

A video can potentially be divided into independent processing ranges.

Example:

```text
500 MB video

Worker 1 → segment A
Worker 2 → segment B
Worker 3 → segment C
Worker 4 → segment D
Worker 5 → segment E
```

Instead of:

```text
A → B → C → D → E
```

we can do:

```text
A ─┐
B ─┤
C ─┼──→ parallel
D ─┤
E ─┘
```

This can dramatically reduce wall-clock indexing time when:

- the segments are independently decodable
- connector bandwidth can support parallel reads
- CPU/GPU resources are available
- AI provider limits allow parallel requests

However:

> **More workers does not automatically mean proportionally faster processing.**

Eventually the bottleneck becomes:

- source bandwidth
- CPU
- GPU
- AI API rate limits
- network
- database
- connector limits

The scheduler should therefore be designed around measured bottlenecks rather than assuming unlimited linear scaling.

---

# 23. Failed Segment Handling

Every processing segment should be an independent durable job.

Example:

```text
Video A

Segment 1 → completed
Segment 2 → completed
Segment 3 → failed
Segment 4 → completed
Segment 5 → completed
```

Do NOT restart the whole video.

Instead:

```text
Segment 3
   ↓
retry
   ↓
worker
   ↓
success
```

The system should persist successful segment results immediately.

This allows:

```text
Worker dies
↓
completed results remain
↓
only incomplete jobs are retried
```

---

# 24. Retry Policy

Each job should have:

```text
attempt_count
last_error
last_attempt_at
next_retry_at
```

Example:

```text
Attempt 1 → failed
Attempt 2 → failed
Attempt 3 → success
```

After repeated failure:

```text
Attempt 1 ❌
Attempt 2 ❌
Attempt 3 ❌
      ↓
Dead-letter / manual inspection
```

Do not endlessly retry broken media.

Failure categories should eventually be distinguished:

```text
Transient network failure
Connector rate limit
Temporary AI failure
Decoder failure
Corrupt media
Unsupported codec
Permission revoked
Source file deleted
```

Different failures deserve different handling.

---

# 25. Checkpointing

Do not wait until the entire video finishes before persisting intelligence.

Persist progressively.

For example:

```text
Video
│
├── Segment 1 → intelligence saved
├── Segment 2 → intelligence saved
├── Segment 3 → intelligence saved
├── Segment 4 → intelligence saved
└── Segment 5 → intelligence saved
```

Then:

```text
ALL COMPLETE
     ↓
Finalize asset index
```

This makes indexing resumable.

It also allows partial intelligence to potentially become available before the entire library has finished processing.

---

# 26. Intelligence Should Be Durable

The factory's temporary media should disappear.

The useful intelligence should not.

Potential persistent data:

```text
Asset metadata
Transcript
Scene information
Frame observations
Objects
People
Actions
OCR
Embeddings
Moments
Temporal relationships
Entity relationships
Confidence/relevance
Processing provenance
```

The existing project direction already emphasizes persistent intelligence, relationships and temporal understanding rather than treating embeddings or individual detections as the core moat.

---

# 27. The Intelligence Pipeline

The initial pipeline can remain hybrid.

Potential flow:

```text
Remote video
     ↓
Media inspection
     ↓
FFmpeg
     ↓
Frame/audio extraction
     ↓
Sampling / scene detection
     ↓
Custom visual pipeline
     ↓
Transcription
     ↓
Gemini / multimodal AI
     ↓
Embeddings
     ↓
Structured intelligence
     ↓
Search index
```

The current project direction already calls for experimentation across frame extraction, scene detection, frame sampling, transcript generation, visual analysis, Gemini video understanding, embeddings, search and timestamp retrieval.

---

# 28. Do Not Send Every Frame to an Expensive AI Model

Processing efficiency matters.

The factory should have multiple stages.

Potentially:

```text
Raw video
   ↓
Cheap inspection
   ↓
Scene/keyframe detection
   ↓
Sampling
   ↓
Audio/transcript
   ↓
Relevant frames
   ↓
Expensive multimodal analysis
```

This allows Brisky to reduce unnecessary AI inference.

The goal is not:

> Analyze every possible byte/frame with the most expensive model.

The goal is:

> **Extract enough information to build reliable searchable intelligence.**

---

# 29. Proxy Architecture — Change the Current Approach

The current behavior of automatically creating proxies in Brisky's server-side `proxies` folder should NOT become the permanent architecture.

The earlier proxy investigation established that a fixed:

```text
4K/1080p → 720p
```

rule is insufficient.

For example, a low-resolution source may actually become larger when transcoded to a supposedly smaller proxy.

Therefore:

> **A proxy is an optimized representation, not synonymous with 720p.**

---

# 30. Proxies Should Be Demand-Driven

Do NOT automatically generate proxies for every connected asset.

Instead:

```text
User connects 20 GB
      ↓
Index intelligence
      ↓
NO full-library proxy generation
```

If the user searches:

```text
Find videos of me playing football.
```

Brisky finds:

```text
match.mp4
01:42:13 → 01:42:27
```

Only when the user needs remote playback or extraction should Brisky create an appropriate derived representation.

This demand-driven approach was already identified as the preferred strategy.

---

# 31. Possible Media Representations

Brisky should conceptually support:

```text
1. Original/reference
2. Thumbnail
3. Low-resolution preview
4. Adaptive proxy
5. Extracted clip
6. Original-quality media when explicitly required
```

The user should not necessarily see technical terminology such as "proxy."

The UX could say:

> **Make available remotely**

rather than:

> Sync 720p proxy

This was part of the existing media-access architecture.

---

# 32. Where Should Proxies Live?

This is an important distinction.

If the user's connector supports writing files, the preferred architecture should allow derived media to be written back to the user's storage where appropriate.

For example:

```text
Google Drive
├── original.mp4
└── Brisky/
    └── previews/
        └── original.preview.mp4
```

Brisky can retain:

```text
proxy_asset_id
source_id
parent_asset_id
representation_type
```

However, the system should NOT assume every connector supports this equally well.

Connector capabilities should be explicit:

```text
can_read
can_write
can_stream
can_range_read
supports_webhooks
supports_signed_urls
supports_large_files
supports_direct_download
```

If a connector cannot accept derived files, Brisky can use another appropriate temporary/remote representation strategy.

---

# 33. Proxy Generation Should Be Adaptive

Potential strategy:

```text
4K
 ↓
720p

1080p
 ↓
720p / 480p

720p
 ↓
480p

480p
 ↓
360p

360p
 ↓
360p / 240p / original
```

But this is only an example.

Before generating a proxy, compare:

- original size
- resolution
- bitrate
- codec
- duration
- expected quality
- resulting proxy size

If the proxy does not provide meaningful value:

> **Do not create it.**

---

# 34. Clip Extraction Is More Important Than Full Proxy Sync

Suppose the user has:

```text
5 TB
```

and Brisky identifies:

```text
12-second moment
```

The user may only need that 12-second clip.

Therefore:

```text
5 TB library
     ↓
Search
     ↓
12-second moment
     ↓
Extract only that moment
     ↓
Return/store derived clip
```

This is vastly more efficient than making the entire 5 TB library remotely playable.

Editing remains downstream from intelligence rather than being the core product.

---

# 35. Original Media Remains the Source of Truth

Brisky should never treat its generated proxy or derived clip as the canonical asset.

Conceptually:

```text
Original
   │
   ├── Proxy
   ├── Preview
   ├── Extracted clip
   ├── Social crop
   └── Other derivatives
```

The Media Registry should eventually understand these relationships.

The existing architecture already anticipates original/derivative relationships such as:

```text
original.mov
original_proxy.mp4
youtube_export.mp4
instagram_9x16.mp4
client_copy.mp4
```

and treating them as related representations of underlying content.

---

# 36. Remote Playback

Brisky's intelligence can be synchronized across devices without synchronizing the entire media library.

Example:

```text
Laptop / Google Drive
        ↓
Indexing
        ↓
Brisky Intelligence
        ↓
Phone
        ↓
Search
        ↓
Find exact moment
```

If the original source is remotely accessible:

```text
Phone
 ↓
Brisky
 ↓
source reference
 ↓
remote playback
```

If it is not remotely accessible, Brisky can still show:

- timestamp
- metadata
- thumbnail
- intelligence
- search result

but cannot magically play the original.

This should be an intentional behavior rather than a hidden limitation.

---

# 37. Connector Architecture

Start with one connector — currently Google Drive — and make the connector interface extensible.

Potential future connectors:

```text
Google Drive
Dropbox
OneDrive
Google Photos
S3
Backblaze B2
Wasabi
NAS
Network shares
Local folders
External drives
```

The existing architecture explicitly calls for authentication, permissions, indexing, incremental synchronization, new-file detection, deletion detection, large-file access, streaming/ranged access and temporary access mechanisms.

---

# 38. Connector Capability Abstraction

Do not make the Media Factory depend directly on Google Drive.

Instead:

```text
MediaSource
├── getMetadata()
├── getReadStream()
├── getRange()
├── getDownloadUrl()
├── write()
├── delete()
├── subscribeToChanges()
└── checkAvailability()
```

Each connector implements what it supports.

For example:

```text
GoogleDriveConnector
DropboxConnector
S3Connector
```

The factory simply requests media access through the abstraction.

---

# 39. API / Developer Platform

The split factory architecture fully supports the developer platform.

In fact, it makes it cleaner.

Brisky should eventually expose its intelligence layer through APIs.

Potential API capabilities:

```text
POST /media
POST /media/index

GET /media
GET /media/{id}

POST /search
POST /query

GET /moments
GET /entities
GET /relationships

POST /collections
GET /collections
```

The existing project architecture already defines this direction.

---

# 40. Developers Should Not Know About the Factory

A developer might send:

```text
POST /media/index
```

and receive:

```json
{
  "job_id": "job_123",
  "status": "queued"
}
```

Behind the scenes:

```text
Developer
   ↓
Brisky API
   ↓
Media Registry
   ↓
Job Queue
   ↓
Scheduler
   ↓
Media Factory
   ↓
Worker
   ↓
Intelligence
```

The developer does not need to know:

- where the worker runs
- whether it is CPU/GPU
- how much temporary storage it has
- which cloud provider runs it
- how many machines exist

Those are Brisky infrastructure concerns.

---

# 41. Everything Media-Processing Related Should Be Asynchronous

Never make an API request wait for a large indexing job.

Bad:

```text
POST /index
      ↓
wait 30 minutes
      ↓
response
```

Preferred:

```text
POST /index
      ↓
202 Accepted
      ↓
job_id
```

Then:

```text
GET /jobs/{job_id}
```

or webhook:

```text
asset.indexed
asset.processing
asset.failed
```

This becomes essential for developer integrations.

---

# 42. Developer BYO-AI Model

The previously discussed developer platform may eventually allow developers to provide their own AI provider credentials.

For example:

```text
Developer
 └── Gemini API key
```

or:

```text
Developer
 └── OpenAI API key
```

while Brisky maintains:

```text
Media Registry
Intelligence
Relationships
Search
Indexing infrastructure
Retrieval infrastructure
APIs
```

The earlier platform design explicitly separates the developer's AI provider from Brisky's intelligence infrastructure.

This is important because:

> **The AI model should not be Brisky's only moat.**

Brisky's value should increasingly come from the accumulated media intelligence, relationships, temporal understanding, registry and workflow integrations.

---

# 43. Developer API and Consumer App Use the Same Core

The architecture should look like:

```text
                         BRISKY
                           │
                 ┌─────────┴─────────┐
                 │                   │
             Web App             Developer API
                 │                   │
                 └─────────┬─────────┘
                           │
                    Intelligence Core
                           │
                       Job Queue
                           │
                     Media Factory
```

This means we do not build two separate systems.

The consumer product and developer platform are two interfaces over the same intelligence infrastructure.

---

# 44. Processing Plans

Plans should eventually control more than just the number of concurrent workers.

Potential dimensions:

```text
Concurrent processing slots
Monthly indexed hours
AI processing credits
Maximum asset count
Maximum source size
Priority
Retention of derived media
API rate limits
Webhook volume
```

Example:

```text
Free
1 slot
limited monthly processing

Starter
2 slots

Pro
5 slots

Business
10 slots

Enterprise
custom
```

The exact numbers are product/pricing decisions and should not be hardcoded into the architecture.

---

# 45. Global Infrastructure Protection

There should also be platform-level controls:

```text
MAX_GLOBAL_WORKERS
MAX_GLOBAL_GPU_WORKERS
MAX_GLOBAL_TEMP_STORAGE
MAX_GLOBAL_AI_REQUESTS
MAX_CONNECTOR_REQUESTS
```

The scheduler must protect Brisky from:

- traffic spikes
- connector rate limits
- AI API limits
- runaway indexing
- very large accounts
- unexpected costs

---

# 46. Cost Control

The goal is not zero infrastructure cost.

That is unrealistic.

The goal is:

> **No permanent media-storage bill proportional to the total size of user libraries.**

The major costs are:

```text
Compute
+
Network/data transfer
+
AI inference
+
Temporary working resources
+
Intelligence database
```

Storage should primarily scale with:

```text
intelligence
+
metadata
+
embeddings
+
transcripts
+
small derived assets
```

rather than:

```text
original media
```

---

# 47. VPS vs Factory Provider

Two deployment models are acceptable.

## Development / early MVP

A VPS running Docker:

```text
VPS
├── Brisky app
├── Queue
└── Worker containers
```

Advantages:

- cheap
- simple
- familiar Docker environment
- easy to debug
- predictable monthly cost

Disadvantages:

- fixed capacity
- manual scaling
- machine can be idle
- machine can become overloaded

---

# 48. Preferred Long-Term Model: Factory Provider

Separate the factory from the application and run the worker container on ephemeral infrastructure.

Conceptually:

```text
Brisky
 ↓
Queue
 ↓
Factory provider
 ↓
Ephemeral container
 ↓
Process
 ↓
Destroy
```

Potential platforms to investigate include:

- Google Cloud Run
- Modal
- RunPod for GPU workloads
- AWS container/serverless infrastructure
- other container/job platforms

The current investigation should compare providers based on actual Brisky requirements rather than choosing one prematurely.

Relevant dimensions:

```text
CPU
GPU
RAM
ephemeral disk
maximum runtime
startup time
scale-to-zero
concurrency
network bandwidth
egress pricing
regional availability
container support
queue integration
observability
```

---

# 49. Do Not Couple Brisky to One Factory Provider

The worker should be packaged as a Docker image.

For example:

```text
brisky/media-worker:latest
```

The worker should have a stable contract.

Input:

```text
job
asset reference
processing configuration
segment/range
```

Output:

```text
status
intelligence references
derived-file references
metrics
error information
```

This allows:

```text
Today:
VPS

Tomorrow:
Cloud Run

Later:
Cloud Run + Modal + GPU provider
```

without redesigning the intelligence system.

---

# 50. Potential Multi-Factory Architecture

Eventually:

```text
                         Scheduler
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
          CPU Factory    GPU Factory    Specialized
          Cloud Run       RunPod          Worker
              │              │              │
              └──────────────┼──────────────┘
                             ↓
                     Intelligence DB
```

Different jobs can use different resource classes.

For example:

```text
FFmpeg
→ CPU worker

Frame extraction
→ CPU/GPU depending on implementation

Heavy vision model
→ GPU worker

AI API request
→ lightweight worker
```

Do not assume every media operation requires a GPU.

---

# 51. The Media Factory Should Be Resource-Aware

A job should eventually declare its requirements.

Example:

```text
resource_class: cpu
memory: medium
gpu: false
```

or:

```text
resource_class: gpu
gpu_memory: 16GB
```

The scheduler can then route the job appropriately.

This avoids paying GPU prices for work that does not need GPU acceleration.

---

# 52. Media Processing Should Be Incremental

Brisky should never think:

> "Indexing a library is one giant job."

Instead:

```text
Library
 ↓
Assets
 ↓
Videos
 ↓
Processing units
 ↓
Jobs
```

Example:

```text
Library
├── video_001
│   ├── segment_001
│   ├── segment_002
│   └── segment_003
├── video_002
│   ├── segment_001
│   └── segment_002
└── video_003
```

This allows:

- parallelism
- retries
- checkpoints
- progress reporting
- cancellation
- prioritization
- resumption

---

# 53. Processing Progress

The user should eventually see something like:

```text
Indexing your library

1,248 / 3,000 videos

41.6%

Currently processing:
video_1248.mp4

Estimated remaining:
...
```

But the underlying system should measure actual jobs rather than pretending the entire process is one monolithic task.

---

# 54. Cancellation

Jobs should be cancellable.

For example:

```text
User clicks:
Stop indexing
```

The system should:

```text
stop accepting new jobs
cancel queued jobs
allow currently finishing jobs to terminate safely
persist completed intelligence
clean temporary resources
```

The original media remains untouched.

---

# 55. Source Changes During Processing

A connector can change while Brisky is indexing.

For example:

```text
Google Drive
video.mp4
```

is modified or deleted during processing.

The system should verify source state where necessary.

Potential result:

```text
source_changed
source_deleted
source_unavailable
```

The job should not blindly assume the source still exists.

---

# 56. Security Principle

Brisky should access media using the minimum permissions necessary.

Prefer:

```text
read-only
```

for indexing where write access is unnecessary.

Only request write permission when the user explicitly enables functionality that needs it, such as:

```text
Save proxy
Save extracted clip
Create Brisky folder
```

This makes connector authorization easier to explain and safer.

---

# 57. Original Media Should Never Be Modified During Indexing

Indexing should be non-destructive.

The factory should:

```text
READ source
PROCESS
WRITE intelligence
```

not:

```text
READ
MODIFY ORIGINAL
```

Derived files should be separate objects.

---

# 58. Observability

Because processing becomes distributed, the factory needs strong observability.

Every job should have:

```text
job_id
asset_id
segment_id
worker_id
source_id
started_at
completed_at
duration
bytes_read
bytes_processed
AI calls
AI latency
retry_count
error
resource usage
```

This will be essential for answering:

> Why is indexing slow?

and:

> Why did this customer consume so much processing?

---

# 59. Performance Metrics

Track at least:

### Media

```text
bytes read
MB/s
duration processed
```

### Processing

```text
decode time
frame extraction time
audio extraction time
```

### AI

```text
requests
latency
tokens/usage
failures
```

### Factory

```text
worker startup time
worker runtime
CPU utilization
GPU utilization
memory
temporary disk
```

### Product

```text
time-to-first-intelligence
time-to-index
time-to-searchable
```

The most important user-facing metric should eventually be:

> **How quickly does newly connected media become meaningfully searchable?**

---

# 60. Time-to-First-Intelligence

Do not necessarily wait until the entire library is finished.

For a large library:

```text
10,000 videos
```

it may be better to:

```text
discover
 ↓
start processing
 ↓
first 100 videos indexed
 ↓
make searchable
 ↓
continue indexing in background
```

This gives the user value quickly.

The system can then progressively increase coverage.

---

# 61. Search Must Work Against Intelligence, Not Raw Media

Once indexing is complete for a segment:

```text
User query
 ↓
Query understanding
 ↓
Search intelligence
 ↓
Relevant moments
 ↓
Source references
 ↓
Preview / extraction
```

The search system should not need to scan the original videos every time.

That would defeat the entire purpose of persistent intelligence.

The intended search architecture already combines:

- semantic similarity
- structured metadata
- transcript search
- visual observations
- temporal information
- entity relationships
- source permissions
- relevance ranking.

---

# 62. Relationships Matter

Brisky should not be reduced to facial recognition.

A face/person detector is just one signal.

The richer objective is:

> **Understand entities and relationships across time and media.**

Potential relationships:

```text
Person
 ↓
appears in
 ↓
Video

Person
 ↓
speaks about
 ↓
Topic

Person
 ↓
attends
 ↓
Event

Product
 ↓
appears with
 ↓
Person

Event
 ↓
contains
 ↓
Moment
```

This is part of the intended long-term media intelligence direction.

---

# 63. Developer Platform Fits Naturally

The final architecture becomes:

```text
                         BRISKY
                           │
              ┌────────────┴────────────┐
              │                         │
          Brisky App                Brisky API
              │                         │
              └────────────┬────────────┘
                           │
                    Intelligence Core
                           │
                        Queue
                           │
                    Media Factory
                           │
                 Ephemeral Workers
```

The developer platform does not require a different factory.

That is a key architectural advantage.

---

# 64. Potential Future API Use Cases

A developer could build:

### Education

```text
Upload/connect lectures
 ↓
Brisky indexes them
 ↓
Ask questions about course material
 ↓
Return timestamped references
```

### Sports

```text
Connect match footage
 ↓
Find goals / celebrations / players
 ↓
Create collections
```

### Podcast tooling

```text
New episode
 ↓
Index
 ↓
Find strongest moments
 ↓
Create social candidates
```

The existing project direction already envisions automation triggered by new media.

---

# 65. Editing Is Downstream

Brisky does not need to become Premiere.

The intelligence layer can power:

```text
Search
 ↓
Select moments
 ↓
Collection
 ↓
Extract clips
 ↓
Rough cut
 ↓
Editor
```

Possible future creation capabilities include:

- trim
- merge
- reorder
- captions
- aspect ratio conversion
- simple audio
- export
- NLE integrations

But editing should remain downstream from intelligence.

---

# 66. Recommended System Boundaries

The codebase should conceptually separate:

```text
apps/
    web/
    api/

services/
    connectors/
    intelligence/
    search/
    media-registry/
    scheduler/

workers/
    media-worker/

packages/
    media-types/
    job-types/
    connector-contracts/
    intelligence-schema/
```

Exact repository structure is flexible.

The architectural boundary is what matters.

---

# 67. Media Worker Contract

The worker should ideally be stateless.

It should not depend on local persistent state between jobs.

Conceptually:

```text
Worker receives:

{
    job_id,
    asset_id,
    source_id,
    operation,
    segment,
    processing_config
}
```

Worker:

```text
1. Validate job
2. Resolve source
3. Acquire temporary media access
4. Stream/range-read media
5. Process
6. Persist results
7. Report completion
8. Clean temporary state
9. Exit
```

---

# 68. Never Depend on Local Worker State as the Source of Truth

Bad:

```text
worker filesystem
    ↓
"this is what has been processed"
```

Good:

```text
Brisky database
    ↓
durable job state
    ↓
durable intelligence
```

Workers can disappear at any time.

The system should remain recoverable.

---

# 69. The Factory Should Be Replaceable

This is a major requirement.

If the factory provider becomes:

- too expensive
- too slow
- unavailable
- geographically unsuitable
- unable to provide required GPUs

Brisky should be able to replace it.

The application should not need a rewrite.

---

# 70. Initial Implementation Strategy

## Phase 1 — Stabilize Current Local Worker

Keep the current Docker worker.

But refactor it so:

```text
worker
```

is clearly separated from:

```text
application
```

Implement:

- job contract
- worker lifecycle
- temporary workspace
- cleanup
- status reporting
- retry-safe processing
- segment-level checkpoints

Do not optimize for massive scale yet.

---

# 71. Phase 2 — Move Worker to VPS

Use a modest VPS as the first remote factory.

```text
Brisky app
     ↓
Queue
     ↓
VPS worker
```

This validates:

- remote connector access
- temporary media handling
- worker stability
- FFmpeg pipeline
- concurrency
- job retries
- real-world indexing speed

without immediately taking on complicated cloud orchestration.

---

# 72. Phase 3 — Abstract the Factory Provider

Create an internal interface such as:

```text
MediaFactory
├── dispatch(job)
├── cancel(job)
├── getStatus(job)
└── getCapacity()
```

The application should interact with this abstraction.

Then implement:

```text
VPSMediaFactory
```

first.

Later:

```text
CloudRunMediaFactory
ModalMediaFactory
RunPodMediaFactory
```

or other providers.

---

# 73. Phase 4 — Ephemeral Factory Provider

Once the processing pipeline is stable:

```text
Brisky
 ↓
Queue
 ↓
Factory Provider
 ↓
Ephemeral Worker
 ↓
Process
 ↓
Destroy
```

At this stage, evaluate providers using actual benchmark data from Brisky rather than theoretical pricing.

---

# 74. Phase 5 — Intelligent Scaling

Introduce:

```text
per-user concurrency
+
global concurrency
+
priority
+
resource classes
+
autoscaling
```

For example:

```text
Free → 1 slot
Starter → 2
Pro → 5
Business → 10
```

while:

```text
Global capacity = N
```

The scheduler decides which jobs execute.

---

# 75. Phase 6 — Demand-Driven Remote Media

Only after intelligence works reliably:

Implement:

```text
Search result
 ↓
Play remotely
 ↓
Check source accessibility
 ↓
Use original if possible
 ↓
Otherwise generate appropriate preview/proxy
```

And:

```text
Select moments
 ↓
Extract clips
 ↓
Save to user's connector where supported
```

Do not generate proxies for the entire library by default.

---

# 76. Phase 7 — Developer API

Expose:

```text
Media API
Search API
Jobs API
Moments API
Collections API
Entity API
Relationship API
Webhooks
SDKs
```

The developer API should use exactly the same:

```text
Media Registry
Queue
Factory
Intelligence Core
```

as the consumer application.

---

# 77. Phase 8 — More Connectors

Once Google Drive is robust:

```text
Dropbox
OneDrive
S3
Backblaze
Wasabi
NAS
etc.
```

Do not build every connector before the core pipeline is proven.

The existing roadmap explicitly recommends starting with one connector and expanding later.

---

# 78. Phase 9 — Cross-Media Intelligence

After video:

```text
Images
Audio
PDFs
Documents
```

The goal becomes:

> **One intelligence layer across different media types.**

This is already the intended later roadmap.

---

# 79. What NOT to Build Right Now

Do not let the factory architecture create scope creep.

Do not initially build:

- full Premiere competitor
- enterprise MAM
- every cloud connector
- every AI provider
- autonomous editing
- massive collaboration suite
- complex rights management
- complete cross-media knowledge graph
- enterprise permissions system

The project material explicitly identifies these as later concerns.

---

# 80. Non-Negotiable Architectural Principles

The agent should preserve these throughout implementation.

### Principle 1 — Brisky is not storage

Do not turn Brisky into a permanent media warehouse.

### Principle 2 — Original media remains the source of truth

Never unnecessarily duplicate originals.

### Principle 3 — Intelligence is persistent

The knowledge Brisky extracts should survive worker termination.

### Principle 4 — Workers are disposable

A worker can disappear at any moment.

### Principle 5 — Jobs are durable

Processing state belongs in the application/database/queue.

### Principle 6 — Processing is resumable

Never require restarting an entire video because one segment failed.

### Principle 7 — Temporary media is bounded

Do not require temporary storage proportional to the user's entire library.

### Principle 8 — Prefer streaming/ranged access

Where the connector supports it, avoid materializing entire files.

### Principle 9 — Proxies are demand-driven

Do not generate proxies for everything.

### Principle 10 — Plans control concurrency

Plans should grant processing capacity/priority, not dedicated permanent machines.

### Principle 11 — Global capacity protects the platform

Per-user limits are not enough.

### Principle 12 — Speed matters

Optimize for time-to-first-intelligence and time-to-searchable, not merely infrastructure cost.

### Principle 13 — Factory is provider-independent

Do not couple Brisky's core architecture to one compute provider.

### Principle 14 — API and web app share the same intelligence core

The developer platform is not a second product architecture.

---

# 81. The Final Target Architecture

The overall system should ultimately look like:

```text
                         ┌───────────────────────┐
                         │       BRISKY          │
                         │                       │
                         │ Web App               │
                         │ Developer API         │
                         │ Authentication        │
                         │ Billing / Plans       │
                         │ Media Registry        │
                         │ Search                │
                         │ Intelligence DB       │
                         └───────────┬───────────┘
                                     │
                              Connector Layer
                                     │
                  ┌──────────────────┼──────────────────┐
                  ↓                  ↓                  ↓
              Google Drive       Dropbox             S3
                  │                  │                  │
                  └──────────────────┼──────────────────┘
                                     │
                               Job Scheduler
                                     │
                       ┌─────────────┴─────────────┐
                       │                           │
                 Interactive                  Batch Queue
                       │                           │
                       └─────────────┬─────────────┘
                                     │
                              MEDIA FACTORY
                                     │
              ┌──────────────────────┼──────────────────────┐
              ↓                      ↓                      ↓
        CPU Worker              CPU Worker              GPU Worker
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │
                              Temporary media
                                     │
                              decode / extract
                                     │
                             analyze / understand
                                     │
                                     ▼
                          ┌────────────────────────┐
                          │  INTELLIGENCE LAYER    │
                          │                        │
                          │ Metadata               │
                          │ Transcripts            │
                          │ Visual observations    │
                          │ Embeddings             │
                          │ Moments                │
                          │ Entities               │
                          │ Relationships          │
                          │ Temporal knowledge     │
                          └───────────┬────────────┘
                                      │
                                      ▼
                              Natural-language
                                  Search
                                      │
                    ┌─────────────────┼─────────────────┐
                    ↓                 ↓                 ↓
                  Search            Ask             Explore
                    │                 │                 │
                    └─────────────────┼─────────────────┘
                                      │
                              Select moments
                                      │
                         ┌────────────┴────────────┐
                         ↓                         ↓
                  Play / Preview              Extract
                         │                         │
                         ↓                         ↓
                  Original/source          Derived clip
                                             / proxy
                                                  │
                                                  ↓
                                      User's connector
                                      where supported
```

---

# 82. The Core Mental Model for the Agent

The simplest way to remember the entire architecture is:

```text
CONNECTORS
    own the media

BRISKY
    owns the intelligence

QUEUE
    owns the work

FACTORY
    performs the work

WORKERS
    are disposable

DATABASE
    remembers what was learned

PROXIES
    are generated only when useful

DERIVED CLIPS
    are generated when requested

API
    exposes the intelligence to other products
```

Or even shorter:

> **Media stays with the user. Processing happens in a temporary factory. Intelligence stays with Brisky.**

---

# 83. Immediate Engineering Priorities

The next implementation work should be ordered approximately as follows:

### P0 — Worker separation

Separate the current Docker media-processing worker from the main application.

### P0 — Job model

Create durable processing jobs with:

- job ID
- asset ID
- segment ID
- status
- attempts
- priority
- timestamps
- errors

### P0 — Temporary workspace

Ensure every worker has bounded temporary storage and cleans it after completion.

### P0 — No permanent proxy generation

Stop treating the server-side `proxies` directory as permanent media storage.

### P0 — Segment-level checkpointing

Persist successful results immediately.

### P0 — Retry system

Retry failed segments without restarting the entire asset.

### P1 — Streaming/ranged media access

Investigate and implement the most efficient media access method supported by Google Drive.

### P1 — Queue + scheduler

Introduce global and per-user concurrency limits.

### P1 — Processing slots

Implement plan-based concurrency without allocating permanent workers.

### P1 — Benchmark

Measure:

- MB/s from Google Drive
- decoding speed
- frame extraction speed
- AI latency
- indexing time
- worker startup time
- temporary storage usage
- cost per indexed hour

### P2 — VPS factory

Move the worker from local Docker to a remote Docker-capable VPS.

### P2 — Factory abstraction

Make the worker execution provider-independent.

### P2 — Ephemeral provider evaluation

Benchmark Cloud Run / Modal / RunPod / other suitable infrastructure using actual Brisky workloads.

### P3 — Demand-driven remote media

Implement:

- remote playback
- on-demand preview
- adaptive proxy
- clip extraction

### P3 — Developer API

Expose asynchronous indexing/search/jobs/intelligence APIs.

---

# 84. Final Architectural Decision

The current preferred direction is:

> **Do not build Brisky as a media-storage company.**

> **Do not require users to keep their computers running for cloud-library indexing.**

> **Do not attempt to make connectors themselves perform Brisky's intelligence processing.**

Instead:

> **Build Brisky as a media intelligence platform with an independent, disposable Media Factory.**

The factory should:

```text
temporarily access media
        ↓
stream/range-read where possible
        ↓
use bounded temporary buffers
        ↓
process incrementally
        ↓
parallelize safe processing units
        ↓
persist intelligence immediately
        ↓
retry failures independently
        ↓
discard temporary media
        ↓
terminate
```

Brisky should permanently retain:

```text
media registry
+
metadata
+
intelligence
+
embeddings
+
transcripts
+
moments
+
entities
+
relationships
+
search indexes
```

And only generate:

```text
proxies
previews
extracted clips
other derived media
```

**when there is an actual reason to do so.**

The developer API, consumer application and future products should all sit on top of the same intelligence layer and use the same factory.

The result is a system designed around the actual Brisky thesis:

> **The user's media can remain wherever the user keeps it. Brisky doesn't need to own the media to understand it.**

And the most important infrastructure principle is:

> **Brisky should pay for processing capacity, not permanently pay for the user's entire media library.**