"""Local image pilot adapter. Requires explicit local models; no network access."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from evaluate import normalized, number

MODELS = {
    'detector': '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    'recognizer': '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
}


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def overlap(a, b):
    left, top = max(a[0], b[0]), max(a[1], b[1])
    right, bottom = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    intersection = max(0, right - left) * max(0, bottom - top)
    union = a[2] * a[3] + b[2] * b[3] - intersection
    return intersection / union if union > 0 else 0


def selection(box):
    if not isinstance(box, list) or len(box) != 4 or not all(number(n) for n in box):
        raise ValueError('Expected normalized target box [x,y,width,height]')
    x, y, w, h = box
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 1 or y + h > 1:
        raise ValueError('Target box lies outside the image')
    return box


class SFacePilot:
    def __init__(self, detector, recognizer):
        for name, file in (('detector', detector), ('recognizer', recognizer)):
            if digest(file) != MODELS[name]:
                raise ValueError(f'{name} checksum differs from the evaluated model definition')
        import cv2
        self.cv = cv2
        cv2.setNumThreads(2)
        self.detector = cv2.FaceDetectorYN.create(str(detector), '', (320, 320), 0.9, 0.3, 5000)
        self.recognizer = cv2.FaceRecognizerSF.create(str(recognizer), '')

    def extract(self, image_path, target_box):
        cv = self.cv
        image = cv.imread(str(image_path))
        if image is None:
            return None, 'image_decode_failed'
        height, width = image.shape[:2]
        if width * height > 40_000_000:
            return None, 'image_too_large'
        self.detector.setInputSize((width, height))
        _, faces = self.detector.detect(image)
        if faces is None:
            return None, 'no_face_detected'
        candidates = []
        for face in faces:
            if not all(math.isfinite(float(n)) for n in face):
                continue
            box = [float(face[0]) / width, float(face[1]) / height,
                   float(face[2]) / width, float(face[3]) / height]
            candidates.append((overlap(box, target_box), face))
        candidates.sort(key=lambda c: c[0], reverse=True)
        if not candidates or candidates[0][0] < 0.5:
            return None, 'target_not_detected'
        if len(candidates) > 1 and candidates[0][0] - candidates[1][0] < 0.1:
            return None, 'ambiguous_target_detection'
        face = candidates[0][1]
        if min(float(face[2]), float(face[3])) < 32:
            return None, 'face_too_small'
        aligned = self.recognizer.alignCrop(image, face)
        return self.embedding(aligned), None

    def embedding(self, aligned):
        vector = self.recognizer.feature(aligned).reshape(-1).tolist()
        if len(vector) != 128:
            raise ValueError('Unexpected SFace embedding dimension')
        return normalized(vector)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--detector', type=Path, required=True)
    parser.add_argument('--recognizer', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    if manifest.get('version') != 1 or not isinstance(manifest.get('samples'), list) or not manifest['samples']:
        raise ValueError('Expected manifest version 1 and nonempty samples')
    # Validate paths/boxes before inference; image roots resolve beside the manifest.
    prepared = []
    for sample in manifest['samples']:
        image = (args.manifest.parent / sample['image']).resolve(strict=True)
        if not image.is_file():
            raise ValueError('Image path must name a local file')
        box = selection(sample['box'])
        prepared.append((sample, image, box))
    engine = SFacePilot(args.detector, args.recognizer)
    samples = []
    for sample, image, box in prepared:
        vector, failure = engine.extract(image, box)
        samples.append({key: sample[key] for key in ('id', 'split', 'source_id', 'identity')})
        samples[-1].update(image_sha256=digest(image), embedding=vector, failure=failure)
    bundle = {'version': 1, 'model': f'opencv-sface:{MODELS["recognizer"]}:yunet:{MODELS["detector"]}:v1',
              'preprocessing': {'opencv': engine.cv.__version__, 'native_resolution': True,
                                'detector_threshold': 0.9, 'min_face_px': 32,
                                'selection_iou': 0.5, 'selection_margin': 0.1}, 'samples': samples}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(bundle, output, indent=2, allow_nan=False)
        output.write('\n')
    print('Local embeddings written; treat this file as private biometric data.')


if __name__ == '__main__':
    main()
