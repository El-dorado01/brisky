# Face matching development diagnostic — 2026-11-01

The present YuNet/SFace pilot is **not ready for automatic tagging** on the supplied
sample. Live thresholds and the user-confirmation requirement were left unchanged.
This is development evidence, not a calibrated held-out accuracy benchmark.

The owner authorized local testing of 18 videos and reviewed 36 sampled frames,
labelling 41 faces. Faces marked unknown are different from the named participants,
as the owner confirmed; knowing their real names does not make them enrolled.
Footage, names, labels, embeddings and case details remain in ignored storage.
No media was uploaded or sent to a remote inference provider.

## Face extraction

The pinned models and original overlap/minimum-size rules were retained. Only the
detector's confidence cutoff changed in the development comparisons:

| Detection cutoff | Usable labelled faces | Extraction coverage |
| --- | --- | --- |
| 0.90 (current) | 22 / 41 | 53.7% |
| 0.75 (diagnostic) | 24 / 41 | 58.5% |
| 0.60 (diagnostic) | 26 / 41 | 63.4% |

These percentages are extraction coverage, **not identity-recognition accuracy**.
At the current cutoff, 6 of 18 named-person faces and 16 of 23 unknown-person faces
were extracted. Misses remain in the reported totals. A separate development check
produced 21/41 extractions after reducing the maximum frame dimension to 640, and
11/41 from padded human-annotated crops at 640. Neither improved this sample.
The crop experiment uses human target boxes and cannot measure automatic discovery.

## File-separated matching diagnostic

The first usable source file per enrolled identity supplied up to three reference
faces. All reference files were excluded from probes. This produced four enrolled
identities across three source files, and 34 probe faces: seven belonging to enrolled
people and 27 to unenrolled people. The latter include 23 explicitly unknown faces
and four faces from two named participants who had no usable enrollment features.
Those failures were not silently dropped. Distinct files are not independently
verified distinct original recordings, and this is not the formal evaluation protocol.

| Development setting | Correct enrolled probes | Wrong matches to unenrolled probes |
| --- | --- | --- |
| Current detector 0.90, match cutoff 0.55 | 0 / 7 | 0 / 27 |
| Detector 0.75, match cutoff 0.55 | 0 / 7 | 0 / 27 |
| Detector 0.60, match cutoff 0.55 | 0 / 7 | 0 / 27 |
| Detector 0.75, relaxed match cutoff 0.363 | 2 / 7 | 8 / 27 |

The current setting abstained on all probes; zero wrong suggestions does not mean
useful recognition or 100% precision. Relaxing thresholds recovered some positives
while introducing wrong identities, so these results do not justify lowering the
live cutoff. Differences from a future exhaustive video scan must not be inferred
from these two labelled frames per file.

## Next decision

Keep manual tagging and explicit review. Compare a stronger detector/recogniser
using the same development data, then validate the selected approach on **fresh**
recording-level splits. The current extractions do not support the formal protocol's
two enrolled identities with two usable reference recordings each plus separate
known/unknown calibration and test sets. No deployment policy was calibrated, and
the development sample must not later be presented as untouched test data.

The new local diagnostic scripts extend the event-developed evaluation tools and
use pre-existing media extraction/model foundations; they do not replace the engine
or demonstrate new Meta inference. Detailed anonymous aggregate results and input
hashes: [JSON evidence](hackathon-evidence/2026-11-01-face-development-diagnostics.json).
