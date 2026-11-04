from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from compare_recognizers import aligned_cases, arcface_input
from prepare_candidate import fetch_range


class ComparisonTests(unittest.TestCase):
    def test_arcface_normalization_preserves_bgr_until_opencv_channel_swap(self):
        import numpy as np
        image = np.array([[[0, 127, 255]]], dtype=np.uint8)
        actual = arcface_input(image)
        np.testing.assert_allclose(actual, [[[-1., -0.5 / 127.5, 1.]]], atol=1e-7)
        self.assertEqual(actual.dtype, np.float32)
        np.testing.assert_array_equal(image, [[[0, 127, 255]]])

    def test_comparison_rejects_changed_labels_or_mixed_vector_spaces(self):
        old = {'id': 'a', 'source_id': 'recording', 'identity': 'p1', 'split': 'unassigned', 'image_sha256': 'a' * 64, 'failure': None, 'embedding': [1.] * 128}
        new = {**old, 'embedding': [1.] * 512}
        aligned_cases([old], [new])
        with self.assertRaisesRegex(ValueError, 'ground truth'):
            aligned_cases([old], [{**new, 'identity': None}])
        with self.assertRaisesRegex(ValueError, 'ground truth'):
            aligned_cases([old], [{**new, 'image_sha256': 'b' * 64}])
        with self.assertRaisesRegex(ValueError, 'dimension'):
            aligned_cases([old], [old])
        with self.assertRaisesRegex(ValueError, 'outcomes'):
            aligned_cases([old], [{**new, 'embedding': None, 'failure': 'no_face_detected'}])

    def test_resumed_range_verifies_server_offset_before_appending(self):
        class Response:
            status = 206
            headers = {'Content-Range': 'bytes 12-15/100'}
            body = b'cdef'
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, count):
                chunk, self.body = self.body[:count], self.body[count:]
                return chunk
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'range'
            target.write_bytes(b'ab')
            with patch('prepare_candidate.urllib.request.urlopen', return_value=Response()) as opened:
                fetch_range('https://example.invalid/model', target, 10, 15)
                self.assertEqual(opened.call_args.args[0].get_header('Range'), 'bytes=12-15')
            self.assertEqual(target.read_bytes(), b'abcdef')
            target.write_bytes(b'ab')
            bad = Response()
            bad.headers = {'Content-Range': 'bytes 0-3/100'}
            with patch('prepare_candidate.urllib.request.urlopen', return_value=bad):
                with self.assertRaisesRegex(ValueError, 'exact requested'):
                    fetch_range('https://example.invalid/model', target, 10, 15)
            self.assertEqual(target.read_bytes(), b'ab')

    def test_curl_resumption_requires_partial_response_and_exact_length(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'range'
            target.write_bytes(b'ab')
            def transferred(command, **kwargs):
                Path(command[command.index('--output') + 1]).write_bytes(b'cdef')
                self.assertEqual(command[command.index('--range') + 1], '12-15')
                self.assertEqual(command[command.index('--max-filesize') + 1], '4')
                return SimpleNamespace(returncode=0, stdout='206')
            with patch('prepare_candidate.subprocess.run', side_effect=transferred):
                fetch_range('https://example.invalid/model', target, 10, 15, 'curl')
            self.assertEqual(target.read_bytes(), b'abcdef')
            target.write_bytes(b'ab')
            with patch('prepare_candidate.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout='200')):
                with self.assertRaisesRegex(ValueError, 'failed'):
                    fetch_range('https://example.invalid/model', target, 10, 15, 'curl')
            self.assertEqual(target.read_bytes(), b'ab')


if __name__ == '__main__':
    unittest.main()
