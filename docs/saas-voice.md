# Voice conversations

2026-11-04: `meta-mms` now selects continuous Meta transcription, streamed Meta
dialogue and resident local MMS speech. Read-aloud/previews also use MMS with an
isolated cache and no Gemini fallback. The UI is retained; Gemini Live and the
recorded-turn path remain selectable explicitly. See
[setup, measurements and limits](meta-mms-voice.md).

2026-11-03: optional Gemini Live development mode now provides continuous
duplex audio with the same screens and Meta-backed media tools. The turn-based
implementation below remains available. Setup, provider boundaries, MMS plan,
session limits and explicit Meta-only submission exclusion are in
[voice provider transition](voice-provider-transition.md).

The hackathon addition connects the existing Voice Mode introduction and immersive
orb/satin screen to saved Space conversations. Their visual layout is retained.
There is no visible transcription, review form or Send button.

Choose Voice Mode, then Start Voice Mode. Microphone access begins only after that
explicit action. Local audio-level detection ends a turn after roughly 2.8 seconds
of silence following speech (maximum 60 seconds / 2 MiB). Gemini transcribes the
recording internally; the same saved-Space Meta workflow generates the reply, and
Gemini speaks it aloud. During playback, an echo-cancelled microphone listener detects sustained near-end
speech. It stops the reply and transfers that microphone into the next recording.
Playback settling time, an adaptive noise floor and a sustained-signal gate reduce
false interruptions; these are heuristics, not guaranteed speaker separation. Pause stops capture; exit
stops microphone/playback and cancels pending speech requests. Sent messages remain
in the Space. Failures are shown honestly rather than animating fake listening.

Speech-triggered interruption is implemented in the existing immersive UI. The
backend still processes individual turns rather than streaming partial model audio.
The microphone button remains a manual fallback. The roughly 200 ms detection gate
can miss very short interjections or clip the beginning of an interruption. Real
microphones, accents, loudspeaker echo, quiet voices and mobile autoplay still need
user acceptance testing; headphones can reduce acoustic playback leakage.

## Configuration and boundaries

The engine root `.env` owns `VOICE_ENABLED`, `VOICE_TRANSCRIBE_MODEL`,
`VOICE_TTS_MODEL`, `VOICE_TTS_VOICE`, and `VOICE_CACHE_DIR`. Optional
`GEMINI_VOICE_API_KEY` overrides the existing Google key. The web server holds no
speech key. Reasoning remains Meta; speech does not change `AI_PROVIDER`.
Explicit `google-speech/<model>` prices in `AI_MODEL_PRICING_JSON` meter calls
through the existing cumulative $30 journal. Google Cloud credit eligibility is
not established by this implementation.

Authenticated first-party routes: POST `/api/voice/transcribe` and
`/api/voice/speak`, proxied to session-guarded engine routes. Speech generation
accepts an owned saved assistant-message ID, never arbitrary client text.
Microphone temporary files are deleted after transcription. Generated reply audio
is privately cached for up to 24 hours by owner/message/text/model/voice/style.

## Validation

Generated-only Gemini speech/transcription and authenticated Next/engine/Meta
reply checks passed before the immersive presentation correction. These establish
provider plumbing, not real-user speech accuracy. Engine voice/budget/limits tests
passed (50 tests across four suites). The previous transcript-review browser test
is superseded; the immersive automatic-turn browser checks are recorded separately
in the contribution log. No real microphone or personal footage was used in these
voice tests. The original orb, satin background and introduction were existing UI;
the authenticated speech orchestration is the event contribution.

Interruption validation: isolated 390/1280px browser checks passed sustained-speech
interruption, unchanged introductory/immersive presentation, automatic follow-up
submission in the same Space, brief-noise/low-level-leakage rejection and stopping
the playback microphone monitor on exit. All microphone and speech were simulated;
no additional paid calls or real Space writes. TypeScript and changed-file lint passed.

## Voice selection, read-aloud and ending a call (2026-11-03)

Voice & speech Settings offers Kore (the unchanged default), Puck, Charon, Aoede,
Zephyr and Sulafat. Voices are allowlisted on the engine. Both the immersive call
and saved-response read-aloud send the browser-selected voice; an absent selection
uses the configured default. Older browser SpeechSynthesis voice selections are
retained as legacy preferences but no longer control reply read-aloud.

The new authenticated POST `/api/voice/preview` proxy and engine equivalent accept
only a voice and fixed sample index 0-3, never arbitrary text. Selecting a voice
auditions a random non-repeating sample; Preview voice chooses another. Captions
show the sample sentence and can be toggled independently without another call.
Owner/message-or-sample/text/model/voice/style cache identities prevent reuse of
another user's private reply. Cache writes are atomic. Existing metering applies.
The voice names are from Google's [prebuilt voice catalogue](https://aistudio.google.com/docs/speech-generation#prebuilt-voices).

Explicit standalone farewells such as "that's all for the session", "end the call"
or "goodbye" end the call after the saved farewell reply finishes playing. The
matching rule is anchored to the whole utterance so discussing a goodbye in media
does not normally close a call. This is an English phrase rule, not a multilingual
semantic intent model. The immersive overlay is scoped to the main content area,
leaving the desktop navigation visible.

Latency remains sequential: pause detection, audio transcription, Meta planning/
reply, then complete Gemini audio generation before playback. Seven recent successful
transcriptions had a median provider-call time of 3.6s; seven syntheses had 6.12s.
These local observations exclude Meta, browser and network overhead and are not a
performance guarantee. Pause detection was shortened by 300ms, and status labels
distinguish Understanding / Thinking / Preparing voice. Streaming first audio and
interrupting during reasoning remain future work; the microphone is not advertised
as listening during that phase.

Validation: all six fixed-sample voices passed live authenticated Gemini generation.
390/1280px mocked-browser checks passed farewell completion/close/no microphone
restart, desktop sidebar bounds, voice audition and persistence, caption toggle
without more inference, and Space read-aloud selecting Gemini with the saved
message ID. Screenshot inspected; type/lint and five engine boundary/cache tests
passed. The owner reports a natural, accurate real-device conversation; this is
user feedback, not a controlled speech accuracy benchmark.

## Patient turns and shared acknowledgement audio (2026-11-03)

In response to real-device cutoff feedback, silence allowance is now 2.8s rather
than 1.1s and the detector accepts lower-level speech. The short pause limit had
been too aggressive; this change still needs real-device feedback across noise
conditions. Detailed intermediate labels are consolidated into Thinking.

Seventeen fixed acknowledgement variants (the original plus sixteen additional
sentences) have audio in each of the six selectable voices. Generated generic
WAV clips live in `apps/web/public/audio/brisky`; they are shared application assets
for every account, not private per-owner speech cache entries. The browser preloads
only the next selected clip while listening, plays it immediately after the turn
ends in parallel with transcription, then preloads another. A shuffled cycle avoids
repeating a variant until the cycle is exhausted and prevents a boundary repeat.
No model call or account lookup is needed to play acknowledgements. Browser caching
can reuse downloads; a first download still depends on the network. Private saved
reply speech remains authenticated and owner-scoped. These clips acknowledge receipt,
not successful retrieval, and are not saved as substantive assistant messages.
Close, pause and final reply playback stop any acknowledgement in progress.

Ordinary source-free Space replies now use the neutral idle mascot, rather than
the empty/confused squashed pose shown in the owner's screenshot.

## Quoted-moment search repair

A request such as `a moment that says "..."` now forces retrieval instead of allowing
a reply-only plan from previously selected evidence. A new quoted request searches
the archive rather than inheriting a prior kitchen-clip filter. Explicit `in this
clip` scope and participant follow-ups are retained. A second bug dropped quoted
words during fallback query understanding; quoted dialogue now supplies lexical
terms and semantic text through that fallback. Literal spoken quotes bypass the
remote understanding timeout and preserve the original request. Prompts no longer
permit treating supplied excerpts as a complete library inventory.

Validation: the exact exam-questions query passed live against the existing index
with a kitchen clip selected, citing `i_know_nothing.mp4` at 14.8-19.1s and the
duplicate copy at 25.35-27.35s. This establishes retrieval for that case, not general
quote accuracy or exact word alignment. It took about 29s end to end: acknowledgements
improve feedback, while search latency remains. Four engine suites passed 33 tests,
including quoted fallback recall and preserving explicit clip scope. No index reset
or private media re-upload was needed.

Packaging validation completed: all 102 acknowledgement WAV clips (17 x 6) exist
and passed RIFF/WAVE integrity checks. Anonymous HTTP access passed with public
24-hour caching and stale-while-revalidate; no account is needed for generic audio.
The default generation maintenance script is a dry run; explicit `--generate`,
`--voice`, `--max-calls` and optional `--model` keep regeneration bounded. Generation
is not part of app startup. Shipped files require no provider key for playback.

Google returned a 100-request/day Tier 1 cap for gemini-3.8-flash-tts during the
large one-time cache batch. Repeated quota retries were stopped after confirming
the daily cap. Preferred speech remains that model; configured speech-only fallback
is gemini-3.8-flash-lite-tts, retaining the selected named voice. Provider quota
responses trigger a bounded fallback and preferred-model cooldown until retry time;
they do not switch Meta reasoning. Cached preferred-model replies remain reusable.
Fallback cache keys include the actual model; its delivery may sound different.
Pricing is explicitly metered; the existing $30 journal was preserved.
The initial 76 static clips use Flash TTS; the remaining 26 (Zephyr 7-16 and Sulafat
1-16) use Flash-Lite TTS. Primary generated files were not overwritten.

Validation: 34 tests across four engine suites, web types/lint and engine build
passed. Authenticated live fixed-sentence speech succeeded with quota fallback;
390/1280px browser checks passed longer-pause continuation, distinct random
acknowledgements, simple status, neutral idle mascot, session ending and shared
read-aloud settings. A second live search using the same exam request without
quotation marks also passed with the kitchen clip selected, citing 19.1-31s of the
exam source. This tests recognized request text, not a new microphone recording.

## Incremental reply audio (2026-11-03)

Voice mode and saved-response read-aloud now POST `/api/voice/stream` through the
authenticated Next proxy to `/api/v1/saas-engine/voice/stream`. Gemini Interactions
uses `stream: true` and explicit 24 kHz mono little-endian PCM. Engine SSE parsing
forwards bounded format/audio/done NDJSON packets incrementally; the web proxy
forwards the response body without assembling a WAV first. Private no-store/
no-transform and no-buffering headers cover the stream. The existing WAV `speak`
and fixed-sample preview endpoints remain available.

The browser schedules arriving PCM buffers through Web Audio, primed from the
user's start/read-aloud gesture. Playback rate and named voice choices are retained.
It reports Speaking when the first buffer is scheduled and resumes listening only
after all scheduled audio has finished, not when the network closes. Interruption,
Stop and Exit cancel the reader and stop every queued source. Closing a call releases
its reusable playback context; read-aloud owns and releases its own context.
The introduction and immersive presentation are unchanged; no transcription is shown.

Every stream verifies the owned saved assistant ID before cache/model access. The
existing shared ledger reserves and settles `voice_synthesis_stream` using reported
usage. Actual-model private cache identities are reused across unary and streaming
speech. Only completed provider output is cached; cancellation/truncation cannot
become a successful cache entry. Interrupted/unknown attempts retain reservations.
Quota fallback is bounded to before any audio is emitted so partial voices are not
spliced together. Known quota cooldowns fail over or fail fast without repeated
unproductive provider requests.

Parser safeguards cover split SSE/UTF-8 boundaries, canonical base64, required
completion marker, rate/channel/encoding validation, 16 MiB PCM/24 MiB wire limits,
backpressure and disconnect cancellation. An error after headers becomes an error
packet; EOF without a done packet is never treated as a complete reply.

Validation: five engine suites passed 39 tests, including early chunks, WAV cache
roundtrip, ownership, cancellation/no partial cache and quota fallback. Engine
build and changed-web type/lint checks passed. At 390/1280px, simulated browser
checks passed playback before network completion, interruption cancelling the
reader/stopping queued sources, delayed microphone resumption until playback end,
same-Space follow-up, and selected-voice read-aloud/Stop. No actual microphone was
used in those fixtures.

One generated-only direct live check received its first PCM in 2.24s and completed
in 4.12s. The authenticated Next/API check received first audio in 2.76s versus
4.28s for the full response; cached replay first audio was 49ms. These are observed
single-run delivery times, not guaranteed acoustic latency or whole-turn timings.
The temporary test Space/session was removed and no personal media was sent.
Transcription, full Meta reasoning/retrieval and pause detection still happen before
reply speech. Meta text streaming and simultaneous processing of unfinished user
speech remain unimplemented; this improvement streams speech, not the whole turn.

Google's [speech streaming format](https://aistudio.google.com/docs/speech-generation#streaming)
and [Interactions event API](https://aistudio.google.com/api-reference/interactions-api)
were checked against the live response.

Social-turn acknowledgement correction: processing clips now wait until a valid
transcript identifies a recognizable work request. Greetings, simple thanks,
check-ins and explicit session endings skip that clip and use the normal Meta
reply. A greeting plus a task can still acknowledge. The local English phrase
gate is conservative; unfamiliar wording may simply skip an acknowledgement.
This removes immediate generic playback during transcription in exchange for
contextually appropriate behavior. Validation: 16 intent cases and 390/1280px
simulated greeting -> search conversation checks passed, retaining streaming,
interruption and selected-voice read-aloud. Types/lint passed; no paid calls.
