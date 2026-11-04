# Meta Model API adapter

## Direct Meta pilot and selection — 2026-11-01

The owner supplied `META_API_KEY` and authorized integration. Authenticated model
discovery returned HTTP 200. Root private configuration now selects `AI_PROVIDER=meta`,
`META_MODEL=muse-spark-1.3` and `META_VIDEO_MODEL=META_AUDIO_MODEL=muse-spark-1.2`.
Baseten settings remain available. Local Whisper and embedding space are unchanged.
Standard-mode model IDs are used; Contributor variants are not selected.

[Official modality guidance](https://dev.meta.ai/docs/video-understanding) warns
that 1.3 audio understanding is not fully supported; audiovisual work therefore
uses 1.2 in this pilot. [Published token rates](https://dev.meta.ai/docs/pricing-rate-limits)
checked today are $1.25 input/$4.25 output per million for both Standard versions.
The existing pricing map was merged, not replaced; each Meta call reserves $0.25
under the unchanged cumulative $10 ceiling and append-only usage journal.

`node --env-file=.env scripts/check-meta-live.cjs --live` runs bounded direct-provider
checks with generated graphics/silence only. Five live checks passed: natural greeting,
cited indexed-evidence reply, red-to-blue native-video analysis, empty silent transcript,
and contextual abstention despite invented transcript cues and unusable person anchors.
Five calls total $0.024083 in reported-token estimates, not an invoice. The shared
ledger counts $1.157388 toward the allowance after this run. No personal media,
Drive access or workers were used. Generated temporary media is cleaned afterward.
Evidence: `docs/hackathon-evidence/2026-11-01-meta-live-pilot.json`.
The engine was rebuilt/restarted with this configuration; `/api/v1/health` returns
HTTP 200. PostgreSQL/Redis were already running; Docker was not started by the agent.
No standalone indexing or face worker was started.

99 targeted regression tests across five suites and API build pass. These checks
validate direct transport and a negative contextual case; positive real-conversation
accuracy and the complete SaaS/browser workflow remain unverified. The event contribution
is the teaching/contextual-evidence/grounded-answer workflow; hosting selection alone
is not represented as a new product capability. The historical record follows.

Implemented 2026-10-30 as event-developed work. **Historical configuration at implementation: Gemini.** The owner
requested the adapter across the existing AI interface without switching providers
or models. No active `.env` settings, credentials or spending allowances were edited.
No live Meta requests, model downloads, Docker or paid inference were used.

Pre-existing foundations include indexing, frame extraction, transcription, search
and the dashboard. The provider-neutral interface and Google adapter were earlier
event-developed work, already present before this task. This contribution adds a Meta implementation and offline contract tests;
it does not establish live Meta availability, accuracy, latency or billing.

## Coverage

| Existing interface method | Prepared Meta path | Evidence boundary |
| --- | --- | --- |
| `understandQuery` | Structured text request | Preserve constraints; malformed/unavailable output falls back to the raw query |
| `decomposeQuery` | Reuses understanding, one model call | Compound flag must agree with subquery count |
| `analyzeFrames` | Batches of four timestamp-labelled images | Require one valid observation per frame; preserve exact source timestamps and OCR text |
| `analyzeVideo` | Native video input with probed duration | Ordered, bounded, non-overlapping segments must cover the supplied duration; no silent frame-only substitute |
| `transcribeAudio` | FFmpeg audio chunks, then structured audio input | Validate relative cue times against each chunk and add source offset once; errors do not yield a completed partial transcript |
| `verifyCandidate` | Sparse original frames plus transcript context | A positive match must cite a supplied timestamp; uncertainty remains insufficient evidence |
| `verifyClip` | Native moving clip plus context | Check clip/source duration agreement; validate relative time and translate to source once |
| `verifyConversation` (new subsequent interface extension) | Moving clip plus exact labelled face anchors and timed cues | Require a two-person grounded exchange with valid IDs and time bounds; same contract as Gemini, still dormant |
| `generateEmbedding` / `getEmbeddingModel` | Explicitly retain existing Google embedding adapter | No Meta embedding endpoint or vector-space compatibility is assumed; local embeddings still follow existing application selection |

Supporting getters expose only the separately configured Meta generation model/cascade
when Meta is explicitly selected. Manual people search, FFmpeg, local Whisper, local
embedding inference and face-evaluation tools remain independent of this adapter.
Conversation verification is a subsequent, scoped backend feature described in
[its evidence contract](conversation-verification.md). Microphone/speech-output voice
mode remains planned; adapter existence alone does not implement it.

Source: `apps/api/src/modules/pipeline/providers/meta-ai.provider.ts` with strict
output contracts in `meta-contract.ts` and bounded HTTP/accounting in
`meta-transport.ts`. `AiIntelligenceService` can construct the adapter, but its
default remains `AI_PROVIDER=google`. The owner subsequently selected Baseten for testing;
see the current transition plan below.

## Direct Meta transition plan (2026-10-31)

The owner wants Baseten for testing and the direct Meta Model API for the actual flow
after validation. Baseten currently serves the sponsor's Meta model; changing host is
separate from choosing a model. No direct Meta key, endpoint or model is selected by
this preparation. Direct Meta calls remain unverified.

The SaaS uses the same engine-facing interface for both hosts. Select `AI_PROVIDER=meta`
only after configuring a dedicated `META_API_KEY`, exact accessible `META_MODEL`, and
explicit `META_VIDEO_MODEL` / `META_AUDIO_MODEL` when those modalities are required.
Confirm each exact model's modalities and pricing against the direct provider, then add
verified `meta/<model-id>` entries to `AI_MODEL_PRICING_JSON`. Baseten sponsor credentials
and its `-1026` model alias must never be copied into Meta settings. Preserve the cumulative
ledger and approved ceiling across the switch; restart engine/workers to load settings.

Run equivalent timestamp, unsupported-evidence and speech fixtures against Meta before
enabling production ingestion. Meta and Baseten share output validation, source offsets,
cancellation and accounting, while request encodings remain provider-specific: Baseten
audio uses `audio_url`; the existing direct Meta adapter uses `input_audio`. Baseten native
video is visual-only and rejects generated dialogue; speech comes from local Whisper or
separately supplied audio. Do not assume direct Meta has identical audio/video semantics.

Keep FFmpeg, local Whisper and the selected embedding space independent of generation
host. Existing 3072-dimensional Google vectors must not be compared with 384-dimensional
MiniLM vectors. A switch in generation host alone requires no embedding migration.

## API contract research

Official documentation checked on 2026-10-30:

- [Meta API reference](https://dev.meta.ai/docs/api-reference): dedicated bearer
  authentication at `https://api.meta.ai/v1`.
- [Chat completion request/response schemas](https://dev.meta.ai/docs/api-reference/chat-completions/schemas):
  text, image, video and audio content parts, completion limits, finish reasons and usage.
- [Structured output](https://dev.meta.ai/docs/structured-output): JSON schema response format.
- [Image understanding](https://dev.meta.ai/docs/image-understanding).
- [Video and audio understanding](https://dev.meta.ai/docs/video-understanding):
  native video and audio input. Its current warning says Muse Spark 1.3 audio
  understanding is not fully supported and its audio examples use 1.2.
- [Model catalog](https://dev.meta.ai/docs/models): model families/modalities;
  account-specific availability must still be checked before use.

There are no default Meta model IDs. Keep text/frame, video and audio models explicit
so an unsupported or degraded modality does not get silently routed to the main model.
Documentation examples are not evidence of access with this owner's key or of credit
eligibility. This adapter targets Meta's documented chat-completions protocol, not an
assumed legacy Llama API envelope or a Baseten endpoint. Baseten hosting is separate work.

## Configuration remains inactive

The original dormant setup retained `AI_PROVIDER=google`, current `AI_MODEL`/fallbacks, `AI_EMBEDDING_MODEL`,
`EMBEDDING_PROVIDER` and `TRANSCRIPTION_PROVIDER` unchanged. `.env.example` documents
dormant settings only; the adapter does not read neutral Google keys as Meta keys.

| Setting | Behavior |
| --- | --- |
| `META_API_KEY` | Dedicated key; falls back to `MODEL_API_KEY` only when absent. An explicitly empty value suppresses that fallback |
| `META_MODEL` | Required primary text/frame model if Meta is later selected; default empty |
| `META_FALLBACK_MODELS` | Optional comma-separated text/frame fallbacks, maximum four total models |
| `META_VIDEO_MODEL` / `META_VIDEO_FALLBACK_MODELS` | Explicit native video models; no automatic fallback to a text-only configuration |
| `META_AUDIO_MODEL` / `META_AUDIO_FALLBACK_MODELS` | Explicit audio models, independently validated for audio support |
| `META_MAX_OUTPUT_TOKENS` | 4096 by default; positive integer up to 32768, includes completion/reasoning budget |
| `META_REQUEST_TIMEOUT_MS` | 30000 by default; maximum 240000 |
| `META_MAX_MEDIA_BYTES` | 50,000,000 bytes default/maximum per inline file (Meta documented limit) |
| `META_MAX_REQUEST_BYTES` | 70,000,000 bytes default/maximum serialized request (local envelope allowance for base64 + JSON) |
| `META_TRANSCRIPT_CHUNK_SECONDS` | 90 by default, positive integer up to 300 |

The adapter keeps the current shared `AI_BUDGET_USD`, ledger path and pricing contract.
Each enabled model needs a verified `meta/<exact-model-id>` pricing entry, with positive
`reservationUsd` and finite input/output token rates. No live prices are supplied or
invented. Delegated Google embeddings retain `google/<embedding-model>` pricing and
Google attribution. Balances from different sponsors are not interchangeable funds.

Do not enable Meta or make a paid pilot until the owner asks to do so. Later live
validation must pin selected models, verify account access, modality behavior and
rates, and compare grounded results on agreed footage before claiming readiness.

## Failure, cost and evidence handling

- Requests are serialized per adapter instance. Google concurrency behavior is
  unchanged. Queued searches re-check cancellation before any paid dispatch.
- The transport uses native fetch, a fixed HTTPS endpoint, no redirects, no SDK
  retries and no implicit provider/model substitutions. Each explicitly configured
  transient HTTP fallback is a new metered attempt; there are no same-model retries.
- Positive budget/pricing is checked before payload preparation. Budget reservation
  is committed immediately before each POST. Failed, cancelled and unknown requests
  retain reservations. This limits admitted work, not the provider's actual bill.
- HTTP 429/5xx can try the next explicitly configured model. Auth/client errors,
  truncated output, refusals and malformed evidence are not silently retried.
- Strict JSON schemas are accompanied by runtime field/type, timestamp, coverage
  and consistency checks. Media text is treated as evidence, never instructions.
- Response bodies are capped at 2 MiB. Partial output or invalid evidence cannot
  become a verified match. Response bodies, prompts, media and credentials are not
  written to the usage ledger or included in sanitized transport errors.
- Reported prompt/completion tokens settle the attempt; completion reasoning is
  not added twice. Missing counts stay unknown (`estimatedUsd: null` in the journal).
  Legacy `ModelUsage` numeric fields use zero with `usageSource: unknown`; zero is
  not proof of free inference. The journal retains reservations and failed attempts
  that cannot be fully represented by one successful method's aggregate usage.
- Image batches preserve their actual frame timestamps. Native video and audio
  are sent as bounded inline content; there is no persistent remote file upload.
  Large media exceeding bounds fails explicitly instead of silently downsampling.
- Supported input encodings are JPEG/PNG/WebP images, MP4/WebM/MOV video and
  MP3/WAV audio. This is adapter request support, not a measured provider codec
  guarantee. Other video containers require explicit conversion before this path.
- Audio chunking uses the existing FFmpeg helper in a uniquely named scratch
  directory and removes only that checked directory afterward. Real speech-boundary
  timing, chunk padding and remote transcription quality remain unmeasured.

Some existing worker/checkpoint and artifact keys still use names such as
`gemini_video`, `gemini_segment` and `gemini`. Those are compatibility names,
not proof of which model ran. Adapter output/observations and per-attempt ledger
identify actual providers/models. A full worker run and persisted provenance audit
remain part of future provider-switch validation; no live switching is claimed here.

## Validation

Offline tests exercise every current AI method using synthetic media bytes, stubbed
FFmpeg metadata/chunks and injected fetch responses. No real decoding, speech or
vision quality is established by these fixtures. Tests cover credential separation,
default Google selection, embedding delegation, per-attempt reservations, fallback
admission, timestamps, malformed/refused/truncated output, bounded payloads,
unknown usage, cancellation, queued cancellation and scratch cleanup.

The final targeted Jest run passed **108 tests** across the adapter/facade, usage
ledger, verification responses, scene verification and people-search regression suites.
API `tsc --noEmit` also passed. Exact final status is recorded
in [the contribution record](hackathon-contributions.md).
No schema or frontend files needed changes for this adapter.

Video descriptions have a separate `META_VIDEO_MAX_OUTPUT_TOKENS` allowance
(default 8192; maximum 32768), including reasoning. Ordinary requests continue
to use `META_MAX_OUTPUT_TOKENS`. Baseten uses the corresponding
`BASETEN_VIDEO_MAX_OUTPUT_TOKENS` override with the same default. These are output
bounds, not spend authorization; the existing usage ledger/cumulative cap applies.
