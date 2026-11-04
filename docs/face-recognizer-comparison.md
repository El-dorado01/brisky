# Local recognizer comparison — 2026-11-01

This is an event-developed extension of the face-evaluation tools. Brisky's existing
media engine, the upstream model architectures and pretrained weights are not new
hackathon contributions. This comparison does not activate a new live model.

## Candidate and reproducibility

Compare SFace with the recognition weights from
[fal's AuraFace model](https://huggingface.co/fal/AuraFace-v1).
The publisher declares Apache 2.0 and describes training for commercial use; this
is a publisher declaration, not an independent audit of the training data. Only
`glintr100.onnx` is downloaded. The bundled detector, landmark and attribute weights
are excluded from this comparison.

The candidate is 260,694,151 bytes (248.6 MiB), versus 38,696,353 bytes (36.9 MiB)
for SFace. Both use the existing 232,589-byte YuNet detector. Exact publisher
revision, SHA-256 and licence reference are recorded in
`services/face-recognition/candidate-models.json`; downloads and private data stay
in ignored `storage/`. The publisher's licence notice is retained beside the weights.

After the normal `pnpm setup:faces`, explicitly prepare this optional candidate:

```powershell
.venv-face/Scripts/python.exe services/face-recognition/prepare_candidate.py
.venv-face/Scripts/python.exe services/face-recognition/prepare_candidate.py --check
# If urllib transfers stall, resume completed ranges with the bounded curl transport:
.venv-face/Scripts/python.exe services/face-recognition/prepare_candidate.py --transport curl
```

Use `.venv-face/bin/python` on macOS/Linux. The downloader resumes disjoint bounded
ranges, verifies the assembled model checksum and never sends media. It is not run
by application startup or the default face setup command. Installation on a clean
non-Windows host remains unverified.

The comparison uses the same YuNet detection, target-box overlap, ambiguity and
minimum-face-size rules. A development detector cutoff of 0.75 provides the two
cross-file positive probes recovered in the earlier diagnostic. It is not a change
to the live detector's 0.90 cutoff. OpenCV supplies the common 112×112 five-point
alignment template; AuraFace receives RGB with `(pixel - 127.5) / 127.5`, following
the publisher's recommended
[InsightFace preprocessing](https://github.com/deepinsight/insightface/blob/master/python-package/insightface/model_zoo/arcface_onnx.py)
and [alignment](https://github.com/deepinsight/insightface/blob/master/python-package/insightface/utils/face_align.py).
SFace retains its original preprocessing. Outputs are normalized separately: SFace
has 128 dimensions, AuraFace 512. These spaces must never be mixed.

Run each variant in a fresh process, with new output names, against the private
review manifest:

```powershell
.venv-face/Scripts/python.exe services/face-recognition/compare_recognizers.py --manifest storage/face-evaluation/review-2026-11-01/annotations.manifest.private.json --models storage/face-models --candidate storage/face-models/aura-comparison/glintr100.onnx --variant sface --output storage/face-evaluation/review-2026-11-01/comparison-sface.private.json --summary storage/face-evaluation/review-2026-11-01/comparison-sface-summary.json
# Repeat with --variant auraface and different output/summary filenames.
```

The tool writes private biometric embeddings separately from anonymous aggregate
summaries. It refuses to overwrite prior evidence. No Docker, credentials, remote
inference or paid model calls are required. Models run on CPU with two OpenCV threads.

## Interpretation

The existing deterministic gallery protocol chooses the first usable source file
per identity, with at most three references. Every gallery file is excluded from
probes, including other people appearing in that file. Named people who cannot be
enrolled remain in the unenrolled counts. The candidate must reproduce identical
detection outcomes and gallery membership before comparing matching results.

The 41 labelled faces have already been used for development. Comparing thresholds
on them cannot establish held-out accuracy or justify deployment. Two sampled
frames per video also do not measure exhaustive discovery or track coverage.
Different recognizers have different score distributions; a shared numeric cutoff
is not a shared error rate. Report the development sweep and wrong suggestions
alongside correct matches rather than selecting a flattering score.

## Results

The publisher-pinned weight and licence checksums passed. Interrupted temporary
downloads were removed after verification. Both fresh-process runs completed with
identical extraction outcomes, labels and image hashes. The baseline reproduces
the earlier embeddings and failures exactly. Neither model used remote inference.

| Development match cutoff | SFace correct / 7 enrolled probes | SFace wrong / 27 unenrolled probes | AuraFace correct / 7 | AuraFace wrong / 27 |
| --- | --- | --- | --- | --- |
| 0.20 | 2 | 14 | 2 | 9 |
| 0.30 | 2 | 13 | 2 | 3 |
| 0.363 | 2 | 8 | 2 | 1 |
| 0.45 | 0 | 2 | 1 | 0 |
| 0.55 | 0 | 0 | 0 | 0 |

Four identities were enrolled using three gallery files; all gallery files were
excluded from the 34 probes. The 27 unenrolled probes include 23 explicitly unknown
faces and four faces from named people who could not be enrolled. Neither variant
made wrong assignments between enrolled identities in this tiny sample.

Both models extracted 24/41 labelled faces. Five of the seven enrolled probes could
not be extracted at all; only two positive probes, from the same person in the same
source file, reached recognition. AuraFace reduces wrong suggestions and recovers
one positive without observed wrong matches at 0.45. It still loses the other
available positive. This does not establish dependable recognition across people.
Retaining the same detector deliberately exposes the unresolved detection bottleneck.

| Local resource measurement | SFace | AuraFace |
| --- | --- | --- |
| Recognition weights | 36.9 MiB | 248.6 MiB |
| Startup including checksum checks | 0.730 s | 2.193 s |
| 41 annotated-face extraction attempts, wall time | 6.232 s | 17.782 s |
| Extraction process CPU time | 9.359 s | 27.625 s |
| Peak process working set | 254.8 MiB | 1,616.0 MiB |
| Paid API calls / credits consumed by these runs | 0 / $0 | 0 / $0 |

These are single runs on the same Windows host with two OpenCV threads. They include
image reads and repeated detection for multiple annotations on a frame, and exclude
video decoding, network download and complete scans. Background load and cold-start
effects were not controlled. Local electricity/CPU cost was not monetized. In these
runs AuraFace took about 2.9× the extraction wall time and 6.3× the peak memory.

**Decision:** keep the live YuNet/SFace model, thresholds and explicit confirmation
unchanged. AuraFace's observed improvement is insufficient to justify switching
the API or claiming automatic tagging is complete. Improve detection and enrollment
coverage next, then validate the chosen approach on fresh independent recordings.
Manual tagging/review remains the implemented product path. No deployment cutoff
was calibrated here. See [earlier findings](face-evaluation-2026-11-01.md).

The anonymous [JSON evidence](hackathon-evidence/2026-11-01-face-recognizer-comparison.json)
was generated only after checking matching private inputs and reproducing every
cutoff result. Reproduce it with a fresh output path:

```powershell
.venv-face/Scripts/python.exe services/face-recognition/report_recognizer_comparison.py --directory storage/face-evaluation/review-2026-11-01 --output storage/face-evaluation/review-2026-11-01/comparison-report.json
```

All 35 Python regression checks pass, covering normalization, mismatched comparison
inputs, safe byte-range recovery and the earlier matching/evaluation/setup logic.
