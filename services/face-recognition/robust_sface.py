"""Local v2 enrollment: bounded contextual crops; full-frame multiscale detection.

Manual boxes guide enrollment only. Probe detection never receives a target box.
No model downloads, network calls or changes to the frozen baseline adapter.
"""
import math
from extract_sface import SFacePilot, selection
from detection_views import ViewDetector, suppress
from check_reference import assess

REVISION = 'yunet-sface-context-v2-tiles4'


class ContextDetector:
    def __init__(self, cv, detector):
        self.cv, self.detector = cv, detector
        self.full = ViewDetector(cv, detector, 'native_and_320')
        self.cached_key,self.cached_faces=None,None

    def setInputSize(self, size):
        pass

    def detect(self, image):
        import numpy as np
        _,native=self.full.detect(image)
        key=self.full.cached_key
        if key==self.cached_key:return None,self.cached_faces
        height,width=image.shape[:2]
        faces=[] if native is None else list(native)
        # Fixed overlapping tiles are independent of annotations/identities.
        # They expose more local context for small/off-centre faces while retaining
        # native full-frame detections and source-coordinate landmarks.
        for ox,oy in ((0,0),(.35,0),(0,.35),(.35,.35)):
            left,top=round(ox*width),round(oy*height)
            right,bottom=min(width,left+math.ceil(.65*width)),min(height,top+math.ceil(.65*height))
            crop=image[top:bottom,left:right];ch,cw=crop.shape[:2]
            if min(ch,cw)<32:continue
            scale=min(2.,640/max(ch,cw));resized=self.cv.resize(crop,(max(2,round(cw*scale)),max(2,round(ch*scale))))
            rh,rw=resized.shape[:2];self.detector.setInputSize((rw,rh));_,found=self.detector.detect(resized)
            if found is None:continue
            for face in found[:20]:
                if len(face)!=15 or not all(math.isfinite(float(n)) for n in face):continue
                sx,sy=rw/cw,rh/ch
                mapped=[float(face[0])/sx+left,float(face[1])/sy+top,float(face[2])/sx,float(face[3])/sy]
                for index in range(4,14,2):mapped.extend((float(face[index])/sx+left,float(face[index+1])/sy+top))
                faces.append(mapped+[float(face[14])])
        merged=suppress(faces)
        self.cached_key=key;self.cached_faces=np.asarray(merged,dtype=np.float32) if merged else None
        return None,self.cached_faces


class RobustSFace(SFacePilot):
    def __init__(self, detector, recognizer):
        super().__init__(detector, recognizer)
        self.detector = ContextDetector(self.cv, self.detector)

    def reference_face(self, image, target):
        selection(target)
        height, width = image.shape[:2]
        _, full = self.detector.detect(image)
        faces = [] if full is None else list(full)
        initial=assess(target,faces,width,height)
        if initial['status'] in ('ready','adjust_selection','ambiguous_selection','face_too_small'):
            self.reference_status=initial
            if initial['status'] not in ('ready','adjust_selection'):return None,initial['status']
            import numpy as np
            from extract_sface import overlap
            match_box=initial.get('suggestedBox',target)
            chosen=max(faces,key=lambda f:overlap([f[0]/width,f[1]/height,f[2]/width,f[3]/height],match_box))
            return np.asarray(chosen,dtype=np.float32),None
        # A manually supplied enrollment box can legitimately localize a crop.
        # Context expansion avoids tightly cropping facial landmarks. All pixels and
        # landmarks map back to the original frame before alignment/comparison.
        x,y,w,h = target
        for padding in (.25, .75):
            left=max(0,math.floor((x-w*padding)*width))
            top=max(0,math.floor((y-h*padding)*height))
            right=min(width,math.ceil((x+w*(1+padding))*width))
            bottom=min(height,math.ceil((y+h*(1+padding))*height))
            crop=image[top:bottom,left:right]
            if min(crop.shape[:2])<32: continue
            crop_height,crop_width=crop.shape[:2]
            scale=min(2.,640/max(crop_height,crop_width))
            resized=self.cv.resize(crop,(max(2,round(crop_width*scale)),max(2,round(crop_height*scale))))
            rh,rw=resized.shape[:2]
            detector=self.detector.detector
            detector.setInputSize((rw,rh))
            _, found=detector.detect(resized)
            if found is None: continue
            sx,sy=rw/crop_width,rh/crop_height
            for face in found[:20]:
                if len(face)!=15 or not all(math.isfinite(float(n)) for n in face): continue
                mapped=[float(face[0])/sx+left,float(face[1])/sy+top,float(face[2])/sx,float(face[3])/sy]
                for index in range(4,14,2): mapped.extend((float(face[index])/sx+left,float(face[index+1])/sy+top))
                faces.append(mapped+[float(face[14])])
        import numpy as np
        faces=suppress(faces)
        result=assess(target,faces,width,height)
        self.reference_status=result
        if result['status'] not in ('ready','adjust_selection'): return None,result['status']
        from extract_sface import overlap
        match_box=result.get('suggestedBox',target)
        chosen=max(faces,key=lambda f:overlap([f[0]/width,f[1]/height,f[2]/width,f[3]/height],match_box))
        return np.asarray(chosen,dtype=np.float32),None

    def extract(self, image_path, target_box):
        selection(target_box)
        image=self.cv.imread(str(image_path))
        if image is None: return None,'image_decode_failed'
        if image.shape[0]*image.shape[1]>40_000_000: return None,'image_too_large'
        face,failure=self.reference_face(image,target_box)
        if face is None: return None,failure
        return self.embedding(self.recognizer.alignCrop(image,face)),None
