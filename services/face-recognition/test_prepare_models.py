import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import prepare_models as setup


class Response(io.BytesIO):
    status = 206
    headers = {'Content-Range': 'bytes 4-7/8'}


class ModelSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)/'models'
        self.content = b'abcdefgh'
        self.files = patch.object(setup, 'MODEL_FILES', [('detector', 'fixture', 'fixture.onnx')]); self.files.start(); self.addCleanup(self.files.stop)
        self.hashes = patch.dict(setup.MODELS, {'detector': hashlib.sha256(self.content).hexdigest()}); self.hashes.start(); self.addCleanup(self.hashes.stop)

    def test_check_does_not_create_directories_or_access_network(self):
        with patch.object(setup.urllib.request, 'urlopen') as network:
            with self.assertRaises(ValueError): setup.prepare(self.root, check=True)
            self.assertFalse(self.root.exists()); network.assert_not_called()

    def test_complete_setup_is_reusable_without_download(self):
        self.root.mkdir(); (self.root/'fixture.onnx').write_bytes(self.content); (self.root/'detector-LICENSE.txt').write_text('fixture notice')
        with patch.object(setup.urllib.request, 'urlopen') as network:
            setup.prepare(self.root, check=True); setup.prepare(self.root); network.assert_not_called()

    def test_partial_transfer_resumes_and_verifies_before_install(self):
        self.root.mkdir(); (self.root/'fixture.download').write_bytes(b'abcd'); (self.root/'detector-LICENSE.txt').write_text('fixture notice')
        def response(request, **_):
            self.assertEqual(request.get_header('Range'), 'bytes=4-'); return Response(b'efgh')
        with patch.object(setup.urllib.request, 'urlopen', side_effect=response): setup.prepare(self.root)
        self.assertEqual((self.root/'fixture.onnx').read_bytes(), self.content)
        self.assertFalse((self.root/'fixture.download').exists())

    def test_wrong_checksum_is_never_installed(self):
        self.root.mkdir(); (self.root/'detector-LICENSE.txt').write_text('fixture notice')
        with patch.object(setup.urllib.request, 'urlopen', side_effect=lambda *_a, **_k: Response(b'bad')), patch.object(setup.time, 'sleep'):
            with self.assertRaises(RuntimeError): setup.prepare(self.root)
        self.assertFalse((self.root/'fixture.onnx').exists())


if __name__ == '__main__': unittest.main()
