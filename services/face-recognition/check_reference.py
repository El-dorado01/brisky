"""Local enrollment geometry check. Suggests a tighter box; never changes a tag."""
import argparse
import json
import math
from pathlib import Path

from extract_sface import MODELS, digest, overlap, selection


def intersection(a,b):
    return max(0,min(a[0]+a[2],b[0]+b[2])-max(a[0],b[0])) * max(0,min(a[1]+a[3],b[1]+b[3])-max(a[1],b[1]))


def assess(target, faces, width, height):
    selection(target)
    candidates=[]
    for face in faces:
        if len(face)!=15 or not all(math.isfinite(float(n)) for n in face): continue
        box=[float(face[0])/width,float(face[1])/height,float(face[2])/width,float(face[3])/height]
        if box[2]<=0 or box[3]<=0: continue
        candidates.append((overlap(box,target),box,face))
    if not candidates: return {'status':'no_face_detected'}
    candidates.sort(key=lambda candidate:candidate[0],reverse=True)
    score,box,face=candidates[0]
    if score>=.5:
        if len(candidates)>1 and score-candidates[1][0]<.1: return {'status':'ambiguous_selection'}
        if min(float(face[2]),float(face[3]))<32: return {'status':'face_too_small'}
        return {'status':'ready'}
    inside=[]
    for _,box,face in candidates:
        cx,cy=box[0]+box[2]/2,box[1]+box[3]/2
        if target[0]<=cx<=target[0]+target[2] and target[1]<=cy<=target[1]+target[3]: inside.append((box,face))
    if len(inside)>1: return {'status':'ambiguous_selection'}
    if len(inside)==1:
        box,face=inside[0]
        area=intersection(box,target)
        if area/(box[2]*box[3])>=.95 and area/(target[2]*target[3])>=.2:
            if min(float(face[2]),float(face[3]))<32: return {'status':'face_too_small'}
            left,top=max(0,box[0]),max(0,box[1])
            right,bottom=min(1,box[0]+box[2]),min(1,box[1]+box[3])
            return {'status':'adjust_selection','suggestedBox':[left,top,right-left,bottom-top]}
    return {'status':'target_not_detected'}


def check(image_path, target, detector_path, recognizer_path=None):
    selection(target)
    if digest(detector_path)!=MODELS['detector']: raise ValueError('Detector checksum mismatch')
    import cv2
    cv2.setNumThreads(2)
    image=cv2.imread(str(image_path))
    if image is None: raise ValueError('Frame could not be decoded')
    height,width=image.shape[:2]
    if width*height>40_000_000: raise ValueError('Frame exceeds pixel limit')
    if recognizer_path is not None:
        from robust_sface import RobustSFace
        engine=RobustSFace(detector_path,recognizer_path)
        engine.reference_face(image,target)
        return engine.reference_status
    detector=cv2.FaceDetectorYN.create(str(detector_path),'',(width,height),.9,.3,5000)
    _,faces=detector.detect(image)
    return assess(target,[] if faces is None else faces,width,height)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--detector',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--recognizer',type=Path)
    args=parser.parse_args()
    manifest=json.loads(args.manifest.read_text(encoding='utf-8'))
    result=check(Path(manifest['image']),manifest['box'],args.detector,args.recognizer)
    with args.output.open('x',encoding='utf-8') as output: json.dump(result,output,allow_nan=False);output.write('\n')
