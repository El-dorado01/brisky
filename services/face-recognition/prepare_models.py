"""Prepare pinned official OpenCV models, retaining partial transfers for retries."""
import argparse
import hashlib
from pathlib import Path
import time
import urllib.request
from extract_sface import MODELS

MODEL_FILES = (
    ('detector', 'face_detection_yunet', 'face_detection_yunet_2023mar.onnx'),
    ('recognizer', 'face_recognition_sface', 'face_recognition_sface_2021dec.onnx'),
)


def verified(path, role):
    return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == MODELS[role]


def prepare(root, check=False):
    if not check:
        root.mkdir(parents=True, exist_ok=True)
    for role, directory, filename in MODEL_FILES:
        target = root / filename
        if not verified(target, role):
            if check:
                raise ValueError(f'{role} model missing or checksum mismatch; run setup:faces')
            # OpenCV's own mirror supplies the identical pinned ONNX bytes.
            url = f'https://huggingface.co/opencv/{directory}/resolve/main/{filename}'
            partial = target.with_suffix('.download')
            last_error = None
            for attempt in range(4):
                try:
                    offset = partial.stat().st_size if partial.exists() else 0
                    request = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
                    started = time.monotonic()
                    with urllib.request.urlopen(request, timeout=60) as response:
                        resumed = response.status == 206
                        if resumed and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                            raise ValueError('Unexpected model range response')
                        size = offset if resumed else 0
                        with partial.open('ab' if resumed else 'wb') as output:
                            while block := response.read(65536):
                                size += len(block)
                                if size > 50*1024*1024 or time.monotonic()-started > 300:
                                    raise ValueError('Model transfer exceeded its bounds; rerun to resume')
                                output.write(block)
                    if not verified(partial, role):
                        partial.unlink(missing_ok=True)
                        raise ValueError('Model checksum mismatch; unverified bytes discarded')
                    partial.replace(target)
                    last_error = None
                    break
                except (OSError, ValueError) as error:
                    last_error = error
                    if attempt < 3:
                        time.sleep(1)
            if last_error:
                raise RuntimeError(f'{role} download incomplete; rerun setup:faces to resume') from last_error
        notice = root / (role+'-LICENSE.txt')
        if not notice.is_file() or not notice.stat().st_size:
            if check:
                raise ValueError(f'{role} licence notice missing; run setup:faces')
            url = f'https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/{directory}/LICENSE'
            with urllib.request.urlopen(url, timeout=60) as response:
                content = response.read(200000)
            if not content:
                raise ValueError('Empty upstream licence notice')
            notice.write_bytes(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parents[2]/'storage'/'face-models')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    prepare(args.directory, args.check)
    print('Pinned face models and licence notices verified. No media uploaded.')


if __name__ == '__main__':
    main()
