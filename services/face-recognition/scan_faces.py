"""Bounded local face scan. JSON paths are supplied by the trusted engine only."""
import argparse
import json
import math
from pathlib import Path
from extract_sface import SFacePilot
from evaluate import normalized


def scan(engine, manifest):
    usable = []
    for reference in manifest['references']:
        vector, failure = engine.extract(Path(reference['image']), reference['box'])
        if vector is not None:
            usable.append((reference['id'], vector, reference.get('sourceId', reference['id'])))
    references, sources = [], set()
    for identifier, vector, source in usable:
        if source not in sources and len(references)<3:
            references.append((identifier,vector)); sources.add(source)
    selected = {identifier for identifier,_ in references}
    for identifier, vector, _ in usable:
        if len(references)==3: break
        if identifier not in selected:
            references.append((identifier,vector)); selected.add(identifier)
    result = {'referenceCount': len(references), 'framesScanned': 0, 'facesDetected': 0, 'matches': []}
    if not references:
        return result
    competitors=[]
    for reference in manifest.get('competitors',[]):
        vector,_=engine.extract(Path(reference['image']),reference['box'])
        if vector is not None: competitors.append(vector)
    cv = engine.cv
    for sample in manifest['frames']:
        image = cv.imread(sample['image'])
        if image is None:
            raise ValueError('A prepared frame could not be decoded')
        height, width = image.shape[:2]
        engine.detector.setInputSize((width, height))
        _, faces = engine.detector.detect(image)
        result['framesScanned'] += 1
        if faces is None:
            continue
        for face in faces[:20]:
            if not all(math.isfinite(float(n)) for n in face) or min(float(face[2]), float(face[3])) < 32:
                continue
            result['facesDetected'] += 1
            box = [max(0, float(face[0]) / width), max(0, float(face[1]) / height), float(face[2]) / width, float(face[3]) / height]
            box[2], box[3] = min(box[2], 1-box[0]), min(box[3], 1-box[1])
            if box[2] <= 0 or box[3] <= 0:
                continue
            vector = normalized(engine.recognizer.feature(engine.recognizer.alignCrop(image, face)).reshape(-1).tolist())
            scores = [(sum(a*b for a, b in zip(vector, ref)), ref_id) for ref_id, ref in references]
            score, reference_id = max(scores)
            # Scores are candidate heuristics. Prefer abstention when another
            # enrolled person's supplied reference is similarly close.
            competitor=max((sum(a*b for a,b in zip(vector,ref)) for ref in competitors),default=-1.)
            if score >= manifest['threshold'] and (not competitors or score-competitor>=.1):
                result['matches'].append({'frame': sample['time'], 'box': box, 'score': min(1, score), 'referenceId': reference_id})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--detector', type=Path, required=True)
    parser.add_argument('--recognizer', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--enhanced',action='store_true')
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    if not 1 <= len(manifest['references']) <= 9 or len(manifest.get('competitors',[]))>12 or not 1 <= len(manifest['frames']) <= 24 or not .3 <= manifest['threshold'] <= 1:
        raise ValueError('Scan exceeds bounded pilot limits')
    if args.enhanced:
        from robust_sface import RobustSFace
        engine=RobustSFace(args.detector,args.recognizer)
    else: engine = SFacePilot(args.detector, args.recognizer)
    result = scan(engine, manifest)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(result, output, allow_nan=False)


if __name__ == '__main__':
    main()
