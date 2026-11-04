# Voice provider transition

Owner direction, 2026-11-03: the reported updated event rule requires Meta-only
model use. The exact organizer wording/link has not yet been supplied. Treat
Gemini Live below as an explicitly requested development experiment, not a
Meta-only submission configuration. No compliance guarantee is made.

## Agreed MMS work and current status

2026-11-04 implementation update: the streaming Meta ASR/text + resident MMS
profile is implemented, with separate MMS read-aloud/previews and cache. Gemini
paths are retained. See [setup, measured scope and remaining checks](meta-mms-voice.md).
The following is the original agreed plan; whole-project model compliance,
real-accent acceptance and production performance are not established by this work.

- Preserve Gemini speech and the turn-based controller behind provider selection.
- Add a locally hosted `facebook/mms-tts-eng` adapter; download/setup must be
  scripted with pinned versions and documented for judges.
- Keep the model resident between requests; synthesize complete sentences in
  sequence while later sentences can be prepared. This is sentence-level
  delivery, not a claim of native incremental MMS inference.
- Measure cold startup, warm time to first audio, whole-turn latency, CPU/RAM,
  pronunciation and naturalness on the target PC before calling it faster.
- Give the Meta-only profile its own voices and acknowledgement assets/cache.
  Never fall back to Gemini or serve Gemini-generated clips in that profile.
- Audit voice transcription, embeddings, face detection/matching, all provider
  fallbacks and setup scripts against the exact rule. Changing TTS alone does
  not establish Meta-only operation.
- MMS weights are CC-BY-NC 4.0. Check suitability before commercial deployment.
  The model card lists no hosted inference provider; an open public API is not
  assumed. See https://huggingface.co/facebook/mms-tts-eng.

## Gemini Live development path

This is new event-period engineering on the existing SaaS/engine foundation,
explicitly requested before the Meta-only switch. The earlier turn-based voice
implementation is retained. It is not the original pre-event Brisky engine.

Root environment (not the browser environment):

```dotenv
VOICE_ENABLED=true
VOICE_CONVERSATION_MODE=live
VOICE_LIVE_MODEL=gemini-3.8-live
VOICE_LIVE_PUBLIC_URL=ws://localhost:3001/api/v1/saas-engine/voice/live
VOICE_LIVE_APP_ORIGIN=http://localhost:3000
```

Uses the existing server-only Gemini speech key. `AI_MODEL_PRICING_JSON` must
include `google-live/gemini-3.8-live` with a $1 session reservation and conservative
audio token rates $3/M input and $12/M output. Official text rates are lower;
we do not claim this upper-rate accounting is an invoice. A completed/closed
connection keeps the $1 hold because the last usage event may omit outstanding
audio/context. Preserve/reconcile the append-only ledger; never clear it. The
owner's cumulative $30 testing ceiling remains in force.

Start PostgreSQL/Redis when needed, then run `pnpm dev:api` and `pnpm dev:web`.
No worker is needed for a voice session over already indexed sources. Open
http://localhost:3000/search, sign in and use the existing Voice Mode button.
Microphone access needs localhost or HTTPS. Use headphones for the first test.
For deployment, expose the engine WebSocket through TLS (`wss://`), allow the
exact SaaS origin, and route WebSocket upgrades to the same engine instance that
issued the ticket. This initial relay uses process-local state, not a shared
multi-instance session store.

To restore the previous implementation, set `VOICE_CONVERSATION_MODE=turn-based`
and restart the engine, then reload the browser. Existing read-aloud and voice
auditions continue to use the separate Gemini TTS implementation.

The authenticated SaaS mints a one-use 30-second engine ticket; the persistent
WebSocket is relayed by the engine. No permanent Google credential reaches the
browser. Raw 16 kHz PCM flows from an AudioWorklet, including while replies play;
24 kHz PCM replies are queued as they arrive. Provider interruption clears queued
audio. Pause stops microphone transmission; exit/permission errors stop tracks,
audio nodes and sockets. Calls have a five-minute maximum, two global active
connections, one active connection per owner, bounded messages/audio and no
automatic paid reconnect. Session resumption is not implemented.

Live handles greetings and the spoken conversation. Media requests call
`consult_brisky`: the existing authenticated Space flow saves the task and Meta
reply/citations, then returns that derived text to Google for spoken delivery.
This intentionally sends returned media analysis to Google during the opted-in
development session; no original Drive video is sent by the Live adapter.
The UI displays no live transcript. Casual Live-only exchanges are not currently
persisted as Space messages. Tool decisions/rephrasing are model behavior and
must be evaluated; they are not guaranteed by unit tests. Cancelled calls cannot
undo an already accepted saved-Space request; late results are not played.

Official references checked 2026-11-03:
- https://aistudio.google.com/docs/pricing#gemini-3.8-live
- https://github.com/google-gemini/gemini-skills/tree/main/skills/gemini-live-api-dev

Validation results are recorded in `hackathon-contributions.md`; do not infer
real microphone quality or latency from offline fixtures.

Owner-requested delivery tuning: Live now requests a warm, grounded, relaxed
tone, comfortable pacing, short natural pauses, soft endings and subtle emphasis.
Kore and the Live model remain selected. This is a prompt preference, not a
guarantee of matching the separate TTS voice; listening comparison remains open.
