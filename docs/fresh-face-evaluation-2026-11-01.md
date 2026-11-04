# Fresh-footage check — 2026-11-01

The current face pipeline still needs improvement. Only two of six named people
could supply a usable reference from the reviewed frames. There were no wrong
matches among three extracted unknown-face examples, but most unknown faces were
not extracted. This is not a full recognition-accuracy result or deployment approval.

This is event-developed evaluation of the existing YuNet/SFace pilot. It does not
add automatic archive scanning, replace the pre-existing media engine, or demonstrate
new Meta inference. No live configuration, SaaS profiles or person tags changed.

## Ground truth and frozen scope

The owner reviewed all 26 sampled frames from 13 additional videos, supplying 20
face annotations and six named people. The owner confirmed these people are new to
the earlier footage and the videos are separate original recordings. Names, face
boxes and source metadata were validated against the prepared review; original video
checksums were rechecked. Labels were snapshotted privately, including added names.

Each named person appears in **only one source file**. Assigning adjacent frames
from that file to enrollment and test would leak recording information. The formal
protocol's two reference recordings per identity plus separate known/unknown
calibration/test sets cannot be constructed from these labels.

Instead, a limited check was frozen before inference:

- Ten named-face annotations supply enrollment examples, with at most three usable
  references per identity and maximum cosine matching, consistent with the pilot rule.
- Nine unknown-face annotations from separate, non-enrollment files are the probes.
- One unknown face shares an enrollment source and is excluded from testing entirely.
- Seven reviewed frames have no face annotations; unannotated detections/empty-frame
  false positives are outside this annotated-face check.

Pinned YuNet/SFace hashes, detector cutoff 0.90, match cutoff 0.55, target IoU 0.50,
selection margin 0.10 and minimum face size 32 pixels were frozen. No model comparison,
threshold tuning or preprocessing search was performed on this footage. The plan
records label, image, model and implementation hashes. The runner refuses a second
attempt in the same directory and does not open probe images if no gallery can be
enrolled. All examples of an enrollment file remain excluded from probe matching.

This differs from the formal two-source corroboration evaluator. It is an offline
enrollment/unknown-rejection check on two sampled frames per video, not the complete
authenticated API scan, an exhaustive video scan or a test of known-person recall.

## Observed results

| Measurement | Result |
| --- | --- |
| Named enrollment faces | 10 |
| Usable reference faces | 2 |
| Named people with usable references | 2 / 6 |
| Enrollment extraction failures | 8 / 10 |
| Unknown probe faces | 9 |
| Extracted unknown probes | 3 / 9 |
| Unknown extraction failures | 6 / 9 |
| Wrongly matched extracted unknown faces | 0 / 3 |
| Cross-recording known-person recall | Not measurable |

Five enrollment failures had no face detected; three had no detected face matching
the annotated box under the frozen selection rules. Among unknown probes, two had
no detection and four had no eligible target-box match. These are pipeline failures,
not evidence that the owner labelled incorrectly or that the footage is unsuitable.

Zero observed wrong matches over three processed unknown examples does not establish
reliable unknown rejection. The six missed probes are retained in counts and cannot
be treated as successful rejections. Neither the lost enrollment identities nor
missed faces are silently removed from the results. No known probes exist, so no
overall recognition percentage, precision claim or known-person recall is reported.

The run took 3.779 seconds and peaked at 210.6 MiB process memory on the current CPU
host. This includes local model startup and annotated still-face extraction, excludes
video decoding and does not estimate production throughput. Paid API calls: zero.
No media was uploaded and originals were unchanged. The anonymous
[evidence JSON](hackathon-evidence/2026-11-01-fresh-face-evaluation.json) records the
plan hash, counts, failure reasons and limitations without names/images/vectors.

## Next work

Improve face detection/reference preparation and give useful enrollment feedback
before expanding to automatic archive-wide tagging. Once usable references exist,
additional independent recordings of the **same** people are needed for calibration
and known-person testing. More single-recording identities do not fill that gap.

These unknown probes have now been evaluated once. Do not tune a replacement model
on them and subsequently present them as untouched test data. The labelled gallery
can support enrollment diagnostics; a future independent evaluation needs fresh
held-out probes and a documented model-selection/calibration boundary.

Implementation: `services/face-recognition/fresh_evaluation.py`. Its `prepare`
command validates/snapshots labels and fixes source roles; `run` executes the frozen
limited check. All 47 Python regressions pass, covering source-file exclusion,
metadata rejection, retained extraction failures, blocked empty-gallery evaluation,
repeat-run rejection and the earlier pilot tools.
