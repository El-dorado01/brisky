"""Explicit, resumable development-model download; no media or inference requests."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import os
import subprocess
import urllib.request


def fetch_range(url, target, start, end, transport='urllib'):
    expected = end - start + 1
    offset = target.stat().st_size if target.exists() else 0
    if offset > expected:
        raise ValueError('Oversized partial model range')
    if offset == expected:
        return
    # Keep signed/CDN cache entries distinct for different ranges and resumptions.
    ranged_url = f'{url}?download=true&range={start + offset}-{end}'
    if transport == 'curl':
        remaining = target.with_name(target.name + '.remaining')
        result = subprocess.run([
            'curl.exe' if os.name == 'nt' else 'curl', '--location', '--fail', '--silent', '--show-error',
            '--range', f'{start + offset}-{end}', '--connect-timeout', '15', '--max-time', '60',
            '--max-filesize', str(expected - offset), '--output', str(remaining),
            '--write-out', '%{http_code}', ranged_url + '&transport=curl',
        ], capture_output=True, text=True, timeout=90,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if result.returncode != 0 or result.stdout != '206':
            raise ValueError('Bounded curl model range failed; rerun to resume completed ranges')
        if remaining.stat().st_size != expected - offset:
            raise ValueError('Curl model range length differs from request')
        with target.open('ab') as output, remaining.open('rb') as source:
            while block := source.read(65536):
                output.write(block)
        remaining.unlink()
        return
    request = urllib.request.Request(ranged_url, headers={'Range': f'bytes={start + offset}-{end}'})
    with urllib.request.urlopen(request, timeout=60) as response:
        expected_range = f'bytes {start + offset}-{end}/'
        if response.status != 206 or not response.headers.get('Content-Range', '').startswith(expected_range):
            raise ValueError('Server did not honor the exact requested model range')
        with target.open('ab') as output:
            while block := response.read(min(65536, expected - offset + 1)):
                if offset + len(block) > expected:
                    raise ValueError('Model range exceeded declared length')
                output.write(block)
                offset += len(block)
    if offset != expected:
        raise ValueError('Incomplete model range; rerun to resume')


def prepare(directory, check=False, connections=4, transport='urllib'):
    definition = json.loads(Path(__file__).with_name('candidate-models.json').read_text())['auraface']
    target = directory / definition['file']
    base = f'https://huggingface.co/{definition["repository"]}/resolve/{definition["revision"]}/'
    if not target.exists():
        if check:
            raise ValueError('Candidate model missing; run prepare_candidate.py explicitly')
        directory.mkdir(parents=True, exist_ok=True)
        # Disjoint ranges avoid restarting a large download on unreliable connections.
        width = 4 * 1024 * 1024
        ranges = [(start, min(start + width, definition['bytes']) - 1)
                  for start in range(0, definition['bytes'], width)]
        parts = [directory / f'{definition["file"]}.bytes-{start}-{end}' for start, end in ranges]
        with ThreadPoolExecutor(max_workers=connections) as pool:
            futures = [pool.submit(fetch_range, base + definition['file'], part, start, end, transport)
                       for part, (start, end) in zip(parts, ranges)]
            for future in futures:
                future.result()
        temporary = target.with_suffix('.assembling')
        with temporary.open('wb') as output:
            for part in parts:
                with part.open('rb') as source:
                    while block := source.read(1024 * 1024):
                        output.write(block)
        with temporary.open('rb') as handle:
            actual = hashlib.file_digest(handle, 'sha256').hexdigest()
        if actual != definition['sha256']:
            temporary.unlink()
            raise ValueError('Candidate checksum mismatch; partial ranges retained for investigation')
        temporary.replace(target)
        for part in parts:
            part.unlink()
    with target.open('rb') as handle:
        actual = hashlib.file_digest(handle, 'sha256').hexdigest()
    if target.stat().st_size != definition['bytes'] or actual != definition['sha256']:
        raise ValueError('Candidate checksum or length mismatch')
    notice = directory / definition['license_file']
    if not notice.exists():
        if check:
            raise ValueError('Publisher licence notice missing')
        with urllib.request.urlopen(base + definition['license_file'], timeout=60) as response:
            content = response.read(definition['license_bytes'] + 1)
        if len(content) != definition['license_bytes'] or b'Apache License' not in content:
            raise ValueError('Unexpected publisher licence notice')
        notice.write_bytes(content)
    if hashlib.sha256(notice.read_bytes()).hexdigest() != definition['license_sha256']:
        raise ValueError('Publisher licence checksum mismatch')
    print('Pinned comparison model and publisher licence present; live models unchanged.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parents[2] / 'storage/face-models/aura-comparison')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--connections', type=int, choices=(1, 2, 4, 8), default=4)
    parser.add_argument('--transport', choices=('urllib', 'curl'), default='urllib')
    args = parser.parse_args()
    prepare(args.directory, args.check, args.connections, args.transport)
