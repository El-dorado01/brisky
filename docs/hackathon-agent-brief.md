# Brisky: hackathon brief for agents

Updated 2026-11-04. Read this before planning or implementing hackathon work.

Latest owner-supplied clarification (November 4): non-Meta text-to-speech only
is permitted when declared in the README. This narrowly supersedes the blanket
TTS restriction below; it does not permit Gemini Live, non-Meta ASR, reasoning,
embeddings or face models. See the final clarification section.

## Organizer wording supplied November 4 — controlling submission constraints

The owner supplied these organizer statements directly. They supersede earlier
notes saying exact wording was unavailable:

> The submission must be a fresh public repo created on Oct 26 or later, holding only work done after kickoff ended at 12:24 PM ET on Oct 26. Only the open-source event component is judged, so anything private that the repo calls must be declared, with a way to run without it.

> Every model your project calls at runtime must be a Meta model, even a small one that runs on the device, so Silero VAD can't be used. Non-model libraries such as OpenCV and FFmpeg are fine. For speech handling, use Meta options such as Muse Voice Transcribe on the Meta Model API or Meta's open-source speech models such as MMS or wav2vec 2.0.

For October 26, 2026, 12:24 PM Eastern corresponds to 16:24 UTC / 17:24 Lagos.
The existing Brisky repository/baseline must not be relabelled as a fresh event
submission. Prepare a separate fresh public event-component repository with
eligible work only, declaring pre-existing/private dependencies and a runnable
alternative without them. Do not publish or delete history without authorization.

Meta-only applies to local embeddings, face models, speech/VAD, remote providers
and fallbacks, not just TTS or the default AI provider. OpenCV as a library is
allowed; a non-Meta model loaded through it is not made eligible by that fact.
Retained Gemini development code is not proof of a compliant submission: the
judge runtime must prevent non-Meta calls, and its event-code eligibility must
be reviewed separately. See [submission readiness audit](submission-readiness.md).

2026-11-03 owner direction: organizer rules reportedly now require Meta-only
model use. Exact updated wording remains to be supplied. The owner explicitly
requested preserving Gemini and implementing/testing Gemini Live before that
switch; this development exception is not the judge-facing configuration.
MMS residency, sentence delivery, benchmarking and the full provider audit are
recorded in [voice transition](voice-provider-transition.md). Do not present the
Gemini development path as Meta-only or remove the retained implementation.

2026-11-04 owner confirmed the submission deadline as November 4, 9 PM Eastern:
November 5, 3 AM Africa/Lagos (02:00 UTC). This supersedes the earlier note that
the exact closing hour had not been supplied. The owner authorized implementing
the streaming Meta ASR/text + local MMS path while preserving Gemini Live.
Setup/limitations are in [Meta/MMS voice](meta-mms-voice.md); implementation and
measured validation must be checked before describing it as ready.

2026-11-01 execution update: the owner subsequently authorized direct Meta integration
and supplied `META_API_KEY`. Model discovery and five generated-only live checks passed;
root configuration selects Meta with 1.3 text and 1.2 audiovisual Standard-mode models.
The $10 cumulative allowance and existing journal remain unchanged. No personal footage
was sent and no worker was started. Positive contextual accuracy and final browser
acceptance remain open; see `docs/meta-adapter.md` for the current status. Historical
provider deferrals below are superseded for this authorized integration pilot.
This is a handoff based on the owner's instructions and supplied rules, not an organizer
eligibility ruling. Confirm implementation against the current code; this brief is not a live status feed.

## What we are building

Brisky is a media intelligence engine and the foundation for a SaaS workspace where people
can **find moments, connect them, and make something from their collections**.
Finding a clip is a starting point, rather than the whole product. Users should be able to
understand, compare, ask questions about, and brainstorm with their own media.

The audience extends beyond content creators and producers. Examples discussed by the owner:

- A student searches a lecture gallery for the exact explanation of a concept, then asks
  questions grounded in those recordings.
- A club finds a catalogue of a player's goals and collects or repurposes those moments.
- A person or team brings related memories together to understand a sequence, revisit a
  decision, or create a useful account of what happened.

These illustrate the broad product ambition; they are not commitments to build every workflow
or to use each example in the hackathon demo. The final SaaS feature scope and demo narrative
still need selection. Do not silently reduce the product to an automatic social-clip editor.

Proposed interaction direction: each saved moment retains its original source, precise
timestamp range, supporting context and optional notes. Collections become inputs for
comparisons, grounded answers, timelines, brainstorming and useful outputs. This workspace
direction is proposed; inspect the current frontend before claiming those features exist.
Answers should cite playable source moments. Separate evidence-supported statements from
generated suggestions, and say when the library does not establish an answer.

## Event and attribution boundary

- Event: **Meta Global AI Developer Hackathon**, startup track.
- Owner-confirmed interval: **2026-10-26 through 2026-11-04**, described as a ten-day event.
  Exact official opening/closing hours and timezone have not been supplied. Do not invent them.
- Brisky existed before the event. The owner confirmed there were no uncommitted Brisky
  changes before 2026-10-26.
- Inspected comparison baseline: `05caf9af22173b5235cef4795ab19b2660761b8f`, authored
  2026-09-23. This is a comparison reference supported by the owner's account, not independent
  proof that every later change is eligible.

**Mandatory contribution practice for agents:**

1. Inspect the baseline, current code and [contribution record](hackathon-contributions.md)
   before describing a capability as new.
2. Clearly distinguish pre-existing code/functionality, event-developed work, and planned or
   unverified behavior in relevant documentation, handoffs and demo/submission materials.
3. When extending an existing capability, identify the specific new behavior and changed code;
   do not relabel the entire capability as an event invention.
4. Update the contribution record for new event functionality and material status changes.
   Record implementation paths and actual validation. Link final development commits before
   submission. Preserve other contributors' work.
5. Never backdate history, invent authorship, or treat a working-tree snapshot, unit test or
   documentation timestamp as independent proof of when a feature was built.

Pre-existing foundations include cloud-connected indexing, FFmpeg scenes/keyframes, Whisper
transcription, Gemini analysis, natural-language retrieval, PostgreSQL/pgvector, BullMQ workers,
previews, clip extraction/lineage and a dashboard. See the contribution record for the precise
new orchestration, evidence, reliability, budget and API changes developed during this collaboration.

## Rules supplied by the owner

- Repositories **must be public**.
- Maximum **four participants** per team; solo entries are allowed.
- The demo must **only highlight specific features, code and functionality built during the
  hackathon**. Judges must be able to identify the original contributions clearly; failure can
  cause immediate disqualification at their discretion.
- New work only in what is presented. Startups may build on existing code/products but must
  clearly identify what was newly developed during the event.
- Projects violating legal, ethical or platform policies, or using code, data or assets without
  the required rights, may be disqualified.

The supplied, non-exhaustive anti-project examples are: AI medical advice (including mental
health advice and skin-blemish detectors), basic RAG applications, simple image analyzers,
simple education chatbots, AI job-application screeners, AI nutrition coaches, personality
analyzers, sports analyzers/coaches, and anything political or involving war.

Product breadth does not override these exclusions. Lecture search must not be assumed safe
as a simple education-chatbot demo; a sports catalogue must not drift into sports analysis or
coaching. Neither example has organizer clearance. Choose a demonstrable workflow that fits
an official problem statement, goes beyond basic retrieval/chat, and avoids the excluded categories.
The official problem-statement list and complete rules URL are not recorded here; verify those
before finalizing the submission. Do not claim an eligibility guarantee.

## Judging rubric supplied by the owner

Stage one is pass/fail: a viable idea reasonably fitting the theme and reasonably using the
**Meta Model API and/or Meta open-weight models**.

Stage two scores each category from 0 to 10:

| Category | Weight | What judges assess |
| --- | --- | --- |
| Impact | 30% | Real-world potential, beneficiaries, significance, adoption potential and fit to an official problem statement. |
| Use of Meta AI tooling | 25% | Creative, substantial use beyond a basic integration; capabilities that surprise judges. |
| Technical depth and execution | 20% | Sound engineering, refinement and thoughtful craft. |
| Demo | 25% | A working, impressive product that holds up live and a compelling demo video. |

Stage three: the top five projects per track advance; final judges watch video demos live
and rank them with the same rubric.

More model calls do not inherently improve the Meta score. Give Meta a necessary, visible
reasoning role with traceable inputs, outputs and user value. Demonstrate an actual outcome
and its evidence rather than a provider-logo swap or a list of hypothetical integrations.

## Engineering priorities and model role

Owner clarification (2026-11-01): consider accuracy, cost and speed equally during
development and seek improvements across all three. The order **accuracy > cost > speed**
applies when a real tradeoff forces a choice; it does not authorize ignoring cost, speed
or other engineering/product metrics. Fine details, temporal order, candidate
recall and correct source timestamps matter. Model confidence alone is not measured accuracy.
Avoid false confirmation; retain useful partial results and allow recovery when work is interrupted.
The owner wants a stable service with understandable UX, rather than constant technical warnings.

Keep deterministic media processing and suitable local work local: FFmpeg, Whisper, indexing
and retrieval should not all become remote model calls. Local execution still consumes CPU,
electricity and time, and is not automatically faster for every workload.

Candidate Meta roles include evidence-sensitive verification, cross-recording interpretation,
connecting or comparing retrieved moments, grounded synthesis and creating outputs from a
collection. These are design options, not implemented promises. Check the exact chosen model's
supported modalities and API before designing around them.

Brisky is intended to support interchangeable providers. Developer-supplied keys are a future
business direction. As of 2026-10-30, the Google adapter remains active and a **dormant Meta
adapter is implemented across the existing AI interface, with offline tests only**. The owner
explicitly requested retaining Gemini: do not switch providers/models or start live Meta calls
without a subsequent instruction. Google/local embeddings retain their existing vector space.
Live Meta access, media accuracy and billing remain unvalidated. See [adapter scope](meta-adapter.md).
An adapter or an abstraction alone does not count as actual Meta model use.

2026-10-31 update: the owner subsequently authorized Baseten live testing while Gemini
Prepay is unfunded. The local root environment now selects `baseten`, pinned to the
sponsor's `meta-models/muse-spark-open-1026`, within the existing $3 allowance.
Four text-only live cases passed, including source citations and unsupported-claim
handling. This supersedes the earlier provider deferral for this pilot only.
The subsequent live browser/SaaS/engine path passed with a synthetic indexed source:
saved replies, a selected-source citation, cached retry and refresh without extra
inference. This is not a real-media retrieval or playback evaluation. Total ledger
reservations are $2.15 of the $3 allowance (including earlier failed Google calls);
Baseten's eight successful requests have $0.02576425 in token estimates, not invoices.
Saved Space citations now connect to session/owner-scoped source playback. A local
generated-video browser check passed range seeking, start/end boundaries and
cross-owner denial without model calls or workers. Cloud-media/device compatibility
remains unverified. See [playback scope](saas-source-playback.md).
Result cards now use local FFmpeg midpoint thumbnails from their saved source ranges,
fitted to the existing card dimensions, with matching player posters and retry states.
Generated red/blue video checks passed source distinction, cache reuse, sizing and
ownership. This does not establish real-footage usefulness or cloud compatibility;
see [thumbnail scope](saas-moment-thumbnails.md).
SaaS Drive linking/folder management and owner-scoped Factory status are now bridged
to the existing engine connector, with callback/session protections and corrected
onboarding logo. Local browser/security fixtures passed; real Google consent and
remote folder/indexing checks remain pending. Sync, workers and automatic polling
remain off. See [Drive scope and setup](saas-drive-connectors.md).
Original video/audio remain disabled in this profile; embeddings retain their existing
provider/vector space. See [Baseten scope and evidence](baseten-adapter.md).

Subsequent 2026-10-31 update: explicit `BASETEN_MEDIA_ENABLED` opt-in is implemented
for native visual-video analysis and separately encoded audio. Synthetic red/blue
temporal segmentation, remote silence and offline local-Whisper silence checks passed;
real speech and Drive indexing remain unverified. The active engine has not been switched
to this media profile. The owner wants Baseten for testing and direct Meta for the actual
flow after validation; prepare that transition without selecting Meta or spending its credits
yet. See the transition checklist in `docs/meta-adapter.md`.

For the final integration, record model/version, adapter/request-building paths, input evidence,
parsed output, resulting product behavior, cost and observed limitations. Avoid unmeasured claims
of unique capabilities, superiority, accuracy, cost savings or latency.

## Budget and execution constraints

- Owner-reported credits (updated 2026-10-30): **$150 in Meta hackathon credits** plus
  **$100 in Baseten sponsor credits**. These are separate provider balances; applicable
  models, pricing and credit terms still need verification. The owner has a Baseten API
  key available for integration; never put it in documentation or commit it.
- Owner-approved initial live testing allowance: **$3**.
  On 2026-10-31 the owner explicitly raised the cumulative ceiling to **$5** for bounded
  Drive/media testing. Preserve the existing ledger; this is not a fresh $5 allowance.
    The owner subsequently approved **$8 cumulative** for the measured single-video
    queue test (ten planned model requests, $2.50 in new conservative reservations).
    On 2026-11-01 the owner approved **$10 cumulative** for the full remote Drive queue
    check; preserve prior reservations. Production polling/workers remain off during tests.
    Subsequently the owner approved settling successful holds to recorded usage estimates.
    Preserve journal history; retain reservations for failed/unknown/in-flight requests.
    This changes allowance accounting, not the $10 ceiling or provider billing records.
  Do not treat the full credit grants as permission to spend them.
- The owner deferred live accuracy/cost pilot and provider validation until later. Do not start
  paid inference merely because a refactor or feature needs testing; follow the current session's authorization.
- Remote inference budget controls require an explicit allowance and verified per-model pricing.
  Do not bypass guards or invent rates to make a call succeed. See [budget controls](ai-budget-controls.md).
- Docker consumes significant power on the owner's machine. The owner reaffirmed on
  2026-10-30 that it stays off by default: tell them when to turn it on for a required
  check; do not start Docker or containers automatically. Use it only when checks need it;
  verify readiness when required rather than assuming an earlier session's containers are running.
  Keep indexing workers and paid calls off during isolated infrastructure checks unless authorized.
- Protect `.env`, credentials and personal media. Never print or commit secrets. Publication
  needs a repository/history secret review and rights checks; do not make the repository public
  merely because the event requires a public submission.
- The owner explicitly welcomes finding faults. Report concrete issues and practical fixes honestly.

## Current implementation boundaries to preserve

Check the code and linked records before repeating these as current facts:

- Bounded range access and resumable audio/scene preparation have been developed. Not every
  stage streams: full-source paths remain, and opt-in windows require real-footage evaluation.
- Asset-wide locking limits concurrency. Do not claim independent per-asset stages all run in parallel.
- Unit, decoder and isolated database checks do not prove live cloud behavior, real speech/model
  accuracy, browser UX or production cost. Label each kind of evidence accurately.
- The first-party SaaS can build on session authentication and the existing API. Third-party
  developer keys, BYOK, attributed billing and some response contracts remain separate work.
- Existing and newly changing frontend work may coexist. Inspect the target app and applicable
  directory instructions before editing; preserve unrelated uncommitted changes.
- Scoped conversation verification now extends confirmed-people search in the media verify
  phase, with labelled face anchors, original clip audio/video and timed cues. Local and
  rollback-only PostgreSQL/HTTP fixture checks passed; real conversation/model accuracy is
  unmeasured. Gemini remains active. See [conversation scope](conversation-verification.md).

## Reading map and handoff checklist

- [Contribution record and exact Meta integration status](hackathon-contributions.md)
- [Judge-facing technical design and workflow rationale](technical-design-for-judges.md)
- [Accuracy/cost audit](hackathon-cost-accuracy-audit.md)
- [API and ingestion readiness review](api-and-ingestion-readiness-review.md)
- [API contracts, pagination and usage semantics](api-contract-and-pagination.md)
- [Streaming scope and limitations](streamed-indexing.md)
- [Search recovery UX](search-recovery-ux.md)

At handoff, state what changed, what already existed, what was actually tested, what remains
unverified and the next concrete step. Keep this brief and the contribution record aligned when
the owner changes scope or an implementation milestone becomes real.

2026-11-02 owner update: the cumulative live testing ceiling is now **$30**.
Preserve the existing append-only usage journal and prior charges/unknown holds;
this is not a fresh $30 allowance. The owner requested AI transcription in Factory
and approved full audio/transcript repair for the specific 53-second Drive video.
Other source-size/account/media approvals remain scoped as before.

2026-11-04 owner preservation direction: back up the complete current development codebase to the existing GitHub repository before creating a separate hackathon-only repository. Preserve Gemini, MiniLM, YuNet/SFace and their development integrations for post-event restoration; do not permanently remove them from the development product. Owner plans to create the new submission repository. Prepare Meta-only changes as a separate profile/component/export, with truthful provenance and private-dependency declarations.

## November 4 owner-supplied organizer clarification  TTS exception

The owner subsequently supplied this organizer response: The one exception is
text-to-speech, which can be any TTS service if the README says which part is TTS.
This supersedes the earlier blanket prohibition only for speech synthesis. Keep
transcription, reasoning, vision, embeddings and every other runtime model Meta.
Gemini Live is not covered: it also performs recognition/reasoning. Declare the
actual demo TTS and a reproducible setup in the public README; do not suggest a
recording shows an implementation that judges cannot run. This clarification is
owner-supplied, not independently authenticated organizer correspondence.

2026-11-04 owner update: the cumulative local live-test ceiling is now $50,
superseding $30. Retain the existing append-only journal and all prior spending,
unknown holds and reservations; this is not a fresh $50 allowance. The local
32 MiB demo source cap remains a local-only override, not a published default.
The owner also confirmed sole human hackathon participation: the contributor to
the earlier original engine did not participate in or assist with this hackathon.
Retain that contributor's historical attribution and distinguish it from the
hackathon team roster; do not erase history or claim sole authorship of old code.
