"""Publish anonymous development comparisons only after checking private inputs agree."""
import argparse
import json
from pathlib import Path

from compare_recognizers import aligned_cases, DEFINITION
from development_report import diagnostic
from extract_sface import digest


def report(directory):
    bundles, summaries, hashes = {}, {}, {}
    for variant in ('sface', 'auraface'):
        path = directory / f'comparison-{variant}.private.json'
        bundles[variant] = json.loads(path.read_text(encoding='utf-8'))
        summaries[variant] = json.loads((directory / f'comparison-{variant}-summary.json').read_text(encoding='utf-8'))
        hashes[variant] = digest(path)
        if bundles[variant]['model'] != summaries[variant]['model']:
            raise ValueError('Summary model identity differs from private bundle')
    if summaries['sface']['manifestSha256'] != summaries['auraface']['manifestSha256']:
        raise ValueError('Comparison manifests differ')
    aligned_cases(bundles['sface']['samples'], bundles['auraface']['samples'])
    shared_keys = ('opencv', 'alignment', 'detectorThreshold')
    if any(bundles['sface']['preprocessing'][key] != bundles['auraface']['preprocessing'][key] for key in shared_keys):
        raise ValueError('Detector/runtime/alignment differs; cannot isolate recognizer')
    variants = []
    for variant in ('sface', 'auraface'):
        bundle, summary = bundles[variant], summaries[variant]
        rows = [diagnostic(bundle['samples'], cutoff) for cutoff in (.2, .3, .363, .45, .55)]
        if rows != summary['diagnostics']:
            raise ValueError('Saved diagnostics do not reproduce private embeddings')
        variants.append({'variant': variant, 'model': bundle['model'], 'preprocessing': bundle['preprocessing'],
                         'labelledFaces': len(bundle['samples']),
                         'extractedFaces': sum(s['embedding'] is not None for s in bundle['samples']),
                         'developmentCutoffSweep': rows, 'timing': summary['timing']})
    return {'date': '2026-11-01', 'status': 'development_comparison_only_no_live_switch',
            'candidatePublisher': DEFINITION['source'], 'candidateRevision': DEFINITION['revision'],
            'candidateModelBytes': DEFINITION['bytes'], 'license': DEFINITION['license'],
            'inputHashes': hashes, 'manifestSha256': summaries['sface']['manifestSha256'],
            'variants': variants,
            'checks': ['Matching sample IDs, identity labels, source files, image hashes and extraction outcomes',
                       '128-dimensional SFace and 512-dimensional AuraFace vectors kept separate',
                       'Identical OpenCV/alignment/detector settings', 'Cutoff sweeps reproduced from private embeddings'],
            'scope': 'Previously inspected development frames; deterministic single-file gallery; gallery files excluded from probes. No recording-level held-out accuracy claim.',
            'timingLimitations': 'One fresh-process run per variant on the same host; timings include CPU inference and image reads, exclude video decode/download. Background load and first-run effects are not controlled.',
            'privacy': 'No names, images, case-level scores or biometric vectors in this artifact. Local CPU inference only; no paid API calls.',
            'liveChange': False, 'formalHeldOutEvaluation': 'pending_fresh_independent_recordings'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = report(args.directory)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(result, output, indent=2, allow_nan=False)
        output.write('\n')
    print('Anonymous comparison written after checking private inputs; live settings unchanged.')
