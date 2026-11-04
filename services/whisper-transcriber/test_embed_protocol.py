import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch


class EmbeddingProtocolTest(unittest.TestCase):
    def test_worker_survives_bad_request_and_reuses_model_function(self):
        spec = importlib.util.spec_from_file_location("embedding_protocol", Path(__file__).with_name("embed.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        calls = []

        def embed(texts):
            calls.append(texts)
            return [[1.0] + [0.0] * 383 for _ in texts]

        module.embed_batch = embed
        requests = ["{}", json.dumps({"id": "first", "texts": ["a"]}), json.dumps({"id": "second", "texts": ["b", "c"]})]
        output = io.StringIO()
        with patch("sys.stdin", io.StringIO("\n".join(requests))), contextlib.redirect_stdout(output):
            module.serve()
        responses = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertIn("error", responses[0])
        self.assertEqual([r["id"] for r in responses[1:]], ["first", "second"])
        self.assertEqual(len(responses[2]["vectors"]), 2)
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
