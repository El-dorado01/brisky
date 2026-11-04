# Brisky feature TODO

- [ ] Submission-critical: prepare fresh eligible event-component repo and a
  runnable path without declared private dependencies. Enforce Meta-only runtime
  across embeddings, face models, speech and fallbacks. Current MiniLM/Gemini
  embeddings and YuNet/SFace are blockers. See
  [readiness audit](docs/submission-readiness.md) and the exact organizer wording
  in [the brief](docs/hackathon-agent-brief.md).

Updated: 2026-11-01.

- [x] Record durable Factory stage runs; show active/recent files, real stage metrics
  and expandable per-file journeys. Reset the removed test folder's seven assets only.
  See [validation and limitations](docs/factory-stage-history.md).
- [ ] Accept fresh user sync/browser stage progression; retain honest reused/skipped
  behavior rather than forcing every file through unnecessary model work.

- [x] Run an owner-approved real negative source diagnostic and verify contextual
  abstention without outbound calls when local speech cues are absent. This is not
  a positive real-conversation pass; see [scope](docs/conversation-verification.md).

- [x] Validate direct Meta key/model access and generated-only text, video, silent
  audio and contextual-negative requests; select explicit Standard models/rates.
  See [pilot evidence](docs/hackathon-evidence/2026-11-01-meta-live-pilot.json).
- [ ] Validate positive real contextual exchanges and the final authenticated
  Space/session → search → playable citation → shortlist demo against direct Meta.

- [x] Connect confirmed-person contextual verification to Baseten using separate
  aligned audio plus video/anchor frames; retain scoped assessments in Space answers.
  Offline fixture validation only; see [scope](docs/conversation-verification.md).
- [ ] Validate live contextual assessments, direct Meta access/modalities and the
  final Space/session demo flow. Face-recognition quality remains a separate gap.

## Current execution: Drive ingestion and provider readiness

- [x] Organize apps as API, workers and web; preserve moved SaaS environment/dependencies,
  update run documentation and remove scheduler test's persistent fixture directory.
- [x] Cache small indexing sources once per decoder session within transfer/memory caps;
  live cached Drive preparation captures all 32 frames without missing samples.
  See [application layout and validation](docs/app-layout.md).

- [x] Replace successful AI budget holds with recorded usage estimates while retaining
  failed/unknown/in-flight reservations. Preserve journal history and the $10 ceiling;
  update offline report. Forty-one relevant ledger/provider/frame/streaming tests pass.

- [x] Implement combined Save & sync with durable selections and failure/paused feedback;
  harden folder boundaries, cursor ordering, checksum drift and concurrent sync. 24
  regressions, real rollback-only SQL and paused Next/engine HTTP checks pass. See
  [scope](docs/drive-save-and-sync.md).
- [x] Full remote frame/video/preview run: eight units, 31 frame observations and derived
  upload/cleanup passed under the approved $10 cumulative ceiling; historical holds $9.15
  were subsequently reconciled to successful usage estimates without rewriting the journal.
- [x] Real Drive add/rename/content-change/move/delete reconciliation, forced OAuth refresh
  persistence and timer-driven discovery/dedup pass on temporary fixtures.
- [x] Investigate frame coverage: reproduced streamed 15-second decoder timeouts;
  add bounded retries, nonempty-file checks and rejection of incomplete preparation.
- [x] Validate the full queue after the frame guard and cache: eight units, all 32
  prepared/observed frames and preview upload/cleanup passed.
- [x] Add complete-file budget admission and controlled account/size gates; live planned
  queue and Factory UI sync pass. Owner approved persistent scoped worker/polling activation.
  See [controlled sync](docs/controlled-sync.md); live scoped polling passes without
  duplicate work or extra inference for the unchanged source.
  Owner-approved settlement accounting restores allowance for successful known usage;
  historical $9.15 holds are not current billed spend or current allowance usage.

- [x] Retire the old Vite `apps/web` prototype (path now reused by Next.js), update root commands/worker build inputs/lockfile, and organize
  the engine `.env` with unused settings removed. Preserved source edits and private
  config backup in ignored storage. See [environment guide](docs/environment-configuration.md).
- [x] Validate actual remote Drive range-read/local-speech queue path without paid AI;
  subsequent full remote and refresh checks pass above. Broad automatic sync remains off.

Use [the detailed ingestion checklist](docs/media-ingestion-roadmap.md) for the complete
sequence: bounded real-file pilot, embedding-space compatibility, large-file windows,
resumption, Meta Files API lifecycle, direct Meta validation and automatic sync.

- [x] Separate Baseten media/text limits; 45 provider tests pass (2026-10-31).
- [x] Original Drive video/audio component preflight passes; temporary media deleted.
  See [non-sensitive evidence](docs/hackathon-evidence/2026-10-31-drive-media-preflight.json).
- [x] Persist a controlled native-video/local-speech Drive index: 12 segments, owner-scoped
  local embeddings, actual retrieval, cited SaaS reply, source thumbnail/range playback,
  cached retry and shortlist/reload checks pass. See
  [integration evidence](docs/hackathon-evidence/2026-10-31-persisted-drive-integration.json).
- [x] Validate production queue processing against retained real Drive media in an isolated
  Redis queue: seven units, 32 frame observations, speech/video-enriched local vectors,
  pre-inference retry and completed-checkpoint replay pass. See [scope](docs/queue-media-validation.md).
- [ ] Validate labelled source faithfulness; remote Drive queue and scoped automatic
  sync have since passed separate checks above. Large-library accuracy remains unverified.
- [ ] Complete the unchecked large-library and Meta-transition acceptance checks.
- [x] Enable Save & sync, standalone worker and polling for the confirmed account only,
  after owner approval and bounded ingestion validation. Other accounts remain paused.

This file tracks proposed work, not implemented capabilities. Follow
[the hackathon brief](docs/hackathon-agent-brief.md) and update
[the contribution record](docs/hackathon-contributions.md) when implementation
begins or its status materially changes.

## Teach Brisky your people

**Status:** Manual identity/appearance backend implemented locally on 2026-10-30;
32 people/OpenAPI tests and API TypeScript check passed. Rollback-only live PostgreSQL
constraint and authenticated HTTP route checks also passed on 2026-10-30.
Confirmed-appearance identity search is now implemented with live PostgreSQL/HTTP
checks. Scoped conversation verification is now implemented with fixture validation;
A bounded local face-suggestion/review pilot is now connected; recognition accuracy
and full-query verification remain unvalidated. Manual
People directory and source-frame teaching UI are now connected; see
[the teaching UI](docs/people-teaching-ui.md).
Latest backend validation: 147 conversation, provider, budget, people-search,
OpenAPI and verification regression tests passed, along with API TypeScript checking
and rollback-only PostgreSQL/HTTP fixture checks. Decoder/model accuracy is unmeasured.
See [the backend contract](docs/people-identity-api.md).

Offline recognition evaluation tools are prepared in `services/face-recognition/`;
47 synthetic/CLI tests pass. Pinned local models/dependencies and a user-triggered
scan/review flow are installed; generated-image runtime and browser fixtures passed.
Owner-labelled footage has now been tested diagnostically: 22/41 baseline face
extractions, and no useful matching cutoff in this development sample. Formal
held-out accuracy remains unvalidated. A local AuraFace comparison reduced wrong
suggestions but retained detection misses and used substantially more memory/time;
the live model remains unchanged. See [findings](docs/face-evaluation-2026-11-01.md)
and [model comparison](docs/face-recognizer-comparison.md).
See [the evaluation protocol](docs/face-recognition-evaluation.md).

**Goal:** Let a user teach Brisky who people are, then search for moments such as
“find where I was talking to my uncle,” with playable source timestamps and clear
evidence for the requested interaction.

**Existing foundation:** Brisky already has media indexing, transcripts, object/action
descriptions and natural-language retrieval. These are pre-existing functionality,
not new hackathon contributions. Personal identity grounding is the proposed addition.

### Ownership

- Backend/technical work: this agent, primarily in `apps/api/` and supporting services.
- Frontend: coordinated work in `apps/web/`; preserve unrelated ongoing edits.
- Preserve all ongoing frontend and unrelated working-tree edits.

### Backend TODO

- [x] Inspect existing indexing, search, authentication and database boundaries.
- [x] Define and document the first manual-tagging API contract before integration.
- [x] Implement owner-scoped identity storage, aliases and “me”; live DB/HTTP checks passed.
- [x] Implement timestamped manual appearances with confirmed/rejected states.
- [x] Add pending face suggestions and separately confirmed face_match appearances.
- [x] Implement backend tagging and connected UI from a selected source frame/range.
- [x] Add a bounded YuNet/SFace scan with temporary local embeddings and review candidates;
  real-footage accuracy still requires calibration.
- [x] Review candidate model sources/licenses and prepare an offline evaluation harness.
- [x] Prepare/install checksum-verified YuNet/SFace models; generated-image inference passed.
- [x] Obtain owner-authorized footage and reviewed labels; diagnose the development sample.
- [x] Compare pinned AuraFace recognition weights locally with SFace; record accuracy,
  CPU time/memory and provider cost without switching the live model.
- [ ] Improve detection and enrollment coverage; the stronger recognizer alone is insufficient.
- [x] Add context-crop enrollment and label-independent tiled probe detection;
  usable named references improve 8→12 of 28. Detection/recognition gaps remain.
- [x] Recheck all available footage as development data and publish anonymous
  correct/wrong/missed counts. At the selected 0.65 cutoff: 0/12 cross-source
  positives recovered, no wrong matches observed. This is not readiness for auto-confirmation.
- [x] Add owner-opted-in archive scanning in standalone workers, full-video windows,
  revision-aware discovery, duplicate reuse, leases/retry/pause, progress and UI.
- [ ] Improve reliable cross-recording matching and validate automatic confirmation;
  archive suggestions still require review. See [current scope](docs/face-archive-processing.md).
- [x] Add a local face-selection preflight with explicit tighter-box acceptance,
  missing/ambiguous/small-face guidance and a manual-save fallback. This improves
  enrollment UX; detector coverage and recognition accuracy remain unresolved.
- [x] Add bounded source-diverse manual-reference candidates and usable-reference fallback;
  73 API tests, TypeScript, generated-image runtime bounds and read-only live SQL pass.
  API reloaded/healthy; full authenticated media/browser integration remains pending.
- [x] Test rotated/scaled/padded detection views on all reviewed frames; native+320
  recovers only one extra named face. Keep detector settings unchanged; see
  [follow-up](docs/face-detection-enrollment.md).
- [ ] Obtain fresh independent recordings, calibrate separately and evaluate held-out accuracy.
  Fresh labels are accepted: 26 frames/20 faces, six new people with only one file
  each. Frozen partial check enrolled 2/6 people and processed 3/9 unknown probes
  without a wrong match. Full known-person evaluation remains impossible; see
  [fresh results](docs/fresh-face-evaluation-2026-11-01.md).
- [x] Support confirming/rejecting suggestions and removing mistaken tags; relabel by manual tagging.
- [x] Resolve known names, aliases and contextual self references; clarify ambiguity.
- [x] Retrieve overlapping confirmed appearance ranges with source timestamps; exclude rejected tags.
- [x] Validate identity search against local PostgreSQL and authenticated HTTP fixtures.
- [x] Implement scoped conversation evidence assessment separately from co-presence;
  Gemini remains active, actual conversation accuracy is unmeasured.
- [x] Bind labelled face frames/boxes, native clip audio/video and timed speech cues;
  reject unsupported turns and invalidate assessments when labels/context change.
- [ ] Validate conversation assessment accuracy on agreed footage and authorized live inference.
- [ ] Validate recognition and timestamp accuracy on agreed demo footage; document limitations.
- [ ] Define and validate the Meta model's concrete role in the workflow.
- [x] Record implemented event contributions and actual validation in the contribution record.
- [x] Run rollback-only PostgreSQL validation with the owner enabling Docker; no workers or paid calls.
- [x] Publish manual identity/appearance routes in the served and generated OpenAPI contract.

### Frontend coordination

- [x] In-moment manual person tagging and real profile/aliases/“this is me” UI;
  isolated browser checks passed (2026-11-01), real-face usability still unverified.
- [x] Review suggested appearances and remove incorrect accepted tags; footage usability unverified.
- [ ] Identity-aware search results with playable evidence and match status.
- [ ] Coordinate request/response shapes with the backend API contract.

### Scope and constraints

- First scope: face-based people identity and one complete teach/review/search workflow.
- Voice identity, a full people directory and recognition of specific personal objects
  are later proposals, not commitments for the first version.
- User-supplied relationships must not be inferred from appearance.
- Recognition suggestions are fallible; do not promise perfect precision or automatically
  treat all similar faces as confirmed identities.
- Keep identity data private to its owner, support removal, and use footage participants
  agree to use. Keep personal media and credentials out of public artifacts.
- Paid inference and live evaluation remain subject to the brief's existing authorization
  and budget constraints.

## Voice conversation with Brisky

**Status:** Speech backend and saved-Space integration implemented. Existing immersive UI retained, with automatic alternating turns and no visible transcript. Generated-audio live checks passed; real microphone/noise acceptance remains. See `docs/saas-voice.md`.

**Goal:** Let users speak requests and follow-up questions to Brisky and receive
spoken answers backed by the same playable source evidence as text interactions.
Example: "Find where I was talking to my uncle," followed by "Only the clips
from December" or "What were we discussing?"

**Existing foundation:** Media transcription and search are existing capabilities;
they do not establish that microphone input, conversational memory or spoken replies exist.

- [x] Define the backend/frontend contract for voice turns and conversation context.
- [x] Connect the existing immersive screen with automatic speech turns; no visible
  transcript/review UI, as requested. Text chat remains available outside voice mode.
- [ ] Resolve spoken names and references using user-confirmed identities; clarify ambiguity.
- [x] Route voice and text through the same evidence-grounded search/answer workflow.
- [x] Add spoken replies; citations remain saved and playable in the Space.
- [ ] Support cancellation and prevent playback audio from becoming a new user request.
- [ ] Evaluate transcription on representative accents, names and background noise,
  then evaluate grounded answer accuracy separately from speech quality.
- [ ] Verify model modalities, provider availability, pricing and credit eligibility
  before selecting or making paid calls.
- [x] Add browser-side interruption during playback, automatic next turns and
  explicit session-ending phrases. Real-device acoustic robustness remains to evaluate.
- [x] Stream first reply audio through engine/Next/browser; live first audio arrived
  before provider completion and interruption stops queued playback.
- [ ] Stream Meta reply text into speech and support interruptions during reasoning.
  Current transcription and full Meta reasoning still precede streamed TTS.

Voice conversation is separate from recognising a person's voice in archived media.
Backend ownership stays with this agent; frontend ownership stays with the other agent.

## Meta adapter across existing AI features

**Status:** Implemented as a dormant adapter on 2026-10-30; Gemini stays active.
108 offline adapter, budget, verification and people-search regression tests passed;
API TypeScript checking also passed.
See [coverage, configuration and validation limits](docs/meta-adapter.md).

- [x] Implement query understanding/decomposition, frame and native-video analysis,
  chunked audio transcription, frame verification and native clip verification.
- [x] Preserve existing Google/local embeddings rather than change the indexed vector space.
- [x] Separate Meta credentials/models from Gemini settings and meter every remote attempt.
- [x] Add offline request/response and failure tests; keep `.env` and active models unchanged.
- [ ] Validate live Meta access, selected models/modalities, accuracy and billing when authorized.
- [ ] Audit full worker execution and persisted provider provenance before a provider switch.

Owner instruction: do not switch to Meta models yet. No paid calls are authorized by
adapter implementation alone; the existing deferred-pilot constraints still apply.

## Shared priorities and available credits

- Owner reaffirmed priority on 2026-10-30: **accuracy > cost > speed**, in that order.
- Docker stays off by default to save power. Tell the owner when an upcoming check
  requires it; do not start Docker or containers automatically.
- Owner reports **$150 in Meta hackathon credits** and an additional **$100 in Baseten
  sponsor credits**. Treat these as separate provider balances, not interchangeable funds.
- Owner has a Baseten API key available when integration is ready. Do not store the key
  in this file or commit it; no key is needed for proposal work.
- Owner increased the cumulative live-testing ceiling from $3 to **$5** on 2026-10-31.
  Subsequently approved $8 and then **$10 cumulative** (2026-11-01) for the full remote
  queue test; preserve the ledger.
  Preserve the existing ledger; sponsor balances do not authorize spending beyond it.
  Direct Meta pricing/access and applicable credit terms remain unverified.

## Other proposed features

### SaaS API foundation

- [x] Persist onboarding profile, workflow, aliases, workspace name/icon and source
  preference through authenticated Next.js routes (2026-10-31). Local PostgreSQL
  and HTTP checks passed; completion drives login routing. Onboarding is now
  session-protected and its UI-preview notice removed at the owner's request.
  Actual connector authorization/import and full browser validation remain
  separate work. See [onboarding scope](docs/saas-onboarding.md).

- [x] Create and apply separate local `saas` schema for Spaces, messages, saved
  source moments, citations and ordered shortlists (2026-10-31).
- [x] Validate ownership constraints, invalid ranges, repeatability and cascades
  against local PostgreSQL with rollback-only fixture data; API TypeScript passed.
- [x] Implement authenticated SaaS Spaces, messages, source moments and ordered
  shortlist routes and connect the sidebar/search/Studio UI (2026-10-31).
  Local PostgreSQL and browser/API persistence checks passed. See
  [Spaces scope](docs/saas-spaces.md).
- [x] Implement the owner-scoped engine search/reply bridge, model conversation
  adapters, saved assistant turns and citation chips with durable retry handling.
  PostgreSQL, real engine HTTP and browser integration checks use fixtures. A separate
  Baseten text pilot now passed; the local engine process has live replies enabled.
  See [conversation scope](docs/saas-conversation.md).
- [x] Validate the Baseten sponsor key/model with four bounded live synthetic-text
  cases. Estimated token cost $0.01511475; see [pilot evidence](docs/baseten-adapter.md).
- [x] Check live Space replies through the browser/SaaS/engine/Baseten path with
  synthetic indexed text: saved replies, shortlisted source citation, cached retry
  and reload without extra inference passed. Temporary data was removed.
- [ ] Evaluate retrieval and real-media source faithfulness; synthetic index text
  does not establish real-footage accuracy.
- [x] Connect owner-scoped source playback to saved Space citations, including byte
  ranges, start/end playback boundaries and retry states. Generated-video browser
  and ownership checks passed; cloud media/mobile devices remain unverified. See
  [playback scope](docs/saas-source-playback.md).
- [x] Implement Next.js email-code login with Brevo SMTP, browser-bound challenges,
  attempt/resend limits and revocable server sessions. Isolated PostgreSQL checks
  passed; real email delivery and browser validation remain pending. See
  [SaaS login](docs/saas-email-login.md).
- [x] Add saved Brief/Storyline Studio outputs with section source citations,
  ordered shortlist, optional direction, copy/download and ownership/version guards.
  See `docs/saas-studio.md`; live output acceptance is distinct from fixture checks.
- [x] Connect SaaS Drive OAuth/session bridge, folder selection/disconnect and live
  Factory account/indexing status; replace onboarding Drive icon. Local fixture
  browser/security checks passed. See [Drive setup](docs/saas-drive-connectors.md).
- [ ] Complete real Google consent and remote folder/refresh verification after
  configuring the SaaS redirect URI and OAuth test user. Sync remains gated off
  until the indexing provider and workers are validated and authorized.
- [x] Replace Space card illustrations with cached, owner-scoped midpoint frames
  fitted to the existing 16:11 cards and use them as player posters. Generated-video
  browser checks passed; see [thumbnail scope](docs/saas-moment-thumbnails.md).

See [schema scope and validation](docs/saas-database.md). Existing engine users/media
are reused; this schema alone does not implement these API or AI workflows.

Add further proposals here with their goal, status, ownership and acceptance criteria.

## 2026-11-02 search and transcription follow-up

- [x] Use durable in-range keyframes for thumbnails when previews do not exist; three
  authenticated source thumbnail routes checked at 640x440.
- [x] Save only answer-selected relevant evidence as result cards; allow no-match
  replies without forced unrelated citations; preserve ranked/cited result order.
- [x] Anchor the composer below scrolling chat; use relative recent timestamps.
- [x] Honor provider-routed AI speech in Factory and reserve speech calls in file plans.
- [x] Repair speech/embeddings for five indexed file records (four unique videos),
  preserving old data backups, visual analysis and tags. One 12-second excerpt was
  human-reviewed; remaining model transcripts still need accuracy evaluation.
- [x] Fix Windows UTF-8 input handling in the local embedding worker.
- [x] Final live action-search check: one video-verified card for the expected source;
  unrelated candlelight source excluded. Archive-wide completeness still unverified.
- [x] Isolated browser acceptance at 390/1280px: stable bottom composer during
  thinking/results, recent timestamp, and cited-card ordering; screenshots inspected.
- [ ] Evaluate Muse Voice Transcribe if required; official API researched, not called
  or selected. Keep transcript-only repair separate from full media reindexing.

## 2026-11-02 connector playback

- [x] Play an owned connector original when a local preview does not exist, using
  byte-range streaming with no retained master or preview job.
- [x] Confirm source identity using version/size or unchanged MD5 for metadata-only
  Drive changes; reject replaced sources and invalid upstream ranges.
- [x] Actual SaaS/Drive HEAD, bounded/suffix ranges and auth-denial checks.
- [x] Guide simple find replies toward brief confirmations; do not synchronize a
  whole transcript to one event without cue timing evidence.
- [x] Actual Drive video decoded/played in isolated Chrome; saved 0-20s boundary
  clamped correctly. No permanent source copy or AI calls.


- [ ] Add optional fresh whole-source reinspection as a resumable background workflow
  with progress and source-version-aware cached summaries. Default narration uses
  the full existing index instead of reprocessing originals. Keep
  original duration separate from inspected coverage; do not promise every detail.


- [x] Connect saved-response read-aloud to Gemini with Kore default, five additional
  voices, browser-local selection shared with voice mode, meaningful sample
  auditions and optional preview captions. Owned-message speech and fixed samples
  use private voice-specific cache and the existing ledger. Six live voices passed.
- [ ] Expose optional Storyteller delivery in Settings if useful; current shared UI
  uses Natural delivery. Browser-speech fallback is not used silently.


- [x] Give voice turns a 2.8s silence allowance, simplify processing status and use
  neutral idle for ordinary source-free replies. Real-noise tuning remains open.
- [x] Repair quoted-moment library routing and fallback quote loss; live exam-quote
  regression passed with the kitchen clip selected. No reindex required.
- [x] Finish packaging/validating all seventeen shared acknowledgement variants
  across six voices; static clips are shared across accounts, private replies are not.

- [x] Add Gemini speech quota fallback/cooldown with explicit metering while keeping
  preferred Flash TTS, selected named voice and Meta reasoning unchanged.

- [x] Implement streaming Meta ASR/dialogue + resident MMS, sentence delivery,
  interruption, provider-aware read-aloud/previews and separate caches while
  preserving Gemini adapters. Generated-input checks and CPU/RAM measurements
  passed; judge setup is in `docs/meta-mms-voice.md`. Gemini acknowledgement audio
  is not requested in this profile.
- [ ] Owner acceptance of Meta voice with normal Nigerian-accent speech, pauses,
  background noise and real media searches; assess naturalness and latency.
- [ ] Whole-project Meta model/fallback audit against the exact updated rule;
  voice profile alone is not certification. Final public-history/secret review
  and contribution/demo attribution remain required.
- [x] Validate Gemini Live development path with generated speech and isolated
  mobile/desktop controls (explicit owner request before the Meta-only switch).
  Existing UI and Meta-backed saved-Space tools are retained; actual microphone
  acceptance and persistence of casual Live-only exchanges remain open.
