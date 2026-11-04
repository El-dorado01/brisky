"""Meta LASER2 CPU embeddings. Offline model files; no fairseq or non-Meta model.

LASER2 architecture/tokenization follows facebookresearch/LASER's BSD-licensed
LaserLstmEncoder and LaserTokenizer. This adapter is new integration code, not a
claim to have invented or trained LASER. See LICENSE.LASER and model-manifest.json.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import unicodedata

MODEL = "meta-laser2-4f82476d54ff"


def load():
    import torch
    import sentencepiece
    from sacremoses import MosesPunctNormalizer
    directory = Path(os.getenv("META_EMBEDDING_MODEL_DIR", "storage/meta-embeddings"))
    manifest = json.loads((Path(__file__).parent / "model-manifest.json").read_text())
    for name, info in manifest["files"].items():
        with (directory / name).open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != info["sha256"]:
                raise ValueError("LASER model checksum mismatch; run setup:meta-embeddings")
    threads = int(os.getenv("META_EMBEDDING_THREADS", "4"))
    if not 1 <= threads <= 8:
        raise ValueError("Invalid CPU thread count")
    torch.set_num_threads(threads)
    # The pinned official checkpoint contains only tensors and primitive dictionaries.
    state = torch.load(directory / "laser2.pt", map_location="cpu", weights_only=True)
    params = state["params"]
    if params != {"num_embeddings": 50004, "padding_idx": 1, "embed_dim": 320,
                  "hidden_size": 512, "num_layers": 5, "bidirectional": True,
                  "left_pad": True, "padding_value": 0.0}:
        raise ValueError("Unexpected LASER2 architecture")

    class Encoder(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.embed_tokens = torch.nn.Embedding(50004, 320, padding_idx=1)
            self.lstm = torch.nn.LSTM(320, 512, num_layers=5, bidirectional=True)

        def forward(self, tokens):
            # One unpadded sentence at a time: same packed LSTM/max pooling as upstream.
            embedded = self.embed_tokens(tokens).transpose(0, 1)
            packed = torch.nn.utils.rnn.pack_padded_sequence(embedded, [tokens.shape[1]])
            encoded, _ = self.lstm(packed)
            unpacked, _ = torch.nn.utils.rnn.pad_packed_sequence(encoded)
            return unpacked.max(dim=0).values[0]

    encoder = Encoder()
    encoder.load_state_dict(state["model"], strict=True)
    encoder.eval()
    dictionary = state["dictionary"]
    del state
    tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(directory / "laser2.spm"))
    normalizer = MosesPunctNormalizer("en", perl_parity=True)
    normalizer.substitutions[21] = ("‘", '"')
    normalizer.substitutions[22] = ("‚", '"')

    def embed(text):
        clean = "".join(" " if unicodedata.category(c).startswith("C") else c for c in text)
        pieces = tokenizer.encode(normalizer.normalize(clean).lower(), out_type=str)
        if len(pieces) > 8192:
            raise ValueError("Input exceeds token bound")
        chunks = [pieces[i:i+384] for i in range(0, len(pieces), 384)] or [[]]
        vectors = []
        with torch.inference_mode():
            for chunk in chunks:
                tokens = torch.tensor([[dictionary.get(piece, 3) for piece in chunk] + [2]], dtype=torch.long)
                vector = encoder(tokens)
                vectors.append(torch.nn.functional.normalize(vector, dim=0))
            # Long descriptions retain all bounded chunks rather than silently dropping their tail.
            result = torch.nn.functional.normalize(torch.stack(vectors).mean(dim=0), dim=0)
        if result.shape != (1024,) or not torch.isfinite(result).all():
            raise ValueError("Invalid LASER output")
        return result.tolist()

    return embed


def main():
    embed = load()
    for line in sys.stdin:
        request = None
        try:
            if len(line.encode("utf-8")) > 1024*1024:
                raise ValueError("Request bound")
            request = json.loads(line)
            texts = request["texts"]
            if not isinstance(request.get("id"), str) or not 1 <= len(texts) <= 64 or not all(isinstance(t, str) and len(t) <= 20000 for t in texts):
                raise ValueError("Invalid request")
            start = time.perf_counter()
            result = {"id": request["id"], "model": MODEL, "dimensions": 1024,
                      "vectors": [embed(text) for text in texts],
                      "duration_ms": round((time.perf_counter()-start)*1000)}
        except Exception:
            result = {"id": request.get("id") if isinstance(request, dict) else None,
                      "error": "Meta embedding could not finish"}
        print(json.dumps(result, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
