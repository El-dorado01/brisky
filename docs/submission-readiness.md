# Submission readiness under the organizer wording supplied November 4

This records owner-supplied organizer requirements, not an eligibility certification.
The exact statements are retained in the [agent brief](hackathon-agent-brief.md).

## Repository boundary

- [ ] Prepare a fresh public repository created October 26 or later, containing
  only work developed after October 26, 2026, 12:24 PM Eastern (17:24 Lagos).
- [ ] Review file/hunk provenance against the pre-event baseline and actual work
  records; a new repository containing the old engine is not sufficient.
- [ ] Declare every pre-existing/private engine or service the event component
  calls, what it supplies, and what is actually judged as new work.
- [ ] Provide a documented runnable path without private dependencies, using an
  eligible public implementation or explicit synthetic fixture mode. Fixture
  mode must not be presented as live private-engine inference.
- [ ] Keep real .env files, secrets, personal footage, user data, caches, local
  usage journals and private diagnostic artifacts out of the public repository.

Do not delete the development repository or rewrite history to satisfy this rule.
Publishing remains a separate action requiring authorization.

## Current development runtime snapshot — not yet compliant

| Component | Inspected configuration / implementation | Status |
| --- | --- | --- |
| Voice listening | Meta Muse Voice Transcribe | Meta model |
| Voice coordination | Meta Muse Wonder 1.0 trial | Meta model |
| Voice output | Local facebook/mms-tts-eng | Meta model; licence still applies |
| Video understanding | Meta Muse Spark 1.2 | Meta model |
| Main text reasoning | Meta Muse Spark 1.3 | Meta model |
| Embeddings | Gemini configured generally; owner-scoped all-MiniLM-L6-v2 local path | **Blocker: neither is a Meta model** |
| Automatic face recognition | Enabled local YuNet/SFace implementation | **Blocker: non-Meta model weights, despite OpenCV library use** |
| Retained Gemini voice / provider paths | Development alternatives preserved | Must be unreachable in judge runtime; assess exported-code eligibility separately |
| Legacy Whisper / other fallbacks | Present in development code | Audit all runtime reachability; non-Meta paths cannot execute |
| FFmpeg / OpenCV library operations | Media decoding and image operations | Non-model libraries allowed by supplied wording |

This is a targeted inspection, not a completed dependency audit. Manual person
tagging is distinct from automatic face recognition; disabling non-Meta face
inference need not remove manual tagging.

## Required runtime work

- [ ] Trace model calls in every app, worker, subprocess, startup/setup and
  fallback; include cached model-derived features used by the submission.
- [ ] Replace or disable non-Meta embeddings. If no suitable Meta embedding
  option is verified, build an honest lexical + Meta-reranking path; do not
  claim old MiniLM vectors are Meta embeddings. Check retrieval quality.
- [ ] Replace or disable YuNet/SFace inference in the submission profile;
  preserve manual tagging where it works without these models.
- [ ] Verify speech handling uses Meta ASR/MMS only and that no Silero or other
  non-Meta model runs locally. Energy-threshold/audio processing code is not
  itself a trained model.
- [ ] Add fail-closed provider/model checks for the judge configuration, including
  background workers and retained Google/Baseten routes. Baseten is a hosting
  provider; eligibility depends on the exact model called, not the provider name.
- [ ] Separate or regenerate non-Meta cached outputs where needed; never silently
  delete the user's development library to prepare the submission.
- [ ] Supply reproducible setup, synthetic demo data, model provenance, licensing,
  configuration, private-dependency declarations and realistic demo limitations.

The owner-approved development budget remains $30 cumulative. These rules do
not authorize publishing, deleting media, resetting billing records or altering
the development library without a concrete scoped task.

November 4 packaging update: separate public event-component repository prepared at https://github.com/El-dorado01/brisky-meta-hackathon (commit 585d23c). Owner confirmed the exact kickoff cutoff and delegated licence choice; new project code is MIT, third-party code/models retain their own terms. Its default standalone synthetic-fixture runner makes only Meta model calls and needs no private engine. This does not resolve non-Meta embedding/face paths in the original full development product; those remain open before a full integrated Meta-only demo. See that repository's README, PROVENANCE.md and DEPENDENCIES.md for actual included scope and validation.
