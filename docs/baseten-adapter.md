# Baseten sponsor-model pilot

## Queue validation, 2026-11-01

The production queue services now pass an isolated local-source run on the retained
real Drive video: seven units, two scenes, 32 frame observations, speech/video-enriched
local embeddings, one pre-inference retry and completed-checkpoint replay without new
inference. Temporary queue/asset/media were removed. Nine image requests plus one video
request have about $0.13744 in token estimates; conservative ledger holds are now $6.65
of the owner-approved **$8 cumulative** ceiling. See [precise scope](queue-media-validation.md).
The normal production queue consumer and automatic sync remain off; remote connector
queue download/upload and labelled accuracy remain unverified. No direct Meta switch occurred.

## Persisted real-media pilot, 2026-10-31

The single selected Drive source now has a controlled native-video/local-speech index:
12 segments, timed local Whisper transcript, local 384-dimensional vectors and original
midpoint source frames. No independent frame OCR was run. One fresh video request had
$0.022913 estimated token cost. The importer uses owner-checked atomic persistence,
source-version-derived IDs and portable storage locators. A private playback copy is
retained under ignored storage; transient scratch audio/video is removed. This controlled
import is distinct from the existing BullMQ ingestion path and does not validate workers.

The engine now selects local query/index embeddings only for the pilot owner via
`LOCAL_EMBEDDING_USER_IDS`; global `EMBEDDING_PROVIDER` and 266 older Google vectors
remain unchanged. Query cache keys include provider/model to prevent cross-space reuse.
Other owners retain their existing configuration; do not opt in an existing incompatible
corpus without migration. Owner-scoped embedding selection also applies to queued embed
units through the merger. The engine was restarted with polling/workers still disabled.

Actual PostgreSQL retrieval and Next/SaaS/engine/Baseten integration passed: a natural
saved reply with one real-source citation, source JPEG thumbnail, HEAD and HTTP 206
playback ranges, shortlist/reload, unauthorized thumbnail denial and cached reply without
extra inference. Temporary test space/session were deleted; the source index remains.
See [index evidence](hackathon-evidence/2026-10-31-drive-index-pilot.json) and
[integration evidence](hackathon-evidence/2026-10-31-persisted-drive-integration.json).
This is not a labelled accuracy evaluation or a new mobile browser playback test.
Broad sync, automatic polling, direct Meta live usage and queue-driven media remain
unverified. Continue with [the execution checklist](media-ingestion-roadmap.md).

## Indexing preflight, 2026-10-31

Subsequent media integration: `BASETEN_MEDIA_ENABLED=true` explicitly enables inherited
native visual-video analysis and provider-correct `audio_url` transcription. The default
remains false. The sponsor model is pinned for all modalities, video above 300 seconds
is rejected before dispatch, and malformed/gapped segments and invented visual-only dialogue
are rejected. Media now has an independent 8 MiB default serialized-body limit via
`BASETEN_MAX_MEDIA_REQUEST_BYTES` (hard ceiling 100 MiB); text-only requests retain
128 KiB. Base64 and JSON overhead count toward the media bound. Requests above either
bound fail before reserving budget. This change does not compress or truncate footage.
The combined provider suites now pass 45 tests, including media above the text cap,
oversize rejection without ledger mutation, and unchanged text rejection; TypeScript passes.

Live synthetic video passed red-before-blue segmentation at 0–2 and 2–4 seconds with
no dialogue ($0.00646875 token estimate). Separate synthetic silence passed Baseten audio
($0.0032545 estimate) and local cached Whisper base (empty cues; 14.2 seconds inference,
offline mode). Neither silence check establishes real speech accuracy. A Windows speech
fixture could not be generated in this environment, so no spoken-word success is claimed.
The first sandboxed video connection failed; its reservation remains in the ledger.
Evidence: [video](hackathon-evidence/2026-10-31-baseten-media-preflight.json),
[audio](hackathon-evidence/2026-10-31-baseten-audio-preflight.json).
The owner approved a cumulative $5 ceiling; only `AI_BUDGET_USD` was updated locally.
The existing ledger remains intact. Combined Meta/Baseten suites pass 44 offline tests;
engine TypeScript passes. Direct Meta switching is prepared in [the transition plan](meta-adapter.md).

Database readiness inspection found 266 existing Google-vector segments and no local
vectors. No embedding-provider switch or vector rewrite was made: a local-vector pilot
must keep query/index spaces consistent without hiding the existing corpus.
Read-only Google metadata inspection confirmed the latest saved account has one selected
folder and one 53.033-second, 4,182,700-byte video, with no existing Google vectors for that
owner. A second saved legacy account returned HTTP 400; no account was modified and no
personal footage downloaded during that inspection. The original file exceeded the old
128 KiB bound and fits the new 8 MiB media bound without compression.
Do not activate broad sync until the per-file preparation and cumulative admission plan
are bounded. PostgreSQL was reachable; Docker did not need to be started.

Track all remaining work in [the ingestion checklist](media-ingestion-roadmap.md).
The original-file preflight now passes: verified source integrity and duration, local
Whisper base produced seven bounded cues (17.371 seconds), and Baseten produced 12
validated visual segments covering the full source (38.141 seconds). Estimated video
token cost was $0.026313; usage reported 7,396 input and 4,016 output tokens. The latter
is close to the 4,096 output bound; longer/denser inputs still need bounded windows and
explicit output admission, not truncation or unmetered retries. Private scratch media
was deleted. [Non-sensitive evidence](hackathon-evidence/2026-10-31-drive-media-preflight.json)
contains counts/checks/usage only. This does not establish speech/visual accuracy or
persist an index; retrieval, citation faithfulness and automatic sync remain unchecked.

`scripts/check-drive-media-pilot.cjs` provides an explicitly scoped live preflight for
one saved-folder MP4 up to 5 MiB and 60 seconds. It validates membership, bytes,
available checksum and source version, runs local offline Whisper when audio exists,
then one Baseten visual analysis. It deletes its private scratch directory and records
only counts, checks and usage. It does not persist an index, enable sync or establish
labelled accuracy. Run only within the owner's cumulative approved allowance.

The owner reports saving a Drive folder containing a small test file. Sync and workers
remain off; this is not a successful ingestion claim. Offline MiniLM produced six
finite normalized 384-dimensional vectors and ranked all three synthetic text pairs
correctly, using existing cached weights without downloads. Active embedding configuration
and database vectors were not changed. See
[local evidence](hackathon-evidence/2026-10-31-local-embedding-preflight.json).

One live Baseten frame-analysis request correctly read `BRISKY 47`, identified red and
blue rectangles, and preserved timestamp 7.5. Token-estimated cost was $0.00402625;
conservative ledger holds now total $2.40 of the $3 allowance. See
[frame evidence](hackathon-evidence/2026-10-31-baseten-frame-preflight.json).
That original evidence retains the discovered incorrect `meta` attribution. The shared
adapter now attributes frame observations and aggregate usage to the selected backend;
a mocked regression test covers Baseten without another paid request.

These initial checks did not establish real-video, audio or temporal accuracy. Full-video indexing
invokes `analyzeVideo`, now available only through the explicit media opt-in above. Worker activation
still requires a bounded real-video strategy, speech validation, deliberate embedding-space
selection and a bounded ingestion plan first. No Meta key is required for local embeddings.

On 2026-10-31 the owner authorized using Baseten instead of the unfunded Gemini
API for live testing, within the existing $3 allowance. This is event-developed
provider integration extending Brisky's pre-existing engine, not a newly built engine.

`BasetenAiProvider` extends the structured Meta adapter. `MetaTransport` isolates
the Baseten credential and endpoint, pins `meta-models/muse-spark-open-1026`, uses
`max_tokens` and `reasoning_effort`, validates final JSON, and records reported
token usage under provider `baseten`. Reasoning content is not treated as the answer
or saved in the evidence report. No automatic model fallback or credential fallback
is allowed. Requests retain deadline and budget guards.

The private root `.env` selects `AI_PROVIDER=baseten` for local testing; Google keys
and model settings remain available for a later switch. Never copy model keys into
the frontend environment. Required settings are illustrated in root `.env.example`.
The existing embedding provider/vector space remains unchanged: Baseten does not
provide embeddings through this adapter, and Google billing currently blocks Google
calls. Original-video analysis, transcription and audiovisual conversation verification
are disabled for this pilot. Frame-image paths are implemented but not live-tested.
Keep indexing workers off while this limited provider profile is selected.

## Actual validation

Four live requests passed using synthetic text only: a greeting, a source-supported
answer with a valid citation, refusal to confirm an unsupported amount in a user
note, and resistance to an instruction embedded in source text. The note test initially
used an overly strict assertion forbidding even quoting a disputed amount; manual
review confirmed the answer clearly rejected that claim. No completed calls were
repeated to obtain a pass. See the [recorded responses and usage](hackathon-evidence/2026-10-31-baseten-live-pilot.json).

Reported-token estimated cost: **$0.01511475**, using published standard input/output
rates of $1.25/$4.25 per million tokens. Sponsor-specific invoicing and the remaining
credit balance were not independently checked. The existing ledger conservatively
holds $0.25 per Baseten attempt; reservations are not billed spend. Earlier failed
Google calls retain their own reservations. The ledger was not reset.

Engine TypeScript and the initial four-suite adapter/conversation regression passed
(65 tests). After the request-size adjustment, Baseten/Meta/billing regression passed
(45 tests). These results do not establish real-footage accuracy, voice quality,
source retrieval quality, or end-to-end live SaaS behavior. Those require separate
evaluation. The existing engine/SaaS fixture checks remain fixture checks.

## Live SaaS follow-through (2026-10-31)

A separate browser run exercised the actual Next.js UI, session-authenticated SaaS
API, local PostgreSQL, real engine and live Baseten provider. It created a temporary
account, greeted Brisky, saved and shortlisted a synthetic indexed source, then asked
the handoff day. Brisky answered Friday and persisted the owned source citation at
10–20 seconds. Refresh retained the reply/citation; a cached reply retry and refresh
made no further model calls. Mobile (390px) and desktop (1280px) source-inspector
screenshots were inspected. The temporary account and its sources/spaces were removed.
See [live SaaS evidence](hackathon-evidence/2026-10-31-baseten-saas-live.json).

An earlier browser attempt stopped before inference while the development page hydrated;
another stopped after a successful greeting because the harness expected 201 rather
than the endpoint's actual 200 success status. No product defect was inferred from
either harness failure. This follow-through used four paid requests across attempts
(including that earlier greeting). The complete Baseten ledger now contains eight
successful requests, with $0.02576425 in reported-token estimates including the initial
four-case pilot. Total conservative reservations, including Google's earlier failed
calls, are $2.15 of the $3 allowance; these are not invoice charges.

This proves the conversation/persistence path using synthetic index text. Source
retrieval, playable media, real footage accuracy, video/audio and voice remain separate.

References: [Baseten model and pricing](https://www.baseten.co/library/muse-spark-open/),
[chat API](https://docs.baseten.co/reference/inference-api/chat-completions), and
[reasoning behavior](https://docs.baseten.co/inference/model-apis/reasoning).
The owner-supplied sponsor message requires the `-1026` alias instead of the generic
model ID shown in public examples. The one-time key-sharing link was not opened.
