"""Local development comparison; never changes live models or calibrates deployment."""
import argparse
from collections import Counter
import json
from pathlib import Path
import time

from benchmark_runtime import peak_memory_mib
from development_report import diagnostic
from evaluate import normalized
from extract_sface import SFacePilot, MODELS, digest, selection

DEFINITION = json.loads(Path(__file__).with_name('candidate-models.json').read_text())['auraface']


class AuraFacePilot(SFacePilot):
    def __init__(self, detector, recognizer):
        if digest(detector) != MODELS['detector'] or digest(recognizer) != DEFINITION['sha256']:
            raise ValueError('Comparison models do not match pinned checksums')
        import cv2
        self.cv = cv2
        cv2.setNumThreads(2)
        self.detector = cv2.FaceDetectorYN.create(str(detector), '', (320, 320), .9, .3, 5000)
        # alignCrop uses the same 112px five-point template as InsightFace ArcFace.
        # The feature function swaps BGR to RGB but applies no normalization itself.
        self.recognizer = cv2.FaceRecognizerSF.create(str(recognizer), '')

    def embedding(self, aligned):
        vector = self.recognizer.feature(arcface_input(aligned)).reshape(-1).tolist()
        if len(vector) != 512:
            raise ValueError('Unexpected AuraFace embedding dimension')
        return normalized(vector)


def arcface_input(aligned):
    """BGR float data; OpenCV feature() subsequently performs the RGB channel swap."""
    import numpy as np
    return (aligned.astype(np.float32) - 127.5) / 127.5


def aligned_cases(baseline, candidate):
    """Require exactly matching labels, sources, extraction outcomes and dimensions."""
    if len(baseline) != len(candidate):
        raise ValueError('Comparison sample counts differ')
    for old, new in zip(baseline, candidate):
        if any(old[key] != new[key] for key in ('id', 'source_id', 'identity', 'split', 'image_sha256')):
            raise ValueError('Comparison ground truth differs')
        if old['failure'] != new['failure']:
            raise ValueError('Detector/extraction outcomes differ; cannot isolate recognizer')
        for sample, dimension in ((old, 128), (new, 512)):
            vector = sample['embedding']
            if vector is not None and len(vector) != dimension:
                raise ValueError('Unexpected comparison embedding dimension')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--models', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--variant', choices=('sface', 'auraface'), required=True)
    parser.add_argument('--detector-threshold', type=float, choices=(.9, .75), default=.75)
    parser.add_argument('--output', type=Path, required=True, help='Private embeddings; never publish')
    parser.add_argument('--summary', type=Path, required=True, help='Anonymous aggregate development results')
    args = parser.parse_args()
    if args.output.exists() or args.summary.exists():
        raise ValueError('Use fresh output filenames; preserve prior evidence')
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    if manifest.get('version') != 1 or not manifest.get('samples'):
        raise ValueError('Require a nonempty version-1 manifest')
    prepared = [(s, (args.manifest.parent / s['image']).resolve(strict=True), selection(s['box']))
                for s in manifest['samples']]
    started = time.perf_counter()
    model = args.candidate if args.variant == 'auraface' else args.models / 'face_recognition_sface_2021dec.onnx'
    cls = AuraFacePilot if args.variant == 'auraface' else SFacePilot
    engine = cls(args.models / 'face_detection_yunet_2023mar.onnx', model)
    engine.detector = engine.cv.FaceDetectorYN.create(str(args.models / 'face_detection_yunet_2023mar.onnx'), '', (320, 320), args.detector_threshold, .3, 5000)
    startup = time.perf_counter() - started
    extraction_started = time.perf_counter()
    cpu_started = time.process_time()
    samples = []
    for sample, path, box in prepared:
        vector, failure = engine.extract(path, box)
        row = {key: sample[key] for key in ('id', 'split', 'source_id', 'identity')}
        row.update(embedding=vector, failure=failure, image_sha256=digest(path))
        samples.append(row)
    elapsed, cpu_seconds = time.perf_counter() - extraction_started, time.process_time() - cpu_started
    model_hash = digest(model)
    fingerprint = f'{args.variant}:{model_hash}:yunet:{MODELS["detector"]}:detector-{args.detector_threshold}:v1'
    bundle = {'version': 1, 'model': fingerprint, 'stage': 'development_only_not_held_out',
              'preprocessing': {'opencv': engine.cv.__version__, 'rgb': True,
                                'inputMean': 127.5 if args.variant == 'auraface' else 0,
                                'inputStd': 127.5 if args.variant == 'auraface' else 1,
                                'alignment': 'opencv_112px_five_point_similarity',
                                'detectorThreshold': args.detector_threshold}, 'samples': samples}
    # Thresholds are deliberately a development sweep, not a selected policy.
    summary = {'date': '2026-11-01', 'status': 'development_only_not_held_out', 'variant': args.variant,
               'model': fingerprint, 'manifestSha256': digest(args.manifest),
               'labelledFaces': len(samples), 'extractedFaces': sum(s['embedding'] is not None for s in samples),
               'failures': dict(Counter(s['failure'] for s in samples if s['failure'])),
               'diagnostics': [diagnostic(samples, c) for c in (.2, .3, .363, .45, .55)],
               'timing': {'startupSecondsIncludingHashChecks': round(startup, 3),
                          'extractionWallSeconds': round(elapsed, 3), 'extractionCpuSeconds': round(cpu_seconds, 3),
                          'peakProcessMiB': round(peak_memory_mib() or 0, 1), 'threads': engine.cv.getNumThreads(),
                          'scope': 'Annotated still-face extractions; repeated frames are re-detected. Excludes video decode, download and full archive scan.'},
               'privacy': 'Owner-authorized local CPU inference; no remote media transfer or paid API calls.',
               'decision': 'No live model or threshold changes. These files have already been used for development; fresh recording-level evaluation remains required.'}
    for path, content in ((args.output, bundle), (args.summary, summary)):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('x', encoding='utf-8') as output:
            json.dump(content, output, indent=2, allow_nan=False)
            output.write('\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
