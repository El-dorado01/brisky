"""Development-only detector diagnostics on reviewed labels, never a held-out score."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
from extract_sface import SFacePilot, MODELS, overlap


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--models',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    manifest=json.loads(args.manifest.read_text(encoding='utf-8'))
    engine=SFacePilot(args.models/'face_detection_yunet_2023mar.onnx',args.models/'face_recognition_sface_2021dec.onnx')
    samples=manifest['samples'];reports=[]
    for threshold in (.9,.75,.6):
        engine.detector=engine.cv.FaceDetectorYN.create(str(args.models/'face_detection_yunet_2023mar.onnx'),'',(320,320),threshold,.3,5000)
        failures=Counter();by_identity=defaultdict(lambda:{'labelled':0,'extracted':0,'sources':set()});bundle=[]
        for sample in samples:
            image=args.manifest.parent/sample['image']
            vector,failure=engine.extract(image,sample['box'])
            key=sample['identity'] or 'unknown';row=by_identity[key];row['labelled']+=1
            if vector is not None:row['extracted']+=1;row['sources'].add(sample['source_id'])
            else:failures[failure]+=1
            bundle.append({k:sample[k] for k in ('id','source_id','identity','split')})
            bundle[-1].update(embedding=vector,failure=failure)
        for row in by_identity.values():row['sources']=sorted(row['sources'])
        report={'threshold':threshold,'labelledFaces':len(samples),'extractedFaces':sum(s['embedding'] is not None for s in bundle),'failures':dict(failures),'identities':dict(by_identity)}
        reports.append(report)
        target=args.output.parent/f'development-embeddings-{threshold}.private.json'
        with target.open('x',encoding='utf-8') as handle:json.dump({'version':1,'model':f'opencv-sface:{MODELS["recognizer"]}:yunet:{MODELS["detector"]}:detector-{threshold}','stage':'development_only_not_held_out','samples':bundle},handle,indent=2,allow_nan=False)
    with args.output.open('x',encoding='utf-8') as handle:json.dump({'version':1,'scope':'Development diagnostics only; same labelled data used across presets; no production threshold selected','results':reports},handle,indent=2)
    print(json.dumps(reports))


if __name__=='__main__':main()
