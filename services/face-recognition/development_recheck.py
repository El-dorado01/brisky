"""Descriptive recheck on consumed development footage, never held-out accuracy.

Gallery boxes are owner-labelled enrollment inputs. Probe detection runs on the
whole frame without target boxes; annotations only associate detections afterwards.
Known probes exclude all reference recordings sharing the probe's source ID.
"""
import argparse
from collections import Counter,defaultdict
import json
from pathlib import Path
import time
from extract_sface import SFacePilot,overlap
from robust_sface import RobustSFace
from check_reference import assess


def select_references(rows):
    selected=[];sources=set()
    for row in rows:
        if row['source_id'] not in sources and len(selected)<3:
            selected.append(row);sources.add(row['source_id'])
    for row in rows:
        if len(selected)==3: break
        if row not in selected: selected.append(row)
    return selected


def decision(vector,gallery,threshold=.55,margin=.1):
    if vector is None or not gallery: return None
    scores=sorted(((max(sum(a*b for a,b in zip(vector,r['embedding'])) for r in select_references(refs)),identity) for identity,refs in gallery.items()),reverse=True)
    if scores[0][0]<threshold or (len(scores)>1 and scores[0][0]-scores[1][0]<margin): return None
    return scores[0][1]


def evaluate(engine,samples):
    gallery_rows=[];started=time.perf_counter()
    for sample in samples:
        if sample['identity'] is None: continue
        vector,failure=engine.extract(Path(sample['image']),sample['box'])
        gallery_rows.append({**sample,'embedding':vector,'failure':failure})
    labelled_sources={r['source_id'] for r in gallery_rows}
    source_sets=defaultdict(set)
    for row in gallery_rows: source_sets[row['identity']].add(row['source_id'])
    probe_cache={};cases=[];within=[];unmatched=0;alternatives={cutoff:[] for cutoff in (.4,.45,.55,.65,.75)}
    for sample in samples:
        known=sample['identity'] is not None
        independent=known and bool(source_sets[sample['identity']]-{sample['source_id']})
        same_recording=known and any(r['identity']==sample['identity'] and r['source_id']==sample['source_id'] and r['image']!=sample['image'] for r in gallery_rows)
        if known and not independent and not same_recording: continue
        if not known and sample['source_id'] in labelled_sources: continue
        path=sample['image']
        if path not in probe_cache:
            image=engine.cv.imread(path)
            if image is None: raise ValueError('Probe frame decode failed')
            height,width=image.shape[:2]
            engine.detector.setInputSize((width,height));_,found=engine.detector.detect(image)
            faces=[] if found is None else [f for f in found[:20] if min(f[2],f[3])>=32]
            probe_cache[path]=(image,faces,width,height)
        image,faces,width,height=probe_cache[path]
        assessment=assess(sample['box'],faces,width,height)
        vector=None
        if assessment['status'] in ('ready','adjust_selection'):
            target=assessment.get('suggestedBox',sample['box'])
            face=max(faces,key=lambda f:overlap([f[0]/width,f[1]/height,f[2]/width,f[3]/height],target))
            vector=engine.embedding(engine.recognizer.alignCrop(image,face))
        gallery=defaultdict(list)
        for row in gallery_rows:
            if row['embedding'] is not None and row['source_id']!=sample['source_id']: gallery[row['identity']].append(row)
        predicted=decision(vector,gallery)
        if same_recording:
            local_gallery=defaultdict(list)
            for row in gallery_rows:
                if row['embedding'] is not None and row['image']!=sample['image']:local_gallery[row['identity']].append(row)
            within.append({'identity':sample['identity'],'predicted':decision(vector,local_gallery,.65),'detected':vector is not None})
        if known and not independent:continue
        cases.append({'id':sample['id'],'known':known,'identity':sample['identity'],'predicted':predicted,'extracted':vector is not None,'enrolled':sample['identity'] in gallery if known else bool(gallery)})
        for cutoff in alternatives:
            alternatives[cutoff].append({'known':known,'identity':sample['identity'],'predicted':decision(vector,gallery,cutoff)})
    for path,(_,faces,width,height) in probe_cache.items():
        labels=[s['box'] for s in samples if s['image']==path]
        unmatched+=sum(all(overlap([f[0]/width,f[1]/height,f[2]/width,f[3]/height],label)<.5 for label in labels) for f in faces)
    known=[c for c in cases if c['known']];unknown=[c for c in cases if not c['known']]
    return {'labelledEnrollmentFaces':len(gallery_rows),'usableEnrollmentFaces':sum(r['embedding'] is not None for r in gallery_rows),'enrolledPeople':len({r['identity'] for r in gallery_rows if r['embedding'] is not None}),
            'knownCrossSource':{'labelled':len(known),'detected':sum(c['extracted'] for c in known),'correct':sum(c['predicted']==c['identity'] for c in known),'wrong':sum(c['predicted'] is not None and c['predicted']!=c['identity'] for c in known),'abstainedOrMissed':sum(c['predicted'] is None for c in known)},
            'unknownSeparateSources':{'labelled':len(unknown),'detected':sum(c['extracted'] for c in unknown),'falseMatches':sum(c['predicted'] is not None for c in unknown)},
            'sameRecordingDevelopmentNotIndependent':{'cutoff':.65,'labelled':len(within),'detected':sum(c['detected'] for c in within),'correct':sum(c['predicted']==c['identity'] for c in within),'wrong':sum(c['predicted'] is not None and c['predicted']!=c['identity'] for c in within)},
            'candidateThresholdsDevelopmentOnly':[{ 'cutoff':cutoff,'knownCorrect':sum(c['known'] and c['predicted']==c['identity'] for c in rows),'knownWrong':sum(c['known'] and c['predicted'] is not None and c['predicted']!=c['identity'] for c in rows),'unknownFalseMatches':sum(not c['known'] and c['predicted'] is not None for c in rows)} for cutoff,rows in alternatives.items()],
            'unmatchedPredictedBoxesNotScored':unmatched,'wallSeconds':round(time.perf_counter()-started,3)}, {'gallery':gallery_rows,'cases':cases}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--old-manifest',type=Path,required=True)
    parser.add_argument('--fresh-plan',type=Path,required=True)
    parser.add_argument('--models',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=False)
    samples=[]
    for manifest,prefix in [(args.old_manifest,'old'),(args.fresh_plan,'fresh')]:
        for row in json.loads(manifest.read_text(encoding='utf-8'))['samples']:
            samples.append({**row,'id':prefix+':'+row['id'],'identity':prefix+':'+row['identity'] if row['identity'] is not None else None,'source_id':prefix+':'+row['source_id'],'image':str((manifest.parent/row['image']).resolve(strict=True))})
    reports=[]
    for profile,factory in [('baseline',SFacePilot),('context-v2',RobustSFace)]:
        engine=factory(args.models/'face_detection_yunet_2023mar.onnx',args.models/'face_recognition_sface_2021dec.onnx')
        report,private=evaluate(engine,samples);report['profile']=profile;reports.append(report)
        (args.output/(profile+'.private.json')).write_text(json.dumps(private,allow_nan=False),encoding='utf-8')
        print(json.dumps(report),flush=True)
    summary={'scope':'Consumed development footage; descriptive cross-source recheck, not held-out accuracy or a deployment approval','threshold':.55,'identityMargin':.1,'reports':reports,
             'limits':['Named people with only one recording cannot be known cross-source probes.','Gallery labels guide enrollment; target boxes never guide probe detection.','Unknown probes sharing named enrollment source files are excluded.','Unmatched predictions and seven empty fresh frames are not adjudicated.','Recheck scores all available enrolled identities; live per-person scans use at most 12 competitor reference candidates.']}
    (args.output/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')


if __name__=='__main__': main()
