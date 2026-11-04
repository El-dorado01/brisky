"""Resident local CPU synthesis over bounded JSON lines. No sockets or downloads."""
import argparse
import base64
import contextlib
import json
import os
import sys
import time

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

def emit(value):
    print(json.dumps(value), flush=True)

def memory():
    if os.name != "nt":
        return {}
    import ctypes
    from ctypes import wintypes
    class Counters(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("faults", wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in ("peak", "working", "peakPaged", "paged", "peakNonPaged", "nonPaged", "pagefile", "peakPagefile")]
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    ctypes.windll.kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    ctypes.windll.psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
    if not ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return {}
    return {"workingSetMiB": round(counters.working/1048576), "peakWorkingSetMiB": round(counters.peak/1048576)}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--threads", type=int, choices=range(1,9), default=4)
    args = parser.parse_args()
    started = time.perf_counter()
    with contextlib.redirect_stdout(sys.stderr):
        from prepare_models import prepare
        prepare(args.directory, True)
        import numpy as np
        import torch
        from transformers import AutoTokenizer, VitsModel
        torch.set_num_threads(min(args.threads, os.cpu_count() or 1))
        tokenizer = AutoTokenizer.from_pretrained(args.directory, local_files_only=True, trust_remote_code=False)
        model = VitsModel.from_pretrained(args.directory, local_files_only=True, use_safetensors=True, trust_remote_code=False).eval()
    emit({"type": "ready", "model": "facebook/mms-tts-eng", "sampleRate": 24000, "loadMs": round((time.perf_counter()-started)*1000), **memory()})
    while True:
        line = sys.stdin.buffer.readline(8193)
        if not line:
            break
        identity = None
        try:
            if len(line) > 8192 or not line.endswith(b"\n"):
                raise ValueError("Request bound exceeded")
            request = json.loads(line)
            identity = request.get("id")
            text = request.get("text")
            if not isinstance(identity, str) or len(identity)>80 or not isinstance(text, str) or not 1<=len(text)<=360 or set(request)!={"id","text"}:
                raise ValueError("Invalid synthesis request")
            started = time.perf_counter()
            with torch.inference_mode():
                torch.manual_seed(42)
                waveform = model(**tokenizer(text, return_tensors="pt")).waveform[0].cpu().numpy()
            source_rate = model.config.sampling_rate
            if len(waveform) > source_rate*45:
                raise ValueError("Speech duration exceeds bound")
            # Browser protocol uses PCM16 mono 24 kHz for either provider.
            samples = np.interp(np.arange(round(len(waveform)*24000/source_rate))*source_rate/24000, np.arange(len(waveform)), waveform)
            pcm = (np.clip(samples, -1, 1)*32767).astype("<i2").tobytes()
            emit({"id":identity,"audio":base64.b64encode(pcm).decode("ascii"),"sampleRate":24000,"durationMs":round(len(samples)/24),"synthesisMs":round((time.perf_counter()-started)*1000), **memory()})
        except Exception:
            emit({"id":identity,"error":"Local MMS synthesis could not finish"})

if __name__ == "__main__":
    main()
