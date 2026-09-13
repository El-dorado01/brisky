#!/usr/bin/env python3
"""
Brisky Local Vector Embedding Engine
High-performance CPU inference via ONNX Runtime & all-MiniLM-L6-v2.
Produces 384-dimensional normalized semantic vectors in ~3ms.
"""

import argparse
import json
import os
import sys
import time
import numpy as np

# Auto-link local .venv site-packages
_script_dir = os.path.dirname(os.path.abspath(__file__))
_venv_site_win = os.path.join(_script_dir, ".venv", "Lib", "site-packages")
_venv_site_unix = os.path.join(_script_dir, ".venv", "lib", f"python{sys.version_info.major}.{sys.version_info.minor}", "site-packages")
if os.path.isdir(_venv_site_win) and _venv_site_win not in sys.path:
    sys.path.insert(0, _venv_site_win)
elif os.path.isdir(_venv_site_unix) and _venv_site_unix not in sys.path:
    sys.path.insert(0, _venv_site_unix)


_SESSION = None
_TOKENIZER = None


def get_model():
    global _SESSION, _TOKENIZER
    if _SESSION is not None and _TOKENIZER is not None:
        return _SESSION, _TOKENIZER

    import onnxruntime as ort
    from tokenizers import Tokenizer
    from huggingface_hub import hf_hub_download

    tok_path = hf_hub_download("sentence-transformers/all-MiniLM-L6-v2", "tokenizer.json")
    model_path = hf_hub_download("Xenova/all-MiniLM-L6-v2", "onnx/model_quantized.onnx")

    tokenizer = Tokenizer.from_file(tok_path)
    tokenizer.enable_padding(direction="right", pad_id=0, pad_token="[PAD]")
    tokenizer.enable_truncation(max_length=256)

    # Configure fast CPU session
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = int(os.getenv("EMBEDDING_THREADS", "4"))
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(model_path, sess_options=opts)

    _SESSION = session
    _TOKENIZER = tokenizer
    return _SESSION, _TOKENIZER


def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    session, tokenizer = get_model()
    clean_texts = [t.strip() or " " for t in texts]
    encodings = tokenizer.encode_batch(clean_texts)

    input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
    attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
    token_type_ids = np.array([e.type_ids for e in encodings], dtype=np.int64)

    outputs = session.run(None, {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "token_type_ids": token_type_ids,
    })

    # Mean pooling
    token_embeddings = np.asarray(outputs[0], dtype=np.float32)  # [batch_size, seq_len, 384]
    input_mask_expanded = np.expand_dims(attention_mask, -1)
    sum_embeddings = np.sum(token_embeddings * input_mask_expanded, axis=1)
    sum_mask = np.clip(np.sum(input_mask_expanded, axis=1), 1e-9, None)
    mean_pooled = sum_embeddings / sum_mask

    # L2 normalize
    norm = np.linalg.norm(mean_pooled, axis=1, keepdims=True)
    normalized = mean_pooled / np.clip(norm, 1e-12, None)

    return normalized.tolist()


def main():
    parser = argparse.ArgumentParser(description="Brisky ONNX Embedding Engine")
    parser.add_argument("--text", help="Single text string to embed")
    parser.add_argument("--batch", help="Path to JSON file containing array of text strings")
    parser.add_argument("--output", help="Optional output JSON file path")
    args = parser.parse_args()

    t0 = time.perf_counter()

    if args.batch:
        if not os.path.isfile(args.batch):
            sys.stderr.write(f"Error: batch file not found: {args.batch}\n")
            sys.exit(1)
        with open(args.batch, "r", encoding="utf-8") as f:
            texts = json.load(f)
        vectors = embed_batch(texts)
    elif args.text is not None:
        vectors = embed_batch([args.text])[0]
    else:
        # Read from stdin
        raw = sys.stdin.read().strip()
        if not raw:
            sys.stderr.write("Error: no text provided via --text, --batch, or stdin\n")
            sys.exit(1)
        try:
            parsed = json.loads(raw)
            texts = parsed if isinstance(parsed, list) else [parsed]
            vectors = embed_batch(texts)
            if not isinstance(parsed, list):
                vectors = vectors[0]
        except json.JSONDecodeError:
            vectors = embed_batch([raw])[0]

    elapsed_ms = (time.perf_counter() - t0) * 1000

    payload = {
        "model": "all-MiniLM-L6-v2",
        "dimensions": 384,
        "duration_ms": round(elapsed_ms, 2),
        "vectors": vectors,
    }

    out_str = json.dumps(payload)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(out_str)
    else:
        print(out_str)


if __name__ == "__main__":
    main()
