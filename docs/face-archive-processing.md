# Local archive face matching

Implemented during the hackathon on 2026-11-01, extending the event-developed
manual teaching/review pilot and the pre-existing media registry, playback,
PostgreSQL and standalone worker host. This is automatic **scanning and suggestion
generation**, not automatically confirmed identity tags or model training.

## Enable and run

On each API/face-worker PC, from the repository root:

```sh
pnpm setup:faces
pnpm setup:faces --check
pnpm build:api
pnpm --filter @brisky/workers start --faces-only
```

Set `FACE_RECOGNITION_ENABLED=true` in the root environment after setup.
`FACE_ARCHIVE_WORKER_ENABLED` defaults to `true`; set it to `false` to stop all
archive face consumption. The HTTP API never starts this consumer. The
`--faces-only` worker opens no HTTP port, disables indexing consumers and skips
connector polling. Ordinary workers also consume opted-in face work. No runtime
or model weights are downloaded on startup. The Docker worker image includes the
scripts, but its isolated face dependencies/weights still require explicit setup
inside a compatible Linux environment; Windows virtual environments are not portable.

In **People & Entities → View tags → Find them across your library**, enable
library matching for the person. A confirmed manual reference is required.
Status shows discovered/scanned videos, queued/running windows and failures.
Pause invalidates outstanding leases; an active local decode may finish, but its
cancelled lease cannot commit further suggestions. Retry requeues blocked/failed windows.
Progress refreshes while the panel is visible. Suggestions retain the existing
original-frame review, confirmation, rejection and undo workflow.

## Processing and bounds

- Every ten seconds a standalone worker discovers indexed videos for opted-in
  people. Settings default off; API startup does not enable anyone.
- Existing, later-added and checksum-changed assets are considered. Source or
  reference changes get a new revision; unchanged windows are not re-enqueued.
- Jobs cover the entire supported video in 60-second windows with up to 24
  midpoint samples per window (at most 2.5 seconds apart). Short clips use fewer
  samples to avoid seeking beyond their final packet. This is sampled detection,
  not continuous tracking; brief appearances can be missed.
- Supported indexed video duration is at most seven days. The existing playable
  source/preview must be ready and no larger than 100 MiB. Existing preview
  hydration can download a connector preview; this path does not create new
  indexing/proxy jobs or send faces to remote models. GB source media still needs
  a sufficiently small existing proxy or a later streaming face-decoder path.
- Discovery admits 16 windows per person per pass and pauses admission at 128
  outstanding windows per person. Oversized-preview failures prevent scheduling
  further windows of that version; they do not mark the video scanned.
- PostgreSQL jobs have atomic `SKIP LOCKED` claims, ten-minute leases, fencing
  tokens, three automatic attempts, delayed retry, and interruption recovery.
  One scan runs at a time per face worker. More workers consume more local CPU.
- Exact checksum/duration/reference/profile/window matches can reuse completed
  suggestions for another asset owned by the same person’s account. Rejected
  suggestions are not copied. Only MD5/SHA-256-shaped checksums qualify; provider
  timestamp/fallback identifiers are not treated as content hashes. Composite owner foreign keys prevent cross-owner
  donor links. Similar-looking files are not assumed byte-identical.
- Source checksums, reference revisions (including bounded competitor references),
  preview versions, ownership, opt-in and active leases are checked before
  suggestion writes. Deletes cascade. Only explicit confirmation creates a
  searchable `face_match` appearance; suggestions are never enrollment references.
- Embeddings and decoded frames are temporary. No biometric vectors are added
  to persistent database storage. The durable job queue contains progress and
  provenance, not face pixels.

## Detection and matching profile

`yunet-sface-context-v2-tiles4-t065-60s` retains the pinned YuNet and SFace weights.
Whole-frame detection combines native/320 views and four fixed overlapping tiles;
all boxes and facial landmarks map back to source coordinates. Probe tiles never
receive annotation boxes. Manual enrollment may additionally use two bounded
context crops, selecting one sufficiently large unambiguous face. A good initial
selection is used directly; the stored manual box is not silently changed.
Preflight can still propose a tighter box for explicit user acceptance.

The candidate cosine cutoff is **0.65**, with a **0.10** margin over supplied
other-person references. Scans prepare up to nine manual target candidates and
select at most three usable references, preferring different sources. Up to twelve
competitor manual references are considered (at most two per other person).
These are development heuristics, not probabilities or calibrated guarantees.
Missing competitors and lookalikes remain limitations.

## Actual development results

All available labelled clips were reused as **development data** with permission.
The earlier frozen unknown check remains historical; these reruns are not fresh
held-out evaluation. No additional footage is needed to exercise the software.

| Measure | Baseline | Final tiled profile |
| --- | ---: | ---: |
| Usable named reference faces / 28 labelled | 8 | 12 |
| Enrolled identities | 6 | 7 |
| Located known cross-source probes / 12 | 5 | 6 |
| Located unknown probes / 30 separate-source labels | 21 | 22 |
| Correct known cross-source matches at 0.65 / 12 | 0 | 0 |
| Wrong known cross-source matches at 0.65 | 0 | 0 |
| Unknown false matches at 0.65 | 0 of 21 extracted | 0 of 22 extracted |
| Correct same-recording development matches at 0.65 / 24 | 4 | 4 |

The lower 0.55 tiled setting recovered one known cross-source match but made two
wrong matches; it was **not selected**. The stricter setting abstains on all twelve
cross-source probes. This is a real recall/recognition-quality gap, not simply a
missing accuracy certificate. Six unmatched detector boxes were not adjudicated;
empty frames, continuous tracking and whole-video identity accuracy are unscored.
People with only one recording cannot supply independent known-person probes.
Successful same-frame/same-recording demonstrations do not establish new-recording
performance. Keep manual tagging and review; do not enable automatic confirmation.

## Verification

`scripts/check-face-archive.cjs` exercises local schema/ownership, repeat discovery,
concurrent claims, checksum reuse, progress, changed content, pause/fencing and a
real generated no-face runtime. Positive dedup cases in that script stub inference.
It preserves the additive schema and removes its temporary users/media.

`scripts/check-face-archive-daemon.cjs --enrollment-bundle <private-bundle>` is an
explicit local test using an already-authorized labelled frame repeated into short
videos. It checks actual daemon discovery, local decoding/models, pending matches,
explicit idempotent confirmation, later additions and changed versions. This is
plumbing evidence, not independent recognition accuracy. Do not pass unapproved
personal data or commit private bundles.

`services/face-recognition/development_recheck.py` reproduces the descriptive
comparison, writes private cases/vectors under ignored storage, and exports an
anonymous summary. Gallery boxes guide enrollment only; probe detection runs on
full frames before labels associate detections. Known queries exclude reference
recordings sharing their source; unknown queries sharing any named gallery source
are excluded. The diagnostic compares all available enrolled competitors, while
live scans have the bounded competitor pool described above.

Meta integration can proceed independently of the local review workflow. Reliable
cross-recording recognition and automatic identity confirmation are still open work.
