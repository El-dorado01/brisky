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
    parser.add_argument("--audio", required=True, help="Path to audio file (mp3, wav, etc.)")
    parser.add_argument("--model", default=os.getenv("WHISPER_MODEL", "base"), help="Whisper model size (tiny, base, small, medium)")
    parser.add_argument("--device", default=os.getenv("WHISPER_DEVICE", "cpu"), help="Inference device (cpu, cuda)")
    parser.add_argument("--compute_type", default=os.getenv("WHISPER_COMPUTE_TYPE", "int8"), help="Compute precision (int8, float16, float32)")
    parser.add_argument("--language", default=os.getenv("WHISPER_LANGUAGE") or None, help="Language code (optional, auto-detected if omitted)")
    parser.add_argument("--task", default=os.getenv("WHISPER_TASK", "transcribe"), choices=["transcribe", "translate"], help="Task (transcribe or translate)")
    parser.add_argument("--vad", action="store_true", default=True, help="Enable Silero Voice Activity Detection filter")
    parser.add_argument("--output", default=None, help="Output JSON file path (prints to stdout if omitted)")
    return parser.parse_args()


def main():
    args = parse_args()

    if not os.path.isfile(args.audio):
        sys.stderr.write(f"Error: audio file not found: {args.audio}\n")
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        sys.stderr.write(f"Error importing faster_whisper: {e}. Ensure faster-whisper is installed in your Python environment.\n")
        sys.exit(2)

    t0 = time.time()

    # Initialize model (cached in standard huggingface/ctranslate2 cache)
    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
        cpu_threads=int(os.getenv("WHISPER_CPU_THREADS", "4")),
    )

    # Transcribe with Silero VAD filter
    segments_generator, info = model.transcribe(
        args.audio,
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

    result = {
        "language": getattr(info, "language", args.language or "unknown"),
        "language_probability": round(float(getattr(info, "language_probability", 1.0)), 3),
        "duration_sec": round(float(getattr(info, "duration", 0.0)), 2),
        "inference_duration_ms": duration_ms,
        "model": args.model,
        "cues_count": len(cues),
        "cues": cues,
    }

    output_json = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output and args.output != "-":
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
