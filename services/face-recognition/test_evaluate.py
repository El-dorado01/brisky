import json
import math
import tempfile
import subprocess
import sys
import unittest
from pathlib import Path

from evaluate import decide, evaluate, normalized, rank, validate
from extract_sface import MODELS, SFacePilot, overlap, selection


def fixture():
    samples = []
    for identity, vector in [('a', [1, 0, 0]), ('b', [0, 1, 0])]:
        for index in range(2):
            samples.append({'id': f'{identity}{index}', 'source_id': f'{identity}{index}',
                            'split': 'gallery', 'identity': identity, 'embedding': vector})
    for split in ('calibration', 'test'):
        samples += [{'id': split + '-known', 'source_id': split + '-known', 'split': split,
                     'identity': 'a', 'embedding': [1, 0, 0]},
                    {'id': split + '-unknown', 'source_id': split + '-unknown', 'split': split,
                     'identity': None, 'embedding': [0, 0, 1]}]
    return {'version': 1, 'model': 'synthetic-unit-vectors-not-real-recognition', 'samples': samples}


class EvaluationTests(unittest.TestCase):
    def test_exact_synthetic_matches(self):
        result = evaluate(fixture())
        self.assertEqual(result['test']['correct'], 1)
        self.assertEqual(result['test']['wrong_identity_suggestions'], 0)
        self.assertEqual(result['test']['known_recall'], 1)

    def test_test_labels_and_vectors_do_not_tune_policy(self):
        bundle = fixture()
        before = evaluate(bundle)['policy']
        bundle['samples'][-2]['embedding'] = [0, 1, 0]
        bundle['samples'][-1]['embedding'] = [1, 0, 0]
        result = evaluate(bundle)
        self.assertEqual(result['policy'], before)
        self.assertEqual(result['test']['wrong_identity_suggestions'], 2)
        self.assertEqual(result['test']['unknown_false_accepts'], 1)

    def test_missed_detection_remains_in_known_recall_denominator(self):
        bundle = fixture()
        bundle['samples'][-2].update(embedding=None, failure='no_face_detected')
        result = evaluate(bundle)['test']
        self.assertEqual(result['known'], 1)
        self.assertEqual(result['extraction_failures'], 1)
        self.assertEqual(result['known_recall'], 0)
        self.assertIsNone(result['precision'])

    def test_ambiguous_calibration_abstains_without_testing(self):
        bundle = fixture()
        bundle['samples'][-4]['embedding'] = [1, 1, 0]
        result = evaluate(bundle)
        self.assertIsNone(result['policy'])
        self.assertIsNone(result['test'])

    def test_unknown_calibration_detection_failure_cannot_establish_a_policy(self):
        bundle = fixture()
        bundle['samples'][-3].update(embedding=None, failure='no_face_detected')
        self.assertIsNone(evaluate(bundle)['policy'])

    def test_cli_writes_private_report_without_overwriting_an_existing_report(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'synthetic.json'
            output = Path(folder) / 'report.json'
            source.write_text(json.dumps(fixture()), encoding='utf-8')
            command = [sys.executable, str(Path(__file__).with_name('evaluate.py')),
                       '--embeddings', str(source), '--output', str(output)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(report['test']['correct'], 1)
            self.assertEqual(len(report['input_sha256']), 64)
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(second.returncode, 0)
            self.assertEqual(json.loads(output.read_text(encoding='utf-8')), report)

    def test_two_source_support_prevents_one_outlier_reference(self):
        gallery = fixture()['samples'][:4]
        gallery[0]['embedding'] = [0, 0, 1]
        scores = rank(gallery, {'embedding': [0, 0, 1]})
        self.assertIsNone(decide(scores, 0.5, 0.05))

    def test_same_source_duplicates_do_not_count_as_two_references(self):
        bundle = fixture()
        bundle['samples'][1]['source_id'] = bundle['samples'][0]['source_id']
        with self.assertRaisesRegex(ValueError, 'two distinct sources'):
            validate(bundle)

    def test_ties_abstain_even_with_zero_margin(self):
        self.assertIsNone(decide([('a', 1), ('b', 1)], 0.5, 0))

    def test_source_leakage_is_rejected(self):
        bundle = fixture()
        bundle['samples'][-1]['source_id'] = bundle['samples'][0]['source_id']
        with self.assertRaisesRegex(ValueError, 'Source leakage'):
            validate(bundle)

    def test_image_content_leakage_is_rejected(self):
        bundle = fixture()
        bundle['samples'][0]['image_sha256'] = 'same-image'
        bundle['samples'][-1]['image_sha256'] = 'same-image'
        with self.assertRaisesRegex(ValueError, 'Duplicate image'):
            validate(bundle)

    def test_copied_gallery_image_cannot_count_as_two_recordings(self):
        bundle = fixture()
        for sample in bundle['samples'][:2]:
            sample['image_sha256'] = 'same-image'
        with self.assertRaisesRegex(ValueError, 'Duplicate image'):
            validate(bundle)

    def test_bad_samples_are_rejected(self):
        patches = [{'embedding': [math.nan, 0, 1]}, {'embedding': [0, 0, 0]},
                   {'embedding': [True, 0, 1]}, {'embedding': [0, 1]},
                   {'embedding': None}, {'identity': 'not-enrolled'},
                   {'embedding': [0, 0, 1], 'failure': 'failed'}]
        for patch in patches:
            bundle = fixture()
            bundle['samples'][-2].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                validate(bundle)

    def test_enrollment_and_unknown_probes_are_required(self):
        for split in ('calibration', 'test'):
            bundle = fixture()
            bundle['samples'] = [s for s in bundle['samples'] if not (s['split'] == split and s['identity'] is None)]
            with self.assertRaisesRegex(ValueError, 'known and unknown'):
                validate(bundle)

    def test_model_and_unique_ids_are_required(self):
        bundle = fixture()
        bundle['model'] = ''
        with self.assertRaises(ValueError):
            validate(bundle)
        bundle = fixture()
        bundle['samples'][-1]['id'] = bundle['samples'][0]['id']
        with self.assertRaisesRegex(ValueError, 'Duplicate sample'):
            validate(bundle)


class ExtractorTests(unittest.TestCase):
    def test_normalization(self):
        self.assertEqual(normalized([3, 4]), [0.6, 0.8])

    def test_bad_boxes(self):
        for box in ([], [0, 0, 0, 1], [0.9, 0, 0.2, 1], [0, 0, math.nan, 1], [0, 0, True, 1]):
            with self.subTest(box=box), self.assertRaises(ValueError):
                selection(box)

    def test_annotation_overlap(self):
        self.assertEqual(overlap([0, 0, 1, 1], [0, 0, 1, 1]), 1)
        self.assertEqual(overlap([0, 0, 0.2, 0.2], [0.5, 0.5, 0.2, 0.2]), 0)

    def test_wrong_model_is_rejected_before_loading_dependencies(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'not-a-model.onnx'
            file.write_text('wrong model')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                SFacePilot(file, file)
        self.assertEqual(len(MODELS['recognizer']), 64)


if __name__ == '__main__':
    unittest.main()
