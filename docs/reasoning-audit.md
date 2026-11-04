# Conversation and search reasoning audit — November 4, 2026

Scope: independent inspection of request routing, selected-source scope, query
rewrites, retrieval-to-answer evidence, source metadata, uncertainty, exclusions,
citation contracts, voice coordination and Studio grounding. This is an audit of
the event-developed orchestration around the pre-existing engine, not a claim
that all model reasoning is correct. Shared fixes apply to every provider;
live inference checks used Meta, not Gemini/Baseten.

## Concrete defects addressed

| Gap | Change and regression coverage |
| --- | --- |
| Relative “that” restricted a new subject to an old selected video | Bare relative clauses and generic “video/clip” words no longer scope searches. Genuine source references remain scoped; explicit collection searches widen scope. |
| Broadening words overrode explicit local scope | “Find another hug in this clip” now stays in the selected source despite “another”. |
| Previous results contaminated a new answer | After retrieval, only current returned evidence enters the answer. Empty/new searches cannot reuse the old selected excerpt as a result. |
| Old duration metadata followed a new search | Re-read current result sources with authenticated owner filtering; discard old source metadata when retrieval is empty. |
| Whole-source narration bypassed a new search request | The narration shortcut no longer intercepts requests to find another video. |
| Literal “find/search” forced lookups for thanks or product questions | Whole-utterance usage questions and acknowledgements no longer force retrieval. Mixed messages containing an actual request still search. The model still handles natural reply wording. |
| A retrieval rewrite could become the only verification question | Forward both resolved retrieval query and original user request to verification, including compound subqueries. Original exclusions/requirements stay visible. |
| Imperfect recollection was treated as an exact-match-or-nothing choice | Retain negative/insufficient query assessments. The answer can offer one distinctive supported alternative while naming the unsupported detail; explicit requirements/exclusions must not be silently relaxed. |
| Throw/catch motion could be inspected as stills | Throwing, tossing, catching and feeding now select bounded moving-video evidence. |

## Checks performed

- 120 deterministic tests passed across ten suites: conversation/answer contracts,
  query parsing, search evidence, original-request forwarding, people search,
  cancellation/resource handling, voice coordination and Studio. These tests
  cover particular behaviors, not overall product accuracy.
- API TypeScript build passed.
- Replayed the owner's exact hippo query with the prior training-field source
  selected. Meta returned the hippo/watermelon clip as a possible match and
  explicitly stated that the thrower's gender could not be established. The
  response retained incomplete coverage instead of claiming an exhaustive match.
- Five generated-only live Meta checks passed: strict gender requirement yielded
  no citation; instruction-like transcript text was ignored; unrelated evidence
  was not cited; an incomplete empty search did not repeat an old assistant's
  invented library inventory; usage questions and thanks stayed conversational.
- Aggregate database inspection showed all 32 indexed development segments had
  current Meta LASER2 vectors. Missing vector migration was not the hippo failure.

The generated live fixtures are reproducible, explicitly opt-in, and retain the
normal cumulative budget ledger:

```sh
pnpm build:api
node --env-file=.env scripts/check-reasoning-live.cjs --live
```

This command makes paid Meta requests. It does not upload personal footage or
modify Spaces. Without `--live` it only prints usage. No test resets the ledger.

## Remaining risks and acceptance work

- This is a small evaluation set, not proof against all paraphrases, languages,
  ambiguous pronouns, hallucinations or instruction injection. Prompt adherence
  and semantic correctness remain probabilistic; valid citation IDs alone do
  not establish that every generated sentence is supported.
- Query understanding still has a short 3.5-second deadline and has timed out in
  observed searches. Original-text fallback remains available; deadline/provider
  latency tuning needs measurement rather than an untested larger timeout.
- LASER candidate thresholds are retrieval heuristics, not calibrated relevance
  probabilities. Recall with synonyms and rare scenes needs a broader labelled
  benchmark. Verification cannot recover a candidate retrieval never found.
- Incomplete searches must not be presented as exhaustive absence. New UI/model
  changes must retain that distinction, including budget-blocked verification.
- Tight event onset/offset, identity attribution, multi-person references and
  cross-recording comparisons need separate grounded examples. Automatic face
  recognition remains disabled in the Meta-only profile.
- Live provider equivalence was not tested for Gemini or Baseten. The shared
  code fix is provider-independent; model outputs need their own evaluation.

No model was added merely to claim improved intelligence. The corrections keep
the model supplied with the right scope, current evidence and original request,
while preserving uncertainty instead of concealing it.

## Follow-up: source reasoning and conversation styles

Extended the shared engine beyond simple clip lookup. A request to explain a
selected tutorial, compare selected recordings or ask what happened next can
read broader indexed source context. Evidence is bounded to 20 items globally,
allocated across sources rather than exhausting the budget on the first one.
Each source keeps its own duration, selected excerpt anchors and coverage flag.
An omitted later section makes that source incomplete; it is not evidence that
the recording never contained the step/event. Explicit excerpt-only requests
stay narrow. New described topics do not silently become a review of an old
selected video, including relative clauses containing ?that?.

Answer instructions now distinguish source facts from proposed questions and
ideas, meeting proposals from final decisions, observable sequence from cause,
and a user's search correction from proof about the footage. Rewriting or
translating an earlier response preserves uncertainty and does not itself
request a new search, even if the text contains ?find? or ?search?. Mixed
rewrite-plus-search requests still reach retrieval. Ambiguous singular source
references should prompt clarification instead of guessing among recordings.

Five additional generated-only live Meta cases passed: shortening preserved
uncertainty; two meeting proposals did not become an agreement; a dropped cup
followed by laughter did not establish causation; general family-memory
brainstorming worked without pretending to inspect footage; an ambiguous
singular clip reference produced a clarification. Rephrasing legitimately used
plan=answer followed by the answer phase. The harness now follows that workflow
rather than incorrectly requiring every edit to finish during planning.

Run just those extra generated cases with:

```sh
node --env-file=.env scripts/check-reasoning-live.cjs --live --styles
```

These are small adversarial examples, not an overall reasoning-accuracy score.
The 20-item context budget, source indexing gaps, ambiguous active-video context
when several moments are selected, and model phrasing still need broader user
acceptance. No UI was redesigned and no extra personal media was uploaded.
