# Face recognition evaluation tools

Prepared 2026-10-30. Consider accuracy, cost and speed together; use
**accuracy > cost > speed** when a tradeoff forces a choice.

2026-11-01 update: pinned local weights/dependencies are now installed, and a
bounded API/SaaS review pilot extends these original offline tools. Generated-image
runtime checks passed; recognition accuracy remains unmeasured. The original
milestone description below is historical. See [the current pilot](local-face-matching.md).

## Status and attribution

Event-developed tools live in `services/face-recognition/`. The offline evaluator,
candidate adapter, source/checksum inventory and synthetic tests are new work.
Existing media indexing, keyframe extraction and manual identity APIs are separate
foundations. These tools do not add automatic recognition to the API or indexing worker.

The owner currently has no evaluation footage and requested tools only. No weights
were downloaded, no new dependencies installed, no personal media accessed and no
inference provider called. Docker is not required. Nineteen tests passed, including
a synthetic end-to-end evaluator CLI run. These results verify evaluation logic;
they do not measure real recognition accuracy or exercise OpenCV inference.

## Candidate review

| Candidate | Verified upstream information | Decision for this milestone |
| --- | --- | --- |
| InsightFace supplied pretrained models | Code is MIT; supplied pretrained weights are restricted to non-commercial research | Do not assume suitable rights for the startup product or demo; no weights selected |
| OpenCV YuNet + SFace | YuNet directory is MIT; SFace directory states all its files are Apache-2.0; official demo pairs them | Implement an explicit-local-model pilot adapter, not a final accuracy winner |
| fal AuraFace v1 | Publisher model card identifies Apache-2.0, ResNet100, and limitations across ethnicity/training coverage | Additional comparison candidate; no adapter or inference run yet |
| Baseten deployment | Official documentation supports custom model serving and notes billable compute | Hosting option later; neither credit applicability nor a face endpoint is verified |

Primary sources checked 2026-10-30:

- [InsightFace licensing](https://github.com/deepinsight/insightface#license).
- [YuNet model directory](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
  and [MIT notice](https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/LICENSE).
- [SFace model directory and license statement](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface).
- [AuraFace publisher model card](https://huggingface.co/fal/AuraFace-v1).
- [Baseten model serving documentation](https://docs.baseten.co/development/model/build-your-first-model).

Published benchmarks do not rank these candidates on Brisky footage. Compare them
on the same labelled recordings before choosing a production recognizer. Prefer
local deterministic processing where appropriate; spending credits is not evidence
of better recognition. A dedicated recognizer also does not satisfy Meta-model use.

## Evaluation protocol

Fresh intake on 2026-11-01: 13 new readable, owner-confirmed separate recordings
were inventoried without duplicate bytes against the earlier development corpus.
Twenty-six private frames await owner labels. `prepare_review.py --no-detection`
prepares a review without detector proposals or recognizer execution; the owner
draws face boxes and may add missing names with **Add name**. Named labels survive
reload and the participant list is included in exported JSON. Original sources and
earlier labels remain unchanged. Inventory can be reproduced with
`services/face-recognition/inventory_videos.py --help`; inventory alone does not
establish participant permission or independent recordings. No accuracy score or
gallery/calibration/test assignment is claimed yet. See
[fresh-intake evidence](hackathon-evidence/2026-11-01-fresh-face-intake.json).

Subsequent status: owner labels are now validated. A frozen partial check exposes
poor enrollment/extraction coverage; each named person still has only one source,
so full known-person validation is unavailable. The unknown probes have been used
once and are no longer untouched. See [fresh results](fresh-face-evaluation-2026-11-01.md).

The local helper `prepare_review.py` creates a private HTML sheet from an inventory,
participant list, FFmpeg path and verified model directory. It samples two frames
per recording, proposes face boxes without guessing identities, and lets the owner
correct boxes/assign names and export reviewed labels. All samples of a recording
must still share one later split; automatic boxes are not ground truth until reviewed.
Unreviewed frames and unannotated detector misses must not be silently counted as
successful recognition. The sheet is an intake tool, not an accuracy report.

1. Use agreed, labelled footage with multiple people, including people absent from
   the reference gallery. Include frontal/profile views, small faces, low light,
   blur and lookalikes where available. Record which conditions each set covers.
2. Extract timestamped original-source frames using the existing media pipeline.
   Preserve original recording IDs. Assign whole recordings to `gallery`,
   `calibration` or `test`; adjacent frames must not cross those boundaries.
3. Manually annotate the target face box in each image. One sample represents one
   annotated face. Use the same image hash for multiple faces in one image; keep
   them in the same split. Gallery identities need two usable reference recordings
   each; both probe splits need enrolled and unenrolled people.
4. Extract embeddings. A missed face, ambiguous box or tiny detection is recorded
   as a failure, never silently removed. The adapter selects by overlap with the
   annotation, not by the expected identity. This measures annotated-target
   retrieval, not exhaustive detection/tracking across a video.
5. Calibrate only on calibration probes. For each identity, score the second-best
   match from distinct reference recordings, requiring two sources of support.
   Abstain below the similarity threshold or when the best identities are too close.
6. The evaluator searches thresholds 0..1 in steps of .02 and margins
   .02/.05/.10/.15/.20. It chooses the most correct calibration suggestions with
   zero observed wrong suggestions, breaking ties toward stricter thresholds and
   margins. If no usable policy exists, or no unknown calibration face was extracted,
   it produces no policy and does not evaluate the test split.
7. Freeze that policy and evaluate test once. Report precision, known-person recall,
   unknown false accepts, extraction failures and suggestion coverage. Missed known
   faces remain in recall denominators. Also inspect the false-accept rate among
   extracted unknown faces so detector failures cannot masquerade as safe matching.

Zero observed mistakes on a small set is not a guarantee. Thresholds are model-
and dataset-specific; similarities are not probabilities. The evaluator does not
certify a production threshold or estimate population accuracy. Before shipping,
collect enough independent recordings per condition to evaluate error rates and
uncertainty, review failures, and compare candidates. Automatic output remains a
suggestion until the user confirms it. Do not infer conversation from co-presence.

## Input and commands

Keep images, manifests, embeddings and reports under ignored `storage/` rather than
committing them. Embeddings are private biometric data; no remote upload is needed.
The evaluator does not access Brisky's database and cannot tag a real identity.

A manifest has `version: 1` and a `samples` array. Each sample has these fields:

```json
{
  "id": "unique-frame-person-id",
  "split": "gallery",
  "source_id": "original-recording-id",
  "identity": "owner-local-person-id",
  "image": "frames/example.jpg",
  "box": [0.1, 0.2, 0.25, 0.3]
}
```

Use `identity: null` for unenrolled people in calibration/test. Paths resolve beside
the manifest; boxes are normalized `[x,y,width,height]` in the displayed image.
All images derived from one recording must share its `source_id`. The adapter hashes
image bytes to catch identical images across splits, but cannot detect re-encoded
copies or fabricated recording IDs. Dataset curation remains necessary.

Once footage is available, create a dedicated environment under ignored storage:

```powershell
python -m venv storage/face-eval-env
& storage/face-eval-env/Scripts/python.exe -m pip install -r services/face-recognition/requirements.txt
```

Obtain the two official ONNX files listed in
`services/face-recognition/model-sources.json`, retain their license notices, and
place them under `storage/face-models/`. The adapter verifies their SHA-256 hashes
before loading. Git LFS pointer text is not the model itself. Nothing auto-downloads.

```powershell
& storage/face-eval-env/Scripts/python.exe services/face-recognition/extract_sface.py --manifest storage/face-evaluation/manifest.json --detector storage/face-models/face_detection_yunet_2023mar.onnx --recognizer storage/face-models/face_recognition_sface_2021dec.onnx --output storage/face-evaluation/embeddings.json
python services/face-recognition/evaluate.py --embeddings storage/face-evaluation/embeddings.json --output storage/face-evaluation/report.json
```

Both commands refuse to overwrite existing output files. The adapter uses native
image resolution, five-landmark alignment through OpenCV, FP32 SFace weights and
normalized 128-dimensional embeddings. Its initial detector score (.9), minimum
face size (32 pixels), target overlap (.5) and overlap separation (.1) are recorded
pilot settings, not validated operating points. Full-resolution decoding consumes
local CPU/memory; images above 40 million pixels return an extraction failure.

Other model adapters can emit the same evaluation bundle: `version`, exact `model`
identity, optional `preprocessing`, and `samples` carrying `id`, `source_id`, `split`,
`identity`, an `embedding` array or `embedding: null` plus `failure`. Use one model
and dimension per bundle. Include `image_sha256` to enable image-content leakage
checks. Reports include the input file checksum for reproducibility.

Run the dependency-free tests now:

```powershell
python -m unittest discover -s services/face-recognition -p test_*.py -v
```

## Later backend integration

After model execution and quality validation, use the existing scene/keyframe
timestamps as input; keep detector model identity and source coordinates with each
observation. Reuse multiple confirmed manual appearances as references, rather than
one mutable centroid. Keep model-suggested identities separate from confirmed tags,
invalidate references when a user rejects/deletes a tag, and keep all matching scoped
to the media owner. Schema/API/indexing wiring, reprocessing/checkpoints and identity-
aware search are still future work. Docker is needed only when the next database
change requires validation; tell the owner beforehand.
