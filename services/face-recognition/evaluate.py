"""Offline, model-neutral evaluation. Never trains, downloads or calls providers."""
import argparse
import json
import math
from collections import defaultdict
from pathlib import Path


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def normalized(vector):
    if not isinstance(vector, list) or not vector or not all(number(n) for n in vector):
        raise ValueError('Embedding must be a nonempty finite vector')
    norm = math.sqrt(sum(n * n for n in vector))
    if not math.isfinite(norm) or norm <= 1e-12:
        raise ValueError('Embedding norm must be positive and finite')
    return [n / norm for n in vector]


def validate(bundle):
    if not isinstance(bundle, dict) or bundle.get('version') != 1:
        raise ValueError('Expected evaluation bundle version 1')
    if not isinstance(bundle.get('model'), str) or not bundle['model']:
        raise ValueError('Record the exact model/preprocessing identity')
    samples = bundle.get('samples')
    if not isinstance(samples, list) or not samples:
        raise ValueError('samples must be a nonempty list')
    ids, dimensions, sources, images = set(), set(), {}, {}
    for sample in samples:
        if not isinstance(sample, dict):
            raise ValueError('Invalid sample')
        for key in ('id', 'source_id'):
            if not isinstance(sample.get(key), str) or not sample[key]:
                raise ValueError(f'{key} must be a nonempty string')
        if sample['id'] in ids:
            raise ValueError('Duplicate sample id')
        ids.add(sample['id'])
        split = sample.get('split')
        if split not in ('gallery', 'calibration', 'test'):
            raise ValueError('Unknown split')
        identity = sample.get('identity')
        if identity is not None and (not isinstance(identity, str) or not identity):
            raise ValueError('identity must be a nonempty string or null for unknown')
        if 'identity' not in sample or split == 'gallery' and identity is None:
            raise ValueError('Gallery needs labelled identities; probes need explicit identity or null')
        source = sample['source_id']
        if source in sources and sources[source] != split:
            raise ValueError('Source leakage between splits; adjacent frames are not held out')
        sources[source] = split
        image = sample.get('image_sha256')
        if image:
            if image in images and images[image] != (split, source):
                raise ValueError('Duplicate image content across sources or splits')
            images[image] = (split, source)
        vector = sample.get('embedding')
        if vector is None:
            if not isinstance(sample.get('failure'), str) or not sample['failure']:
                raise ValueError('Missing embeddings need an explicit extraction failure')
        else:
            if sample.get('failure') is not None:
                raise ValueError('Successful embeddings cannot also claim extraction failure')
            normalized(vector)
            dimensions.add(len(vector))
    if len(dimensions) != 1:
        raise ValueError('Require one consistent embedding dimension')
    gallery = defaultdict(set)
    for sample in samples:
        if sample['split'] == 'gallery' and sample.get('embedding') is not None:
            gallery[sample['identity']].add(sample['source_id'])
    if len(gallery) < 2 or any(len(sources) < 2 for sources in gallery.values()):
        raise ValueError('Require at least two enrolled people, each supported by two distinct sources')
    for sample in samples:
        if sample['identity'] is not None and sample['identity'] not in gallery:
            raise ValueError('Known probes must have usable enrolled references; mark unenrolled people null')
    for split in ('calibration', 'test'):
        probes = [s for s in samples if s['split'] == split]
        if not any(s['identity'] is None for s in probes) or not any(s['identity'] is not None for s in probes):
            raise ValueError('Calibration and test each need known and unknown probes')
    return samples


def rank(gallery, probe):
    """Score each identity by its second-best distinct-source support, not a centroid."""
    if probe.get('embedding') is None:
        return []
    query = normalized(probe['embedding'])
    by_person = defaultdict(dict)
    for reference in gallery:
        if reference.get('embedding') is None:
            continue
        vector = normalized(reference['embedding'])
        if len(query) != len(vector):
            raise ValueError('Incompatible embedding dimensions')
        score = max(-1.0, min(1.0, sum(a * b for a, b in zip(query, vector))))
        sources = by_person[reference['identity']]
        source = reference['source_id']
        sources[source] = max(sources.get(source, -1.0), score)
    scores = []
    for identity, sources in by_person.items():
        ordered = sorted(sources.values(), reverse=True)
        if len(ordered) >= 2:
            scores.append((identity, ordered[1]))
    return sorted(scores, key=lambda item: (-item[1], item[0]))


def decide(ranking, threshold, margin):
    if not ranking or ranking[0][1] < threshold:
        return None
    if len(ranking) > 1 and (ranking[0][1] == ranking[1][1] or ranking[0][1] - ranking[1][1] < margin):
        return None
    return ranking[0][0]


def metrics(probes, rankings, threshold, margin):
    known = sum(p['identity'] is not None for p in probes)
    unknown = len(probes) - known
    unknown_extracted = sum(p['identity'] is None and p.get('embedding') is not None for p in probes)
    correct = wrong = unknown_accepts = accepted = extracted = 0
    for probe, ranking in zip(probes, rankings):
        extracted += probe.get('embedding') is not None
        prediction = decide(ranking, threshold, margin)
        if prediction is not None:
            accepted += 1
            if prediction == probe['identity']:
                correct += 1
            else:
                wrong += 1
                unknown_accepts += probe['identity'] is None
    return {'samples': len(probes), 'known': known, 'unknown': unknown,
            'extracted': extracted, 'extraction_failures': len(probes) - extracted,
            'accepted': accepted, 'correct': correct, 'wrong_identity_suggestions': wrong,
            'unknown_false_accepts': unknown_accepts,
            'unknown_extracted': unknown_extracted,
            'precision': correct / accepted if accepted else None,
            'known_recall': correct / known if known else None,
            'unknown_false_accept_rate': unknown_accepts / unknown if unknown else None,
            'unknown_false_accept_rate_when_extracted': unknown_accepts / unknown_extracted if unknown_extracted else None,
            'coverage': accepted / len(probes) if probes else None}


def evaluate(bundle):
    samples = validate(bundle)
    gallery = [s for s in samples if s['split'] == 'gallery']
    calibration = [s for s in samples if s['split'] == 'calibration']
    test = [s for s in samples if s['split'] == 'test']
    calibration_ranks = [rank(gallery, p) for p in calibration]
    # Tune only on calibration. No publication threshold or test-set optimization.
    candidates = []
    unknown_available = any(p['identity'] is None and p.get('embedding') is not None for p in calibration)
    for threshold in ([i / 100 for i in range(0, 101, 2)] if unknown_available else []):
        for margin in (0.02, 0.05, 0.1, 0.15, 0.2):
            result = metrics(calibration, calibration_ranks, threshold, margin)
            if result['wrong_identity_suggestions'] == 0 and result['correct'] > 0:
                candidates.append((result['correct'], threshold, margin, result))
    if not candidates:
        return {'version': 1, 'model': bundle['model'], 'policy': None,
                'status': 'no_usable_policy_on_calibration', 'test': None,
                'note': 'Need extracted unknown calibration probes and at least one correct accepted known '
                        'with no wrong suggestions. No test evaluation performed; do not tune on test.'}
    _, threshold, margin, calibration_result = max(candidates, key=lambda c: c[:3])
    test_ranks = [rank(gallery, p) for p in test]
    return {'version': 1, 'model': bundle['model'], 'status': 'evaluation_only_not_deployment_approval',
            'preprocessing': bundle.get('preprocessing'),
            'policy': {'threshold': threshold, 'margin': margin, 'distinct_reference_sources': 2},
            'gallery': {'samples': len(gallery), 'extraction_failures': sum(s.get('embedding') is None for s in gallery)},
            'calibration': calibration_result, 'test': metrics(test, test_ranks, threshold, margin),
            'test_cases': [{'id': probe['id'], 'expected': probe['identity'],
                            'suggested': decide(ranking, threshold, margin),
                            'best_similarity': ranking[0][1] if ranking else None,
                            'runner_up_gap': ranking[0][1] - ranking[1][1] if len(ranking) > 1 else None,
                            'extraction_failure': probe.get('failure')}
                           for probe, ranking in zip(test, test_ranks)],
            'note': 'Finite-sample results only. Missing detections remain in recall denominators. '
                    'Scores are similarities, not probabilities. All output identities remain suggestions.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--embeddings', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    content = args.embeddings.read_bytes()
    report = evaluate(json.loads(content.decode('utf-8')))
    import hashlib
    report['input_sha256'] = hashlib.sha256(content).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(report, output, indent=2, allow_nan=False)
        output.write('\n')
    print('Evaluation report written; not a production accuracy guarantee.')


if __name__ == '__main__':
    main()
