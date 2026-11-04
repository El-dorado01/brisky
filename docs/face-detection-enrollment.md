# Detection and enrollment follow-up — 2026-11-01

The backend now considers a bounded pool of manual face references rather than
only the three newest tags. Detection-view experiments found only a small gain,
so the live detector, recognizer, matching cutoff and confirmation flow are unchanged.
Automatic tagging is still not validated.

This extends the event-developed face review/evaluation tools and manual identity
backend. The underlying media engine and upstream face models predate this work.

## Implemented enrollment change

Previously, three recent tags from one source could exclude useful older examples.
A failed face extraction could therefore leave no usable references even when other
manual tags existed. The service now:

- Reads at most 30 recent, owner-scoped, confirmed **manual** tags for the selected person.
- Prepares up to three candidates from each of up to three source files: nine maximum.
  Candidates are ordered across files before returning to additional tags from a file.
- Skips reference sources whose previews are unavailable or exceed the existing size
  bound; tries each unavailable source only once. Other decoder/runtime failures
  remain errors. If no source can be prepared, the user is asked to open a tagged preview.
- Locally extracts the candidates and chooses at most three usable references,
  preferring different source files, then filling remaining slots if fewer files work.
- Rejects candidate results that refer to a reference not actually prepared for this scan.

References still require successful face detection, target-box overlap and alignment.
This does not silently accept an arbitrary crop as a face. `face_match` appearances
remain excluded from reference selection. Vectors are temporary, owner scoping and
source-version checks remain, and suggestions still require explicit confirmation.

The recent-30 pool can miss an older usable tag outside that window. Different source
files can also be exports from the same recording; file diversity is not proof of
independent evidence or measured accuracy. This change improves fallback handling,
not a calibrated identity policy. Real recognition gains from it remain unmeasured.

The selected target still has at most 24 sampled frames and a 300-second limit.
There can now be up to 33 prepared frames (nine reference candidates plus 24 target
frames), versus 27 previously. The 100 MiB per-source bound, one active scan per API
process, 150-second overall deadline and 120-second child deadline remain in place.
At most four source files can be resolved: three reference files plus the target.
No new model, provider call, database migration or environment variable is required.

Implementation: `apps/api/src/modules/people/face-references.ts`,
`face-matching.service.ts`, and `services/face-recognition/scan_faces.py`.

## Detection experiments

The same 36 reviewed frames, including two with no labelled faces, supplied 41 face
annotations. No names or target boxes entered the detector. Each additional view
ran the pinned YuNet model on the whole frame; predictions and five landmarks were
mapped back to original coordinates and duplicate boxes suppressed at IoU 0.3.
Detection-to-label coverage uses one-to-one maximum-cardinality box matching at
IoU 0.5. Feature extraction retains the original stricter target-selection rules.

OpenCV documents an approximate 10–300-pixel detectable face range, motivating the
smaller input comparison. The newer dynamic-shape export is described as the same
2023 model with changed input dimensions, so it was not treated as a new accuracy
model. [Official YuNet documentation](https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/README.md).

| Diagnostic setting | Usable faces / 41 | Usable named faces / 18 | Unmatched predicted boxes | Wall time |
| --- | --- | --- | --- | --- |
| Native, cutoff 0.90 | 22 | 6 | 0 | 6.321 s |
| Native + quarter turns, 0.90 | 22 | 6 | 0 | 18.431 s |
| Native + max-side 640, 0.90 | 22 | 6 | 1 | 7.998 s |
| Native + max-side 320, 0.90 | 23 | 7 | 0 | 6.996 s |
| Native + quarter turns at 320, 0.90 | 23 | 7 | 0 | 8.008 s |
| Native + 96-pixel border, 0.90 | 22 | 6 | 0 | 12.100 s |
| Native + quarter turns at native/640, 0.90 | 22 | 6 | 1 | 24.878 s |
| Native, cutoff 0.75 | 24 | 8 | 10 | 5.943 s |
| Native + quarter turns, cutoff 0.75 | 24 | 8 | 13 | 18.334 s |

Unmatched boxes need human review; these counts are not independently adjudicated
false positives. Nor is extraction coverage identity-recognition accuracy. Timings
are sequential development runs sharing a loaded recognizer, with last-frame
detection caching, two CPU threads and uncontrolled background load. They exclude
video decoding and are not complete-scan benchmarks or directly comparable with
the fresh-process recognizer comparison timings.

Native + 320 recovers only one extra named face. It still supplies no named identity
with usable references from two source files at cutoff 0.90. Rotations/padding add
substantial work without useful coverage improvement here. Lowering the cutoff adds
many unmatched predictions. These results do not justify enabling a detection change.

The native diagnostic exactly reproduces the earlier baseline embeddings/failures.
Private case details remain in ignored storage. Anonymous
[JSON evidence](hackathon-evidence/2026-11-01-face-detection-views.json) contains all
settings and aggregate results. No extra model downloads, remote media transfers or
paid API calls occurred during this follow-up.

Reproduce diagnostics against the private review data using a new output directory:

```powershell
.venv-face/Scripts/python.exe services/face-recognition/diagnose_views.py --manifest storage/face-evaluation/review-2026-11-01/annotations.manifest.private.json --models storage/face-models --output-directory storage/face-evaluation/review-2026-11-01/views-new-run
```

## Checks and next acceptance step

API TypeScript and 73 people/enrollment/search/conversation tests pass. The service
fixture verifies unavailable-source fallback, candidate limits, owner/manual query
scoping, reference-manifest construction and cleanup without database/media calls.
All 41 Python tests pass, including geometry inversion, duplicate suppression,
one-to-one matching and reference fallback/diversity. Real generated-image CLI checks
accept nine unusable reference candidates without creating suggestions and reject
ten candidates before inference. Temporary fixtures were removed.

PostgreSQL and Redis were already running; this step did not start Docker. The actual
reference SQL and its query plan passed against local PostgreSQL in a read-only
transaction with nonexistent fixture owner/person IDs, writing no data. The existing
source API was restarted with the same root environment; health passes and an
unauthenticated scan returns 401 before media work. Workers and provider settings
were unchanged. See [live query/reload checks](hackathon-evidence/2026-11-01-face-enrollment-checks.json).
A complete authenticated media scan and browser flow using the new reference pool
remain unverified; earlier browser fixtures exercised the previous pilot.

Next, obtain fresh, clear reference footage for at least two people, with two
genuinely separate recordings per person, then separate known/unknown calibration
and test recordings. Keep the current development videos out of the untouched test
set. Better reference visibility and an alternative detector still need evaluation;
automatic archive-wide tagging remains pending. See the
[evaluation protocol](face-recognition-evaluation.md).
