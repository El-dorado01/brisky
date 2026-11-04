# Persistent local embeddings and search deadlines

Implemented 2026-10-26 without Docker, model downloads, or paid inference. The active embedding provider was not changed; an existing corpus must be re-embedded deliberately before changing vector models.

## Local worker lifecycle

`LocalEmbeddingService` lazily starts `embed.py --serve`. Requests and responses use newline-delimited JSON and request IDs. The Python process retains the ONNX session and tokenizer between calls. Single and batch requests share the process; Python executes its input stream serially.

The client validates the model name, vector dimension (384), number of vectors, and finite values before returning results. It accepts at most sixty-four texts and one MB of JSON per request, with at most thirty-two outstanding requests. A malformed response, process failure, stalled request, or application shutdown fails pending work instead of silently replaying it. A later independent call can start a clean worker.

The worker shuts down after sixty seconds idle by default, releasing model memory. Request timeout defaults to sixty seconds, including queue time and cold start. Reported local usage duration includes the Node-to-worker round trip, rather than just Python inference. Actual startup/inference speed and quality have not been benchmarked.

When a search expires during local inference, the worker is terminated. Since one process is shared, this also rejects other requests queued on it. They are not silently retried; this is a correctness-first limitation until task-level local cancellation or isolated scheduling is introduced.

Model downloads are disabled by default. `LOCAL_EMBEDDING_ALLOW_DOWNLOAD=true` explicitly permits fetching missing cached model files. The supported local model remains `all-MiniLM-L6-v2`; configuring another name fails explicitly. The tokenizer still truncates at 256 tokens, so text chunking and recall evaluation remain necessary.

If local embeddings are selected, a local failure no longer falls back to a different remote vector space. Search retains its existing lexical fallback; an indexing embedding unit fails and can be retried explicitly.

Settings: `LOCAL_EMBEDDING_TIMEOUT_MS=60000`, `LOCAL_EMBEDDING_IDLE_MS=60000`, `LOCAL_EMBEDDING_ALLOW_DOWNLOAD=false`. The environment example documents these defaults; active `.env` settings were not switched.

## Search deadlines

`SEARCH_DEADLINE_MS` defaults to thirty seconds. Async request context carries an abort signal through nested search operations. Query interpretation has a nested 3.5-second allowance; its old detached timeout race is removed. A completed or expired scope aborts detached continuations so they cannot admit fresh paid attempts.

The Google adapter checks cancellation before reserving each inference attempt, supplies the signal to generation/embedding/upload/poll requests, and cancels retry waits. Evidence extraction checks before starting/continuing work and sends a kill signal to FFmpeg on search expiry. Provider cancellation remains best effort: server-side work may continue and be billed. Reservations therefore remain conservative and unknown charges remain unknown.

An expired API search returns `searchStatus: incomplete`, empty results, and an explanation that this does not prove the requested moment is absent. The existing web search view displays “Search unfinished.” Results already computed during an expired search are not streamed or returned as partial results yet.

This is not a database statement deadline: an already-running PostgreSQL query can continue until the database finishes. Requests queued behind the shared AI semaphore are prevented from starting paid inference after expiry, but queue entries are not immediately removed. HTTP client-disconnect handling is not yet connected to the request scope. These limitations must be addressed before claiming complete end-to-end cancellation.

## Validation

Tests use a real child process running a fixture worker to verify process reuse, concurrent response routing, malformed vectors, crash/restart, idle shutdown, deadlines, and shutdown behavior. A separate Python protocol test stubs `embed_batch`, proving JSONL request handling without loading ONNX or downloading a model. Search tests verify deadline responses, request-context isolation, cancellation of retry waits, and no remote-vector fallback after local failure.

Live database/cache/queue checks and real-footage accuracy/cost evaluation still require a bounded Docker session. They have not been run as part of this implementation.
