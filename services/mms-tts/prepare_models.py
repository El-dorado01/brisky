"""Explicit setup only: pinned Meta MMS weights, never downloaded at app startup."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import urllib.request

REVISION = "c71de0fe7204c83f1c10820a7d696d0b450048ba"
WEIGHTS_SHA256 = "69cf8b651c1493f1801dfd2311c298d694a38357bc9a1e41f410491ea6f0e1be"
FILES = ("config.json", "model.safetensors", "special_tokens_map.json", "tokenizer_config.json", "vocab.json", "README.md")

def prepare(directory, check=False):
    root = Path(directory).resolve()
    if not check:
        root.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for name in FILES:
        target = root / name
        if not target.is_file() or (name == "model.safetensors" and hashlib.sha256(target.read_bytes()).hexdigest() != WEIGHTS_SHA256):
            if check:
                raise ValueError("Missing or invalid MMS file; run pnpm setup:mms")
            partial = root / (name + ".download")
            for attempt in range(3):
                try:
                    offset = partial.stat().st_size if partial.exists() else 0
                    request = urllib.request.Request(f"https://huggingface.co/facebook/mms-tts-eng/resolve/{REVISION}/{name}", headers={"Range": f"bytes={offset}-"} if offset else {})
                    with urllib.request.urlopen(request, timeout=90) as response:
                        resumed = response.status == 206
                        if resumed and not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
                            raise ValueError("Unexpected range response")
                        size = offset if resumed else 0
                        with partial.open("ab" if resumed else "wb") as output:
                            while block := response.read(262144):
                                size += len(block)
                                if size > 160 * 1024 * 1024:
                                    raise ValueError("MMS file exceeds download bound")
                                output.write(block)
                    if name == "model.safetensors" and hashlib.sha256(partial.read_bytes()).hexdigest() != WEIGHTS_SHA256:
                        partial.unlink()
                        raise ValueError("MMS weight checksum mismatch")
                    partial.replace(target)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(2)
        hashes[name] = hashlib.sha256(target.read_bytes()).hexdigest()
    manifest = root / "brisky-model.json"
    if check:
        saved = json.loads(manifest.read_text("utf8"))
        if saved.get("revision") != REVISION or saved.get("sha256") != hashes:
            raise ValueError("MMS manifest mismatch; rerun setup")
    else:
        manifest.write_text(json.dumps({"model": "facebook/mms-tts-eng", "revision": REVISION, "license": "CC-BY-NC-4.0", "sha256": hashes}, indent=2), "utf8")
    print("Pinned MMS model verified (CC-BY-NC-4.0).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    prepare(args.directory, args.check)
