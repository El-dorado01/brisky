"""Frozen, limited enrollment/unknown-rejection check; not full recognition accuracy."""
import argparse
from collections import Counter, defaultdict
import json
import hashlib
from pathlib import Path
import time

from benchmark_runtime import peak_memory_mib
from extract_sface import MODELS, SFacePilot, digest, selection

UNKNOWN = 'Unknown / not enrolled'


def write_new(path, data):
    with path.open('x', encoding='utf-8') as handle:
        json.dump(data, handle, indent=2, allow_nan=False)
        handle.write('\n')


def prepare(labels_path, frames_path, inventory_path, output):
    if output.exists(): raise ValueError('Use a new evaluation directory')
    labels_blob = labels_path.read_bytes()
    labels = json.loads(labels_blob)
    prepared = json.loads(frames_path.read_text(encoding='utf-8'))
    inventory = json.loads(inventory_path.read_text(encoding='utf-8'))
    if labels.get('version') != 1 or labels.get('dataset') != prepared['dataset']:
        raise ValueError('Labels belong to a different review dataset')
    expected = {f['id']: f for f in prepared['frames']}
    actual = labels.get('frames', [])
    if len(actual) != len(expected) or {f['id'] for f in actual} != set(expected):
        raise ValueError('Missing or repeated reviewed frames')
    declared = labels.get('participants', prepared['participants'])
    if not isinstance(declared, list) or not all(isinstance(n,str) and n.strip() and len(n)<=80 for n in declared):
        raise ValueError('Invalid participant names')
    names, entries = set(), []
    for frame in actual:
        original = expected[frame['id']]
        if frame.get('reviewed') is not True: raise ValueError('Every frame must be reviewed')
        if any(frame.get(key) != original[key] for key in ('source_id','image','frame_s')):
            raise ValueError('Reviewed frame metadata differs from prepared footage')
        face_ids = set()
        for face in frame.get('faces', []):
            if type(face.get('id')) is not int or face['id']<1 or face['id'] in face_ids:
                raise ValueError('Invalid or repeated face ID')
            face_ids.add(face['id'])
            person = face.get('person')
            if person != UNKNOWN and person not in declared: raise ValueError('Face needs a declared name or explicit unknown label')
            if person != UNKNOWN: names.add(person)
            image = (frames_path.parent / original['image']).resolve(strict=True)
            if not image.is_relative_to(frames_path.parent.resolve()): raise ValueError('Image leaves private review directory')
            entries.append({'id':f'{frame["id"]}-face-{face["id"]}', 'source_id':frame['source_id'],
                            'frame_s':frame['frame_s'], 'image':str(image), 'image_sha256':digest(image),
                            'name':person, 'box':selection(face['box'])})
    for record in inventory['records']:
        if digest(Path(record['file'])) != record['sha256']: raise ValueError('Original video changed since intake')
    identities = {name:f'fresh-person-{i:03}' for i,name in enumerate(sorted(names,key=str.casefold),1)}
    gallery_sources = {e['source_id'] for e in entries if e['name'] != UNKNOWN}
    for entry in entries:
        entry['identity'] = identities.get(entry.pop('name'))
        entry['split'] = 'gallery' if entry['identity'] else ('excluded_gallery_context' if entry['source_id'] in gallery_sources else 'test_unknown')
    # This run deliberately cannot report known recall: named faces are enrollment only.
    plan = {'version':1,'status':'frozen_partial_check_not_formal_gallery_calibration_test',
            'labels_sha256':hashlib.sha256(labels_blob).hexdigest(),'prepared_frames_sha256':digest(frames_path),
            'inventory_sha256':digest(inventory_path),'implementation_sha256':digest(Path(__file__)),
            'adapter_sha256':digest(Path(__file__).with_name('extract_sface.py')),
            'models':MODELS,'detector_threshold':.9,'match_threshold':.55,'references_per_identity':3,
            'selection_iou':.5,'selection_margin':.1,'min_face_px':32,
            'matching':'Maximum cosine over at most three usable manual references per identity; no tuning or model selection on these files',
            'identity_count':len(identities),'review_frames':len(actual),
            'empty_review_frames':sum(not f.get('faces') for f in actual),
            'known_probe_count':0,'samples':entries}
    output.mkdir(parents=True)
    (output/'labels.private.json').write_bytes(labels_blob)
    write_new(output/'identities.private.json',identities)
    write_new(output/'plan.private.json',plan)
    return {'reviewedFrames':len(actual),'labelledFaces':len(entries),'namedPeople':len(identities),
            'galleryFaces':sum(e['split']=='gallery' for e in entries),
            'unknownProbeFaces':sum(e['split']=='test_unknown' for e in entries),
            'excludedGalleryContextFaces':sum(e['split']=='excluded_gallery_context' for e in entries)}


def unknown_metrics(cases, threshold):
    extracted = sum(c['embedding'] is not None for c in cases)
    accepted_faces = sum(any(score >= threshold for score in c['scores']) for c in cases)
    return {'labelledUnknownFaces':len(cases),'extractedUnknownFaces':extracted,
            'unknownExtractionFailures':len(cases)-extracted,'wronglyMatchedUnknownFaces':accepted_faces,
            'wrongProfileSuggestions':sum(score>=threshold for c in cases for score in c['scores']),
            'unknownFalseAcceptRate':accepted_faces/len(cases) if cases else None,
            'unknownFalseAcceptRateWhenExtracted':accepted_faces/extracted if extracted else None,
            'knownRecall':None}


def run(directory, models, factory=SFacePilot):
    plan_path = directory/'plan.private.json'
    plan = json.loads(plan_path.read_text(encoding='utf-8'))
    if plan['models'] != MODELS or plan['implementation_sha256'] != digest(Path(__file__)) or plan['adapter_sha256'] != digest(Path(__file__).with_name('extract_sface.py')):
        raise ValueError('Frozen model/implementation changed; do not silently reuse test footage')
    write_new(directory/'run-started.private.json',{'plan_sha256':digest(plan_path),'scope':'Single frozen evaluation attempt; do not tune on test'})
    started = time.perf_counter()
    engine = factory(models/'face_detection_yunet_2023mar.onnx',models/'face_recognition_sface_2021dec.onnx')
    gallery, observations = defaultdict(list), []
    def extract(sample):
        path = Path(sample['image'])
        if digest(path) != sample['image_sha256']: raise ValueError('Prepared frame changed after freeze')
        vector, failure = engine.extract(path,sample['box'])
        observations.append({**sample,'embedding':vector,'failure':failure})
        return vector
    gallery_samples = [s for s in plan['samples'] if s['split']=='gallery']
    for sample in gallery_samples:
        vector = extract(sample)
        if vector is not None and len(gallery[sample['identity']]) < plan['references_per_identity']:
            gallery[sample['identity']].append(vector)
    gallery = {identity:refs for identity,refs in gallery.items() if refs}
    cases = []
    if gallery:
        for sample in plan['samples']:
            if sample['split'] != 'test_unknown': continue
            vector = extract(sample)
            scores = [] if vector is None else [max(sum(a*b for a,b in zip(vector,ref)) for ref in refs) for refs in gallery.values()]
            cases.append({'id':sample['id'],'embedding':vector,'scores':scores})
    metrics = unknown_metrics(cases,plan['match_threshold']) if gallery else None
    status = ('blocked_no_usable_gallery_test_not_run' if not gallery else
              'unusable_unknown_check_no_extracted_probes' if not metrics['extractedUnknownFaces'] else
              'partial_unknown_rejection_check_not_full_accuracy')
    write_new(directory/'observations.private.json',{'samples':observations,'unknown_cases':cases})
    report = {'date':'2026-11-01','status':status,
              'planSha256':digest(plan_path),'labelsSha256':plan['labels_sha256'],'models':plan['models'],
              'detectorThreshold':plan['detector_threshold'],'matchThreshold':plan['match_threshold'],
              'reviewFrames':plan['review_frames'],'labelledFaces':len(plan['samples']),
              'gallery':{'namedPeople':plan['identity_count'],'usableEnrolledPeople':len(gallery),
                         'failedEnrollments':plan['identity_count']-len(gallery),'labelledFaces':len(gallery_samples),
                         'usableReferenceFaces':sum(len(refs) for refs in gallery.values()),
                         'extractionFailures':sum(s['embedding'] is None for s in observations if s['split']=='gallery')},
              'unknownTest':metrics,'excludedGalleryContextFaces':sum(s['split']=='excluded_gallery_context' for s in plan['samples']),
              'emptyReviewFramesNotEvaluated':plan['empty_review_frames'],
              'wallSeconds':round(time.perf_counter()-started,3),'peakProcessMiB':round(peak_memory_mib() or 0,1),
              'limitations':['Each named person has only one source recording; no cross-recording known-person probes.',
                             'Only annotated faces in two sampled frames per file; unmatched detector boxes and tracking are not evaluated.',
                             'Maximum-reference pilot matching differs from the formal two-source corroboration protocol.',
                             'No threshold calibration, model selection, full recognition accuracy or deployment approval.',
                             'Skipped or failed extractions are not proof of correct unknown rejection.'],
              'privacy':'Owner-authorized local CPU only; originals unchanged; names, images, vectors and case-level scores private.',
              'liveSettingsChanged':False,'paidApiCalls':0}
    write_new(directory/'report.json',report)
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    prep=sub.add_parser('prepare')
    for name in ('labels','frames','inventory','output'): prep.add_argument('--'+name,type=Path,required=True)
    execute=sub.add_parser('run'); execute.add_argument('--directory',type=Path,required=True);execute.add_argument('--models',type=Path,required=True)
    args=parser.parse_args()
    result=prepare(args.labels,args.frames,args.inventory,args.output) if args.command=='prepare' else run(args.directory,args.models)
    print(json.dumps(result))
