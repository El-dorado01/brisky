# Grounded conversation verification

## 2026-11-01 owner-reviewed real negative excerpt

An owner-approved 10-second two-person excerpt was labelled by the owner as **not an
exchange**. Local offline Whisper produced no cues. The actual contextual adapter,
tested with a fetch guard, returns `insufficient_evidence` with zero outbound calls:
the required two timed cues are missing. No cues or positive labels were fabricated.
One separate direct Meta 1.2 source-analysis request completed with three segments
and empty dialogue fields. This does not constitute a grounded contextual verdict;
incidental details in the model's description were not fact-checked. Positive real
exchange verification remains untested. Cost estimate: $0.0100845 for this single call;
shared allowance accounting afterward: $1.167473 of $10, not an invoice.

`scripts/check-meta-contextual.cjs --manifest <private-review.json>` checks readiness
without network. `--live` requires explicit recorded egress approval, human ground truth
and matching evidence hashes. Contextual mode also requires reviewed participant ranges
and at least two speech cues. The separate `--source-diagnostic` mode runs source analysis
only and records that distinction. Review data, transcript, model prose and results stay
under ignored `storage/face-evaluation/contextual-review-2026-11-01/`.
CLI syntax/default readiness and the no-egress abstention guard passed; no database,
worker, automatic identity confirmation or full browser-flow check was performed.

## 2026-11-01 Baseten contextual bridge

The event-developed contextual verifier now supports the sponsor-pinned Baseten model
when `BASETEN_MEDIA_ENABLED=true`. Local face suggestions still require user review:
only confirmed manual or accepted face-match appearances can anchor this verification.
No identity suggestions are automatically confirmed by the contextual model.

Baseten receives one bounded moving clip, two labelled anchor images and a separately
extracted mono MP3 from that exact clip. Audio duration must agree within 0.5 seconds;
the combined raw evidence remains bounded to 32 MiB and existing serialized-request,
budget and cancellation guards apply. Temporary audio is removed on success/failure.
This follows [Baseten vision/audio guidance](https://docs.baseten.co/inference/model-apis/vision):
video ignores its embedded audio and speech must be supplied separately.

Space answer generation now retains fresh conversation assessments associated with
overlapping owned source evidence, including uncertain/error outcomes and inspected
ranges. Instructions prohibit expanding a supported exchange into independent identity
verification, a whole-segment assertion or satisfaction of other query requirements.
The pre-existing indexing, decoder and search foundations remain unchanged.

Validation: 65 tests pass across four targeted suites, using synthetic bytes and
stubbed provider/decoder responses. Coverage checks
the combined request, source-time conversion, credential/model attribution, media
opt-in, audio alignment, malformed positives, cleanup and scoped answer propagation.
TypeScript checks pass. No paid calls, personal-media transfer, live model accuracy
or full browser flow validation is claimed. Root environment/provider selection is
unchanged; restart/rebuild is needed to load the new code.

Remaining delivery checks include direct Meta access and modality validation, live
contextual behavior, Space/session stability and a repeatable end-to-end demo. Poor
cross-recording face recognition is a separate known limitation, not the only open item.

The historical implementation/validation record below describes the earlier stage.

Implemented 2026-10-30 as event-developed backend work. Gemini remains the active
provider. The dormant Meta adapter implements the same new contract, but no live
Meta or Google calls were made for this change. Existing indexing, decoding,
transcription and general search remain separate foundations, not new event inventions.

## Request and response

The existing media search endpoint retrieves confirmed people appearances first.
For conversation wording and `phase: verify` (the default), it can additionally
assess whether the two labelled people exchange speech in a bounded clip:

```json
{
  "query": "Find where I was talking to my uncle",
  "phase": "verify",
  "assetId": "optional-source-id",
  "people": {
    "references": ["me", "my uncle"],
    "selections": [{"reference":"my uncle","personId":"owned-candidate-uuid"}]
  }
}
```

Send this to `POST /api/v1/media/search` with the existing authenticated session.
`people`, `references`, `selections` and `assetId` are optional. The `people` object
accepts only references/selections, with the same bounded validation and candidate
ownership checks as personal search; it cannot override query, source, owner or limit.
GET media search also uses this path for resolved conversation queries. POST is
needed to submit explicit choices when aliases are ambiguous.

`phase: retrieve` never performs conversation inference. `/people/search` remains
the manual appearance retrieval/clarification endpoint and never initiates this
verification. The media POST response now explicitly uses HTTP 200, matching its
existing published contract; Nest's former implicit 201 was corrected during HTTP QA.

Each retained manual result may gain `conversationVerification`:

- `status`: `supported`, `not_supported`, `uncertain`, `insufficient_evidence` or `error`.
- `scope`: always `conversation_between_tagged_people`.
- `explanation`: what the bounded evidence supports or why no conclusion was reached.
- `turns`: for supported assessments, source-time turn ranges with the owned person ID,
  exact confirmed appearance/anchor ID, transcript observation/cue ID, visible observation
  and `addressesOtherParticipant: true`.
- Optional `issue` and actual provider/model `usage` metadata.

Non-supported assessments have no turns. Results, playable appearance timestamps
and source links remain available when inspection is uncertain, unavailable or fails.
Assessment turn timestamps refer to the original source, not the extracted clip.

**Scope matters:** this evaluates a conversation between the tagged people only.
It does not establish additional date, topic, clothing or other query requirements.
`hasExactMatch` and `stage2Verified` remain false and
`identitySearch.queryConditionsVerified` remains false. A supported assessment is
a grounded model judgment, not a measured accuracy guarantee or a claim that the
whole query is verified. Confidence alone does not authorize a positive result.

## Evidence and policy

`ConversationVerifierService` reuses the existing owner-scoped media preparation
callback. It does not introduce a public file-path API, new source connector or
independent master download. Existing bounded cloud range/staging paths remain in use.

1. Exactly two distinct people must be resolved from current confirmed manual tags.
   Ambiguity, missing identities and ordinary people queries do not trigger inference.
2. For each co-presence candidate, select one current confirmed face annotation per
   person, prioritizing overlap with the candidate. Preserve its normalized face box,
   labelled frame timestamp, owned person ID and appearance range.
3. Include those frame times and two seconds of surrounding context, bounded by source
   duration and `SEARCH_INSPECTION_MAX_SECONDS` (20 seconds by default). Distant anchors
   or long candidates exceeding the bound return insufficient evidence; they are not
   silently shortened or treated as disproven.
4. Require at least two complete, timed transcript observations in that window, with
   owner and asset checks. More than 100 cues is an explicit insufficient-evidence
   case, not a truncated positive. Partial cues at window edges are not used.
5. Prepare the actual moving clip through existing source access. Require original
   evidence, an audio stream and duration agreeing with the source range within
   0.5 seconds. Preview-only, silent or misaligned evidence cannot be supported.
6. Decode each labelled anchor frame from that same clip at its source-relative offset.
   Send the full frame with the exact annotation box/identity mapping, moving video,
   audio and timed transcript metadata. Files are bounded; paths are never put in prompts.
7. Require two or more ordered, non-overlapping, participant-specific turns covering
   both people, with distinct supplied transcript IDs. Each turn must fit within the
   co-presence candidate, its person's tagged range and its cited cue. The model must
   describe visible speaking/response cues addressed to the other participant and
   cross-check transcripts against actual audio. Co-presence, voiceover, background
   speech or transcript text alone is insufficient.
8. Validate output in each adapter and again at the application boundary. Convert
   model-relative timestamps to source time once. Unknown IDs, missing/contradictory
   turns or unsupported times cannot become supported assessments.
9. Re-read the selected annotations and transcript context after inference. Rejection,
   deletion, relabelling or context changes invalidate the assessment. No conversation
   cache is introduced. Completed response snapshots are not permanent identity guarantees.

All nonpositive outcomes remain scoped to this clip, never an assertion that the
requested conversation is absent elsewhere. This initial policy is conservative:
overlapping speech, off-screen participants, distant face references or incomplete
transcripts may abstain. It does not add speaker diarization, voice identification,
automatic face matching or general conversation discovery without people tags.

## Cost, cancellation and cleanup

The default `PEOPLE_CONVERSATION_MAX_CANDIDATES=3` is configurable from 1 to 5.
Remaining candidates retain their appearance results with an inspection-limit reason.
Budget admission failure stops further model attempts for that search. Existing
model pricing, per-attempt reservations, deadlines and disconnect cancellation apply.
No budget or active `.env` setting was changed, and no paid calls were authorized or run.

Conversation payloads have a 32 MiB combined bound; extracted anchor images have a
4 MiB per-frame orchestration bound. Existing clip size/time limits also apply.
Prepared clips/anchor frames are disposed through the existing evidence cleanup,
including unsuccessful assessments. Search progress publishes manual results first
so timeout recovery can retain useful source moments.

Source preparation may still consume CPU or network before model budget rejection;
the model adapter checks admission before outbound inference. The existing shared
ledger is not a provider billing guarantee. Local decoding is not free computation.

## Validation and limits

The final targeted run passed **147 tests** plus API `tsc --noEmit`.
Local tests cover schema invariants, ID/box/time grounding, two-person exchange
requirements, original-vs-preview evidence, silence, malformed provider positives,
stale tags, candidate/budget limits, cleanup, and retrieve/verify routing. Provider
tests use synthetic bytes and stubbed generation/fetch; they do not measure recognition,
speech quality, factual correctness or real model behavior.

The owner enabled Docker for rollback-only PostgreSQL/HTTP validation. The expanded
`scripts/check-people-identities.cjs` invokes `conversation-http-validation.cjs` and
uses real SQL, real session authentication, the real media search controller and
real orchestration. The decoder and model are explicit fixtures. It covers supported
source-time turns, uncertainty, missing audio, stale-tag rejection, selection after
ambiguity, invalid nested fields, owner isolation and scratch cleanup. Fixture database
changes are rolled back. No worker or paid inference process is started.

Real-footage accuracy, speech-boundary effects, original/preview identity fidelity,
live cloud/provider behavior and full application/browser integration remain unverified.
Do not present these checks as proof of actual conversation recognition. See the
[contribution record](hackathon-contributions.md) for exact final test counts.
