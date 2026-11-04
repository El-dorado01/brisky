"""Generated-image smoke benchmark; NOT a recognition accuracy or video throughput test."""
import ctypes
import json
import math
from pathlib import Path
import tempfile
import time
from extract_sface import SFacePilot


def peak_memory_mib():
    if __import__('os').name != 'nt':
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    class Counters(ctypes.Structure):
        _fields_ = [('cb', ctypes.c_ulong), ('PageFaultCount', ctypes.c_ulong)] + [
            (name, ctypes.c_size_t) for name in ('PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
    counters = Counters(); counters.cb = ctypes.sizeof(counters)
    ctypes.windll.kernel32.GetCurrentProcess.restype = ctypes.c_void_p
    ctypes.windll.psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
    if not ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return None
    return counters.PeakWorkingSetSize / 1024**2


def main():
    root = Path(__file__).resolve().parents[2]
    models = root / 'storage' / 'face-models'
    start = time.perf_counter()
    engine = SFacePilot(models/'face_detection_yunet_2023mar.onnx', models/'face_recognition_sface_2021dec.onnx')
    startup = time.perf_counter()-start
    cv = engine.cv
    import numpy as np
    with tempfile.TemporaryDirectory(prefix='brisky-face-smoke-') as temporary:
        blank = np.full((720, 1280, 3), 80, dtype=np.uint8)
        image = Path(temporary)/'blank.jpg'; cv.imwrite(str(image), blank)
        _, failure = engine.extract(image, [.1, .1, .4, .4])
        assert failure == 'no_face_detected'
        detection_start = time.perf_counter(); cpu_start = time.process_time()
        for _ in range(24):
            engine.detector.setInputSize((1280, 720)); _, faces = engine.detector.detect(blank)
            assert faces is None
        detection_seconds = time.perf_counter()-detection_start
        detection_cpu = time.process_time()-cpu_start
        # Exercise alignment and feature extraction with deliberately synthetic landmarks.
        # These supplied landmarks are not a successful face detection or identity match.
        synthetic = np.full((112, 112, 3), 128, dtype=np.uint8)
        cv.circle(synthetic, (40, 42), 6, (20,20,20), -1); cv.circle(synthetic, (74,42), 6, (20,20,20), -1)
        landmarks = np.array([20,10,80,100,40,42,74,42,56,60,42,78,72,78,.99], dtype=np.float32)
        feature_start = time.perf_counter()
        vector = engine.recognizer.feature(engine.recognizer.alignCrop(synthetic, landmarks)).reshape(-1)
        assert len(vector) == 128 and all(math.isfinite(float(n)) for n in vector)
        feature_seconds = time.perf_counter()-feature_start
    report = {'date':'2026-11-01','status':'passed','scope':'CPU generated blank frames and supplied synthetic landmarks only; not real-face accuracy, complete scan time or production throughput',
              'opencv':cv.__version__,'threads':cv.getNumThreads(),'modelBytes':sum(p.stat().st_size for p in models.glob('*.onnx')),
              'startupSeconds':round(startup,3),'blank720pFrames':24,'blankDetectionSeconds':round(detection_seconds,3),
              'blankDetectionCpuSeconds':round(detection_cpu,3),'syntheticFeatureSeconds':round(feature_seconds,3),'peakProcessMiB':round(peak_memory_mib() or 0,1),
              'checks':['Pinned model checksums verified','Blank reference rejected','24 blank detections return no faces','Alignment/recognition forward pass yields 128 finite values'], 'noRemoteInference':True}
    output=root/'docs'/'hackathon-evidence'/'2026-11-01-face-runtime.json'
    output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__': main()
