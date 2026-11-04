# Brisky: hackathon contribution record

2026-11-02 five-slot progression: at owner request, partitioned active-job admission into
two source-preparation and three downstream slots, under global/per-user caps of five.
Added continuation queue priorities and pre-admission prerequisite checks for embeddings/
finalization, retaining per-asset locks, owner/scope/budget guards and non-preemption.
38 targeted tests, API build and isolated real SQL/Redis concurrency/ordering checks pass.
The explicit clean-retry request was fulfilled for the current seven-file batch only;
50 unrelated assets and journal remain. This extends the event scheduler on the existing
worker foundation; no full-media throughput or accuracy success is claimed.

2026-11-02 Factory presentation cap: limited cards/panels/journeys to five recent files,
preserved expandable per-file substeps, and ordered the owned list by effective latest
activity. Web type/lint, API build and SQL state/progress checks pass. Per owner request,
cleared only the current seven test-folder assets, 25 jobs and five exclusive artifacts
for another clean retry; preserved unrelated media knowledge and append-only journal.
The two-job configuration remains. This refines the event-developed visibility UI,
not the pre-existing indexing foundation.

2026-11-02 measured Factory progress: native frame planning now publishes exact completed
frame counts after successful decoding, with separate telemetry counters rather than
reusing coarse overall job milestones. Windowed speech reports completed windows; other
stages remain indeterminate when no denominator exists. Root global/per-user limits
were changed to two at the owner's explicit request, retaining atomic admission,
per-asset locking, model/provider scope and budget cap. 45 targeted tests, API build,
web types/lint and rollback PostgreSQL progress/isolation checks pass. The queue was
paused to drain an in-flight transcription job before restarting; its successful result
was retained. No new claim of improved recognition or doubled throughput is made.

2026-11-02 Factory follow-up: actual user resync exposed retry bookkeeping that marked
retryable failures terminal, causing later BullMQ attempts to loop without claimable
waiting rows. Retry attempts now return the owned job to waiting; cooperative dependency
delays are not logged/marked as failed. Added three lifecycle regressions. Grouped Factory
activity by file with expandable substeps and a five-file default; removed the ambiguous
"Completed work" card badge. Intermediate cleanup is excluded from final Purge until
the asset is indexed/partially indexed. Connector and Overview now share active/pending/
attention semantics, preventing stale parent processing flags from implying live work.
25 targeted tests, API build, web type/lint and real rollback SQL active/queued/failed
consistency checks pass. Existing decoder/timeouts remain distinct from budget limits.
At the owner's repeated request, cleared exactly the current seven-file batch and 18
jobs again, retaining 50 unrelated assets/originals/profiles/journal. API polling is
temporarily off in its runtime environment so the reset remains clear for manual resync.
No cap increase or recognition/real-media success claim is made.

2026-11-02 Factory stage journeys: replaced hard-coded metric placeholders with durable
owned stage-run telemetry around actual source/scenes/transcription/understanding/index
and cleanup work. Added canvas recent-file completions, panel history and daily metrics,
2.5-second polling and per-file journeys in Overview. Reuse/deferred/interrupted states
are distinguished; no simulated stage execution or timing delay. Extends the pre-existing
worker/indexing foundation. 21 targeted API tests, standalone lifecycle test, real rollback
PostgreSQL live/completion/isolation checks, API build and web type/lint checks pass.
Fresh browser/sync acceptance remains pending. After explicit owner instruction, reset
only seven known test-folder assets and related queued/derived knowledge; preserved
50 unrelated assets and the journal. See [scope](factory-stage-history.md).

2026-11-01 scoped Meta worker startup and Factory visibility: the owner explicitly
approved ongoing Meta processing for the selected Drive folder under existing account,
size and $10 limits. Actual worker startup exposed consumers racing connector registration
and startup reconciliation. Standalone workers now request manual Bull registration and
start consumers only after Nest application initialization completes. An isolated VM
lifecycle test verifies this ordering; worker import check and API build pass. Recovered
four specific interrupted small assets via existing retry services; oversized assets
remain blocked. No unrelated failed jobs were retried.

Factory status now overlays fresh owner-scoped active job stage/progress when the parent
asset still reports queued; connector counts and indexing cards use the same effective
state, and active files sort first. Eleven SaaS connector/worker-role regressions pass;
the real PostgreSQL read shows the selected assets' effective processing state. No browser
verification claimed. Worker remains running; Drive/decoder retries were observed and
complete indexing/model accuracy is not claimed. This fixes the event orchestration/UI
bridge on the pre-existing queue/indexing foundation.

2026-11-01 Meta controlled-worker correction: queued selected Drive media exposed a
Baseten-only file-plan guard. Extended controlled indexing to explicit Meta and added
model allowlists to shared ledger plans, using the maximum per-attempt hold while
retaining provider/source/owner/size/local-speech restrictions and append-only history.
Old single-model plans remain compatible; changed plans fail closed. Mixed-model
provider/exhaustion/restart and Meta-planning regressions pass: 34 tests plus API build.
This extends the existing worker foundation. Runtime startup was rejected by automatic
approval review pending explicit folder-wide Meta egress approval; no worker started
and runtime completion is not claimed.

2026-11-01 real-source contextual preparation: added `scripts/check-meta-contextual.cjs`
with a default no-network inspection mode, owner egress receipt and immutable evidence
hash checks before live use. Prepared one local 10-second, owner-labelled two-person
excerpt and offline Whisper transcript. Owner approved this exact excerpt for one Meta
check and labelled it as no reciprocal exchange. Whisper returned zero speech cues;
the actual contextual adapter abstains with zero outbound calls (injected fetch guard).
One separately labelled direct source-analysis call completed with three segments and
no generated dialogue, at $0.0100845 in reported-token estimates. This is a real negative
source diagnostic, not a positive contextual-verification pass or recognition benchmark.
Private media/model prose remain under ignored storage; only anonymous counters are
recorded publicly. No identity tags, database rows, workers or folder settings changed.
Positive exchanges and the first authenticated Drive/search demo remain pending.

2026-11-01 direct Meta activation: owner-authorized model discovery and five live,
ledger-guarded calls passed through the existing event-developed adapter. Added
`scripts/check-meta-live.cjs` and recorded generated-only greeting, grounded citation,
temporal color-video, silent audio and contextual-negative evidence. Selected explicit
Standard-mode 1.3 text/1.2 audiovisual models with official rates, preserving Baseten,
local speech/embeddings and the $10 journal. 99 regression tests and API build pass.
Direct hosting is integration validation, not a standalone product innovation or
replacement claim for the pre-existing indexing engine. The substantive event workflow
remains confirmed-person teaching, contextual assessment and grounded Space answers.
Positive real conversation, face accuracy and final browser/session acceptance remain
open. See [direct Meta status](meta-adapter.md).

2026-11-01 contextual Baseten bridge: extended the event-developed conversation
verifier to send bounded video, labelled confirmed-person frames and separately
extracted/aligned audio through the sponsor-pinned provider. Shared structured
parsing retains participant/cue/time checks, budget admission and abstention;
temporary audio is cleaned on every outcome. Space conversation now carries fresh,
range-scoped assessments into grounded reply generation instead of dropping them
when source segments are reloaded. No automatic identity confirmation is introduced.
Changed `pipeline/providers/meta-ai.provider.ts`, `baseten-ai.provider.ts`,
`pipeline/space-conversation.ts` and `conversation/conversation.service.ts` with
targeted provider/contract tests. These extend the pre-existing media/search
foundation. Offline fixture validation only; no paid inference or personal egress.
Live contextual accuracy, direct Meta and final browser/session acceptance remain
unverified. See [contextual scope](conversation-verification.md).

2026-11-01 local archive matching and development recheck: extended event-developed
manual people/review with owner opt-in, durable PostgreSQL window jobs, standalone
face consumption, progress/pause/retry, revision-aware automatic discovery and
same-owner checksum duplicate reuse. Added composite owner constraints, atomic
claims, leases, fencing and bounded retries. The `apps/workers --faces-only` mode
disables indexing consumers and connector polling; HTTP API never starts face
consumption. This extends the pre-existing worker/media foundation, rather than
inventing those foundations during the event. No automatic identity confirmation.

Added bounded manual-context enrollment, label-independent multiscale/fixed-tile
probe detection, other-person reference ambiguity scoring, and short-video sample
bounds. Frozen baseline adapter remains unchanged. On consumed development footage,
usable named references improve 8→12 of 28; located cross-source known probes 5→6
of 12 and unknown probes 21→22 of 30. The lower .55 tiled setting has one correct
and two wrong known cross-source matches; selected .65 abstains on all 12, with no
wrong known/unknown matches observed. Same-recording development matching is 4/24
correct at .65. These are poor cross-recording results, not validated accuracy;
recognition quality remains open work. No request for additional footage is needed
to exercise the software. All rechecks are development reuse, not fresh held-out data.

Implementation: people `face-archive.*`, `face-sampling.*`, `face-matching.*`,
database `face-schema.sql`, worker entry/role guard, `robust_sface.py`,
`development_recheck.py`, and web `ArchiveMatching.tsx`/`FaceMatches.tsx`/bridge.
102 API regressions, 56 Python regressions, API build, web TypeScript and targeted
lint pass. Local SQL/worker checks cover concurrent claims, duplicate reuse,
ownership, changed sources, pause/fencing and real generated no-face handling.
Actual API/daemon/FFmpeg/models check scans three short videos repeating one
authorized labelled frame, emits 12 probe suggestions, automatically discovers a
later duplicate and rescans a changed version. Explicit confirmation is idempotent;
none are auto-confirmed. This fixture is plumbing evidence, not new-video accuracy.
Isolated browser controls pass at 1280/390 with stub responses; full Space session
behavior is not established by that check. Fixtures removed and test consumers
stopped; no paid inference or personal-media egress. See
`docs/face-archive-processing.md` and the development/integration evidence JSON.

2026-11-01 Space tagging modal redesign: refined the event-developed manual
teaching/preflight UI with a two-column desktop layout, stacked mobile drawer,
fixed header/action footer, bounded portrait/landscape frame stage, selection
shading/reset, two step labels, selected-person summary, expandable timing and
coordinate controls, and a separate saved state with undo. Hugeicon animations
are triggered by their buttons. `TagPerson.tsx` opts into new optional
`ConnectorDialog.tsx` panel/content class overrides; other dialogs keep their
defaults. Final web TypeScript and targeted lint pass. Isolated browser checks
pass for portrait and landscape frames at
1280x844, 390x844 and 375x667: pinned header/footer, no horizontal overflow,
image/selection alignment, manual save/undo, and explicit tighter-box acceptance
with the saved coordinates. Feedback and saved confirmation scroll into view,
respecting reduced motion; accepting a box returns to the frame. Checks used
generated vector placeholders, stubbed API responses and temporary fallback
fonts. The temporary preview route was removed. Full Space integration was
blocked by session lookup timeouts during local compilation; it is not claimed
as revalidated for this redesign. See anonymous layout evidence. This extends
the existing event teaching flow and pre-existing playback foundation; it adds
no recognition accuracy or automatic tagging claim.

2026-11-01 reference-selection preflight: extended the event-developed manual
teaching flow with a local YuNet geometry check before saving. A single suitable
face inside a broad selection can be proposed as a tighter box, requiring explicit
acceptance and a second Teach action; no tag is created by the check. Missing,
ambiguous, small or unavailable checks preserve an explicit manual-save fallback.
Added session/owner-scoped engine and Next bridge routes, source-version rechecks,
bounded subprocesses, shared scan lock and temporary-frame cleanup. Implementation:
`services/face-recognition/check_reference.py`, API people `reference-check.ts` and
`face-matching.*`, web `people-http.ts` and `TagPerson.tsx`. 51 Python tests, 79
people API tests, API/web TypeScript and targeted web lint pass. Ten enrollment-only
frames returned two ready, two proposed adjustments, five no detections and one
unmatched target; proposed personal boxes were not accepted or saved. Previously
tested unknown footage was not reused. Browser checks pass at 390/1280 widths:
real no-face checking, manual save/undo, unauthenticated/cross-owner denial, and
stubbed tighter-selection/ready responses to exercise explicit acceptance without
claiming real recognition. Isolated webpack mode used temporary fallback fonts;
cold compilation exceeded the preview timeout, resolved by retrying after compile.
Initial Turbopack nested-route discovery failure remains a development limitation.
See linked evidence. Live generated-video engine checks pass with real FFmpeg/YuNet,
no appearance writes and injected-owner rejection. Integration exposed a pre-existing
cache issue: reads refreshed both access and modification timestamps, causing false
source-change conflicts. Changed `proxy-cache.service.ts` to preserve content mtime
while refreshing LRU access; two cache regressions and API TypeScript pass. This
extends the pre-existing preview cache, rather than introducing it during the event.
This improves tagging guidance, not measured recognition accuracy,
and does not change detector/matching cutoffs or enable automatic archive tagging.
See `docs/hackathon-evidence/2026-11-01-reference-preflight.json`.

2026-11-01 fresh-label evaluation: validated all 26 reviewed frames/20 face labels
and six new named identities against prepared frames and unchanged source checksums.
Each identity has only one recording, so full cross-recording evaluation is not
possible. Added a frozen local-only enrollment/unknown-rejection runner with private
label snapshots, implementation/model/image hashes, gallery-file exclusion and
single-attempt protection. Two of ten named faces enrolled two of six identities;
three of nine unknown probes extracted, with zero wrong matches observed among
those three. Extraction failures remain explicit; no full accuracy/known recall or
deployment claim. Seven empty frames and one gallery-context unknown are outside
the probe check. 47 Python regressions pass; no paid calls, egress, live setting
changes, SaaS profile creation or automatic archive tagging. This extends event
evaluation tooling, not the pre-existing engine. See
`docs/fresh-face-evaluation-2026-11-01.md` and anonymous JSON evidence.

2026-11-01 fresh-footage intake: owner supplied 13 additional videos and confirmed
they are separate original recordings. Read-only FFprobe/hash inventory found all
13 readable (~54 MiB, 295 seconds), no byte duplicates within the batch or against
the development set. Added a reusable streamed-hash inventory helper and prepared
26 private review frames with detector proposals disabled. No recognition model
ran on this footage; evaluation roles/policy must be fixed before calibration/test
inference. Review sheets now support adding missing participant names, preserve
names attached to saved labels on reload, and include the list in JSON exports.
43 Python regressions and review JavaScript syntax check pass; new browser controls
are not browser-validated in this step. Source footage unchanged; no media egress,
paid calls, Docker requirement or live feature change. This extends event evaluation
tooling, not the pre-existing media engine. Awaiting owner ground truth; see
`docs/hackathon-evidence/2026-11-01-fresh-face-intake.json`.

2026-11-01 detection/enrollment follow-up: added bounded manual-reference fallback
across source files (recent 30 tags, up to nine prepared candidates, three usable
references), skipping unavailable reference previews while preserving owner/manual
scoping, source invalidation and explicit review. No model or detector cutoff switch.
Added local-only view diagnostics with source-coordinate/landmark restoration,
duplicate suppression and one-to-one label matching, including empty reviewed frames.
Native+320 recovered 23/41 faces versus 22/41, only one extra named face; rotations
and padding did not help. Lower cutoffs added unmatched detections. No deployment
claim follows from this development sample. API TypeScript, 73 relevant API tests,
41 Python tests and real generated-image CLI candidate-bound checks pass. The actual
reference query/plan also passes against local PostgreSQL in a read-only transaction;
the API was reloaded with existing settings, health and unauthenticated scan denial
pass. No new complete authenticated scan/browser run; workers remain unchanged.
No paid calls, media egress or new model downloads. This extends event identity/evaluation work, not the
pre-existing engine. See `docs/face-detection-enrollment.md` and anonymous evidence.

2026-11-01 recognizer comparison tooling: added a separate, explicitly prepared
AuraFace recognition candidate pinned to the publisher revision/SHA-256, with a
resumable bounded-range urllib/curl downloader and retained publisher licence. Added CPU-only
comparison tooling using unchanged detection/selection rules, separate vector spaces,
anonymous summaries and fresh-process memory/timing. This extends the event face
evaluation tools; upstream models and the existing media engine are not new work.
The SFace run exactly reproduces the earlier private development embeddings and
failures; 35 Python regressions pass. Candidate weight/licence hashes and real local
inference passed. Both extracted 24/41 development faces. At cutoff 0.45, AuraFace
recovered 1/7 enrolled probes with 0/27 unenrolled false accepts; SFace recovered 0/7
with 2/27 false accepts. Only two enrolled probes reached recognition, so this is
not dependable recognition or held-out accuracy. AuraFace used 1,616 MiB peak memory
and 17.782s extraction versus 255 MiB and 6.232s for SFace. No paid calls, media
egress or live model/threshold changes. Stronger-recognizer comparison is complete;
detection/enrollment improvement and fresh recording-level validation remain pending.
See `docs/face-recognizer-comparison.md` and its anonymous JSON evidence.

2026-11-01 real-footage development diagnostics: owner supplied reviewed labels for
36 frames/41 faces and confirmed unknown faces differ from enrolled participants.
Pinned local extraction yielded 22/41 usable faces; detector presets recovered
24/41 and 26/41, while resizing/cropping did not improve coverage. A file-separated
single-source gallery diagnostic recovered 0/7 enrolled probes at the live cutoff;
a relaxed setting recovered 2/7 but wrongly matched 8 unenrolled probes. These are
development findings, not calibrated held-out accuracy or deployment approval.
No live settings changed, no remote inference occurred, and private names/media/
vectors remain outside public evidence. Added reproducible local diagnostic tools;
31 Python regressions pass. Formal recording-level validation and a stronger
recogniser comparison remain pending. See `docs/face-evaluation-2026-11-01.md`.

2026-11-01 owner-footage evaluation intake: owner authorized local testing of the
supplied folder. Read-only inventory found 18 readable files (~385 seconds) without
byte-identical duplicates. Added a local-only review-sheet generator with sampled
frames, detector-box suggestions, manual box correction, owner identity labels,
browser-local progress and JSON export. Prepared 36 private frames/22 suggested
boxes; no identities were guessed or accuracy scored. Source files were unchanged;
media/names/labels remain in ignored storage and no remote inference was used.
Isolated browser checks passed loading, export/reload and 390/1280 layout; personal
images were hidden before screenshot capture. Evaluation awaits owner-supplied
ground truth and recording-level split selection. This extends the event evaluation
tools, not a new pre-existing engine capability. Evidence:
`docs/hackathon-evidence/2026-11-01-face-evaluation-intake.json`.

2026-11-01 local matching pilot: connected pinned OpenCV YuNet/SFace to a bounded
user-triggered API scan and SaaS review panel. Manual references remain separate from
pending suggestions; accepting creates an idempotent, frame-scoped `face_match` tag,
rejecting creates none. Confirmed match tags participate in existing people retrieval
and conversation anchors, but never seed further matches automatically. Added owner
FKs/indexes, stale-reference/checksum rejection, local temporary-file cleanup, and a
whole-button animated Hugeicons review UI. This extends the earlier event manual
identity tools and pre-existing playback/search; it is not new foundational indexing.
Added explicit `pnpm setup:faces`/`--check` commands and root/API/worker setup docs.
Worker-only hosts do not need the current API-host face runtime; no startup download.
The owner approved resuming the local approach after discussing cost/accuracy/speed.
Pinned weights/licences and isolated OpenCV 4.14.0 + NumPy 2.5.4 are installed locally.
Checks: 70 people/search/conversation regressions, 29 Python tests, API/web TypeScript,
targeted web lint, rollback-only PostgreSQL review/ownership tests, actual browser
review with generated video/seeded suggestions, and real runtime no-face rejection.
Generated-image CPU smoke: 176 MiB peak process memory, 0.455s startup and 2.398s for
24 blank 720p detections; this excludes video decoding and does not measure real-face
accuracy or production throughput. No personal media or remote inference was used.
See `docs/local-face-matching.md` and `2026-11-01-face-{review,runtime,ui}.json` under
`docs/hackathon-evidence/`. Real-footage calibration/accuracy, queued archive scanning,
multi-host deployment and direct Meta validation remain pending.

2026-11-01 People view toggle: added Cards/Table controls with cards as the default
on each page load. Both views share the real owner-scoped directory/search and
profile/tag actions; compact semantic table rows show aliases under names on mobile.
Uses existing animated Hugeicons with whole-button hover triggers. This is an
event-developed UI extension, not a change to recognition or the pre-existing engine.
Web TypeScript and targeted lint pass. Browser evidence:
`docs/hackathon-evidence/2026-11-01-people-view-toggle.json`.

2026-11-01 minor People UI refinement: Explore moments now uses the existing
animated Hugeicons arrow, with hover triggered by the whole link, replacing the
text arrow. This changes presentation only.

2026-11-01 People presentation refinement: replaced the empty-state add-user glyph
with three overlapping decorative illustrated avatars. Real person cards now have
subtle deterministic colour palettes, an abstract cover, initial avatar, clear name,
bounded alias chips, a primary tag action and separate edit/delete controls. Avatars
are decorative or initials, not detected faces. No recognition metrics were invented.
TypeScript and targeted lint pass. Updated empty-state/card screenshots at 390/1280
pixels were inspected; the isolated browser teaching/undo/deletion flow still passes.

2026-11-01 icon interaction refinement: moved hover triggers to containing buttons
and links across Factory/Drive controls, search actions, dialogs, onboarding cards,
sidebar/developer controls and entity cards. Factory Hugeicons now inherit the
control trigger instead of creating an icon-only hover context. Added a shared
reduced-motion-aware adapter for remaining installed Hugeicons and used animated
Hugeicons in the manual teaching UI. Existing animation primitives and page designs
are pre-existing/event work being refined, not a new model capability.
Web TypeScript and lint on active changed controls pass (two existing unused-import
warnings in DeveloperView). Browser checks confirmed button-text hover animates the
Hugeicon without pointing at its glyph, alongside the manual teaching flow. Legacy
unused sample Entities components have pre-existing lint errors; they are not claimed
lint-clean. Evidence: `docs/hackathon-evidence/2026-11-01-people-ui.json`.

2026-11-01 manual people teaching UI: connected the People directory and new-person
routes to real owner-scoped profile CRUD, aliases/self identity, tag review/removal
and confirmed deletion. Added source-player frame capture, face-box selection,
range input, existing/new-person selection and immediate tag undo in the responsive
teaching dialog. Added a SaaS-session bridge to the existing manual people service;
developer JWT routes remain separate. This extends the event-developed manual
identity backend and pre-existing media playback, not automatic recognition.
TypeScript/lint, 30 existing people regressions and actual isolated browser/DB
checks pass; no inference or personal footage used. Recognition and custom objects
remain pending. See `docs/people-teaching-ui.md` and linked evidence.

2026-11-01 Factory overview refinement: replaced the always-visible totals strip
with an Overview button beside Connectors. The desktop modal/mobile drawer displays
a status donut, accessible count breakdown and fully indexed percentage, using the
existing owner-scoped counts and refresh. This is event-developed presentation of
pre-existing indexing states; no new backend or inference capability is claimed.
Web TypeScript and targeted lint pass. Actual browser checks at 390/1280 pixels
confirmed hidden-until-open metrics, database-matching totals, panel bounds and focus
restoration on close; both screenshots were inspected. Empty/loading handling is
implemented but not separately browser-verified. Evidence:
`docs/hackathon-evidence/2026-11-01-factory-overview.json`.

2026-11-01 Factory visibility: added responsive owner-scoped asset totals for tracked,
fully indexed, processing, queued, partial and failed files using the existing indexing
counts endpoint and ten-second refresh. Partial indexing is excluded from successful
indexing. Loading shows placeholders; no new database query or AI call was introduced.
This adds UI visibility to pre-existing indexing states, not a new indexing capability.
TypeScript and targeted lint pass. Actual Factory browser checks at 390/1280 pixels
matched owner-scoped database totals; screenshots were inspected. No sync or AI calls
were triggered. Evidence: `docs/hackathon-evidence/2026-11-01-factory-totals.json`.

2026-11-01 controlled sync: added durable complete-file budget holds consumed by scoped
attempts and released on finalization/cancellation/permanent failure. Existing request
journal remains intact. Added account/size/profile gates, scoped polling, failed-file
manual retry and queued/paused/error UI feedback. Fixed a reproducible Factory loading
loop with a CSS-animated Hugeicon spinner. Fifty budget/connector/checkpoint regressions,
eight poller regressions, API build/TypeScript, web type/lint, real isolated planned queue
and real Factory-to-Drive UI checks pass. The owner explicitly approved persistent scoped
worker/polling activation after automatic review required ongoing-egress consent.
Runtime worker is on; a real polling tick updated only the allowed account without any
inference or duplicate enqueue. The other account was unchanged. This extends
pre-existing sync/indexing infrastructure. See `docs/controlled-sync.md` and linked evidence.

2026-11-01 application reorganization: moved the existing SaaS from `frontend` to
`apps/web`, created the standalone `apps/workers` bootstrap with a workspace dependency
on the existing engine, forwarded old API worker scripts and updated Docker inputs,
root/app READMEs, scripts, migrations and current path references. Historical prototype
`apps/web` references refer to the retired Vite app; the path now holds Next.js. Existing
standalone worker functionality predates this folder split; shared processing modules
remain in API. Scheduler fixtures now use cleaned OS temporary directories instead of
recreating `test-storage-f5`. Small-source decoder caching extends existing range reads:
bounded 8 MiB default, source/version/length validation and range fallback for large files.
Twenty-eight relevant tests, API build, web TypeScript and moved-login HTTP pass; worker
syntax/runtime imports resolve without consuming jobs. A live no-inference cached read
captured all 32 frames with exactly one source's cloud bytes. Full cached queue validation
now passes eight units, all 32 prepared/observed frames, speech, native video, preview
upload/cleanup, retry and checkpoint replay; existing vectors were preserved and temporary
fixtures removed. See `docs/app-layout.md` for details and limits.

2026-11-01 owner-authorized ledger reconciliation: event budget controls now count
successful reported usage estimates instead of retaining the larger original hold.
Failed, unknown and in-flight attempts retain reservations; estimates above a hold still
count in full. Historical entries remain append-only and unchanged. The offline summary
uses the same rules. Sixteen ledger regressions pass, including restart/shared-file
accounting, released allowance, unknown usage, errors and over-reservation estimates;
41 ledger/provider/frame/streamed-indexing regressions pass overall. Estimates must match
recorded token usage and original reservation pricing before reducing a hold. No new billing
reconciliation or invoice accuracy is claimed. The ceiling remains $10; strict-frame
remote queue validation subsequently passed with the small-source cache (see above).

2026-11-01 event extension of existing Drive sync: manager/Next proxy/controller now
combine folder saving and sync request, with explicit complete/failed/paused states and
saved selection retained after discovery failure. Existing payloads and confirmations
remain supported. `connectors.service.ts` now enforces direct selected-parent scope,
handles move out/back, scopes source lookups by account/owner, recognizes checksum
changes without time drift, captures cursors before full listing, rejects incomplete
discovery before archival, and serializes account sync using session advisory locks.
No schema migration was required. Twenty-four targeted regressions, API/frontend
TypeScript, frontend lint, rollback-only PostgreSQL fixture state/lock checks and actual
paused Next/session/engine HTTP passed. Evidence and limitations:
`docs/drive-save-and-sync.md`. Separate real Drive lifecycle checks now pass for add,
quick rename, checksum replacement, move out/back and deletion, with enqueue captured.
Added/modified change records share reconciliation because quick edits can be classified
as added. Forced OAuth refresh persistence and the real poller timer/dedup check pass.
The isolated full remote queue also passed: eight units, two scenes, 31 frame observations,
speech, native video and one preview upload (deleted afterward). Original media and
existing vectors were preserved. These are event validation/extensions of the pre-existing
engine, not a new engine or labelled accuracy evaluation. The owner approved $10 cumulative;
the preserved ledger holds $9.15. Broad sync, polling and production workers remain disabled.

Follow-up event correction: no-inference frame comparison reproduced streamed decoder
timeouts silently skipped by the existing sampler. Required frames now use bounded
streamed retries (two attempts, 60 seconds each), must exist and be nonempty, and cause
preparation failure when unavailable. Exclusive scene endpoints are omitted. New focused
regressions cover these paths. Full paid queue evidence above predates this guard;
post-correction end-to-end validation subsequently passed with the small-source cache.
No-inference diagnostics attempted 32 samples from each source: local decoding retained
32, while the old streamed timeout skipped nine. A previously failing 0.05-second frame
then decoded successfully with the longer timeout. Preparation fingerprint version was
advanced to reject stale partial checkpoints. Four frame regressions plus scene-window
and streamed-indexing checks pass (17 tests); API TypeScript passes. See dated frame
diagnostic/timeout evidence linked from `docs/drive-save-and-sync.md`.

2026-11-01 owner-requested cleanup: retired the pre-existing feasibility UI at `apps/web`.
Its current uncommitted source was archived in ignored private storage before removal.
Root commands now target the retained Next.js `frontend`; worker Docker COPY and the
retired lockfile importer were removed. Frozen offline lockfile validation passes without
changing dependency resolutions. Historical prototype references below are attribution,
not a claim that the removed UI is still available.
Root `.env` was privately backed up, grouped/commented and parser-checked to preserve
retained values; unused aliases/legacy settings were removed. `.env.example` and current
README setup were aligned. Engine port 3001 matches the existing SaaS/engine split;
explicit background switches remain off. See `docs/environment-configuration.md`.

Remote Drive queue validation now passes for selected-file range reads and local speech:
the real production connector/auth resolver and queue processor read 4,182,700 bytes and
produced eight cues. Completed checkpoint replay left the AI ledger unchanged; paid
inference was blocked for the entire run. Temporary queue/asset/derived files were
removed. No Google files were uploaded or modified; forced token refresh, remote scene/
video units and automatic sync remain unverified. Evidence:
`docs/hackathon-evidence/2026-11-01-drive-remote-audio-queue.json`.

2026-11-01 queue validation (began 2026-10-31): actual retained Drive media passed the
pre-existing production processor/scheduler/indexing/unit services via real BullMQ and
PostgreSQL in an isolated queue. Seven units, two scenes and 32 frame observations
completed using nine Baseten image requests and one video request. Local Whisper and
local embeddings ran; one pre-inference interruption retried, and a completed-scene
checkpoint replay left the inference ledger unchanged. Temporary queue, asset and
derived media were removed. Existing 266 Google vectors and 12 saved pilot vectors
remain. This is local-source queue validation, not remote Drive queue or automatic-sync
validation. See `docs/queue-media-validation.md` and dated evidence JSON.

Event corrections in `indexing.processor.ts`: embedding units wait for speech/native
video, merge overlapping video context with transcript/frame fields, and keep owner
selection/predicates; duplicate-index keyframe arrays are serialized for JSONB. Subsequent
scene checkpoint attribution explicitly stores the real provider/model instead of Google
schema defaults. That final attribution/owner-predicate update is covered offline, not by
another paid full queue run. Five focused regressions and broader preparation/scheduler
tests pass; TypeScript passes. No schema migration was required.
Owner approved $8 cumulative for the measured plan. The ten queue calls have $0.13744
in token estimates; conservative holds total $6.65. Ledger was preserved; no invoice is
inferred. Production queue consumer, polling/broad sync and direct Meta remain off.

2026-10-31 event extension: controlled real Drive indexing and integration checks.
`scripts/drive-pilot-persistence.cjs` and the `--persist` mode of the scoped preflight
persist 12 native-video segments, local speech, source frames and local vectors using a
short owner-checked transaction. Private playback media remains in ignored storage;
scratch media is deleted. This controlled importer is distinct from Brisky's pre-existing
queue ingestion and does not establish worker/polling readiness or independent frame OCR.
New `embedding-provider.ts` implements explicit owner-scoped local selection, used by
MediaService and the merger/queued embed unit; query cache identity includes provider/model.
Only the pilot owner is opted in; the global configuration and 266 Google vectors remain.
The first playback check caught absolute paths outside the locator mapping; the importer
and pilot rows now store portable relative locators, preserving the existing storage jail.
Nine targeted embedding/cache/thumbnail/stream tests and ten earlier local-embedding/
selection/search tests passed (overlapping selection coverage); TypeScript passes.
`scripts/check-persisted-drive.cjs` passed actual SQL retrieval and Next/SaaS/engine live
reply/citation, JPEG thumbnail, source ranges, reload/shortlist, authentication and cached
retry checks. Temporary session/space removed. Evidence is recorded in dated
`drive-index-pilot.json` and `persisted-drive-integration.json` files under
`docs/hackathon-evidence`. Real-world accuracy, mobile browser playback on this source,
queue resumption and broad automatic sync remain unverified.

2026-10-31 original Drive component preflight passed through the new scoped script:
source membership/integrity and 53.033-second duration validated, existing local Whisper
base returned seven timed cues, and the event Baseten media adapter returned 12 validated
visual segments with empty dialogue across the recording. Video usage estimate $0.026313;
4,016 output tokens is close to the configured 4,096 bound. Private media was deleted;
only counts/checks/usage are recorded in
`docs/hackathon-evidence/2026-10-31-drive-media-preflight.json`. This is not a labelled
accuracy evaluation, persisted Drive index, search success or automatic-sync validation.

2026-10-31 subsequent event extension: separate Baseten media and text request limits
in `meta-transport.ts`. Media defaults to 8 MiB serialized (configurable ceiling 100 MiB),
text retains 128 KiB, and bounds are checked before paid reservations. Existing direct
Meta settings are unchanged. Both adapter suites pass 45 tests; engine TypeScript passes.
`scripts/check-drive-media-pilot.cjs` adds explicit account/file-scoped real-media
preflight with selected-folder/source validation, bounded private download, local speech
processing, one guarded visual request and private scratch cleanup. It is not queue
ingestion or an accuracy benchmark. Full remaining work is tracked in
`docs/media-ingestion-roadmap.md`, linked from TODO, including large-file windows,
Meta upload/reuse/deletion, query/index compatibility, retries, ownership and sync gates.

2026-10-31 subsequent event-developed media integration extends the existing shared
Meta/Baseten adapter: explicit Baseten media opt-in, pinned sponsor model for media,
documented `audio_url` encoding, 300-second video rejection, and strict visual-only
dialogue rejection. Existing direct Meta request behavior is preserved. Code:
`providers/{baseten-ai.provider,meta-ai.provider,meta-transport}.ts` under
`apps/api/src/modules/pipeline/`. Combined provider suites pass 44 tests, TypeScript
passes. `scripts/check-baseten-media.cjs` records one live generated red/blue video
success and separate silent-audio success in dated evidence JSON. Cached offline Whisper
also returned zero cues for silence. Real speech/Drive ingestion is not yet validated.
The first sandboxed video connection was blocked; its reservation remains recorded.
The owner approved raising the cumulative ceiling from $3 to $5; no ledger reset occurred.
Direct Meta host transition is documented in `docs/meta-adapter.md`, still without live
Meta validation or an active host switch. Existing Google embeddings remain untouched.

2026-10-31 indexing preflight (event validation of pre-existing local embedding and
frame-analysis foundations): cached offline MiniLM passed a six-text, three-pair smoke
test; one live Baseten synthetic frame passed text, color and source-timestamp checks.
Evidence: `docs/hackathon-evidence/2026-10-31-local-embedding-preflight.json` and
`docs/hackathon-evidence/2026-10-31-baseten-frame-preflight.json`. These are synthetic
checks, not personal-footage accuracy or completed Drive ingestion. Active embedding
configuration, workers and sync remain unchanged. The event-developed shared provider
adapter now fixes Baseten frame/aggregate attribution in
`apps/api/src/modules/pipeline/providers/meta-ai.provider.ts`; the Baseten adapter suite
passes seven mocked tests including the regression. Full-video/audio integration remains
unverified; Baseten original-video analysis is still deliberately disabled. Ledger holds
are $2.40 of the authorized $3; token estimates are not invoices.

Prepared 2026-10-27 for the Meta Global AI Developer Hackathon startup entry.

See [the judge-facing technical design](technical-design-for-judges.md) for tool/workflow choices,
intended advantages, measured evidence and the distinction between implemented and planned behavior.

## Attribution boundary

Brisky existed before the hackathon. The latest committed comparison reference inspected is
`05caf9af22173b5235cef4795ab19b2660761b8f`, authored 2026-09-23 at 20:37:47 +01:00.
The project owner confirmed on 2026-10-27 that the event runs **2026-10-26 through 2026-11-04**
and that there were **no uncommitted Brisky changes before 2026-10-26**. On that basis, this commit
is the source comparison baseline for the work in this collaboration. The exact official opening
hour/timezone was not supplied; the confirmation establishes the day-level boundary.
Git author dates and a snapshot created today cannot independently prove development time.

Recent work remains in the working tree. The contribution list below identifies the functional work
developed in this collaboration since the owner-confirmed start, rather than claiming all file changes
as new functionality. Preserve contributions by other authors; formatting-only changes are not new functionality.

## Existing product — context only

The reference README and code already describe cloud-connected video indexing, FFmpeg scene/keyframe
processing, Whisper transcription, Gemini multimodal analysis, natural-language search, PostgreSQL/
pgvector retrieval, BullMQ workers, on-demand previews, extracted clips and lineage, and a web dashboard.
These capabilities must not be presented as created during this hackathon. Existing marketing claims
are not measured results for this entry.

## Contributions since the owner-confirmed start

| Work developed in this collaboration | Main code | Current status |
| --- | --- | --- |
| Conversational engine-to-SaaS integration | `apps/api/src/modules/conversation/`, `pipeline/space-conversation.ts`, Google/Meta provider methods, SaaS reply schema/core/route and conversation/citation UI | Developed 2026-10-31 on the pre-existing engine retrieval/provider/budget infrastructure and earlier SaaS persistence. Adds model-generated conversation planning/answering, owner-scoped indexed evidence, original-range citations, saved assistant turns and durable reply claims/recovery. Offline provider/orchestration/auth tests, isolated PostgreSQL persistence/retry/citation checks, real Nest/Fastify+SQL fixture checks, and Next.js/mobile+desktop browser checks passed. Browser fixtures cover automatic replies, follow-up/shortlist context, citations, reload without regeneration and outage/manual retry. Gemini selection is unchanged; Meta remains dormant. Live activation remains opt-in/default disabled. No paid model calls, real footage, email or workers; real naturalness/semantic accuracy/cost remain unmeasured. Source chips select the inspector; playback is still separate. See `docs/saas-conversation.md` |
| Authenticated SaaS Spaces, messages and shortlists | `apps/web/server/spaces-core.ts`, `spaces-http.ts`, `apps/web/app/api/spaces/`, `apps/web/lib/spaces-context.tsx`, search/Studio/sidebar integration, local migration and check scripts | Implemented 2026-10-31 using the previously added SaaS tables and existing engine owner/media IDs. Isolated PostgreSQL checks passed for ownership, CRUD, pagination, concurrent ordered messages, retry deduplication, source ranges, atomic ordered shortlists and delete cascades. Local Chrome/API checks passed for creating a Space, saving/reloading messages, adding an owned source range, shortlisting/reordering/reloading, rename/pin, unauthenticated/forged-role rejection and deletion; mobile/desktop screenshots inspected. TypeScript and targeted lint passed. This is SaaS persistence, not an engine search/chat bridge: no assistant inference, automatic results, citations, playback or generated outputs are claimed. No emails, workers or paid model calls. See `docs/saas-spaces.md` |
| Mobile Entities and voice panel interaction polish | `apps/web/hooks/use-bottom-sheet.ts`, `EntitiesView.tsx`, `VoiceModeModal.tsx` | Updated 2026-10-31 with shared spring motion, handle-only drag, velocity/distance dismissal, reduced-motion support, dynamic viewport/safe-area sizing and scroll restoration. Headless mobile Chrome checks passed for both panels' bounds, finger tracking, short-drag snap-back and swipe dismissal; screenshots inspected. TypeScript passed. New hook/voice lint passed; existing Entities data-handling lint issues remain. Temporary voice preview removed; no audio captured, model call or database needed for final UI checks. This does not implement voice inference or recognition |
| Persistent SaaS onboarding | `apps/web/server/onboarding-core.ts`, `apps/web/app/api/onboarding/route.ts`, workspace/profile tables, onboarding/OTP/sidebar integration | Developed and migrated locally 2026-10-31. Isolated PostgreSQL and Next.js HTTP checks passed for account-owned profiles/workspaces, alias normalization, concurrent/repeat save, validation, ownership and login routing. Public UI preview retained; saving requires a session. Source selection is a preference, not OAuth/import or recognition enrollment. Browser interaction remains unverified. See `docs/saas-onboarding.md` |
| Next.js SaaS email-code authentication | `apps/web/server/auth-core.ts`, SMTP/server HTTP helpers, `apps/web/app/api/auth/`, `apps/web/server/auth-schema.sql`, login/OTP wiring and session-gated app layout | Developed and migrated locally 2026-10-31; isolated PostgreSQL checks passed with fake mail for code hashing, browser binding, resend/attempt limits, concurrent single use, expiry, sessions/logout and SMTP failure. Auth HTTP negative-path/logout checks and targeted lint passed. Initial frontend TypeScript passed; final rerun encountered concurrent onboarding UI errors, preserved as ongoing work. Separate from existing engine JWT auth. No live emails sent; full browser integration and delivery remain unverified. See `docs/saas-email-login.md` |
| First-run onboarding workflow and new-account routing | `apps/web/app/(auth)/onboarding/page.tsx`, `apps/web/components/onboarding/OnboardingView.tsx`, and `OtpForm.tsx` new-user routing | Implemented and refined 2026-10-31; renders 4-step progressive setup (identity & search aliases, workspace creation with Hugeicon library selection, storage connector selection, AI search preview with Hugeicons replacing emojis), top-left branding, centered header layout matching `/login`, directional card transitions, dynamic canvas synchronization (`AuthThemeEnforcer`) eliminating mobile dark-overscroll/tile glitches, mobile Safari focus auto-zoom prevention via `Viewport` `maximumScale: 1` + 16px font enforcement (`globals.css` and responsive input classes) and horizontal overflow clamping, and new-vs-existing routing separation on email authentication. Verified clean HTTP 200 responses. |
| Separate SaaS workspace persistence | `apps/api/src/modules/database/saas-schema.sql`, database migration integration, `scripts/check-saas-schema.cjs` | Implemented and applied to local PostgreSQL 2026-10-31. Spaces, ordered messages, source moments, citations and shortlists use owner/Space composite foreign keys. Rollback-only live constraint/cascade checks and API TypeScript checking passed. Existing engine users/media reused. Next.js authentication and Spaces routes/browser persistence are now implemented separately above; grounded chat and citation generation remain planned. See `docs/saas-database.md` |
| Scoped conversation verification grounded in confirmed people tags | `apps/api/src/modules/pipeline/conversation-evidence.ts`, `apps/api/src/modules/people/conversation-verifier.service.ts`, Google/Meta provider extension, media search integration and `scripts/conversation-http-validation.cjs` | Implemented 2026-10-30; 147 targeted tests, API `tsc --noEmit` and rollback-only PostgreSQL/HTTP fixture checks passed. Exact labelled face frames/boxes, original moving clip audio and timed cues are required; two-person grounded turns are validated and stale labels/context invalidate assessments. Gemini stays active; no paid/live model calls. Real decoding/model accuracy, cloud behavior and browser UX remain unverified. Full-query match flags remain false. See `docs/conversation-verification.md` |
| Dormant Meta adapter across the existing AI interface, preserving Gemini selection | `apps/api/src/modules/pipeline/providers/meta-ai.provider.ts`, `meta-transport.ts`, `meta-contract.ts`, adapter/facade specs, `.env.example` | Implemented 2026-10-30; 108 offline adapter, budget, verification and people-search regression tests passed, plus API `tsc --noEmit`. Query understanding/decomposition, frames, native video, chunked audio and evidence verification have request/response fixtures; embeddings delegate to the existing Google backend. Active `.env` settings/models remain unchanged. No live Meta access, real decoding/media accuracy, provider billing or full worker execution validated; no Docker or paid calls. See `docs/meta-adapter.md` |
| Confirmed-appearance identity search and ambiguity resolution | `apps/api/src/modules/people/people-search.ts`, `people-search.service.ts`, people controller/module, media search integration, OpenAPI and expanded `scripts/people-http-validation.cjs` | Implemented 2026-10-30; 80 people, media integration, OpenAPI and verification regression tests passed, plus API `tsc --noEmit`. Live rollback-only PostgreSQL/HTTP checks passed range union/intersection, gaps/touching endpoints, rejected tags, ambiguity selection, source/offline filtering and cross-owner denial. Existing media entry-point integration is locally tested; full API/browser validation remains pending. Results are manual co-presence evidence, never verified conversations or automatic recognition. No workers or paid inference. See `docs/people-identity-api.md` |
| Offline face-recognition evaluation tooling | `services/face-recognition/`, `docs/face-recognition-evaluation.md` | Prepared 2026-10-30; 19 synthetic/CLI tests passed without Docker or paid calls. Model-neutral evaluator separates reference/calibration/test recordings, counts misses, requires two-source support and abstains on ambiguity. Local YuNet/SFace adapter and model/checksum inventory prepared; OpenCV inference not executed, no weights/dependencies downloaded, no evaluation footage available. No automatic recognition, indexing or API matching integration is claimed. |
| Manual personal identity and timestamped appearance backend | `apps/api/src/modules/people/`, `apps/api/src/modules/database/schema.sql`, `scripts/check-people-identities.cjs`, `scripts/people-http-validation.cjs`, OpenAPI contract | Implemented 2026-10-30; 30 targeted tests and API `tsc --noEmit` passed. Owner-enabled local PostgreSQL checks passed for schema block reapplication, composite owner foreign keys, self uniqueness, face-box constraints and deletion cascades. Authenticated HTTP routes passed real SQL round trips, pagination, correction, conflict and cross-owner denial checks. All fixtures/schema changes rolled back; no workers or paid inference. Automatic recognition, model suggestions, identity-aware search, interaction verification and frontend integration remain unimplemented by this milestone. Contract: `docs/people-identity-api.md` |
| Provider-neutral application boundary and Google adapter separation | `apps/api/src/modules/pipeline/ai-intelligence.service.ts`, `ai-provider.ts`, `providers/google-ai.provider.ts` | Implemented; Google remains active. Dormant Meta adapter is a separate contribution below |
| Per-attempt budget reservations and explicit model pricing | `apps/api/src/modules/pipeline/ai-usage-ledger.ts`, `scripts/summarize-ai-usage.cjs` | Implemented; live billing reconciliation pending |
| Strict verification outcomes, evidence identity, timestamp-preserving cache and candidate expansion | `apps/api/src/modules/media/media.service.ts`, `verification-correctness.spec.ts` | Regression and isolated database checks passed |
| Bounded detail/sequence evidence preparation | `apps/api/src/modules/pipeline/search-evidence.service.ts` | Implemented; real-footage quality evaluation pending |
| Persistent local embedding worker and deadline propagation | `apps/api/src/modules/pipeline/local-embedding.service.ts`, `services/whisper-transcriber/embed.py`, `apps/api/src/common/search-deadline.ts` | Protocol/cancellation tests passed; model quality unmeasured |
| Provisional results, retained results after timeout, deliberate continuation | `apps/web/src/App.tsx`, `components/MomentSearch.tsx`, API search routes | Implemented; live browser validation pending |
| Client-disconnect and PostgreSQL cancellation; serialized schema application | `apps/api/src/common/search-disconnect.ts`, `apps/api/src/modules/database/database.service.ts` | Isolated live PostgreSQL/Redis/HTTP checks passed |
| Bounded cloud-source staging, request-scoped reuse, Drive cancellation and source-size checks | `apps/api/src/modules/media/cloud-inspection-source.ts`, `apps/api/src/common/search-resources.ts`, connector changes | Synthetic-stream tests passed; live Drive checks pending |
| Removal of approximate bitrate-based timestamp extraction | `apps/api/src/modules/queue/indexing.processor.ts`, `ranged-access.spec.ts`, `scripts/check-clip-timestamps.cjs` | Removed; replaced by decoder-driven reads below, with bounded complete-source fallback |
| Decoder-driven cloud range reads for selected moments | `apps/api/src/modules/pipeline/seekable-media-source.ts`, connector session contract, search/export wiring | Implemented; local range/native decoding compared; live Drive and progressive full-indexing validation pending. See `seekable-cloud-media.md` |
| Streamed scene/audio preparation and reusable preparation checkpoints | `apps/api/src/modules/queue/indexing.processor.ts`, `apps/api/src/modules/pipeline/processing-units.service.ts` | Implemented; completed preparation can resume; independently scheduled per-window processing remains pending. See `streamed-indexing.md` |
| Resumable audio windows and persistent local Whisper sessions | `apps/api/src/modules/pipeline/audio-windows.ts`, Whisper service/Python protocol, worker and transactional checkpoint methods | Implemented opt-in; fixture/decoder/database checks; real speech-boundary evaluation pending. See `resumable-audio-windows.md` |
| Resumable scene preparation and evidence spanning window boundaries | `scene-windows.ts`, FFmpeg pipeline, worker and owner-scoped checkpoint transactions | Implemented opt-in; unit/worker/native decoder fixtures; new transaction path not live-DB validated, real footage accuracy/cost evaluation deferred. See `resumable-scene-windows.md` |
| Authentication and request admission | Auth service, shared request-validation/limits helpers, controllers and auth form | Required private secret, strict session claims, opt-in development demo setup, targeted validation and per-process IP limits; unit/HTTP checks. See `authentication-and-request-admission.md` |
| Durable clip operations for API consumers | Job/media routes, indexing service/worker, `clip_operations` schema and result links | Keyed submission, owner-scoped lookup, dispatch recovery and atomic result publication; unit/worker fixtures and isolated PostgreSQL checks. See `clip-operations-api.md` |
| Developer contract, paginated reads and honest tenant-scoped economics | `api-contract.ts`, `pagination.ts`, error filter, list/economics routes, dashboard and generated OpenAPI | Implemented 2026-10-28; route/unit and isolated SQL/schema checks; unmeasured billing/hit rates remain unknown. See `api-contract-and-pagination.md` |

This table relies on the owner's confirmation of the start boundary and clean pre-event working tree.
Before submission, link each row to its final development commit and retain the official event rules.
It is an attribution record, not an organizer eligibility ruling.

## Exact use of Meta models

Active Space mobile-header update (2026-10-31): on the single-Space view only, the
brand wordmark is replaced by a left hamburger navigation button and centered
`Spaces` title. Existing ellipsis and Space Studio controls render into the right
side of that header via a shared client layout slot, preserving their state and
desktop placement. A right-panel icon distinguishes Studio from main navigation;
the duplicate mobile content title is hidden. TypeScript and targeted lint passed.
Headless Chrome checks at 390, 760 and 1280 px passed for title centering, control
placement, ellipsis interaction and Studio open/close; phone and desktop screenshots
were inspected. Temporary test account removed; no email/model calls made.

Brand/navigation polish (2026-10-31): replaced `apps/web/app/favicon.ico` with a
multi-resolution rendering of the existing composer `b.` mark in its existing logo
font and violet badge styling. Mobile header menu moved right; the duplicate
trigger inside the mobile drawer was removed, while desktop collapse/expand
controls remain. Phone/tablet/desktop browser checks and favicon HTTP/metadata
checks passed; temporary fixture account removed and no email/model calls made.

Signed-in auth-page navigation (2026-10-31): shared `GuestOnly` layout now redirects
valid sessions away from `/login` and `/verify`, using saved onboarding completion
to choose `/search` or `/onboarding`. This extends the event-developed SaaS auth.

SaaS processing feedback (2026-10-31): email sign-in and onboarding save/skip
buttons now display spinner icons during their existing pending states, retain
disabled controls and expose busy state. Reduced-motion preferences are respected.

SaaS sign-in repair (2026-10-31): restored a stale Next.js request-code route via
frontend restart, fixed local bind-address Origin comparison, and sanitized HTML/
malformed-JSON login responses. Local HTTP origin/error checks, auth/onboarding
regressions, TypeScript and targeted lint passed; no engine or model calls needed.

Entities protection update (2026-10-31, owner requested): `/entities`,
`/entities/new` and its `/entity/new` alias now use the shared session guard.
This supersedes the earlier public Entities preview exception.

Latest SaaS route/layout update (2026-10-31): onboarding now requires a session and
no longer displays the temporary UI-preview notice; this supersedes its earlier
public-preview exception. Entities remains public. The mobile app shell now
reserves a solid header row, removes obsolete page-title menu padding and sizes
content below navigation. TypeScript and targeted lint passed; signed-out onboarding
redirect and public Entities HTTP checks passed.
Headless Chrome checks at 390, 760 and 1280 px passed for header/title separation,
opaque mobile navigation, viewport height and drawer open/close behavior;
phone/desktop screenshots were inspected. No database or model calls were needed.

Onboarding audience update (2026-10-31): copy, workflow choices and defaults now
welcome personal, learning, work, creative and general use. Backend validation and
the database constraint accept the new values while preserving existing profiles.
All five choices passed local persistence tests. This extends the event-developed
SaaS onboarding; it does not claim new domain-specific engine functionality.

SaaS UI development exception (2026-10-31, owner requested): `/entities` and its
children plus `/onboarding` remain public. Shared `RequireSession` layouts retain
login checks for the other existing app sections; this does not grant anonymous
access to authenticated data APIs. See `docs/saas-email-login.md`.

Logout follow-up (2026-10-31): sidebar loading/error handling and full navigation,
stale-cookie cleanup without database access, and rejection of unsigned mock
sessions are implemented. Database-backed HTTP logout/replay/cookie/redirect checks,
auth regression checks and targeted lint passed; no browser click test or email sent.

**A dormant Meta adapter is implemented, but no live Meta inference has been run or validated.**
The owner requested keeping Gemini active. `AI_PROVIDER=google`, existing generation models,
Whisper selection and the existing embedding space were preserved. The facade can now construct
the Meta implementation only through explicit future selection/configuration. Query understanding,
decomposition, frames, native video, audio transcription and evidence verification have offline
request/response coverage; embedding calls retain the explicit Google backend. See
[the complete scope and limits](meta-adapter.md). This implementation is not actual Meta model use.

Intended demo contribution: use a Meta multimodal model to check scene-specific evidence for a retrieved
candidate, preserving the user's fine-detail or temporal constraints. Local retrieval, decoding and
transcription provide the foundation. Before submission, record the exact model/version, adapter path,
request-building code, supplied evidence, parsed output, and how the result changes the UI. Pin this
record to the final submitted commit and provide a reproducible example. Do not imply model support
or accuracy until it works and is measured.

## Demo and publication boundaries

### 2026-10-31: Manage layout and drawer motion refinement

Event-developed UI refinement of `DriveManager`, `DriveManagementModal`,
`ConnectorDialog`, `PipelineCanvas` and `DetailPanel`: larger text/touch targets,
account summary, folder filtering and removable selection chips, clear saved/dirty
states, persistent Save/Cancel actions and a red Disconnect confirmation. Folder errors
have retry instead of a misleading empty state. Clicking the current breadcrumb no
longer sets a loading state without a navigation change. Sync waits for saved edits.
The owner moved the mobile Connectors action back into the canvas; this supersedes
the earlier header placement. Drawer entrances now use eased transform motion with
reduced-motion support; the full-viewport detail panel retains its source ownership
and backend behavior. This changes SaaS presentation/interaction, not engine indexing.
Frontend TypeScript and targeted lint passed. Local browser checks passed mobile and
desktop layout/navigation, folder filtering/empty state, save persistence and dirty
state reset, disabled sync for unsaved edits, cancellable red Disconnect confirmation,
canvas action placement and full-screen mobile details. Screenshots were inspected.
Folder responses used browser fixtures; only temporary local account/selection rows
were changed, then removed. No Google Drive calls, workers or inference were used.
See [layout evidence](hackathon-evidence/2026-10-31-drive-manage-layout.json).

### 2026-10-31: Factory modal/drawer navigation and Hugeicons

Event-developed UI refinement: separate Drive management modal, responsive native
dialogs with the shared mobile drawer hook, and a dirty-selection alert before
returning through Back/Cancel/close/Escape/dismiss. Keep editing preserves the draft;
Discard changes returns to the connector list. Animated Hugeicons replace Factory
Lucide glyphs. The mobile Connectors action uses the shared top-bar slot; the canvas
detail panel is a full-viewport native modal on mobile and keeps its desktop sidebar.

Local browser fixture checks passed navigation, native focus, draft preservation and
explicit discard, mobile drawer anchoring and desktop centering, mobile header action,
and 390x844 detail coverage. Screenshots inspected; fixture account data removed.
No personal Drive access, workers or inference was used. This extends the new SaaS
connector UI, not the pre-existing engine connector. The owner reports Google Drive
connection succeeded; real folder management remains owner-unverified. See
[scope](saas-drive-connectors.md) and [evidence](hackathon-evidence/2026-10-31-drive-dialogs.json).

### 2026-10-31: SaaS Drive linking and live Factory status

Event-developed bridge over the existing Drive connector: `SaasConnectorsController`,
Next.js connector/indexing routes, signed browser/session-bound OAuth state,
`FactoryProvider`, connector management UI and Factory node data. The onboarding
Drive icon now reuses the shared Google Drive SVG. This does not relabel existing
OAuth/token encryption, Google folder enumeration, sync or indexing as new work.
Factory sample accounts/files/metrics were removed in favor of owner-scoped records;
unavailable historical metrics remain unavailable. Folder selection, explicit sync
and disconnect are connected; sync is gated off pending indexing/provider readiness.

Security fixes remove the legacy callback's caller-supplied user ID and first-user
fallback, introduce short-lived one-use opaque state plus a browser cookie, and keep
SaaS session/OAuth credentials off browser JavaScript. The SaaS callback validates a
signed ten-minute cookie bound to the current session, handles cancellation, clears
the cookie and rejects replay. Mutations require matching Origin. No encrypted tokens
or raw provider errors are returned in account/status payloads.

Engine/frontend types and targeted lint passed. Eleven connector/sync/contract tests
and pure local state checks passed. Real browser/SaaS/engine/PostgreSQL fixture checks
passed listing/progress, folder saves, account/Origin isolation, OAuth URL and
cancellation/replay, disconnect and unauthenticated denial. Mobile/desktop screenshots
were inspected; fixtures were cleaned up. No Google API calls, workers or inference
were used. Actual Google consent, remote folders, refresh and indexing remain
unverified. See [scope and setup](saas-drive-connectors.md) and
[evidence](hackathon-evidence/2026-10-31-saas-drive.json).

### 2026-10-31: Source-frame result thumbnails and player posters

Event-developed `MomentThumbnailService`, session-guarded engine thumbnail route,
saved-moment SaaS thumbnail route and `MomentThumbnail` component replace result-card
vector placeholders with range-specific source JPEGs and add inspector posters.
The new integration reuses pre-existing FFmpeg/media/proxy facilities. Frames come
from the saved range midpoint, center-cropped to the designed 16:11 card, with disk
cache, identical-request deduplication, serial decoding, bounded queue/timeouts and
loading/retry UI. Both SaaS and engine enforce ownership before serving images.

Engine/frontend TypeScript, targeted lint, six thumbnail-policy/contract tests and
existing real Nest/PostgreSQL conversation fixture checks passed. The real browser
evaluation used a generated red/blue video: separate ranges produced distinct correct
frames, 640x440 JPEGs, cached identical responses and exact card sizing. Cross-owner
and unauthenticated access were denied; existing citation playback checks passed.
Mobile/desktop screenshots were inspected. Temporary accounts/MP4 were removed;
synthetic derivative JPEGs remain in the local cache. No AI calls were made.
This is not an AI picture generator or verified best-frame selector. Cloud formats,
real-footage usefulness, physical mobile devices and cache eviction remain unverified
or planned. See [scope](saas-moment-thumbnails.md) and
[evidence](hackathon-evidence/2026-10-31-saas-thumbnails.json).

### 2026-10-31: Saved Space citation playback

Event-developed integration of the pre-existing engine's source lookup/proxy cache:
`apps/web/server/space-playback.ts`, the saved-moment playback route, `SourcePreview`,
and the session-guarded GET/HEAD stream methods in `ConversationController`.
New `stream-response.ts` supplies validated single byte ranges, metadata-only HEAD,
416 and disconnect cleanup. SaaS resolves the owned saved moment rather than accepting
an arbitrary filesystem path; engine independently checks source ownership. Playback
uses original source timestamps and pauses at the saved range end. No new proxy jobs
or workers are started by this bridge. Missing sources/previews have retry UI.

Engine/frontend TypeScript and targeted frontend lint pass. Four regression suites
passed 24 tests, followed by the expanded three-test playback suite including the
no-enqueue case. Real Nest/PostgreSQL conversation fixtures still pass. Actual local
browser checks used generated blue MP4 media and temporary accounts: citation click,
10-second start, 12-second stop, seek clamp, HEAD/range/416, incorrect Space association,
and unauthenticated/cross-owner denial passed. Mobile/desktop screenshots were inspected;
temporary account/source/file fixtures were removed. No AI calls were made.
Cloud hydration, format breadth, physical mobile devices and real-footage source
quality remain unverified. See [scope](saas-source-playback.md) and
[evidence](hackathon-evidence/2026-10-31-saas-playback.json). This is source playback,
not a newly extracted or frame-accurate edited clip.

### 2026-10-31: Baseten live text pilot and Google billing handling

Event-developed extension of the pre-existing engine: `BasetenAiProvider`, provider
selection in `AiIntelligenceService`, and a dedicated Baseten profile in `MetaTransport`.
The sponsor key is restricted to the exact `meta-models/muse-spark-open-1026` model,
with isolated credentials, structured output validation, deadlines and ledger accounting.
Four authorized live synthetic-text cases passed (greeting, cited source answer,
unsupported note claim, source prompt injection). Reported-token estimated cost was
$0.01511475 at published standard rates, not an independently verified invoice.
See [implementation limits](baseten-adapter.md) and
[live outputs](hackathon-evidence/2026-10-31-baseten-live-pilot.json).
The note case required manual review after an assertion incorrectly rejected quoting
an unsupported claim; the response explicitly refused to confirm that claim.
Original-video/audio support and real-footage accuracy remain unverified/disabled;
existing embeddings are preserved. A subsequent live browser check passed through
Next.js sessions, SaaS persistence, the real engine and Baseten using a temporary
synthetic indexed source. Initial reply, shortlisted-source follow-up, a persisted
10–20 second citation, cached retry and refresh without further inference all passed.
Temporary accounts/data were deleted. Mobile/desktop source-inspector screenshots
were inspected. This validates the live conversation path, not retrieval, playback
or real-footage accuracy. See [live SaaS evidence](hackathon-evidence/2026-10-31-baseten-saas-live.json).
Eight total Baseten requests across the adapter pilot and browser attempts have
$0.02576425 in token estimates; total conservative ledger reservations including
failed Google attempts are $2.15 of the $3 allowance. No budget reset was performed.
Engine TypeScript and 65 initial adapter/conversation tests passed; 45 targeted
adapter/billing tests passed after the final request-size change.

Google live testing returned HTTP 402 with the owner confirming a $0 Prepay balance.
`GoogleAiProvider` now stops on billing/auth/configuration HTTP errors rather than
rotating keys or retrying; five billing regression tests pass. Earlier failed requests
remain recorded in the ledger; no Google success or billed amount is inferred.
This changes existing provider error handling, rather than introducing Gemini support.

Mobile SaaS navigation polish (event-developed UI): shared taller headers use a left
two-line menu, centered page title and right-side actions. The search landing header
is transparent and borderless with a centered Brisky wordmark and Voice mode action;
other pages use a lighter translucent glass tint. Existing space menus and Studio
controls remain available. The mobile Space Studio panel now renders at the document
root to cover the entire viewport, including the top bar, at every width below 768px.
It uses a transform-only eased slide, respects reduced motion, provides its own close
button and Escape dismissal, and contains keyboard focus and scrolling while open.
TypeScript and targeted lint checks pass; local browser checks cover phone/tablet
full-viewport sizing and desktop controls. This changes presentation, not engine or voice backend
capabilities; live voice conversation remains separate from this UI work.

Introduce Brisky as a pre-existing product, then explicitly identify the new event-developed feature.
Keep the demo focused on that feature; use existing functionality only as clearly labelled context.
Show actual evidence and timestamps, an ambiguous/near-match case, and the resulting verified or
unconfirmed outcome. Attribute any improvement separately to model choice and evidence-policy changes.
Use only footage, datasets, code and assets whose rights permit the intended use and publication.

Public repository visibility, team membership (maximum four), licensing/dependency/media rights,
and a repository/history secret review still require verification before submission/publication.
The local `.env` is ignored and untracked in the current checkout; that is not a historical secret audit.
No repository was published and no license grant was chosen by this documentation step.

Run `node scripts/snapshot-hackathon-work.cjs` to record a content-hash inventory of relevant changed
source/docs against the comparison commit. The snapshot excludes credentials, storage and generated
files. It records current content, not authorship or trustworthy creation time. Keep dated development
commits going forward without rewriting or backdating history; finalize this document against the actual
submission commit and official event interval.

### 2026-11-02: Factory dependency layout

Event-developed presentation on the pre-existing indexing pipeline:
`apps/web/components/connectors/PipelineCanvas.tsx` now forks Scenes into Understand
and Transcribe, joining at Index before Purge. `apps/web/lib/pipeline-stages.ts`
clarifies that speech and visual analysis need not finish in a fixed sequence.
Web TypeScript and targeted lint pass; new browser layout acceptance remains open.
Scheduling is unchanged. The separate frame fix below addresses the current source.

### 2026-11-02: Recovery for an audio tail beyond the last video frame

Event-developed recovery in the pre-existing FFmpeg scene extraction:
`ffmpeg-pipeline.service.ts` now retries an empty near-end decode at bounded earlier
seeks within the same scene, preserving the successful seek timestamp and required
evidence checks. It does not mask transport errors or general decoder failures.
`frame-coverage.spec.ts` covers the 14.7/14.72s tail and non-recovery on decoder errors.
Local reproduction on the actual affected Drive source confirmed audio/video duration
mismatch; extraction passed after recovery at 14.65s. 30 focused tests and the API build
passed. A fresh end-to-end sync remains unverified. The owner-requested seven-asset
reset preserved 50 unrelated assets, originals, people profiles and the usage journal.
See `docs/factory-stage-history.md`.

### 2026-11-02: Provider-neutral Factory labels and explicit reuse

The event-developed Factory UI now renders the pre-existing `gemini_video` job key as
?Video analysis?, including live notes and recorded substeps. Persisted job/checkpoint
keys are retained for compatibility; the active configured Meta provider is unchanged.
Reused-index completions display ?Reused? on the Index card and ?Reused existing index?
in Overview journeys. Totals still count file records rather than unique content hashes.
A read-only local database check confirmed one current duplicate with a completed
`reused_index` event pointing to an older indexed donor. Web TypeScript and targeted
ESLint pass. Browser acceptance is pending.

### 2026-11-02: Search relevance, durable thumbnails and AI speech repair

Event-developed fixes extending the pre-existing retrieval/transcription foundations:
- `moment-thumbnail.service.ts` crops an owned, in-range durable indexed frame when
  no playable preview exists. File paths are resolved inside storage, including realpath
  checks. Generated JPEGs retain the existing 640x440 card fit. Actual thumbnail
  generation and authenticated SaaS thumbnail routes passed for three new Drive sources.
- `conversation.service.ts` preserves retrieval priority, selects one overlapping
  segment per candidate, retains bounded inspected ranges and returns only model-cited
  evidence as result cards. `space-conversation.ts` permits a supported no-match answer
  without forcing unrelated citations and carries query checks into answer context.
- `media.service.ts` checks long action scenes through at most three bounded video
  excerpts (beginning/middle/end), returning only a positively checked interval.
  Absence in sampled excerpts is not treated as a full-video negative. Singular searches stop inspecting after a verified match; plural requests
  retain the bounded multi-candidate path. This is implementation, not an accuracy claim.
- `SearchResultsView.tsx` anchors the composer outside scrollable messages, sorts current
  cited moments first and uses relative/recent chat dates via `lib/chat-time.ts`.
  Web TypeScript and targeted lint pass; browser presentation acceptance remains open.
- Factory now honors `TRANSCRIPTION_PROVIDER=ai` across Meta/Baseten/Google adapters,
  bypassing local Whisper even if installed. Controlled budget plans include audio
  chunks and audio model IDs. AI errors do not silently fall back to Whisper.
- `local-embedding.service.ts` explicitly uses UTF-8 for the Windows Python protocol;
  multilingual transcript repair exposed a tokenizer failure with the inherited encoding.

Validation: 129 tests across eight focused suites and API TypeScript build passed
before the final runtime restart. Three actual thumbnail bridge checks passed without
AI. A first live action search returned incomplete/no cards, exposing the long-scene
inspection limit; the new localization path still requires its live recheck.

The owner approved a 12-second audio comparison, judged its Spark 1.2 result accurate
enough, then approved full audio/repair for that source and the other three unique
indexed recordings. Five file records (four unique videos, one duplicate) now have
Meta-generated transcript observations and rebuilt local 384-dimensional embeddings.
Old transcripts/index rows are backed up in ignored `storage/usage`; visual evidence,
people tags, originals and usage history remain intact. Only the initial 12 seconds
were human-reviewed; the remaining model transcripts are not a labelled accuracy
benchmark. Existing saved chats/moments retain their snapshots. No full reset occurred.
Muse Voice Transcribe was researched but not selected or called in this change.

Follow-up validation: all five connected indexed file records now use refreshed Meta
speech observations (one returned no audible cues), with duplicate transcript reuse.
The old transcript and index data have per-source backups in ignored storage. Only
four unique audio recordings were sent across the repair; no visual reindex occurred.
Timed observation cues are now selected within the final citation range instead of
copying the whole scene transcript. The local database range query passed.

Final live action-search check passed at the engine/SaaS boundary: the owner's exact
stick/extended-leg query returned one cited result for the expected source, scoped
to a video-verified 0-20s excerpt. The reply described the requested action and the
countdown; unrelated candlelight material was not returned as a card. The overall
search status remains incomplete because other candidates were not exhaustively
checked. This is one positive case, not a retrieval accuracy benchmark. The targeted
129-test run and follow-up 42-test verification/conversation run passed; the final
API build, web TypeScript/lint and actual owned range-evidence SQL check also passed.
API and worker restarted with AI speech and the owner-approved $30 cumulative cap;
automatic connector polling remains off for manual acceptance sync.

Isolated Chrome browser acceptance passed at 390px and 1280px with synthetic
thinking/completed responses: composer top/bottom remained identical in both states
(y=770..824 within an 844px viewport), recent date rendered ?Just now?, and the cited
matching moment was selected first despite a different saved-row order. Screenshots
were inspected. Temporary sessions/browser profiles were removed; no AI calls or real
chat writes were made by this browser fixture. The local web server had stopped and
was restarted for acceptance. Actual search/thumbnail checks above used real indexed
sources separately.

### 2026-11-02: In-app space deletion confirmation

`SearchResultsView.tsx` replaces `window.confirm` for space deletion with the shared
accessible alert dialog: centered on desktop, bottom drawer on mobile. The dialog
names the space and explains that chat, saved moments and shortlist are removed
while original library media remains. Cancel receives initial focus. The destructive
button uses red styling, button-hover Hugeicon animation, a pending spinner and
double-submit protection. Failure stays inside the dialog for retry; the existing
SaaS deletion API and navigation remain unchanged. TypeScript and targeted lint pass.

Isolated Chrome checks passed at 390/1280px: mobile full-width bottom drawer,
desktop centered dialog, initial Cancel focus, cancellation without a DELETE,
in-dialog failure/retry, and successful confirmed navigation. Native confirmation
was disabled in the fixture. All deletions were mocked; real spaces were untouched.

### 2026-11-02: Connector-backed source playback and concise find replies

The pre-existing connector read-session and source playback primitives now have an
event-developed SaaS bridge for originals that lack a local preview. `media.service.ts`
resolves the source through both asset and connector ownership; it verifies size/version
and uses content MD5 to distinguish harmless Drive metadata changes from replacement
media. `remote-stream-response.ts` proxies validated bytes with seeking, HEAD support,
backpressure and disconnect cleanup, without keeping another copy of the master.
`conversation.controller.ts` prefers existing local media and falls back to that source.
Unsupported/unavailable sources keep a retry state rather than silently starting jobs.

`space-conversation.ts` now asks for one or two short sentences for a simple moment
lookup, leaving full descriptions to cards and forbidding invented synchronization of
several transcript cues with one visual event. Existing replies are preserved snapshots.
`SourcePreview.tsx` no longer tells users to wait for preparation that was never queued.
33 focused tests, the API build and web TypeScript/targeted lint passed. Real Drive
transport through SaaS passed readiness HEAD, bounded/suffix reads, invalid ranges
and unauthenticated denial without AI calls. Browser decoding remains a separate check.

Actual isolated Chrome acceptance subsequently passed: the Drive source decoded at
576x1024, playback advanced after clicking Play, and a seek past the saved 0-20s range
paused/clamped correctly. The 52.823946s original remained in Drive; temporary sessions
and the browser profile were removed. No inference or real chat changes were involved.


### 2026-11-02: Drive-backed face checks and tagging controls

Event-developed face preflight/scanning now uses the existing owner-scoped connector
read session and ephemeral seekable FFmpeg bridge when no retained preview exists.
This fixes the 409 caused by requiring a local preview after streamed playback.
Sources are bounded to 100 MiB with a 200 MiB read allowance, validated before
accepting results, and closed on success/failure, including suggestion thumbnails.
Existing local previews still work. No remote recognition model or retained master
copy was introduced. Local recognition accuracy claims remain pending evaluation.

`TagPerson.tsx` and `SourcePreview.tsx` add explicit frame selection within the saved
moment, searchable names/aliases, visibility range sliders, and access to the existing
person edit/delete APIs. Delete requires an in-modal confirmation; the directory's
existing profile controls were not newly invented here. Frame changes reset the face
box; a failed preflight now displays the actual safe SaaS error instead of hiding it
behind a generic outage warning. The starting frame is the player's paused position,
not an automatic best-face selection.

Validation: API build and web TypeScript/targeted lint passed. A real Drive-backed
SaaS preflight returned HTTP 201 with a detector advisory (full-frame selection did
not identify a target), without AI calls or tag writes. Focused lease tests cover
bounds, missing sources, version validation and release. Isolated mobile and desktop browser checks passed frame seeking, alias search
among 25 synthetic people, edit, confirmed delete/cancel and range inputs; real
people were unchanged. The mobile harness timed out waiting for browser-close
acknowledgement after its assertions passed; its finally cleanup still ran. Desktop
completed normally. Across nine API suites, 106 assertions passed after updating
the enrollment fixture to the new leased-source contract.


### 2026-11-02: Citation playback modes and original-source follow-up search

Extending existing playback, the Space player defaults to the cited range and adds
an explicit Full video / Back to moment control. Switching back restores citation
boundaries; full-source face tagging uses the original duration. No indexing or
source retention behavior changed.

Extending event-developed conversations, lookup/timestamp requests now trigger
retrieval even if the planner tries to answer from existing excerpts. Referential
follow-ups with one selected asset search that original asset without its prior
citation range; explicit other-video/library requests keep wider retrieval. Hugging
and embracing now route to motion-based video verification. Prompts distinguish a
containing excerpt from exact event onset/offset, and forbid treating missing
excerpt content as absence from the original.

Validation: 52 focused API tests, API build, web TypeScript and targeted lint passed.
Regression cases cover a 0-20s selection followed by a hugging timestamp lookup and
an explicit request to search other videos. Real browser and bounded Meta acceptance
are recorded below when complete; no claim of frame-accurate event boundaries.


Live follow-up acceptance: the original-source hugging lookup reached moving-video
inspection beyond the saved-result-only planning path but exhausted the bounded
search deadline. HTTP 200 retained searchStatus=incomplete and no fabricated
citation or exact timestamp. The hug's onset/offset is still unverified; do not
present this as a successful temporal-localization evaluation. A direct Drive/SaaS
playback check passed HEAD, byte ranges, invalid-range rejection and ownership denial.
The first simultaneous browser check hit a transient source timeout; it was retried
separately from paid inference. No saved Space messages were altered.


Separate real Drive browser acceptance passed: playback defaulted to the cited
0-20s range and clamped at its end; Full video successfully sought to 26s; Back to
moment returned to the citation start and restored range restrictions. No inference,
saved chat writes or additional retained original were involved.


### 2026-11-02: Space follow-up scrolling and authenticated chat avatar

Extending the event-developed Space chat UI, `SearchResultsView.tsx` scrolls its
own message container when a new follow-up or reply/pending state arrives, keeping
the composer fixed. Polls of the same message and source selection changes do not
re-trigger scrolling; reduced-motion preferences are respected. Initial source
results retain their existing layout. Both initial and subsequent user messages
now use the authenticated name/email initial, matching the sidebar profile, rather
than a hard-coded U. This does not add profile photo uploads or a new auth system.

Validation uses web TypeScript/lint and an isolated 390/1280px browser fixture with
synthetic chat messages/profile. No engine restart, indexing, paid inference or real
chat writes are required for these frontend changes.


### 2026-11-02: Focused action citations and dedicated Moments panel

Extending existing event-developed query verification, a positively checked simple
motion query with a timestamp anchor can now inspect an additional eight-second
source clip around that anchor. Only a separately positive video check replaces
the wider interval. Failed/negative refinement keeps the previously verified wider
match; temporal-order/context/exclusion requests retain context. This is bounded
localization around an anchor, not a measured exact event onset/offset or a claim
that every event lasts eight seconds. Existing stored citations are unchanged.
`media.service.ts` uses the existing provider-independent verifyClip boundary,
metering and verification cache. Three new regression cases cover narrower success,
negative fallback and retaining temporal-order context. Across the focused three
suites, 55 assertions passed after updating the old wide-window expectation.
API build passed and the verified API was restarted with polling still disabled.
No new live accuracy claim is made for shortened clips.

`ReplyCitation.tsx` replaces long inline citation pills with a compact title,
separate timestamp/duration line and a parent-hover animated Hugeicons play badge.
Full titles remain accessible. `SearchResultsView.tsx` moves the source browser and
player out of the chat into a Moments panel: docked at wide desktop sizes and a
full-screen focus-trapped drawer below 1280px. A persistent Moments/count launcher
sits above the composer; citation clicks select their result, open the panel and
prepare playback at the cited start. `SourcePreview.tsx` focuses the video and
scrolls the panel's own content instead of the page. Playback rejection retains an
explicit native Play path for browser autoplay restrictions. Source details start
collapsed; Studio and Moments launchers avoid stacking both panels.

The profile initial fix and follow-up scroll behavior also gained resize-aware
content tracking: late-loading content keeps the latest turn visible unless the
user scrolls back. Existing source/identity primitives remain pre-existing; these
are UI and orchestration extensions, not new identity models or a new media engine.
Web TypeScript and targeted lint passed. Isolated browser acceptance at 390/1280px
passed profile initials, thinking/reply scrolling, citation title/range/duration,
panel opening, selected-source video focus, actual generated-video playback and
player visibility. Fixtures used synthetic chats/people and a generated 40-second
video with proper byte-range responses; no real messages/media or paid inference
were changed by these browser checks.


2026-11-02 panel-control refinement: the existing Moments close icon is preserved
at the owner's request. Studio open/expand controls are hidden while Moments is
open and return when it closes, removing the adjacent look-alike desktop triggers.
This is a small refinement to the event-developed Space UI; no backend change.

The Moments header now removes its reserved right padding on docked desktop
layouts, aligning the unchanged close icon with the panel's right content edge.


### 2026-11-02: Original-duration narration context and response action toolbar

Extending event-developed conversation orchestration, `ConversationService` now
supplies authenticated original-file duration metadata independently of citation
length. Explicit whole/full/entire-video narration for one source loads its full
indexed timeline (up to 20 segments), timestamped frame descriptions and repaired
speech, rather than reusing only the saved excerpt. Timeline span/gap checks control
complete versus partial status. Context explicitly distinguishes saved analysis
from a fresh viewing and prohibits exhaustive-detail promises. This builds on the
pre-existing indexed media intelligence; it is not a new video analysis engine.

An attempted synchronous fresh reinspection proved unreliable within the reply
deadline and was removed from the final path. Default narration instead reuses
existing intelligence, avoiding repeated media downloads and paid video calls.
Future on-demand fresh background review remains planned. Live troubleshooting also
exposed inherited 4096-token video completion truncation; video analysis now has
an independent bounded 8192-token allowance via META_VIDEO_MAX_OUTPUT_TOKENS (or
BASETEN_VIDEO_MAX_OUTPUT_TOKENS), including reasoning. Ordinary requests retain their
existing limit. The append-only ledger and $30 cumulative ceiling remain intact.

`ResponseActions.tsx` adds parent-hover animated Hugeicons below every assistant
turn: Copy, browser read-aloud/stop, and Open cited moments when citations exist.
Read-aloud uses browser voices, not the planned conversational voice mode. No new
TTS provider, feedback persistence or historical response regeneration is claimed.
Existing failed-reply retry remains separate. Copy/speech failure states are visible.

Validation: 66 focused API tests and the API build passed. Regressions cover original
duration, full-index narration beyond a 20s citation, timestamped later-frame context,
index gaps, owner scoping, provider output limits and existing conversation behavior.
Web TypeScript/targeted lint passed. Isolated 390/1280px checks passed copy, mocked
speech start/stop, profile initials, chat scrolling, compact citations, separate
Moments panels and generated-video citation playback. Real chats were unchanged.
Final live full-index narration acceptance is recorded below separately.


Live acceptance passed through the authenticated engine with the owner's exact
whole-clip narration request and a saved 0-20s selection: HTTP 200, original duration
about 52.8s, complete indexed timeline context, two source references spanning
0-48.82s and 48.82-52.82s. The reply included later hugging, aftermath and end cards,
and stated that its account came from saved timeline analysis rather than a fresh
frame-by-frame viewing. This validates full-index scope and duration, not exhaustive
narration accuracy (brief actions may still be missing from saved analysis). No raw
video was resent for this final check, and the real Space/messages were unchanged.


### 2026-11-02: Space rename dialog, clipboard/pin notifications and pin icon

Extending the event-developed Space menu, `SearchResultsView.tsx` replaces native
window.prompt with the shared accessible dialog/mobile drawer. The name is prefilled,
limited to the existing 200-character backend contract, trimmed and saved through
the existing update endpoint. Save busy/error/retry states stay in the dialog;
cancellation does not write. Copy link, successful pin/unpin and rename now show
an accessible dismissible notification that expires automatically. Failed writes or
clipboard operations do not show success. `Sidebar.tsx` uses the existing Hugeicons
Pin glyph rather than an emoji for pinned spaces. No schema or engine change.

Read-aloud remains browser SpeechSynthesisUtterance with navigator.language and no
explicit voice selection; the actual voice is the browser/device default. Expressive
AI TTS with Natural/Storyteller styles is a proposed next step, not implemented or
provider-switched by this change. Official Gemini TTS docs support style/pace/tone
controls (https://ai.google.dev/gemini-api/docs/speech-generation); the sponsored
Muse Spark Open endpoint documents text output, not synthesized speech.


Validation passed: web TypeScript/targeted lint and isolated 390/1280px checks for
prefilled rename focus, cancel without writes, in-dialog failure/retry, saved names,
copy confirmation and pin/unpin notifications plus SVG pin visibility. Native prompt
was disabled in the fixture; all Space mutations and clipboard writes were mocked.
No real chats, provider settings or paid inference were changed.

## Space Studio creation workspace — 2026-11-02

Event work extends the existing engine/indexed media foundation with ordered
shortlist-to-Brief/Storyline generation and persisted SaaS Studio documents. Removed
the duplicate Assets tab; Moments retains browsing, previews and manual source
addition. New `components/studio/SpaceStudio.tsx` and rebuilt `StudioView.tsx` expose
direction, output choice, creation states, saved documents, section citations and
copy/Markdown download. Source changes disable playback of stale references.

Implementation: web `server/studio-{core,http}.ts`, `/api/studio` and per-Space
Studio routes; additive `saas.studio_outputs` in `saas-schema.sql`; engine
conversation Studio endpoint and `pipeline/studio-document.ts`; configured Meta,
Baseten (inherited) and Gemini provider adapters. Claims, cached retries and source
version validation reuse existing authentication/database/model-metering foundations.
This is indexed-evidence synthesis, not an exhaustive fresh visual review.

Validation: API build; 69 passing Studio/conversation/provider tests across four
suites; web type checking and targeted lint; isolated local PostgreSQL ownership, ordered snapshot,
cached/failed retry, citation rejection, concurrent claim, changed-source, export
escaping and cascade checks. Synthetic browser acceptance passed at 390/1280px:
shortlist/direction, no duplicate Assets tab, create spinner, saved output, citation
controls and no horizontal overflow. Synthetic screenshots visually inspected.
After explicit owner approval, one text-only live Meta check using the saved
24–32-second training-field moment analysis passed: a two-section Brief with one
valid source reference, persisted readback, available-source check and cached retry.
The temporary test Space/session were removed; real Spaces and shortlists were
unchanged. No video/audio was sent for this check. It is one acceptance example,
not a general generation-quality benchmark. Video reels,
timeline exports, voice generation and independent face accuracy remain open.
The example used broader scene context too confidently for the exact selected
seconds. Added explicit broader-context labels and prompt restrictions; this
follow-up passed offline checks, with no second paid generation claimed.

Studio UI follow-up: reserved a separate, padded eyebrow row so the introductory
label can wrap clear of maximize/close controls in the compact panel. Panel width
now animates alongside its translation over 400ms, with matching chat-margin
timing and reduced-motion support. This refines the event Studio UI; no engine or
model behavior changes. Web types and targeted lint passed. Isolated 390/1280px
browser checks passed; desktop checks verified control clearance and intermediate
widths in both directions using controlled animation time. No paid calls or real
Space mutations occurred.

Studio empty-state polish: reused the existing People three-portrait illustration
instead of the standalone sparkle icon. Explicit neutral/violet action colors in
`StudioView.tsx` override the global teal anchor default for Explore moments and
the other outlined Studio actions. This reuses existing artwork; no new model,
recognition capability or backend behavior is implied.

Owner clarification: Studio now uses its own moment/brief/storyline artwork in
`StudioEmptyArtwork.tsx`, retaining the People illustration's overlapping shapes,
pastel palette, white borders and soft shadows. Portraits are no longer reused in
Studio; the artwork is decorative and does not imply existing creations.

Studio page reading/library redesign: `StudioLibrary.tsx` adds pastel document
cards, summary previews, format/status labels, loaded-creation search, Brief and
Storyline filters, reset/no-results states and existing keyset pagination. Search
explicitly says it covers loaded creations when more pages exist. `StudioDocument.tsx`
adds readable line lengths, title/summary hierarchy, estimated reading time,
collapsible original direction, a keyboard-focusable section outline, supporting
moment cards, separate suggestions and a collapsible complete source list.
`StudioView.tsx` retains saved generation/playback/export flows and adds a sticky
copy/download toolbar; the compact library appears only when desktop width allows.
Existing decorative artwork and Hugeicons are reused, with button-hover animation.
No model, database, generation prompt, stored output or provider change is included.

Validation: web types and targeted lint passed. Synthetic browser acceptance at
390/900/1440px passed format filtering, text search/no-results/reset, outline focus,
all-source expansion, copy feedback, citations and no horizontal overflow. Gallery
and mobile document screenshots visually inspected; real creations untouched and
no paid calls made.

Studio spacing correction: widened the desktop library/document gutter to 40px
(48px on larger screens), gave the library 240px, and constrained creation cards
and their content to their column. Long source titles no longer enlarge compact
cards into the document gutter. This is a presentation-only follow-up.

Space emotion integration: new `components/search/SpaceCompanion.tsx` reuses the
existing Brisky 3D mascot/expression library as one persistent composer companion.
Initial processing uses searching, follow-up processing thinking, composer focus
listening, available reply citations success, no attached reply citations empty,
and failed replies/load errors error. Greeting covers a ready Space without a reply.
Short status text describes the UI state; success is not an accuracy assertion and
empty does not assert that no match exists elsewhere. Historical replies use the
existing b. brand treatment instead of allocating one WebGL canvas per message.
Reduced-motion preference disables ambient motion and pointer tracking; existing
mascot visibility suspension and fallback remain. No provider call or new emotion
inference is introduced. This wires pre-existing mascot artwork/expressions into
the event Space UI rather than claiming the mascot was newly created here.

Validation: web types and targeted lint passed; synthetic 390/1280px browser checks
passed source-ready expression rendering, focused composer/listening, initial
searching, failure/error, no-citation/empty states and a single mascot canvas.
Focus was explicitly emulated in the isolated browser. Mobile screenshot visually
inspected. No real conversations, model calls or paid budget changes were made.

## Grouped SaaS settings — 2026-11-02

Replaced the sample `/settings` profile with the authenticated account and grouped
working settings: profile, workspace, connections, experience, read aloud, people,
privacy/data, security and developer navigation. `components/settings/SettingsView.tsx`
reuses existing onboarding persistence and auth logout; `SettingsSources.tsx` reuses
the existing connector manager. No new schema or inference capability is claimed.
`lib/browser-preferences.ts` adds validated browser-local mascot visibility/motion
and response-speech enablement/voice/rate, wired into SpaceCompanion/ResponseActions.
Sidebar account details refresh after profile saves; Profile deep-links to its group.
Removed sample identity and unverified face/voiceprint claims. Save failures retain
drafts, internal-link navigation/sign-out warn about unsaved edits, and resetting
browser choices confirms that saved work is unaffected. See `saas-settings.md` for
scope and unsupported account/security/billing functions.

Validation: synthetic 390/1280px browser checks passed profile-save failure/retry,
unsaved dialogs, stored browser preferences, preview voice/rate, connector management,
sign-out confirmation/cancel, reset and no horizontal overflow. Separate Space
checks passed mascot/read-aloud toggles and actual utterance voice/rate wiring.
All writes, source operations and speech were mocked; no real account edits or paid
calls. Settings mobile screenshot inspected; type/lint validation recorded with the change.

Dropdown consistency follow-up: shared `components/ui/AppSelect.tsx` and
`app-select.css` replace plain selects in Settings, Space manual source addition
and face-match source selection, plus the bespoke tagging person picker. Existing
selection callbacks/persistence are preserved. Styled triggers, selected checkmarks,
descriptions, bounded option lists, viewport-aware positioning and reduced-motion
reveal animation now share one implementation. Source/voice/person lists support
search; people aliases and voice languages remain searchable. Native popovers put
the menu above scroll containers while retaining the parent dialog. Keyboard arrows,
Home/End, Enter, type-ahead, Tab and Escape support selection and focus restoration.
No database, model, face-matching or source-processing behavior changes.

Validation: synthetic 390/1280px browser checks passed Settings selection, End/Enter,
Escape focus restoration, viewport fit, language search, no-results feedback and
stored voice choice. Generated-video tagging-dialog checks passed alias search,
person selection and Escape closing only the dropdown while retaining dialog/focus.
Mobile popup screenshot visually inspected. No real person/account edits, raw media
transfer or paid calls occurred; web type/lint checks run for changed components.

Appearance settings: added Light/Dark/System and four text-size choices to the
existing browser-local preference store. Replaced forced-light AuthThemeEnforcer
with responsive theme application and OS change subscriptions; root bootstrap
applies saved choices before paint on account/app routes. Shared brand surface,
foreground and solid-action tokens cover app panels, dialogs, dropdowns, inputs,
navigation and Factory controls while retaining the marketing presentation.
Common text tokens/labels scale independently of spacing; mobile input minimums
and browser pinch zoom remain usable. Appearance uses a distinct animated Hugeicons
palette instead of the Experience cog. Existing app backgrounds were migrated to
theme tokens; no account/database or AI provider behavior changes.

Validation: synthetic 390/1280px checks passed dark canvas/card/text colors, 1.25×
Extra large text scaling, reload persistence, live System dark/light changes and no
horizontal overflow. Studio gallery/document checks passed at 390/900/1440px in
dark mode with Extra large text (filters, outline, sources, copying and citations).
Dark mobile Settings screenshot inspected. No real account edits or paid calls.


Voice conversation addition (2026-11-02): implemented session-guarded engine voice
transcription/speech routes, Next proxies and saved-Space/Meta reply orchestration.
Gemini handles speech only, with ledger admission, owned saved-message TTS, bounded
recordings, cleanup and private generated-audio caching. Existing introduction and
immersive orb/satin UI are retained; the initial transcript-review presentation
was superseded at the owner's request. The immersive controller now detects a
pause, submits internally, speaks the reply and resumes listening without visible
transcription. Pause/exit stop capture; there is no simultaneous duplex listening.

Validation: generated-only live Gemini roundtrip and authenticated saved Meta reply
plus speech passed; core voice/budget/request-limit suites passed 50 tests. These
checks do not establish microphone/accent/noise accuracy. See [voice scope](saas-voice.md).


Voice conversation (2026-11-02): new session-guarded speech routes, Next proxies,
owned-message Gemini TTS caching and budgeted transcription connect to saved Meta
Space replies. Existing introduction and immersive orb/satin design are retained.
The initial transcript-review presentation is superseded: silence ends each turn
automatically, Brisky replies aloud, then listens again. No transcription is shown.
Pause/exit stop capture; simultaneous duplex/barge-in remains unimplemented.
Generated-only live speech roundtrip and authenticated Meta reply/speech passed;
50 engine voice/budget/limit tests passed. Real microphone/accent/noise acceptance
remains. See [voice scope](saas-voice.md).

Immersive correction validation: isolated 390/1280px browser checks passed the
restored introduction, no visible transcript, silence-triggered submission, spoken
reply, resumed listening and exit stopping capture. Microphone/audio were simulated;
no paid calls or real Space writes. Web TypeScript and changed-component lint passed.


Voice interruption (2026-11-02): extended the event voice controller with an
echo-cancelled microphone monitor while reply audio plays. Sustained input stops
playback and transfers the same live microphone to a fresh recorded turn, retaining
the saved Space and existing UI. An adaptive noise floor, settling window and
sustained-speech gate reject brief/low-level signals. Browser checks at 390/1280px
passed interruption, follow-up persistence, simulated playback leakage/transient
rejection and monitor cleanup on exit. TypeScript and lint passed. No additional
paid calls or actual media. This is browser-side speech-triggered interruption,
not a streaming speech model; real acoustic echo/quiet-voice/onset accuracy remains
unverified. See [voice limits](saas-voice.md).


Voice refinements (2026-11-03): retained the original introduction/immersive design
and scoped the overlay to main content so desktop navigation stays visible. Clear
English session-ending utterances finish the farewell, close the call and leave
the mic off. Connected saved Space response actions to Gemini TTS with owned
assistant IDs, replacing browser SpeechSynthesis. Settings now offers Kore plus
five verified alternatives, random fixed-sentence auditions and independent
preview captions; selections persist in browser preferences and apply to calls
and read-aloud. Added a guarded fixed-sample preview route, voice allowlisting,
voice-separated caching, and atomic cache writes. Meta remains the reasoning model.

Measured existing provider-call latency (median 3.6s transcription / 6.12s synthesis
from seven successes each); no instant-response claim. Reduced silence wait by
300ms and made status stages explicit. Streaming generation remains planned.
Validation: six live authenticated generated-only voice previews passed; no personal
media sent. Browser fixtures at 390/1280px passed session ending, sidebar bounds,
voice selection/captions/persistence and selected-voice Space read-aloud. Web types
and lint, engine build and five voice-boundary/cache tests passed. User separately
reported natural real-device speech and satisfactory results. See [voice scope](saas-voice.md).

Voice introduction backdrop correction (2026-11-03): portal the existing intro
modal to the document body so its viewport backdrop covers navigation as well as
content. The immersive screen remains positioned inside main content. No speech,
model or session behavior changed.


Patient voice/search feedback repair (2026-11-03): increased silence tolerance to
2.8s and lowered speech-level cutoff after real-device reports of premature turn
submission. Collapsed intermediate labels into Thinking, retained the immersive
design and switched source-free Space companionship from empty/confused to idle.
Added shared generated acknowledgement assets: seventeen variants in each chosen
voice, shuffled without immediate repeats and preloaded for playback alongside
transcription. These are public generic speech, available across accounts; private
reply speech remains owner-scoped. They establish receipt, not a result claim.

Search repairs extend existing retrieval: force library lookup for new quoted
moment requests, preserve explicit clip/participant follow-up scope, retain quoted
words through parser fallback, bypass remote understanding for literal speech
quotes, and forbid library-inventory claims from selected excerpts. Regression
suites passed 33 cases. A live exact exam-query check with prior kitchen selection
cited the indexed exam source; no reindex or private media re-upload. This did not
establish instant search (about 29s), general quote accuracy or exact word alignment.
See [voice scope](saas-voice.md) for asset and validation details.

Shared acknowledgements completed: 102 generated generic WAV clips, seventeen
variants across six voices, validated for RIFF/WAVE integrity and anonymously
served with public 24h cache headers. Runtime uses shuffled preloaded assets, not
a model call per acknowledgement. Bounded maintenance generator defaults to dry
run. During generation Google's 100/day Flash TTS cap was reached; retries stopped
and remaining clips used Flash-Lite with the same named voices (26 of 102 clips).
Added explicit model-priced quota fallback/cooldown for live speech; preferred
Flash TTS remains configured, cached replies remain owner-scoped and actual-model
cache identities are separate. Meta reasoning is unchanged. API fallback live
check passed; 34 engine tests, types/build/lint passed. Quote-free exam request
with kitchen selected also passed live; no fresh microphone recording was tested.


Incremental voice speech (2026-11-03): added authenticated owned-message streaming
endpoint and Next forwarding route, bounded SSE-to-NDJSON PCM transport and browser
Web Audio scheduling. Existing voice UI, Meta reasoning, selected voices and public
acknowledgements are retained. New playback starts before provider completion;
interrupt/Stop/Exit cancel input and queued audio, and listening resumes after
playback rather than network EOF. Completed streams reuse private actual-model
WAV cache; partial/aborted streams are not cached. Existing metering/cooldowns and
bounded quota fallback apply, with no mid-stream voice splicing.

Validation: 39 tests across five engine suites; API build and web type/lint passed.
390/1280px simulated voice/read-aloud checks passed early playback, cancellation,
queue stopping, mic timing, same-Space follow-up and voice selection. Generated-only
live direct first audio 2.24s/completion 4.12s; authenticated web/API first audio
2.76s/full stream 4.28s and cache replay first audio 49ms. Temporary fixture Space/
session removed, journal preserved, no personal media. Measurements are single-run
network delivery observations, not a near-instant whole-turn guarantee. See
[streaming scope](saas-voice.md).

Voice social-turn correction (2026-11-03): cached processing acknowledgements now
wait for a successful transcript and play only for recognizable work requests.
Greetings, simple thanks/check-ins and farewells go directly to the normal Meta
reply, preventing a random "let me think" clip from answering a greeting. Mixed
greeting-plus-task requests can still acknowledge. No UI, provider or assets changed.
The gate is a conservative local phrase heuristic, not semantic intent validation.

Gemini Live development adapter (2026-11-03, owner-requested before a future
Meta-only profile): new engine `live-voice.service.ts`, authenticated config/ticket
routes and one-use origin-bound WebSocket relay; new browser AudioWorklet,
`live-voice.ts` and `LiveVoiceConversation.tsx`. The existing introduction and
immersive UI are reused without layout changes. Continuous microphone input,
streamed output, provider interruption and saved-Space/Meta tool integration
replace separate STT/reasoning/TTS turns in this optional mode. The previous
turn-based path and Gemini TTS/read-aloud remain available. This is not a claim
of Meta-only eligibility. Casual Live exchanges are not yet persisted; media
tool requests/replies/citations use the existing Space persistence.

Validation: a generated-Windows-speech live relay check passed authentication,
CSRF, foreign-origin denial, ticket replay denial, a greeting response, real
provider interruption and a synthetic media-tool round trip. First audio was
1.159 seconds after that generated greeting ended in one run. This is not a
microphone/network latency guarantee or a real-library search evaluation.
Isolated 390/1280px browser fixtures passed continuous mic transmission during
playback, audio queue interruption, pause/resume, same-Space tool follow-ups,
no visible transcript and farewell device cleanup. Browser media/socket and
Space writes were mocked. A separate Chrome check used its actual AudioWorklet
with generated fake-microphone input: 3,200-byte PCM packets, capture during
playback, pause transmission and exit track cleanup passed. Resampling continuity
was checked at 16/44.1/48 kHz. Final engine build, web type/lint and 47 tests across
seven engine suites passed. The contract inventory also exposed an existing
undocumented Studio route; its inventory entry was added without changing Studio.
Temporary test sessions were deleted. MMS remains
planned: see `voice-provider-transition.md` for residency, sentence generation,
benchmarking, licence, profile separation and judge-setup requirements.

Live delivery refinement: owner requested matching the earlier relaxed TTS
delivery more closely. Added explicit warm/grounded tone, comfortable pacing,
short pauses, soft endings and subtle emphasis instructions. Voice/model and UI
are unchanged. Audible similarity requires the owner's listening comparison;
no paid inference is needed for this prompt edit.

Streaming Meta/MMS voice (2026-11-04): new `meta-live-voice.ts` composes persistent
Muse Voice Transcribe endpointing, streamed Muse Spark 1.3 dialogue/tool calling
and sequential local MMS English sentences. `mms-speech.service.ts` keeps one
isolated Python runtime resident; `mms-saved-speech.service.ts` provides owned
read-aloud/previews with a separate private cache. Setup scripts pin/check official
MMS safetensors and keep downloads explicit. Existing voice UI, SaaS sessions,
Space/Meta tool persistence and browser audio are extended, not relabelled as new
foundations. Gemini Live/turn-based implementations and preferences are retained.
The Meta voice profile neither calls Gemini speech nor requests its public
acknowledgement clips. This does not certify the entire app's model compliance.

Validation: real generated-input ASR returned "Hello Brisky, how are you today?"
with speech boundary/final events. Full authenticated Meta+MMS relay completed a
synthetic media-tool round trip with interruption and origin/ticket/session
checks; first greeting audio was 3.768s after speech ended in one run. Real MMS
read-aloud first PCM 1.711s, full generation 11.114s; private replay first PCM
58ms. Temporary test Space/session removed; no personal footage/audio sent.
Initial model load 71s during installation, later 16s; warm short-sentence tests
about 1.05–1.79s on this host, longer separate run 4.2s, resident working set about
552 MiB. The model-only farewell test initially failed; a narrow standalone
farewell check was added and a real ASR/MMS re-test passed. Isolated mobile/
desktop control/settings checks passed, including interruption during a farewell,
no visible transcript, preserved Gemini choice, one MMS voice and independent
preview captions. Measured scope and unverified accent/acoustic acceptance are
recorded in `docs/meta-mms-voice.md`. Existing ledger and $30 ceiling preserved;
audio billing keeps bounded holds instead of inventing token usage.

Final checks for this voice batch: 57 tests across ten engine suites passed;
engine build, web type/lint, public contract generation and setup:mms --check
passed. Final engine profile is `meta-mms`; indexing workers/polling stay off.
Owner microphone/accent acceptance and the separate whole-project rule audit
remain open.

Validation for the social-turn correction: sixteen intent cases and 390/1280px
simulated greeting-to-search turns passed (no greeting acknowledgement, one
post-transcript task acknowledgement). Streaming/interruption/read-aloud remained
working. TypeScript and changed-file lint passed; no paid calls or account writes.

2026-11-04 voice reliability follow-up: corrected Meta/MMS microphone pacing to use elapsed time rather than accumulating interval drift, bounded the input jitter buffer at three seconds, and ignored late results only for known retired tools. Unknown tool IDs still fail. Added sanitized failure-category logging without audio/transcripts/secrets. Twelve voice regression checks passed and API build verified; the user's first-message disconnect has not yet been reproduced or confirmed resolved on their microphone. MMS English remains a single-speaker checkpoint; no Kore-equivalent voice is claimed.

2026-11-04 Meta/MMS voice follow-up: fixed search-result loss during speech interruption in the event-developed relay. Dispatched searches now survive speech interruption; bounded completion announcements wait while the user speaks or another reply runs. Search history includes the original request immediately and its completed answer independently of playback. Common status questions reuse running/completed search state rather than making another saved search; concurrent consult calls reuse the running search. Saved voice requests use the verbatim finalized transcript, without model-added notes. Call closure still cancels relay work (already submitted Space writes may finish). Eighteen regression checks passed, including one search across two status questions and deferred result announcement. Live owner acceptance remains pending; this is not an MMS model capability change.

2026-11-04 Meta/MMS casual conversation fix: narrowed consult_brisky instructions to actionable media requests. Whole-utterance thanks and positive result confirmations disable tool choice and are guarded against unsolicited consult calls, preventing accidental saved-Space messages. Mixed requests such as 'thank you, find another clip' remain eligible for media tools. MMS reads the direct generated conversational answer without a second saved-Space answer. Twenty-one regression checks pass, including the owner's exact confirmation, generated-text-to-speech equality, and a model returning an unwanted consult call. Real microphone confirmation pending; no existing chat history deleted.

2026-11-04 Wonder voice trial: added explicit muse-wonder-1.0 support to the event voice relay, with existing Meta-only/MMS controls preserved. Spoken-response guidance now adapts length to intent. Added opt-in synthetic comparison script using the shared production instructions/tools and append-only budget ledger. One sample per eight scenarios: Wonder 8/8 expected tool decisions, Spark 1.3 6/8; median first model output 1.896s vs 2.047s, excluding ASR/MMS/tools. This is a small model-only check, not a general accuracy guarantee. Sixteen comparison calls cost an estimated 0.056968 USD from reported tokens. Active local voice coordination selects Wonder with verified pricing; saved-Space and video model settings remain unchanged. Twenty-two voice regression tests pass; owner live acceptance pending. Reproduction and caveats: docs/voice-model-comparison.md.

2026-11-04 farewell and action-evidence correction: owner's exact thank-you/end-session phrase is already recognized; its old generic failure was not reproduced. Local MMS synthesized both farewell sentences successfully (1.727s/2.149s, excluding startup). Added graceful ending if farewell synthesis fails, suppression of search announcements during farewell, and sanitized failure-category logging. Action routing now sends dance/dancing/sway/twirl queries to moving-video verification instead of sparse stills. Query checks carry an explicit video/frames method independently of original/preview provenance; the saved-answer prompt distinguishes a confirmed moving action from incomplete search coverage. Seventy-eight targeted regression checks pass and API build passes. Changes extend event-period voice/evidence work; pre-existing media engine remains attributed separately. Live dancing verification result recorded separately after the run.

Live confirmation for the dancing correction: repeated the owner's exact search through the authenticated SaaS-engine reply path using the existing selected Drive source and Meta video verification. Completed in 36.594s, searchStatus=complete, positive moving-video assessment, cited source range 1.5-9.5s. Answer confirmed playful kitchen dancing rather than reporting stills-only uncertainty. Temporary authentication session removed; no Space messages created or old messages changed. No reindex/purge. Full result is private .tmp/dancing-search-result.json. This confirms this clip/query only, not general retrieval accuracy.

2026-11-04 organizer-rule clarification (documentation/audit only): owner supplied exact fresh-public-repo, post-kickoff cutoff, declared-private-dependency/runnable-alternative, and all-runtime-models-Meta requirements. Recorded verbatim in the brief and created docs/submission-readiness.md. Current development configuration still includes non-Meta embedding paths (Gemini/general and owner-scoped MiniLM) and enabled YuNet/SFace face inference: whole-project compliance is not established. No runtime switch, model replacement, repository publication, history deletion or library purge performed by this audit. Existing contribution attribution must be checked against October 26 12:24 PM Eastern cutoff, not merely the date.

2026-11-04 development backup preparation: owner requested pushing the complete current development code before preparing a separate event-only repository. Added .pnpm-store exclusion and replaced a connector-encryption test fixture's deployment-key reuse with a synthetic test-only key. Source backup excludes environment secrets, personal storage, models, virtual environments and diagnostics; existing provider/face functionality is preserved. This backup is a development snapshot, not an eligibility claim for the submission repository.

2026-11-04 isolated event repository: owner supplied https://github.com/El-dorado01/brisky-meta-hackathon.git, confirmed new workspace/mascot/event work began after October 26 12:24 PM Eastern, and delegated licence choice (MIT selected for new project code). Prepared an independent checkout under .worktrees/brisky-meta-hackathon. Exported 370 added event-source files from preserved snapshot fd34773, excluding the old engine, moved pre-event landing page, Gemini acknowledgement WAVs, secrets and personal media. Added new standalone synthetic fixture runner reusing the event answer/Studio contracts and Meta/MMS voice relay, plus six runtime tests, model-surface audit, judge instructions, third-party notices and explicit old-engine dependency declaration. Live synthetic-only Wonder search/citation, ephemeral thanks and Studio checks pass under the unchanged original usage ledger; desktop/mobile checks pass; optional new-runner microphone/MMS end-to-end acceptance remains unverified. Workspace TypeScript passes against existing matching dependencies; full database/engine integration is not claimed. New repository commit 585d23c. The original development code and model integrations are preserved. This is a runnable alternative for judging event components, not completed full-product replacement of MiniLM/YuNet/SFace.

2026-11-04 Meta-only engine migration: added strict startup configuration admission, guards against Google/Whisper execution, a pinned official Meta LASER2 CPU adapter and explicit setup command, isolated 1024-dimensional vectors with source fingerprints, owner-scoped resumable backfill, and duplicate-vector inheritance. Original model integrations and old vectors remain preserved; automatic face matching is disabled in the event profile, manual tags retained. API build, setup checksum verification and 21 profile/embedding regression checks passed. Locally backfilled 32 existing segments. Real retrieval acceptance and reproducible full judge bootstrap remain under verification; do not equate the separate synthetic demo with the full UI/engine. See docs/meta-only-runtime.md.

Meta-only live retrieval follow-up: exam quote search passed with the unrelated kitchen selection (complete); dancing search found the expected clip with moving-video confirmation at 1.5?9.5s but reported incomplete overall coverage. Both used the isolated 1024d Meta space; no old vectors were substituted. Backfill rerun skipped all 32 current vectors. Existing $30 ledger retained; no workers or broad connector polling started.

Published full-application setup: original Meta-only engine commit 49b7e71293e667a885a8752117d8e779cd8220c4 pushed to El-dorado01/brisky; event-only setup/sources commit 9841df4 pushed to El-dorado01/brisky-meta-hackathon. Anonymous GitHub metadata confirms both repositories are public. Judge bootstrap cloned and verified the exact engine revision in an ignored external dependency directory; standalone runner six tests and runtime audit passed. A complete clean-machine install with fresh email/OAuth credentials is still unverified. The submitted event repository does not vendor or relabel the original engine.
