"""Local detection coverage diagnostic; no human target boxes enter the detector."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import time

from detection_views import PLANS, ViewDetector, matched_labels
from extract_sface import SFacePilot, digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--models', type=Path, required=True)
    parser.add_argument('--output-directory', type=Path, required=True)
    args = parser.parse_args()
    if args.output_directory.exists(): raise ValueError('Use a new private output directory')
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    samples = manifest['samples']
    frames = json.loads((args.manifest.parent/'frames.private.json').read_text(encoding='utf-8'))['frames']
    image_names = list(dict.fromkeys(frame['image'] for frame in frames))
    grouped = defaultdict(list)
    for sample in samples: grouped[sample['image']].append(sample)
    if not set(grouped).issubset(image_names): raise ValueError('Missing prepared frames for labels')
    args.output_directory.mkdir(parents=True)
    engine = SFacePilot(args.models/'face_detection_yunet_2023mar.onnx', args.models/'face_recognition_sface_2021dec.onnx')
    reports = []
    for plan, threshold in [(plan, .9) for plan in PLANS] + [('native',.75), ('quarter_turns', .75)]:
        detector = engine.cv.FaceDetectorYN.create(str(args.models/'face_detection_yunet_2023mar.onnx'), '', (320,320), threshold, .3, 5000)
        engine.detector = ViewDetector(engine.cv, detector, plan)
        bundle, coverage = [], defaultdict(lambda: {'labelled': 0, 'extracted': 0, 'sources': set()})
        predicted, matched, located_named = 0, 0, 0
        started, cpu_started = time.perf_counter(), time.process_time()
        for image_name in image_names:
            labels = grouped[image_name]
            path = (args.manifest.parent / image_name).resolve(strict=True)
            image = engine.cv.imread(str(path))
            if image is None: raise ValueError('Image decode failed')
            height, width = image.shape[:2]
            _, faces = engine.detector.detect(image)
            faces = [] if faces is None else [f for f in faces if min(f[2],f[3]) >= 32]
            boxes = [[float(f[0])/width,float(f[1])/height,float(f[2])/width,float(f[3])/height] for f in faces]
            hits = matched_labels(boxes, [label['box'] for label in labels])
            predicted += len(boxes); matched += len(hits)
            located_named += sum(labels[index]['identity'] is not None for index in hits)
            for sample in labels:
                vector, failure = engine.extract(path, sample['box'])
                row = {key: sample[key] for key in ('id','identity','source_id','split')}
                row.update(embedding=vector, failure=failure, image_sha256=digest(path))
                bundle.append(row)
                person = coverage[sample['identity'] or 'unknown']; person['labelled'] += 1
                if vector is not None:
                    person['extracted'] += 1; person['sources'].add(sample['source_id'])
        wall, cpu = time.perf_counter()-started, time.process_time()-cpu_started
        for person in coverage.values(): person['sources'] = sorted(person['sources'])
        report = {'plan':plan,'threshold':threshold,'frames':len(image_names),'labelledFaces':len(samples),
                  'matchedLabels':matched,'locatedNamedFaces':located_named,
                  'predictedBoxes':predicted,'unmatchedPredictedBoxes':predicted-matched,
                  'extractedFaces':sum(s['embedding'] is not None for s in bundle),
                  'extractedNamedFaces':sum(s['embedding'] is not None and s['identity'] is not None for s in bundle),
                  'namedPeopleWithTwoUsableSourceFiles':sum(k != 'unknown' and len(v['sources']) >= 2 for k,v in coverage.items()),
                  'inferenceViews':engine.detector.inference_views,'wallSeconds':round(wall,3),'cpuSeconds':round(cpu,3)}
        reports.append(report)
        with (args.output_directory/f'{plan}-{threshold}.private.json').open('x',encoding='utf-8') as output:
            json.dump({'version':1,'stage':'development_only_not_held_out','plan':plan,'threshold':threshold,
                       'coverage':dict(coverage),'samples':bundle},output,indent=2,allow_nan=False)
        print(json.dumps(report),flush=True)
    with (args.output_directory/'summary.json').open('x',encoding='utf-8') as output:
        json.dump({'status':'development_diagnostic_no_live_change','manifestSha256':digest(args.manifest),
                   'scope':'Existing reviewed frames; unmatched predictions need human review. All annotations are development data. Local CPU only.',
                   'results':reports},output,indent=2)


if __name__ == '__main__': main()
