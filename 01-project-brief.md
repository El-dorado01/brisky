# AI MEDIA INTELLIGENCE PLATFORM

## Product & Engineering Master Brief

**Document purpose:**
This document is the source of truth for an AI coding agent working on the product.

**Current stage:** Pre-MVP / architecture + implementation

**Primary objective:**
Build a production-quality MVP of an AI-powered media intelligence platform that allows users to connect existing media storage, continuously index their video/media libraries, and search for exact moments using natural language.

**Important:** This is **not simply an AI video search application**. Search is the first user-facing capability of a deeper media intelligence infrastructure.

---

# 1. PRODUCT VISION

## 1.1 The problem

People and small organizations accumulate enormous media libraries.

Their media may be distributed across:

* Local computer drives
* External HDDs
* External SSDs
* NAS
* Google Drive
* Dropbox
* OneDrive
* Google Photos
* S3-compatible storage
* Other cloud providers

The problem is not necessarily that the media is lost.

The problem is:

> **The user remembers the content but not where the content is stored.**

For example:

> "Find the video where I'm sitting in a car."

> "Find the moment where I talked about the new product."

> "Find every clip of this person from last year's events."

> "Find footage of our football player celebrating a goal."

> "Find the video where the CEO says we're expanding to Lagos."

Traditional file systems cannot answer these questions.

The user has to manually:

1. remember a possible folder,
2. open files,
3. scrub through video,
4. inspect footage,
5. repeat across hundreds/thousands of files.

The product eliminates this workflow.

---

# 2. CORE PRODUCT PROMISE

The core promise is:

> **Connect your media once. We continuously understand it, so you can find any moment by simply describing what you remember.**

The user should not need to know:

* filename
* folder
* storage location
* exact date
* exact video
* exact timestamp

They only need to describe what they're looking for.

Example:

```text
Find where I'm sitting inside a car.
```

The system should return:

```text
Video: IMG_4821.mp4

Relevant moment:
00:37 → 01:02

Why:
A person is sitting inside a vehicle.
```

The user can then:

* preview it
* jump directly to the timestamp
* save the moment
* create a collection
* extract a clip
* eventually edit/create content from it.

---

# 3. PRODUCT PHILOSOPHY

The product should be thought of as three layers.

## Layer 1 — Intelligence

> Understand individual media.

The system understands:

* people
* objects
* actions
* scenes
* environments
* speech
* text
* locations
* events
* visual concepts
* temporal relationships

---

## Layer 2 — Memory

> Understand the user's entire media archive.

The system knows:

* what media exists
* where it exists
* when it was created
* where it is stored
* whether it has changed
* whether it is duplicated
* which copy is likely the original
* which moments exist within each asset
* what each moment contains

This eventually becomes a **Media Registry / Media Graph**.

---

## Layer 3 — Creation

> Help the user do something with the media.

Future capabilities:

* collections
* selects
* clip extraction
* rough cuts
* social clips
* highlight reels
* captions
* editing integrations
* AI-assisted editing
* automated content creation

The MVP should focus heavily on **Layers 1 and 2**.

Layer 3 should be introduced gradually.

---

# 4. IMPORTANT COMPETITIVE POSITIONING

The primary competitors to study are:

* **Framea**
* **Jumper**

Other products exist, but these are especially relevant to the initial product category.

Do NOT build the product under the assumption that:

> "Natural-language video search is unique."

It isn't.

The competitive landscape already contains products offering combinations of:

* semantic video search
* local indexing
* cloud connectors
* timestamps
* NLE integrations
* collections
* AI-assisted workflows

Therefore:

## Do not compete solely on:

* "better AI search"
* "better embeddings"
* "better timestamps"
* "AI editing"
* MCP
* prettier UI
* cheaper pricing

These are features competitors can potentially reproduce.

---

# 5. LONG-TERM DIFFERENTIATION

The long-term platform should aim to become:

> **The intelligence layer that understands media regardless of where that media lives.**

Potential future capabilities include:

### Media Registry

Know:

```text
what exists
where it exists
which copies exist
which is the original
which are proxies
what changed
what was deleted
```

### Media Graph

Understand relationships:

```text
Original
 ├── Backup
 ├── Proxy
 ├── Drive copy
 ├── Export
 └── Social-media version
```

### Rights-aware intelligence

Eventually understand:

* people
* releases
* usage permissions
* music rights
* commercial rights
* expiry dates

This is **not an MVP requirement**.

---

# 6. TARGET USERS

Do not initially optimize for giant organizations such as Arsenal or major broadcasters.

Those organizations already have enterprise media asset management systems and significant resources.

Initial target users should be people who have meaningful media libraries but still depend heavily on manual searching.

Potential users:

### Creators

* YouTubers
* TikTok creators
* Instagram creators
* podcasters
* documentary creators
* travel creators

### Professional creatives

* videographers
* wedding filmmakers
* photographers
* freelance editors
* production freelancers

### Small organizations

* small media agencies
* marketing teams
* churches
* schools
* universities
* sports academies
* local sports clubs
* event organizations
* NGOs
* small broadcasters

---

# 7. INITIAL ICP

The exact vertical should remain an explicit product decision rather than hard-coding the application around one industry.

However, the architecture should support a future vertical strategy.

Strong candidates include:

### Small video/content agencies

Potential problem:

> "The client wants footage from their 2023 event."

The agency may have:

* several editors
* several drives
* old project folders
* cloud storage
* duplicate exports
* years of footage

This is a high-value use case.

### Wedding/event studios

Potential workflow:

```text
Shoot
 ↓
Offload
 ↓
Backup
 ↓
Edit
 ↓
Deliver
 ↓
Archive
 ↓
Client requests old footage
```

### Sports academies/clubs

Potential queries:

> "Find all goals by John this season."

> "Find clips where John celebrates."

> "Find footage of the team training."

---

# 8. USER EXPERIENCE

## 8.1 Initial onboarding

User creates an account.

They see:

> **Connect your media**

Options eventually:

```text
Google Drive
Dropbox
OneDrive
Google Photos
Local folders
NAS
S3
```

MVP should start with:

### Local folder + Google Drive

Additional connectors come later.

---

# 9. CONNECTOR PHILOSOPHY

A connector is not merely an importer.

It is a **persistent relationship** between our platform and an external media source.

Once connected:

```text
Connector
    ↓
Initial discovery
    ↓
Initial indexing
    ↓
Continuous synchronization
```

The system must detect:

### New files

```text
NEW
 ↓
Index
```

### Modified files

```text
MODIFIED
 ↓
Determine whether content changed
 ↓
Re-index if necessary
```

### Deleted files

```text
DELETED
 ↓
Remove/deactivate from search index
```

### Moved files

Maintain the same underlying external file ID where possible.

---

# 10. CRITICAL: INCREMENTAL INDEXING

Never repeatedly process the entire library.

Bad:

```text
Every night:
Download everything
Analyze everything
Rebuild everything
```

Correct:

```text
Initial sync
     ↓
Index existing media

Then:

Connector change event
     ↓
Determine affected assets
     ↓
Process only affected assets
```

This dramatically reduces:

* AI cost
* processing time
* bandwidth
* compute
* database operations

---

# 11. MEDIA SHOULD REMAIN WHERE IT LIVES

The original video should **not need to be permanently uploaded to our infrastructure**.

This is a core architectural principle.

Example:

```text
User's Google Drive
       │
       │
       ↓
Our connector
       │
       ↓
Media intelligence
       │
       ↓
Our database
```

Our database stores intelligence about the media.

Not necessarily the media itself.

---

# 12. WHAT WE STORE

Potential asset metadata:

```text
asset_id
user_id
connector_id
external_file_id
filename
mime_type
file_size
duration
width
height
codec
created_at
modified_at
content_hash
status
index_version
```

We may store:

* thumbnails
* low-resolution previews
* extracted frames
* temporary processing artifacts

but these should be treated separately from original media storage.

---

# 13. THE HYBRID MEDIA INTELLIGENCE PIPELINE

This is one of the most important architectural requirements.

Do **not** build the system around a single AI provider.

Do **not** simply send every video directly to Gemini.

Do **not** extract one frame per second from every video forever.

Instead implement a **hybrid pipeline**.

The system should combine:

1. Traditional/custom media processing
2. Frame-analysis pipeline
3. Gemini native video understanding
4. Speech/transcription
5. OCR
6. Embeddings
7. Structured enrichment
8. Semantic retrieval

---

# 14. CUSTOM VISUAL PIPELINE

We need our own visual-processing layer.

Potential tools:

### FFmpeg

Used for:

* video metadata
* decoding
* frame extraction
* thumbnails
* audio extraction
* clip extraction

### Scene/shot detection

Use visual changes to divide video into meaningful segments.

Instead of:

```text
1 frame every second
```

we want:

```text
Video
 ↓
Scene detection
 ↓
Meaningful temporal segments
 ↓
Representative frames
```

For example:

```text
00:00–00:18
Person sitting at desk

00:18–00:31
Person walks outside

00:31–00:55
Person enters vehicle

00:55–01:22
Driving
```

This reduces unnecessary analysis.

---

# 15. FRAME-ANALYSIS SYSTEM

We should build a reusable internal frame-analysis service.

Responsibilities:

* sample frames
* detect scene changes
* select representative frames
* send frames to vision models where appropriate
* generate structured observations
* associate observations with timestamps

Example:

```json
{
  "timestamp": 37.2,
  "objects": ["person", "car"],
  "scene": "vehicle interior",
  "activity": ["sitting"],
  "description": "A person is sitting inside a car."
}
```

The frame-analysis service should **not assume a single AI provider**.

---

# 16. GEMINI NATIVE VIDEO UNDERSTANDING

Gemini should be integrated as another major intelligence pathway.

Gemini's native video understanding can analyze video directly and provide semantic understanding of video content and timestamps.

Use it for tasks where native temporal/video understanding is more useful than isolated-frame analysis.

Potential use cases:

* understanding events across time
* contextual descriptions
* complex actions
* temporal relationships
* video-level summaries
* difficult visual queries
* validating candidate segments

Gemini should therefore complement our custom pipeline rather than replace it.

---

# 17. HYBRID STRATEGY

The desired architecture:

```text
                     VIDEO
                       │
              ┌────────┴────────┐
              │                 │
           FFmpeg           Gemini Video
              │                 │
        metadata +          contextual/
       frame pipeline       temporal AI
              │                 │
              ↓                 ↓
       Visual observations   AI observations
              │                 │
              └────────┬────────┘
                       ↓
                 Intelligence
                   Merger
                       ↓
              Structured Media Data
                       ↓
              Embeddings + Index
```

The purpose is to determine empirically which method is:

* cheaper
* faster
* more accurate
* more reliable

for each type of analysis.

---

# 18. TWO-STAGE ANALYSIS

Do not perform maximum-cost analysis on every frame.

## Stage 1 — Broad/cheap indexing

Extract:

* metadata
* duration
* scene boundaries
* representative frames
* basic visual information
* transcript
* OCR where appropriate
* thumbnails
* embeddings

This establishes baseline searchability.

---

## Stage 2 — Deep analysis

Perform deeper analysis when justified.

Examples:

* complex actions
* detailed event understanding
* person identification
* difficult visual queries
* ambiguous results

Potentially:

```text
User query
   ↓
Initial search
   ↓
Candidate segments
   ↓
Deep AI analysis
   ↓
Re-ranking
```

This can dramatically reduce AI costs.

---

# 19. SPEECH INTELLIGENCE

Video isn't just visual.

Extract audio and transcribe it.

Store:

```text
transcript
speaker segments
timestamps
language
```

Example:

```text
00:42–00:48
"I think we're going to expand into Lagos."
```

Then a query:

> "Find where the CEO talks about Lagos."

can be solved primarily through transcript search.

This means **not every search needs expensive visual analysis.**

---

# 20. OCR

Extract text appearing inside video.

Examples:

* presentation slides
* signs
* product names
* screen recordings
* captions
* documents
* television screens

Store OCR observations with timestamps.

---

# 21. EMBEDDINGS

Each meaningful media segment should eventually have semantic embeddings.

Example:

```text
Segment:
00:37–01:02

Description:
A person sitting inside a vehicle.

Embedding:
[...]
```

Search can combine:

### Semantic similarity

with:

### Metadata filters

and:

### Transcript search

and eventually:

### Visual/entity filters

This should be a **hybrid retrieval system**, not vector search alone.

---

# 22. SEARCH ARCHITECTURE

User:

> "Find videos where I'm sitting in a car."

Potential pipeline:

```text
Natural-language query
       ↓
Query interpretation
       ↓
Candidate retrieval
       ├── semantic embeddings
       ├── transcript
       ├── metadata
       └── structured observations
       ↓
Candidate ranking
       ↓
Optional deep visual verification
       ↓
Results
```

Return:

```text
Asset
Timestamp
Duration
Thumbnail
Description
Confidence/relevance
```

---

# 23. SEARCH SHOULD BE TIMESTAMP-AWARE

This is essential.

Do not return only:

> `video.mp4`

Return:

```text
video.mp4

00:37 → 01:02
```

The user should be able to click the result and immediately jump to that point.

---

# 24. DATABASE

Use:

## PostgreSQL

with:

## pgvector

Initially.

Do not introduce a dedicated vector database unless scale requires it.

Suggested tables:

```text
users

organizations

connectors

connector_accounts

media_assets

media_segments

media_observations

transcripts

transcript_segments

embeddings

indexing_jobs

sync_events

collections

collection_items

api_keys

usage_records
```

Additional tables can be introduced as the architecture matures.

---

# 25. MEDIA ASSET

Example:

```text
media_assets

id
user_id
connector_id
external_file_id
filename
mime_type
size
duration
width
height
codec
checksum
created_at
modified_at
last_indexed_at
index_version
status
```

Status examples:

```text
discovered
queued
processing
indexed
failed
deleted
stale
```

---

# 26. MEDIA SEGMENTS

Each video can contain multiple searchable temporal segments.

Example:

```text
media_segments

id
media_asset_id
start_time
end_time
description
scene_type
activity
location
objects
people
embedding
analysis_version
```

---

# 27. RAW VS ENRICHED DATA

Preserve raw AI observations.

Do not only save the final LLM interpretation.

Example:

### Raw

```json
{
  "timestamp": 37.2,
  "objects": ["person", "car"],
  "scene": "vehicle interior"
}
```

### Enriched

```json
{
  "start": 35,
  "end": 62,
  "environment": "inside vehicle",
  "activity": ["sitting"],
  "semantic_description":
    "A person enters a car and sits inside."
}
```

Why?

Because raw intelligence allows:

* reprocessing
* improved models
* debugging
* new search features
* model migrations
* auditability

without necessarily reprocessing the original media.

---

# 28. AI PROVIDER ABSTRACTION

The platform must not be coupled directly to Gemini.

Create an abstraction:

```text
AIProvider
```

Possible implementations:

```text
GeminiProvider
OpenAIProvider
FutureProvider
CustomProvider
```

Potential interfaces:

```text
analyzeVideo()
analyzeFrames()
generateEmbedding()
transcribeAudio()
extractStructuredData()
```

The exact interface should evolve during implementation.

---

# 29. DEVELOPER PLATFORM

This is an important part of the long-term product.

There will eventually be two consumers of the platform:

```text
                CORE PLATFORM
                     │
            ┌────────┴────────┐
            ↓                 ↓
       Consumer App       Developer API
```

Our own consumer application should consume the **same APIs** exposed to developers wherever practical.

Do not create an internal system that cannot eventually be exposed as a proper API.

---

# 30. DEVELOPER USE CASE

A developer might build:

> AI wedding-video assistant

or:

> football archive search

or:

> podcast clip generator

using our infrastructure.

Their application could call:

```http
POST /api/v1/search
```

Example:

```json
{
  "query": "Find clips of the player celebrating goals",
  "limit": 20
}
```

Response:

```json
{
  "results": [
    {
      "asset_id": "839201",
      "filename": "match-final.mp4",
      "start_time": 127.2,
      "end_time": 143.8,
      "score": 0.94
    }
  ]
}
```

---

# 31. BRING YOUR OWN AI KEYS

Long term, developers should potentially be able to provide their own AI provider credentials.

Example:

```text
Developer
    ↓
Your Media Intelligence API
    ↓
Their AI provider credentials
    ↓
Gemini/OpenAI/etc.
```

Benefits:

* developer controls AI costs
* developer can choose provider
* we don't have to absorb every AI processing cost
* advanced users can customize processing
* creates a platform/API business

However:

**Do not make BYOK a requirement for the first MVP.**

Build the abstraction now.

Expose BYOK after the core system works.

---

# 32. API-FIRST ARCHITECTURE

The backend should be designed as a proper API platform.

Potential API domains:

```text
/auth
/users
/connectors
/media
/indexing
/search
/collections
/clips
/ai
/developer
/api-keys
/usage
```

API versioning should begin early:

```text
/api/v1/...
```

---

# 33. BACKEND TECHNOLOGY

Use:

## NestJS + TypeScript

This is the preferred backend.

Reasoning:

* strongly typed
* excellent API architecture
* excellent async/event-driven model
* good ecosystem for cloud SDKs
* good AI SDK ecosystem
* natural fit with React/TypeScript
* shared types
* strong developer-platform architecture
* modular architecture

Use:

## Fastify

under NestJS where appropriate.

---

# 34. FRONTEND

Use:

```text
React
Vite
TypeScript
Tailwind CSS
```

Do not introduce Next.js unless there is a concrete requirement.

This is primarily an application/dashboard rather than an SEO-first website.

---

# 35. QUEUE / WORKER ARCHITECTURE

Video processing must be asynchronous.

Never process videos inside ordinary HTTP requests.

Use:

```text
Redis
+
BullMQ
```

Architecture:

```text
API
 ↓
Create indexing job
 ↓
Redis/BullMQ
 ↓
Worker
 ↓
FFmpeg / AI
 ↓
Database
```

---

# 36. WORKER TYPES

Potential workers:

```text
ConnectorWorker

DiscoveryWorker

MediaMetadataWorker

FrameExtractionWorker

SceneDetectionWorker

VisionAnalysisWorker

GeminiVideoWorker

TranscriptionWorker

OCRWorker

EmbeddingWorker

EnrichmentWorker

IndexWorker
```

These do not necessarily need to be separate deployable services initially.

They can be modular workers within the same worker application.

---

# 37. CONNECTOR EVENT FLOW

Example:

```text
Google Drive
     ↓
Change notification
     ↓
Connector worker
     ↓
Identify changed file
     ↓
Compare metadata/hash/version
     ↓
Create job
     ↓
Media processing
     ↓
Update intelligence
```

Deletion:

```text
Drive delete event
     ↓
Find external_file_id
     ↓
Mark asset deleted
     ↓
Remove from active search
```

---

# 38. INITIAL INDEXING

When a connector is first connected:

```text
CONNECT
 ↓
Authenticate
 ↓
Discover files
 ↓
Filter supported media
 ↓
Create media_assets
 ↓
Queue indexing jobs
 ↓
Workers process asynchronously
```

The user must **not be forced to wait until everything finishes.**

Show progress:

```text
Library indexing

Videos discovered: 4,238
Indexed: 1,241
Processing: 17
Remaining: 2,980

Searchable content is available now.
```

---

# 39. INDEXING PRIORITY

Consider prioritizing:

1. recently modified files
2. recent files
3. user-selected folders
4. smaller files
5. files likely to be relevant

The exact prioritization algorithm can evolve.

---

# 40. VIDEO PROCESSING COST CONTROL

Do not assume:

> every frame = AI request.

Use:

```text
metadata
 ↓
scene detection
 ↓
representative frames
 ↓
cheap analysis
 ↓
deep analysis where needed
```

Potentially use:

```text
native Gemini video analysis
```

for difficult/contextual cases.

---

# 41. LOCAL VS CLOUD PROCESSING

The architecture should support hybrid processing.

Potential future architecture:

```text
                 Media
                   │
         ┌─────────┴─────────┐
         ↓                   ↓
      Local              Cloud
    Processing          Processing
         │                   │
         └─────────┬─────────┘
                   ↓
             Intelligence
```

Local processing can reduce:

* bandwidth
* privacy risk
* cloud processing costs

Cloud processing provides:

* stronger models
* centralized indexing
* easier cross-device access

The MVP can initially process through cloud infrastructure while maintaining the architecture needed for future local workers.

---

# 42. MEDIA STORAGE

Original media should remain in the user's source whenever possible.

We may store:

* thumbnails
* proxies
* temporary files
* extracted clips

but these should have explicit lifecycle rules.

Do not accidentally turn the product into a giant cloud storage company.

---

# 43. SECURITY

Security must be designed from the beginning.

Important areas:

* OAuth
* connector tokens
* encryption
* API keys
* access control
* tenant isolation
* signed URLs
* permissions
* connector revocation
* deleted files
* data retention

Never expose external connector credentials to the frontend after authorization.

---

# 44. MULTI-TENANCY

The platform should be designed for:

```text
User
 ↓
Organization
 ↓
Projects / Libraries
 ↓
Media
```

Even if MVP initially only exposes a simple user account.

This will make future team functionality easier.

---

# 45. FUTURE MEDIA GRAPH

Eventually we should represent relationships such as:

```text
Asset A
 ├── duplicate of Asset B
 ├── proxy of Asset C
 ├── export of Asset D
 └── derived clip E
```

Use:

* cryptographic hashes
* perceptual hashes
* metadata
* visual similarity
* temporal similarity

This becomes the foundation of the future Media Registry.

**Not required for the first MVP.**

---

# 46. FUTURE RIGHTS INTELLIGENCE

Potential future query:

> "Show me footage of the CEO that we can use in paid advertising."

The system could understand:

```text
Person
+
Footage
+
Release
+
Usage rights
+
Expiration
```

This is a potentially powerful professional feature.

Do not implement legal interpretation in MVP.

---

# 47. EDITING

Do not build a Premiere competitor.

Initial editing functionality should be extremely limited.

Potential MVP:

* set in/out
* extract clip
* create collection
* concatenate clips
* basic export

Later:

* captions
* aspect ratios
* transitions
* audio
* rough cuts

Eventually:

* Premiere integration
* DaVinci integration
* Final Cut
* CapCut
* EDL/XML/etc.

---

# 48. SEARCH → CREATION

Long-term workflow:

```text
Search
 ↓
Select moments
 ↓
Collection
 ↓
Arrange
 ↓
Rough cut
 ↓
Export / NLE
```

Eventually:

```text
"Create a 30-second Instagram Reel from my best clips about our product launch."
```

AI identifies:

* relevant footage
* strongest moments
* speech
* b-roll
* sequence

Then creates a draft.

This is **future functionality**, not the core MVP.

---

# 49. PRODUCT UI

The initial application should likely contain:

### Dashboard

Shows:

* connected sources
* indexed media
* indexing status
* recent activity

### Media Library

Shows:

* assets
* source
* duration
* thumbnail
* status

### Search

Main experience:

```text
What are you looking for?

[ Find me sitting inside a car................ ]
```

Results:

```text
┌─────────────────────────────────────┐
│ Thumbnail                           │
│                                     │
│ IMG_4821.mp4                        │
│ 00:37 — 01:02                       │
│ "Person sitting inside a car"       │
│                                     │
│ [Preview] [Save] [Extract]          │
└─────────────────────────────────────┘
```

### Connectors

Manage:

* Google Drive
* Local folders
* future providers

### Collections

Saved search results / clips.

---

# 50. MVP SCOPE

The MVP should prove one thing:

> **Can we make a real media library genuinely searchable by meaning and return useful timestamp-level results?**

### MVP should include:

* authentication
* React application
* NestJS API
* PostgreSQL
* pgvector
* Redis
* BullMQ
* FFmpeg
* local media ingestion
* Google Drive connector
* media discovery
* incremental indexing foundation
* video metadata
* scene detection
* representative frame extraction
* custom frame-analysis pipeline
* Gemini video analysis
* transcription
* embeddings
* semantic search
* timestamp-level results
* video preview
* indexing progress
* basic collections

---

# 51. MVP SHOULD NOT INCLUDE

Do not build initially:

* full video editor
* mobile apps
* 10+ connectors
* enterprise rights management
* hardware appliance
* complex billing
* advanced team permissions
* custom foundation model
* custom GPU infrastructure
* complicated media graph
* full NLE integrations
* AI social-media automation
* enterprise MAM features

---

# 52. DEVELOPMENT PHASES

## PHASE 0 — Foundation

Set up:

```text
React + Vite
NestJS
TypeScript
PostgreSQL
pgvector
Redis
BullMQ
Docker
FFmpeg
```

Create repository structure.

Establish environment configuration.

Establish API versioning.

Establish database migrations.

---

# PHASE 1 — Media Intelligence Proof of Concept

Before building complex UI:

Take one video.

Process:

```text
video
 ↓
metadata
 ↓
scene detection
 ↓
frame extraction
 ↓
custom visual analysis
 ↓
Gemini video analysis
 ↓
transcription
 ↓
structured intelligence
 ↓
embeddings
 ↓
PostgreSQL
```

Then query:

> "Find where the person is inside a car."

Return:

```text
video.mp4
00:37–01:02
```

### This phase is the most important technical validation.

---

# PHASE 2 — Local Media Library

Allow users to select a local folder.

System:

```text
Folder
 ↓
Discover media
 ↓
Index asynchronously
 ↓
Search
```

Build:

* media library
* indexing queue
* progress
* search
* timestamp preview

This lets us validate the experience without cloud connectors.

---

# PHASE 3 — Google Drive Connector

Implement:

* OAuth
* file discovery
* supported media detection
* external file IDs
* metadata synchronization
* initial indexing
* change detection
* deletion detection
* modified-file detection

The architecture should make future connectors plug-in based.

---

# PHASE 4 — Continuous Intelligence

Implement:

```text
Connector event
 ↓
Change detection
 ↓
Index affected asset
 ↓
Update database
 ↓
Update embeddings
```

This is where the product begins behaving like a **living media memory** rather than a one-time importer.

---

# PHASE 5 — Search Quality

Improve retrieval through:

* hybrid search
* semantic embeddings
* transcript search
* metadata filtering
* structured observations
* re-ranking
* Gemini verification
* query interpretation

Benchmark against real-world queries.

---

# PHASE 6 — Collections & Basic Editing

Add:

* save result
* collections
* multiple selected moments
* in/out selection
* clip extraction
* export

Do not build a complete editor.

---

# PHASE 7 — Developer API

Expose:

```text
authentication
connectors
media
search
collections
clips
webhooks
API keys
usage
```

Build documentation.

Create API keys.

Make the consumer application use the same public API patterns.

---

# PHASE 8 — Developer Platform

Add:

* BYOK AI providers
* developer dashboards
* usage limits
* API billing
* webhooks
* SDK
* documentation
* organization accounts

Potential SDK:

```text
@yourcompany/sdk
```

---

# 53. FUTURE ROADMAP

After MVP:

### V2

* Dropbox
* OneDrive
* NAS
* better person recognition
* OCR
* improved scene understanding
* duplicate detection
* media graph
* collections
* better clip extraction

### V3

* team collaboration
* permissions
* advanced search
* rights management
* NLE integrations
* AI-assisted editing
* creator workflows

### V4

Potential:

* Windows indexing agent
* NAS appliance/service
* advanced Media Registry
* cross-cloud intelligence
* enterprise capabilities

---

# 54. TECHNICAL PRINCIPLE: PROVIDER AGNOSTIC

Never hard-code the application around:

> Gemini

Gemini should be an important provider.

But the architecture should allow:

```text
Gemini
OpenAI
Anthropic
local models
future models
```

The product's value should be:

> **Our media intelligence infrastructure**

not:

> "We use Gemini."

---

# 55. TECHNICAL PRINCIPLE: MODEL-AGNOSTIC DATA

AI-generated information must be stored in a way that survives model changes.

Use fields such as:

```text
provider
model
model_version
analysis_version
created_at
```

Example:

```text
provider: google
model: gemini-x
analysis_version: 1
```

If we later switch models, we can reprocess selectively.

---

# 56. TECHNICAL PRINCIPLE: EVERYTHING IMPORTANT IS ASYNC

Anything potentially expensive should become a job.

Examples:

```text
index media
extract frames
transcribe
analyze
embed
re-index
generate clip
sync connector
```

The API should create jobs and return quickly.

---

# 57. TECHNICAL PRINCIPLE: OBSERVABILITY

Every indexing job should be traceable.

Record:

```text
job ID
asset ID
stage
provider
model
start time
end time
status
error
retry count
cost where available
```

This is essential for debugging AI/media processing.

---

# 58. FAILURE HANDLING

Media processing will fail sometimes.

Examples:

* corrupt video
* unsupported codec
* expired connector token
* rate limit
* AI API error
* network failure
* deleted file
* permission denied

Jobs must support:

```text
retry
failed
dead-letter
manual retry
```

Do not silently lose assets.

---

# 59. COST MANAGEMENT

The product should be designed around the principle:

> **Index once, search many times.**

Do not repeatedly send the same media to expensive models.

Store intelligence.

Use:

* caching
* embeddings
* raw observations
* incremental processing
* scene sampling
* batch AI requests
* cheap-first analysis
* deep analysis only when useful

---

# 60. FIRST TECHNICAL EXPERIMENT

Before building the entire platform, create a standalone experiment:

```text
/test-video
```

Input:

```text
sample.mp4
```

Output:

```text
metadata.json
scenes.json
frames/
transcript.json
visual-analysis.json
gemini-analysis.json
segments.json
embeddings
```

Then build a simple search endpoint.

The experiment should answer:

1. How accurately can we find a moment?
2. How precise are timestamps?
3. How many frames are actually required?
4. Is Gemini native video better than our frame pipeline for different tasks?
5. What does each approach cost?
6. How long does indexing take?
7. What information should be stored permanently?

**Do not optimize architecture based purely on theory. Benchmark it.**

---

# 61. SUCCESS CRITERIA

The MVP is successful if a test user can:

### Step 1

Connect/import a real media library.

### Step 2

Wait while indexing happens asynchronously.

### Step 3

Search naturally:

> "Find me in a car."

### Step 4

Receive relevant videos.

### Step 5

Jump directly to the relevant timestamp.

### Step 6

Say:

> "Find another one."

and receive more results.

### Step 7

Save several results into a collection.

If this experience feels magical, **we have the foundation of the product.**

---

# 62. WHAT THE AGENT MUST NOT DO

The coding agent must not prematurely:

* build a massive microservice architecture
* introduce Kubernetes
* introduce a dedicated vector DB without evidence
* build a complete editor
* build ten connectors
* create proprietary AI models
* store every original video
* process every frame through an expensive LLM
* couple the system permanently to Gemini
* over-engineer enterprise permissions
* build billing before the core experience works

---

# 63. ARCHITECTURE AT A GLANCE

The intended architecture:

```text
                         USER
                          │
                          ↓
                 React + Vite App
                          │
                          ↓
                 NestJS API / Fastify
                          │
             ┌────────────┼────────────┐
             ↓            ↓            ↓
          Auth         Search       Connectors
                          │            │
                          ↓            ↓
                     PostgreSQL     Google Drive
                     + pgvector     Local Files
                          │
                          ↓
                        Redis
                          │
                       BullMQ
                          │
        ┌─────────────────┼─────────────────┐
        ↓                 ↓                 ↓
   Media Worker      AI Workers       Sync Workers
        │                 │                 │
      FFmpeg              │             Connectors
        │                 │
        ├──────────┬──────┤
        ↓          ↓      ↓
     Frames     Gemini  Speech
        │        Video   to Text
        │          │       │
        └──────────┼───────┘
                   ↓
            Intelligence Layer
                   ↓
            Structured Segments
                   ↓
            Embeddings / Search
                   ↓
              Search Results
                   ↓
          Collections / Clips
```

---

# 64. LONG-TERM PLATFORM

The ultimate architecture should become:

```text
                       MEDIA SOURCES
                            │
       ┌──────────┬─────────┼──────────┬──────────┐
       ↓          ↓         ↓          ↓          ↓
      SSD        NAS       Drive     Dropbox    OneDrive
       │          │         │          │          │
       └──────────┴─────────┴──────────┴──────────┘
                            ↓
                    CONNECTOR LAYER
                            ↓
                    MEDIA REGISTRY
                            ↓
                    MEDIA INTELLIGENCE
                            ↓
                 ┌──────────┴──────────┐
                 ↓                     ↓
           Search / Retrieval      Media Graph
                 │                     │
                 └──────────┬──────────┘
                            ↓
                    CREATIVE LAYER
                            ↓
             ┌──────────────┼──────────────┐
             ↓              ↓              ↓
          Search        Collections      Editing
             │              │              │
             └──────────────┼──────────────┘
                            ↓
                      PUBLIC API
                            ↓
                 THIRD-PARTY DEVELOPERS
```

---

# 65. THE BIGGER VISION

The product starts with:

> **"Find my video."**

Then evolves into:

> **"Understand my media."**

Then:

> **"Remember my media."**

Then:

> **"Help me use my media."**

And ultimately:

> **"Operate my media workflow."**

That progression is important.

We are **not trying to build another search box**.

We are building the infrastructure that allows software to understand a user's media archive.

---

# 66. FINAL PRODUCT THESIS

The working thesis is:

> **An AI media intelligence platform that connects to the messy storage environments of creators and small media teams, continuously understands their media, maintains a searchable intelligence layer over that media, and lets users retrieve exact moments using natural language — eventually extending from search into organization, retrieval, editing and automated content creation.**

The core technical differentiator we want to investigate is:

> **A continuously maintained, connector-aware media intelligence layer combining custom visual/frame analysis with native multimodal video understanding, rather than relying entirely on one AI model or requiring users to upload their entire media libraries into our storage.**

And the long-term strategic direction is:

> **Media intelligence infrastructure + consumer application + developer API.**

---

## Agent instruction

**Build the smallest working version of the above system first.**

Do not attempt to implement the entire vision at once.

The immediate goal is:

```text
ONE VIDEO
    ↓
UNDERSTAND IT
    ↓
INDEX IT
    ↓
SEARCH IT
    ↓
RETURN EXACT MOMENT
```

Then:

```text
MANY VIDEOS
    ↓
LOCAL LIBRARY
    ↓
SEARCH
```

Then:

```text
CONNECTED CLOUD
    ↓
CONTINUOUS INDEXING
    ↓
SEARCH
```

Everything else comes after these foundations are proven.

**Most importantly, the media intelligence pipeline must remain hybrid:**

**custom FFmpeg/scene/frame-analysis pipeline + Gemini native video understanding + transcription + embeddings + structured enrichment.**

Do not remove one in favor of the other without benchmarking the tradeoffs.

---

# 67. AGENT (GEMINI FLASH 3.8) ARCHITECTURAL ASSESSMENT & CRITICAL CONSIDERATIONS

*(Added during technical evaluation & validation review)*

## 67.1 Executive Assessment & Architectural Strengths

This master brief is exceptionally well-structured, disciplined, and realistic. Unlike typical AI application specs that over-index on generic "chat with your data" tropes, this architecture establishes genuine moat-building principles:

1. **"Media remains where it lives" is the winning architectural thesis:**
   Most failed video/media startups inadvertently turn into expensive cloud storage businesses by demanding users upload terabytes of raw camera footage. Treating the platform as a **read/intelligence overlay** with pointer metadata and local caching is 100% the correct paradigm for cost control and frictionless onboarding.
2. **Strict Phased Empirical Validation (`/test-video` first):**
   The mandate in Section 60 to benchmark one video end-to-end before building multi-tenant dashboards, auth, or connector infrastructure prevents premature optimization and forces empirical answers to latency, cost per minute, and timestamp accuracy.
3. **Hybrid Pipeline vs. Vendor Monoculture:**
   Avoiding single-vendor lock-in (e.g., sending raw video exclusively to Gemini or Twelve Labs) protects unit economics, avoids rate limits, and enables optimal modality selection (e.g., using fast Whisper/OCR for spoken/written queries vs. multimodal VLMs for visual actions).
4. **Explicit Anti-Goals (Sections 51 & 62):**
   Explicitly ruling out premature Kubernetes, full video editors, 10+ connectors, and premature billing systems protects engineering velocity and keeps the focus strictly on the core loop: **Query → Exact Timestamped Moment**.

---

## 67.2 Critical Engineering Hurdles & Practical Realities

While the vision is sound, several technical obstacles will be encountered immediately during execution and must be designed for upfront:

### A. The Cloud Connector Bandwidth & Egress Problem
* **The Challenge:** The brief states that media should stay in the user's storage without permanent re-uploading. However, to run FFmpeg (scene detection, keyframe extraction, audio demuxing), worker containers still need to read video bytes.
* **The Reality:** Downloading a 40 GB 4K ProRes file from Google Drive to run scene detection will saturate worker bandwidth, cause high network latency, and incur API rate limits.
* **Architectural Solution:**
  - Leverage HTTP range requests (`ffmpeg -ss ... -i <signed_url>`) where supported.
  - Prioritize extracting lightweight audio streams first (for transcription) before heavy visual passes.
  - Where full processing is required, process inside temporary scratch volumes and purge media files immediately after extracting metadata, embeddings, transcripts, and thumbnails. Never retain the source video.

### B. Local Media File Paths & Browser Security Sandboxing
* **The Challenge:** Phase 2 proposes indexing local folders and previewing them in a web app (`React + Vite`).
* **The Reality:**
  - Modern web browsers enforce strict security sandboxes: frontend JavaScript cannot read arbitrary paths like `C:\Users\...\footage.mp4` or directly feed them into an HTML5 `<video>` tag.
  - Professional camera codecs (H.265/HEVC 10-bit, ProRes, AVCHD) do not play natively in standard web browsers (Chrome, Firefox).
* **Architectural Solution:**
  - When running locally, the backend/agent must expose a dedicated streaming/proxy endpoint (e.g., `/api/v1/media/stream/:assetId`) that serves byte-range chunks.
  - Implement fast, on-the-fly FFmpeg remuxing/transcoding to web-compatible H.264/WebM proxies for unsupported camera formats so in-browser scrubbing remains smooth.

### C. Cross-Modal Temporal Alignment & Drift
* **The Challenge:** The hybrid pipeline aggregates three distinct temporal streams:
  1. Visual scene cuts from FFmpeg (e.g., shot changes).
  2. Transcript segments from Whisper/STT (word/phrase boundaries).
  3. Native video event annotations from Gemini/VLM.
* **The Reality:** These streams do not align on identical timestamp boundaries. A spoken sentence may span `00:14 → 00:23`, while a visual scene cut occurs at `00:19`.
* **Architectural Solution:**
  - Design the "Intelligence Merger" (Section 17) with a deterministic temporal segmentation strategy.
  - Use visual scene changes as primary temporal anchor windows (e.g., PySceneDetect / FFmpeg `select='gt(scene,0.3)'`).
  - Project overlapping transcript phrases and OCR events into these windows.
  - Persist consolidated `media_segments` with explicit start/end bounds and cross-references to raw observation IDs.

### D. Hybrid Retrieval Strategy: Vector vs. Lexical (BM25)
* **The Challenge:** If a user searches for *"Find where the CEO discusses the Lagos expansion"*, vector similarity on visual embeddings can be unreliable or yield false positives, whereas full-text lexical search on the speech transcript provides 100% precision.
* **The Reality:** Pure vector search (`pgvector`) is insufficient on its own for mixed video intelligence.
* **Architectural Solution:**
  - Implement a dual-retrieval pipeline inside PostgreSQL using **Reciprocal Rank Fusion (RRF)**:
    - **Stream 1 (Lexical):** PostgreSQL `tsvector` / full-text search with BM25 ranking across transcripts and OCR text.
    - **Stream 2 (Semantic):** `pgvector` cosine similarity over visual and enriched segment embeddings.
  - Combine ranked candidate lists and apply hard metadata filters (date ranges, connector ID, duration) before returning ranked timestamped moments.

---

## 67.3 Technology Stack Validation Matrix

| Component | Brief Selection | Assessment | Operational Recommendation |
| :--- | :--- | :--- | :--- |
| **Backend** | NestJS + TypeScript | **Optimal** | Strong modular architecture, clean dependency injection, native BullMQ ecosystem. |
| **HTTP Engine** | Fastify | **Optimal** | Superior throughput and lower memory overhead compared to Express. |
| **Database** | PostgreSQL + pgvector | **Optimal** | Unifies relational entities, raw JSON observations, and vector indexes without introducing extra database infrastructure prematurely. |
| **Task Queue** | Redis + BullMQ | **Industry Standard** | Essential for concurrency limits, job retries, backoff, and step-by-step progress tracking. |
| **Video Engine**| FFmpeg | **Mandatory** | The universal standard for decoding, scene evaluation, and audio/frame extraction. |
| **Frontend** | React + Vite + Tailwind | **Optimal** | High developer velocity, lightweight, avoids SSR/Next.js complexity where an SPA/dashboard is needed. |

---

## 67.4 Strategic Competitor & Moat Analysis

In addition to **Framea** and **Jumper**, the competitive landscape includes API-first video models like **Twelve Labs** and legacy studio platforms (e.g., Adobe Sensei).

* **The Trap:** Competing solely as a "better video search model" is vulnerable to commoditization as foundation models evolve.
* **The Moat:** The platform's true defensibility lies in:
  1. **Connector Depth:** Maintaining real-time index synchronization across heterogeneous, messy storage without moving master files.
  2. **Cost-Aware Two-Stage Indexing:** Knowing *when* to use cheap FFmpeg/speech heuristics vs. expensive multimodal LLM calls.
  3. **The Living Media Registry:** Transitioning from passive search to active graph awareness (knowing originals vs. proxies vs. social exports).

---

## 67.5 Recommended Immediate Action Plan (Phase 0 & 1)

1. **Infrastructure Bootstrap (Phase 0):**
   - Provide a minimal `docker-compose.yml` defining PostgreSQL (with `pgvector` extension enabled) and Redis.
   - Initialize the NestJS backend skeleton and React+Vite frontend.
2. **Execution of the Phase 1 Experiment (`/test-video`):**
   - Select a representative 2–3 minute test video containing clear visual cuts, spoken dialogue, and text on screen.
   - Build a standalone script/service to run:
     1. FFmpeg metadata and scene detection.
     2. Audio extraction and Whisper transcription.
     3. Frame extraction on key scene shifts.
     4. Direct Gemini video contextual analysis.
     5. Unified JSON segment generation and embedding creation.
   - Validate timestamp retrieval precision against at least 5 natural language queries.

