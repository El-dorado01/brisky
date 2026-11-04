import contextlib
import io
import json
import os
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
import transcribe


class WhisperProtocolTest(unittest.TestCase):
    def test_model_is_loaded_once_for_multiple_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = os.path.join(directory, "audio.wav")
            with open(audio, "wb") as handle:
                handle.write(b"fixture")
            requests = "".join(json.dumps({"id": index, "audio": audio}) + "\n" for index in [1, 2])
            loader = Mock(return_value=object())
            inference = Mock(return_value={"cues": []})
            output = io.StringIO()
            with patch.object(transcribe.sys, "stdin", io.StringIO(requests)), contextlib.redirect_stdout(output):
                transcribe.serve(types.SimpleNamespace(), loader, inference)
            self.assertEqual(loader.call_count, 1)
            self.assertEqual(inference.call_count, 2)
            self.assertEqual([json.loads(line)["id"] for line in output.getvalue().splitlines()], [1, 2])

    def test_missing_audio_does_not_load_the_model(self):
        loader = Mock()
        output = io.StringIO()
        with patch.object(transcribe.sys, "stdin", io.StringIO('{"id":1,"audio":"missing-file.wav"}\n')), contextlib.redirect_stdout(output):
            transcribe.serve(types.SimpleNamespace(), loader, Mock())
        self.assertFalse(json.loads(output.getvalue())["ok"])
        loader.assert_not_called()


if __name__ == "__main__":
    unittest.main()
