#!/usr/bin/env python3
"""
Brisky faster-whisper Transcription Engine
High-performance local transcription with Silero VAD and auto-language detection.
"""

import argparse
import json
import os
import sys
import time

# Auto-link local .venv site-packages so global Python and IDE language servers resolve dependencies
_script_dir = os.path.dirname(os.path.abspath(__file__))
_venv_site_win = os.path.join(_script_dir, ".venv", "Lib", "site-packages")
_venv_site_unix = os.path.join(_script_dir, ".venv", "lib", f"python{sys.version_info.major}.{sys.version_info.minor}", "site-packages")
if os.path.isdir(_venv_site_win) and _venv_site_win not in sys.path:
    sys.path.insert(0, _venv_site_win)
elif os.path.isdir(_venv_site_unix) and _venv_site_unix not in sys.path:
    sys.path.insert(0, _venv_site_unix)


def parse_args():
    parser = argparse.ArgumentParser(description="Transcribe audio using faster-whisper")
    parser.add_argument("--audio", help="Path to audio file (mp3, wav, etc.)")
    parser.add_argument("--serve", action="store_true", help="JSONL requests; reuse one model for this session")
    parser.add_argument("--model", default=os.getenv("WHISPER_MODEL", "base"), help="Whisper model size (tiny, base, small, medium)")
    parser.add_argument("--device", default=os.getenv("WHISPER_DEVICE", "cpu"), help="Inference device (cpu, cuda)")
    parser.add_argument("--compute_type", default=os.getenv("WHISPER_COMPUTE_TYPE", "int8"), help="Compute precision (int8, float16, float32)")
    parser.add_argument("--language", default=os.getenv("WHISPER_LANGUAGE") or None, help="Language code (optional, auto-detected if omitted)")
    parser.add_argument("--task", default=os.getenv("WHISPER_TASK", "transcribe"), choices=["transcribe", "translate"], help="Task (transcribe or translate)")
    parser.add_argument("--vad", action="store_true", default=True, help="Enable Silero Voice Activity Detection filter")
    parser.add_argument("--output", default=None, help="Output JSON file path (prints to stdout if omitted)")
    return parser.parse_args()


def load_model(args):
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise RuntimeError(f"faster-whisper is unavailable: {e}") from e

    # Initialize model (cached in standard huggingface/ctranslate2 cache)
    return WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
        cpu_threads=int(os.getenv("WHISPER_CPU_THREADS", "4")),
    )

def transcribe(model, args, audio):
    if not os.path.isfile(audio):
        raise ValueError("Audio file not found")
    t0 = time.time()
    # Transcribe with Silero VAD filter
    segments_generator, info = model.transcribe(
        audio,
        language=args.language if args.language else None,
        task=args.task,
        vad_filter=args.vad,
        vad_parameters=dict(min_silence_duration_ms=500),
        beam_size=5,
        word_timestamps=False,
    )

    cues = []
    for segment in segments_generator:
        text = (segment.text or "").strip()
        if not text:
            continue
        cues.append({
            "start_time": round(float(segment.start), 2),
            "end_time": round(float(segment.end), 2),
            "text": text,
        })

    duration_ms = int((time.time() - t0) * 1000)

    return {
        "language": getattr(info, "language", args.language or "unknown"),
        "language_probability": round(float(getattr(info, "language_probability", 1.0)), 3),
        "duration_sec": round(float(getattr(info, "duration", 0.0)), 2),
        "inference_duration_ms": duration_ms,
        "model": args.model,
        "cues_count": len(cues),
        "cues": cues,
    }

def serve(args, model_loader=load_model, transcriber=transcribe):
    model = None
    while True:
        line = sys.stdin.readline(8193)
        if not line:
            return
        request_id = None
        try:
            if len(line) > 8192:
                raise ValueError("Whisper request exceeds input limit")
            request = json.loads(line)
            request_id = request["id"]
            audio = request["audio"]
            if not isinstance(request_id, int) or not isinstance(audio, str) or not os.path.isfile(audio):
                raise ValueError("Invalid Whisper request")
            if model is None:
                model = model_loader(args)
            result = transcriber(model, args, audio)
            response = {"id": request_id, "ok": True, "result": result}
        except Exception as error:
            response = {"id": request_id, "ok": False, "error": str(error)}
        print(json.dumps(response, ensure_ascii=False), flush=True)

def main():
    args = parse_args()
    if args.serve:
        serve(args)
        return
    if not args.audio or not os.path.isfile(args.audio):
        sys.stderr.write("Error: audio file not found\n")
        sys.exit(1)
    started = time.time()
    result = transcribe(load_model(args), args, args.audio)
    result["inference_duration_ms"] = int((time.time() - started) * 1000)

    output_json = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output and args.output != "-":
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
