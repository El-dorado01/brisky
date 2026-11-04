"""Development-only input-size/crop diagnostics. Does not change the live recogniser."""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import tempfile
from extract_sface import SFacePilot, MODELS


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--models',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();manifest=json.loads(args.manifest.read_text(encoding='utf-8'))
    engine=SFacePilot(args.models/'face_detection_yunet_2023mar.onnx',args.models/'face_recognition_sface_2021dec.onnx');cv=engine.cv;reports=[]
    with tempfile.TemporaryDirectory(prefix='preprocessing-',dir=args.output.parent) as temporary:
        image_path=Path(temporary)/'probe.jpg'
        for variant in ('max_side_640','annotated_crop_640'):
            bundle=[];failures=Counter();by_identity=defaultdict(lambda:{'labelled':0,'extracted':0,'sources':set()})
            for sample in manifest['samples']:
                image=cv.imread(str(args.manifest.parent/sample['image']));height,width=image.shape[:2];box=sample['box']
                if variant=='annotated_crop_640':
                    # Box-only preparation; identity labels never influence face selection.
                    x,y,w,h=box
                    left=max(0,math.floor((x-.25*w)*width));top=max(0,math.floor((y-.25*h)*height))
                    right=min(width,math.ceil((x+1.25*w)*width));bottom=min(height,math.ceil((y+1.25*h)*height))
                    image=image[top:bottom,left:right]
                    box=[(x*width-left)/(right-left),(y*height-top)/(bottom-top),w*width/(right-left),h*height/(bottom-top)]
                rows,cols=image.shape[:2];scale=640/max(rows,cols)
                if variant=='max_side_640':scale=min(1,scale)
                image=cv.resize(image,(max(2,round(cols*scale)),max(2,round(rows*scale))))
                cv.imwrite(str(image_path),image)
                vector,failure=engine.extract(image_path,box)
                key=sample['identity'] or 'unknown';row=by_identity[key];row['labelled']+=1
                if vector is not None:row['extracted']+=1;row['sources'].add(sample['source_id'])
                else:failures[failure]+=1
                bundle.append({k:sample[k] for k in ('id','source_id','identity','split')});bundle[-1].update(embedding=vector,failure=failure)
            for row in by_identity.values():row['sources']=sorted(row['sources'])
            report={'variant':variant,'detectorThreshold':.9,'labelledFaces':len(bundle),'extractedFaces':sum(s['embedding'] is not None for s in bundle),'failures':dict(failures),'identities':dict(by_identity)};reports.append(report)
            with (args.output.parent/f'development-embeddings-{variant}.private.json').open('x',encoding='utf-8') as handle:
                json.dump({'version':1,'model':f'opencv-sface:{MODELS["recognizer"]}:yunet:{MODELS["detector"]}:{variant}','stage':'development_only_not_held_out','samples':bundle},handle,indent=2,allow_nan=False)
    with args.output.open('x',encoding='utf-8') as handle:json.dump({'scope':'Development diagnostics; crop variant uses human face boxes and cannot establish automatic detector coverage. No live changes.','results':reports},handle,indent=2)
    print(json.dumps(reports))


if __name__=='__main__':main()
