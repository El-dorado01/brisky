# Resumable scene preparation

`WINDOWED_SCENE_PREPARATION=false` keeps this path opt-in. It currently requires a versioned streamed
connector source. Local uploads keep the existing full-scene path. This is a local preparation change;
it does not call an AI provider.

## Design and tradeoffs

FFmpeg scans bounded source intervals using input seek and duration, then extracts frames at absolute
source timestamps. No intermediate video re-encoding or byte-to-time estimation is used. Defaults:
60-second cores, two seconds of context on either side, and 1,000 evidence intervals per asset.
Settings are `SCENE_WINDOW_SECONDS`, `SCENE_WINDOW_CONTEXT_SECONDS` and `SCENE_WINDOW_MAX_SCENES`.

Intervals intersecting a core retain their context rather than being cut at the artificial boundary.
Each boundary also has a separate interval spanning both sides, with five sampled frames. These are
evidence intervals, not a claim of globally equivalent natural scene segmentation. Context may
duplicate observations and increase downstream analysis cost. Finite samples cannot guarantee
capture of a fleeting detail or a sequence longer than the context interval. Accuracy evaluation
remains necessary before enabling this by default.

After each window, validate the source version, persist its keyframes, and commit an owner-scoped
checkpoint in the existing processing-units table. A transaction locks the owned asset and checks a
shared source/policy fingerprint before saving. Changed source or policy requires explicit reindexing.
Retries reuse completed windows whose inline or durable evidence remains available; missing evidence
is decoded again. A short final core retains intersecting evidence even if its interval midpoint falls
in the preceding core. Stable numeric identifiers distinguish window scenes and boundary intervals.

The scene limit fails without discarding earlier checkpoints. Raising only the resource quota permits
resume; it does not change the evidence policy fingerprint. There is no silent truncation. Decoder,
reader-byte and reader-time limits still apply. Repeated seeks can transfer the same source bytes;
streaming alone is not a guarantee of lower bandwidth or cost.

The existing asset lock remains. Windows prepare sequentially, and downstream scene/model jobs are
queued after preparation finishes. This does not yet provide early visual search results or parallel
scene/audio jobs for one asset. Audio has its separate opt-in resumable path.

## Validation and remaining work

Worker fixtures cover interruption/resume and retained boundary intervals. Unit checks cover source
timestamp validation, short final windows, and transaction ownership/fingerprint rollback. Native
FFmpeg fixtures compare local and range-backed bounded scans, confirm absolute timestamps, compare
sampled frames to original decoding, and check samples on both sides of a boundary. SQL transaction
tests for this new path use a mocked client; live database/provider validation remains deferred.

The live accuracy/cost pilot is deferred at the owner's request. The proposed improved SaaS app is a
separate product phase; its features and design have not been specified or implemented here. Meta
adapter work also remains separate.
