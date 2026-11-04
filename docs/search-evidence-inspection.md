# Search evidence inspection

Implemented 2026-10-26. No Meta adapter or live inference was used to build this feature.

Search retrieves up to 30 candidates by default (separate from the displayed result limit, bounded at 60). Verification begins with five candidates, or eight for detail queries. If none confirms the request, it expands in batches, inspecting at most fifteen candidates per topic. Operational errors stop expansion; missing local evidence can be specific to a candidate, so other candidates may still be inspected. Global paid-inference reservations continue to apply across attempts. Compound searches can have several topics; fifteen is a per-topic limit, not a global per-request ceiling.

Verification receives the original request, not just a rewritten retrieval phrase. A conservative keyword policy recognizes action order and exclusions, routing them to a short video clip. Detail queries extract up to twelve native-resolution samples from the candidate interval. Routine scene verification retains the three-frame path. This routing is a heuristic, not a complete language parser.

The local source resolver checks asset ownership using the current user, then prefers an available original under the configured storage root and otherwise uses its available preview. Real paths are checked to prevent symlink escape. It does not download a cloud master or queue whole-library preview generation. A cloud-only source without a local preview reports insufficient evidence. Source-range connector retrieval is still follow-up work.

Inspection defaults to a maximum twenty-second interval and twenty-five MB of prepared evidence. Windows longer than the limit are not silently truncated; they report insufficient evidence. Extraction is serialized within each API process. Scratch directories are unique per inspection and removed after use, including extraction/verification failures. File-size checks occur after each frame or clip is extracted; they bound accepted evidence, not transient decoder memory or temporary encoder output size.

Sequence timestamps are validated relative to the extracted clip, then translated to absolute source seconds. Confirmed sequence results keep the entire inspected interval so the preceding/following action is not cut away. Frame-based matches can still narrow around a sampled timestamp. Cache identity includes the verification policy version, query, model cascade, evidence bytes, timestamps, and source kind. Repeated searches currently re-extract local evidence before matching its fingerprint; avoiding that CPU work is a later cache optimization.

`verificationEvidenceKind` distinguishes original, preview, and stored-frame evidence in the API. Uninspected candidates are related results with insufficient-evidence status; they cannot become exact matches just because their retrieval scores are high. The UI does not yet present all these statuses distinctly.

Native resolution preserves available pixels but does not recover detail missing from a preview. Twelve sparse samples cannot guarantee capture of every subsecond event. Spatial crops, adaptive frame cadence, neighboring-window expansion, remote source-window retrieval, calibrated match thresholds, full request deadline/cancellation, persistent local embeddings, and real-footage evaluation remain pending. The current 0.5 confidence acceptance threshold is legacy behavior, not a calibrated probability.

Configure `SEARCH_INSPECTION_MAX_SECONDS` (positive, at most sixty) and `SEARCH_INSPECTION_MAX_MB` (positive, at most one hundred) if needed. Do not raise limits before measuring costs and resource use. Paid calls still require explicit model pricing and a positive inference allowance; the local pilot allowance is three dollars, but prices remain unconfigured.

Docker can stay off for isolated tests. Database-backed ownership/retrieval/cache behavior and actual source/media quality require a bounded live validation session before making performance or accuracy claims.
