# Streaming Meta voice with local MMS

This event-period addition composes Muse Voice Transcribe, streamed Meta text
dialogue and a resident Meta MMS English synthesizer. It reuses the existing
SaaS authentication, Space/Meta tools and immersive voice UI. Gemini Live and the
earlier turn-based voice implementation are retained as separate configurations.

## Setup for a new host

Install the monorepo dependencies as described in the root README. Install
Python 3.11–3.14, then run from the repository root:

```sh
pnpm setup:mms
pnpm setup:mms --check
```

Setup creates `.venv-mms`, installs CPU PyTorch 2.10.0 and Transformers 4.57.6,
and downloads `facebook/mms-tts-eng` at revision
`c71de0fe7204c83f1c10820a7d696d0b450048ba`. The 145,227,512-byte safetensors
weights are SHA-256 checked against
`69cf8b651c1493f1801dfd2311c298d694a38357bc9a1e41f410491ea6f0e1be`.
Small model/tokenizer files and the upstream README are retained with a local
integrity manifest. Downloads can resume. `--check` does not download/install.
API/worker startup never downloads models. CPU packages plus weights require
several hundred MB of disk; startup/RAM/speed measurements are host dependent.

Root `.env` (never browser variables):

```dotenv
VOICE_ENABLED=true
VOICE_CONVERSATION_MODE=meta-mms
META_API_KEY=your-server-only-meta-key
META_VOICE_MODEL=muse-wonder-1.0
MMS_MODEL_DIR=storage/mms-models/eng
# Optional overrides for separately provisioned hosts:
# MMS_PYTHON_BIN=/absolute/path/to/isolated/python
# MMS_CACHE_DIR=storage/voice-cache/mms
VOICE_LIVE_PUBLIC_URL=ws://localhost:3001/api/v1/saas-engine/voice/live
VOICE_LIVE_APP_ORIGIN=http://localhost:3000
```

For remote browsers use HTTPS and a `wss://` public relay URL, and configure the
exact SaaS origin. The engine issuing a one-use ticket must handle that socket;
shared multi-instance connection state is not implemented. No permanent model
key is sent to the browser.

Keep the existing explicit Meta text pricing and cumulative allowance. Add this
entry to `AI_MODEL_PRICING_JSON` without replacing other model prices:

```json
"meta-asr/muse-voice-transcribe-1.0": {
  "reservationUsd": 0.05,
  "inputUsdPerMillion": 0,
  "outputUsdPerMillion": 0
}
```

Muse Voice Transcribe is billed at $0.18 per hour of audio processed, not by
tokens. The zero token-price placeholders above are unused, not a free-service
claim. Each five-minute stream retains its $0.05 admission hold; no fictional
token count is used to settle audio charges. Reconcile against provider billing.
Each streamed Muse Spark dialogue call reserves/settles through its existing
text-model rates and reported usage. MMS inference is local, with no paid API.
The owner's $30 cumulative testing ceiling and append-only journal remain intact.

With PostgreSQL/Redis available, run the existing two services:

```sh
pnpm dev:api
pnpm dev:web
```

No indexing worker is needed for voice over already indexed sources. Open
http://localhost:3000/search, sign in and start Voice Mode. Use headphones for the
first test. First use loads MMS; later requests reuse its Python process. The
existing wave/orb screen has no visible transcript. Settings exposes the single
MMS English voice in this profile and preserves the prior Gemini preference.

## Pipeline and cancellation

The browser AudioWorklet sends 100 ms packets of 16 kHz mono PCM throughout a
call, including during playback. The engine sends paced binary audio to Meta's
`wss://api.meta.ai/v1/asr/realtime` in `ENDPOINTING` mode. Only `speechComplete`
starts reasoning; partial hypotheses never become user commands. Turn IDs are
tracked so an older final arriving after newer speech cannot start a stale reply.
"Brisky" is a vocabulary hint, not a guarantee of recognition. English is
supported; Nigerian accents, Pidgin, names and local-noise accuracy still need
the owner's listening/recognition acceptance. Confidence scores are not supplied
by this API and are not invented by Brisky.

On new speech, the current reasoning fetch is aborted, pending tool responses
are cancelled, browser audio is cleared and queued synthesis is discarded. An
already running local sentence may finish CPU work, but its stale audio is not
played. Model-detected speech-start still has network/model latency; it is not
claimed to be acoustically instantaneous. Pausing the microphone sends no more
captured audio; the ASR connection receives silence to preserve its real-time
pacing contract, which can still incur audio-processing charges until exit.

Meta text deltas are assembled into short complete sentences and synthesized
sequentially by MMS while later text arrives. Speech is delivered as PCM packets
over the existing authenticated WebSocket. This is sentence-level synthesis,
not native token-by-token MMS audio generation. Media questions call the existing
Space tool: its Meta answer and citations are saved, then the completed answer is
spoken sentence by sentence. That existing tool response is still buffered;
streaming its saved answer during generation remains future work. Casual voice
exchanges stay in call context and are not yet saved as Space messages.

Read-aloud and fixed-sentence previews also use MMS in this mode, with a separate
owner/model-specific private cache. The legacy recorded-turn transcription route
is disabled in this profile rather than falling back to Gemini. Public Gemini
acknowledgement audio is not requested by this controller. Errors never trigger
a provider switch. The original Gemini code/assets remain for explicit later use.

Calls are bounded to five minutes, two global active sessions, one per owner,
bounded audio/frame queues and authenticated tools. There is no automatic paid
reconnection. Closing releases browser devices, inference requests and ASR;
the local MMS process stays resident until engine shutdown.

## Submission boundary and remaining checks

Validation on the owner's CPU host (2026-11-04):

- Setup integrity check passed. Published safetensors checksum matched. Initial
  cold loading while dependencies were installing took 71s; a later process
  loaded in 16s. The engine prewarms the model and keeps it resident.
- Four threads worked best among 1/2/4 on the i7-8665U. Warm "Hello there!"
  synthesis was 1.05–1.08s for 1.46s of speech; a longer test sentence was
  1.63–1.79s for 2.56s of speech. A separate longer-reply run took about 4.2s.
  These are fixed generated sentences, not a general throughput guarantee.
- Actual Python working set was about 552 MiB after reply synthesis. The small
  Windows launcher is a separate process and is not the model RAM measurement.
- Generated-audio authenticated relay test: greeting first PCM after speech end
  3.768s, full synthetic media-tool response completed, two speech-start
  interruption events, authentication/CSRF/origin/replay denial passed.
- Owned-message MMS read-aloud: first PCM 1.711s, whole generation 11.114s;
  cached replay first PCM 58ms, whole replay 81ms. Temporary Space/session removed.
- Standalone generated farewell passed with real Meta ASR and MMS after fixing
  a model-only end-call failure. Narrow local farewell detection avoids requiring
  an extra model call; model-classified other intents still need acceptance.
- Isolated 390/1280px browser checks passed continuous mic during playback,
  cancellation, same-Space tools, no visible transcript, pause/exit cleanup,
  interrupted-farewell recovery, single MMS voice selection, preserved Gemini
  preference and caption toggling without another preview request. Browser media,
  sockets and Space writes were mocked; no personal recordings were used.

This demonstrates plumbing and generated-input behavior, not Nigerian-accent
accuracy, real acoustic echo cancellation or parity with Gemini Live.
Final engine build, web type/lint, setup verification and 57 checks across ten
engine suites passed.

MMS weights use CC-BY-NC 4.0; retain attribution and review suitability before
commercial use. The voice profile uses Meta models, but that does not certify
the entire project against the reported updated rule. Existing local embedding
and face-model choices, all non-voice fallbacks, the exact organizer wording,
and public-repository history/secret review require their own final audit.
Do not present the pre-existing Brisky engine as newly built for the event.
Use `hackathon-contributions.md` for implementation and actual validation status.

Official references checked 2026-11-04:
- https://dev.meta.ai/docs/speech-to-text
- https://dev.meta.ai/docs/api-reference/voice/realtime
- https://dev.meta.ai/docs/pricing-rate-limits
- https://dev.meta.ai/docs/cookbook/streaming-responses
- https://huggingface.co/facebook/mms-tts-eng

Transport follow-up (2026-11-04): wall-clock PCM pacing tolerates timer drift and up to three seconds of bounded input jitter. Known cancelled/completed tool results are ignored on arrival; fabricated IDs remain rejected. Sanitized server warnings distinguish backlog from malformed input. Real-user confirmation of the reported first-message disconnect remains pending. English config has num_speakers=1 and speaker_embedding_size=0: language checkpoints are not selectable English voice identities.

Search interruption correction (2026-11-04): speech interruption now stops dialogue/playback, not a dispatched Space search. Completion updates voice history and queues an announcement for the next listening gap. Common search-status questions use current search state without another media request; at most one Space search runs per call at a time. Saved user prompts retain the finalized ASR text rather than generated tool-argument commentary. Ending the call stops result playback; already submitted saved-Space requests may still finish. Eighteen offline regression checks pass; real microphone acceptance remains pending. This supersedes earlier statements that speechStart cancels pending search tools.

Casual conversation routing (2026-11-04): only actionable media requests should invoke the saved-Space tool. Thanks and positive result confirmations stay in ephemeral call history, with tool choice disabled and an additional dispatch guard for whole-utterance acknowledgements. Mixed thanks plus a new request are not suppressed. Direct conversational generated text feeds MMS; there is no separate saved chat response for these turns. Existing accidental saved messages remain untouched. Twenty-one offline voice checks pass; owner microphone acceptance remains pending.

Wonder voice trial (2026-11-04): active local META_VOICE_MODEL is muse-wonder-1.0; explicit Spark alternatives remain supported. Merge meta/muse-wonder-1.0 pricing (reservationUsd 0.25, inputUsdPerMillion 4, outputUsdPerMillion 20) when using it. Video and saved-Space model selection are independent. See [comparison and reproduction](voice-model-comparison.md) for eight synthetic scenarios per model, observed decisions, cost and limitations. Owner microphone acceptance remains pending.

Farewell follow-up (2026-11-04): a recognized end-session intent now emits normal ending even if local farewell speech fails, rather than demanding reconnection; new user speech still interrupts closure. Search-result announcements wait during farewell. The owner's reported failure could not be reproduced with the exact text; sanitized errors now distinguish known synthesis/provider failures without recording audio or transcripts. Local synthesis of both farewell sentences passed. Dancing queries require actual video verification, and saved replies now receive explicit video/frames query-check metadata.

Live dancing search recheck passed in 36.594 seconds: actual moving video was verified, response confirmed dancing, and citation narrowed to 1.5-9.5 seconds with searchStatus=complete. No library reindex or saved-message rewrite. This is a single-query check; the original microphone farewell failure remains unreproduced, with graceful closure now regression-tested.

## Gemini TTS relay streaming (November 4)

Under the disclosed TTS-only exception, the Meta conversation relay can forward
Gemini PCM as SSE audio deltas arrive. It still waits for complete response-text
sentences from Meta, but no longer waits for the entire sentence's generated audio.
Normal replies, search announcements, status replies and farewells use this path.
MMS remains the non-streaming local sentence fallback when explicitly selected.
No provider switch happens automatically after partial audio has played.

52 offline voice/relay checks passed, plus API compilation. A generated-only live
Kore sentence delivered first audio at 1558 ms and completed at 10043 ms (82 PCM
chunks). That is one TTS-path observation, not total microphone-to-response latency.
Interruptions abort the request and discard stale audio; incomplete streams are
not cached as successful replies. There is no guarantee of a particular latency.
