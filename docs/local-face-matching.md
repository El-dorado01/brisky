# Local face matching pilot

This event-developed feature extends the manual people/tagging backend and existing
media playback. YuNet detects faces; SFace compares them with manually tagged faces.
It is a review-only pilot, not trained personal models or measured recognition accuracy.
Meta/Baseten retains the separate contextual reasoning/conversation role.

## Setup on a new PC

Install Node/pnpm and Python 3.10+ first. From the repository root:

```sh
pnpm setup:faces
pnpm setup:faces --check
```

The script creates `.venv-face`, installs the pinned OpenCV package and compatible
NumPy, downloads about 39 MB of pinned model weights, verifies SHA-256 and retains
upstream licence notices. Downloads resume on retry; incorrect model bytes are never
installed. Rerunning is safe. The check command creates nothing and downloads nothing.
Docker, personal footage, model-provider keys and inference credits are not required
for setup. `node scripts/setup-face-recognition.cjs --help` lists Python/model-directory
overrides. Python 3.14/Windows is the current development environment; other platforms
are supported by the script layout but not locally tested.

The **API host** executes user-triggered face scans; **standalone workers** now
consume owner-opted-in library scans from a durable PostgreSQL queue. Install the
face runtime on every host that performs face work. Neither API nor worker startup
installs packages/downloads weights. The Docker image copies the scripts but does
not install the isolated face runtime. Multi-host face deployment remains unverified.
See [archive processing](face-archive-processing.md) for the faces-only worker mode.

In the root `.env`, set `FACE_RECOGNITION_ENABLED=true` after setup succeeds, then
restart the engine. The default isolated Python is `.venv-face/Scripts/python.exe`
on Windows or `.venv-face/bin/python` elsewhere; `FACE_PYTHON_BIN` can override it.
Models live under `${STORAGE_ROOT}/face-models`; for a custom storage root, pass
`--models-dir /your/storage/face-models` during setup. Existing Whisper dependencies,
provider keys and text-vector spaces are not changed.

## Current archive update

The v2 profile adds bounded contextual enrollment crops and full-frame overlapping
tiles. Named-reference extraction improved, but reliable cross-recording matching
remains unresolved. See [current results and worker/API limits](face-archive-processing.md);
this does not certify recognition accuracy or enable automatic confirmation.

## User flow and limits

The tagging dialog now checks the selected frame locally before saving through
**Teach Brisky this person**. When one clear detected face fits inside a broad
selection, **Use tighter selection** lets the user review and apply its box.
Applying a box does not save a tag: the user must click Teach again. Missing,
ambiguous or small detections offer guidance and **Save manual tag** instead.
Unavailable local checks also allow manual saving. The advisory check verifies
detection geometry only; it does not establish identity or recognition accuracy.
Manual saves retain their existing semantics and may be reference candidates later.

`POST /api/people/:personId/reference-check` is the session-authenticated Next
bridge to `POST /api/v1/saas-engine/people/:personId/reference-check`.
Body: `{assetId, frame_s, box}` with normalized `[x,y,width,height]`.
The engine checks ownership, indexed video availability and source versions, uses
one temporary local frame, and writes no identities, tags or embeddings. The
45-second operation shares the existing per-process scan lock; frame decoding
and detector subprocesses have their own shorter limits. Existing local preview
hydration may download an already-generated connector preview; no new indexing
job or remote AI request is created.

Preview-cache access now preserves the content modification timestamp (at
millisecond precision) while refreshing access time. This avoids false source-change
conflicts on repeated preview resolution and retains the existing LRU eviction order.

1. Teach a person by manually marking a clear face in a playable source moment.
2. Open People & Entities → that person's **View tags**.
3. Under **Find this face again**, select one indexed, playable video and scan.
4. Review each original-frame preview and face box. Confirm or reject the candidate.

Scans consider up to nine **manual** reference candidates from up to three source
files among the 30 newest eligible tags. Failed extractions are skipped; at most
three usable references are selected, preferring different files. See the
[enrollment follow-up](face-detection-enrollment.md) for bounds and validation.
Scans retain at most
24 sampled frames, one video of up to 300 seconds, a local playable file up to 100 MiB,
and one active scan per API process. The existing local source/preview resolver can
hydrate an already-generated Drive preview; no new proxy job is queued by this scan.
The separate owner-opted-in archive worker scans supported indexed videos automatically;
this single-video button retains its bounded manual scope. Brief/small/occluded faces can be
missed. A cosine cutoff of .65 is an **uncalibrated development heuristic**, not a probability,
production threshold or accuracy guarantee. Up to twelve manual reference candidates from other owned people provide a .10
ambiguity margin. This bounded pool is not a complete identity classifier; lookalikes
still require user review.

Confirming adds a `face_match` appearance for the inspected frame's ~40 ms interval,
clamped to source duration. It does not label the entire scene or claim tracking.
Only confirmed appearances participate in people retrieval/conversation anchors.
Automatically suggested/accepted frames are not reused as manual training references.
Repeated confirmation does not create duplicate tags. Rejected suggestions create none.

## Storage and invalidation

`face_suggestions` uses composite owner foreign keys to people, source assets and
reference appearances; related lookup/cascade keys are indexed. Source checksum and
reference timestamp/checksum changes invalidate pending review. Profile/reference
deletion cascades suggestions. API origin checks, SaaS sessions and server-derived
owners preserve existing access boundaries. Biometric vectors stay in a temporary
Python process, never in PostgreSQL or a remote model request. Prepared images and
manifests are removed after a scan, including failures. Preview responses are private,
non-cacheable JPEGs. Stale review metadata can remain until its parent is removed;
retention/garbage collection is separate work.

Pinned sources and licence references are in `services/face-recognition/model-sources.json`.
YuNet's notice is MIT; SFace's directory is Apache-2.0. Deployment/publication must
preserve notices; public model files and their licences do not establish rights to
private participant footage. The source/evaluation tools were prepared earlier in
the event; the runtime/service/SaaS review integration is a later event extension.

## Validation boundaries

The synthetic Python tests exercise matching/selection/failure logic and setup
resumption/checksum checks. PostgreSQL rollback fixtures cover owner isolation,
pending exclusion from search, confirmation idempotence, frame-scoped tags, rejection,
stale-reference/source denial and deletion cascades. These checks do not measure face
recognition accuracy. See `hackathon-evidence/2026-11-01-face-review.json`.
Run the committed regression checks from the root:

```sh
.venv-face/Scripts/python.exe -m unittest discover -s services/face-recognition -p "test_*.py"
node --env-file=.env scripts/check-face-review.cjs
```

Use `.venv-face/bin/python` for the first command on macOS/Linux.
The second command requires local PostgreSQL and rolls back all schema/data fixture
changes. It refuses non-local database hosts and starts no workers or model calls.
The installed Windows/Python 3.14 runtime passed model checksum checks, blank-face
rejection, 24 blank 720p detections and a synthetic-landmark SFace forward pass.
This smoke run measured 176 MiB peak process memory, 0.455s startup, 2.398s blank
detection and 0.093s synthetic feature extraction. It excludes video decoding and
is not a benchmark of real recognition or complete scans. The actual browser
scan rejected a generated no-face reference. Separately seeded candidates exercised
preview rendering, acceptance/rejection, owner denial and mobile/desktop layouts.
See `hackathon-evidence/2026-11-01-face-runtime.json` and
`hackathon-evidence/2026-11-01-face-ui.json`. Both setup and check commands passed
against the prepared environment; a clean cross-platform bootstrap is unverified.
Real recognition accuracy still requires agreed gallery/calibration/held-out footage;
see [evaluation protocol](face-recognition-evaluation.md). Model confidence and a
working UI do not replace this evaluation.

The owner subsequently supplied reviewed footage. [Development diagnostics](face-evaluation-2026-11-01.md)
found substantial detection misses and no useful safe matching cutoff on that sample.
The current recogniser is not ready for automatic tagging; settings remain unchanged
and formal held-out validation is still pending.

A subsequent [AuraFace recognizer comparison](face-recognizer-comparison.md) completed
locally. It reduced wrong suggestions on the same development sample but retained
the detection misses and consumed substantially more CPU time/memory. The live
model remains unchanged; improve detection/enrollment before fresh held-out validation.
