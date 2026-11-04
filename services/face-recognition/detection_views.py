"""Development-only rotated/scaled views; all detections map back to source pixels."""
import hashlib
import math

from extract_sface import overlap

PLANS = {
    'native': ((0, None),),
    'quarter_turns': tuple((angle, None) for angle in (0, 90, 180, 270)),
    'native_and_640': ((0, None), (0, 640)),
    'native_and_320': ((0, None), (0, 320)),
    'quarter_turns_and_320': ((0, None),) + tuple((angle, 320) for angle in (0, 90, 180, 270)),
    'native_and_padding': ((0, None), (0, 'pad96')),
    'quarter_turns_and_640': tuple((angle, side) for side in (None, 640) for angle in (0, 90, 180, 270)),
}


def inverse_point(x, y, angle, width, height, edges=False):
    """Pixel centers use W-1/H-1; continuous bounding-box edges use W/H."""
    offset = 0 if edges else 1
    w, h = width - offset, height - offset
    if angle == 0: return x, y
    if angle == 90: return y, h - x
    if angle == 180: return w - x, h - y
    if angle == 270: return w - y, x
    raise ValueError('Only quarter-turn rotations are supported')


def source_face(face, angle, width, height, scale_x=1., scale_y=1., padding=0):
    x, y, w, h = map(float, face[:4])
    corners = [inverse_point(a, b, angle, width, height, True)
               for a, b in ((x, y), (x + w, y), (x, y + h), (x + w, y + h))]
    left, right = min(p[0] for p in corners), max(p[0] for p in corners)
    top, bottom = min(p[1] for p in corners), max(p[1] for p in corners)
    mapped = [left / scale_x - padding, top / scale_y - padding, (right - left) / scale_x, (bottom - top) / scale_y]
    for index in range(4, 14, 2):
        a, b = inverse_point(float(face[index]), float(face[index + 1]), angle, width, height)
        mapped.extend((a / scale_x - padding, b / scale_y - padding))
    return mapped + [float(face[14])]


def suppress(faces, threshold=.3):
    selected = []
    for face in sorted(faces, key=lambda row: row[14], reverse=True):
        if all(overlap(face[:4], previous[:4]) <= threshold for previous in selected):
            selected.append(face)
    return selected


class ViewDetector:
    def __init__(self, cv, detector, plan):
        if plan not in PLANS: raise ValueError('Unknown detection view plan')
        self.cv, self.detector, self.plan = cv, detector, plan
        self.cached_key, self.cached_faces = None, None
        self.inference_views = 0

    def setInputSize(self, size):
        # Each view sets its actual dimensions immediately before detection.
        pass

    def detect(self, image):
        import numpy as np
        key = (image.shape, hashlib.sha256(image.tobytes()).digest())
        if key == self.cached_key:
            return None, self.cached_faces
        cv = self.cv
        height, width = image.shape[:2]
        faces = []
        for angle, side in PLANS[self.plan]:
            padding = 96 if side == 'pad96' else 0
            source = cv.copyMakeBorder(image,padding,padding,padding,padding,cv.BORDER_CONSTANT,value=0) if padding else image
            source_height, source_width = source.shape[:2]
            scale = min(1., side / max(width, height)) if isinstance(side,int) else 1.
            cols, rows = max(2, round(source_width * scale)), max(2, round(source_height * scale))
            resized = cv.resize(source, (cols, rows)) if (cols, rows) != (source_width, source_height) else source
            view = resized if angle == 0 else cv.rotate(resized, {
                90: cv.ROTATE_90_CLOCKWISE, 180: cv.ROTATE_180, 270: cv.ROTATE_90_COUNTERCLOCKWISE}[angle])
            cv_height, cv_width = view.shape[:2]
            self.detector.setInputSize((cv_width, cv_height))
            _, found = self.detector.detect(view)
            self.inference_views += 1
            if found is None: continue
            for face in found[:100]:
                if len(face) != 15 or not all(math.isfinite(float(n)) for n in face): continue
                mapped = source_face(face, angle, cols, rows, cols / source_width, rows / source_height, padding)
                if mapped[2] > 0 and mapped[3] > 0: faces.append(mapped)
        merged = suppress(faces)
        self.cached_key = key
        self.cached_faces = np.asarray(merged, dtype=np.float32) if merged else None
        return None, self.cached_faces


def matched_labels(predictions, labels, cutoff=.5):
    """Maximum-cardinality box matching; one prediction cannot explain two labels."""
    edges = [[j for j, label in enumerate(labels) if overlap(prediction, label) >= cutoff]
             for prediction in predictions]
    owners = {}
    def assign(index, visited):
        for label in edges[index]:
            if label in visited: continue
            visited.add(label)
            if label not in owners or assign(owners[label], visited):
                owners[label] = index
                return True
        return False
    for index in range(len(edges)): assign(index, set())
    return set(owners)
