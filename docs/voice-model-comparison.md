# Voice dialogue model comparison — November 4, 2026

This tests event-developed voice dialogue instructions, not the pre-existing
Brisky engine. The active voice coordination trial now selects `muse-wonder-1.0`.
Video understanding remains Spark 1.2; saved-Space reasoning remains its separately
configured model. MMS and ASR are unchanged. Gemini is retained, dormant.

## Measured comparison

Sixteen live calls: eight synthetic text scenarios per model, one sample each.
Both models received identical improved spoken-response instructions, tools and
synthetic history, with alternating model order and minimal reasoning effort.
No personal media, actual library evidence, microphone audio or Space writes.

| Measure | Spark 1.3 | Wonder 1.0 |
| --- | --- | --- |
| Expected tool/no-tool decisions | 6 / 8 | 8 / 8 |
| Median first text or tool delta | 2.047 s | 1.896 s |
| Reported token-cost estimate, eight calls | $0.014988 | $0.041980 |

Scenarios: greeting, new search, pending-search status, completed-search status,
positive confirmation, thanks plus a new search, a two-part explanation, farewell.
The pass rule checks tool choice and nonempty conversational output; it does not
automatically grade factual accuracy, style, argument quality or human preference.
No deterministic acknowledgement/status/farewell guards were applied in this
model-only comparison, to expose differences otherwise masked by application code.

Spark restarted the completed search and omitted `end_call` for the farewell.
Wonder made the expected decisions in these cases. Both acknowledged thanks without
tools and called the media tool for a mixed thanks/new-search request. Wonder's
completed-search response was: “Yes, I did — the clip of someone dancing beside
a kitchen counter, around four to nine seconds in.” This refers to synthetic
evidence provided in the test, not an actual search result.

Both produced multi-sentence explanations when asked. Wonder's was fuller; this is
an editorial observation, not a blinded style score. The prompt now asks for length
appropriate to intent, contractions, clear punctuation and varied sentence rhythm,
instead of usually limiting replies to one or two short sentences.

This small run supports an owner voice trial, not a general superiority claim or
a reliability guarantee. First output is not first audible sound: ASR, actual
tool execution, MMS synthesis, network variation and browser playback are excluded.
Existing interruption, privacy and status guards remain in place.

## Reproduce

Build the API, configure root `.env` credentials and the approved cumulative AI
budget, then run from the repository root:

```sh
node --env-file=.env scripts/evaluate-meta-voice.cjs --run
```

This is a paid opt-in test. It uses the existing append-only usage ledger, with
Wonder pricing added in memory for the comparison. It does not enable a worker
or call the media tools. Raw synthetic outputs and usage are written to
`storage/voice-evaluation/wonder-comparison.json`; another run overwrites that
report but never resets the ledger.

For actual voice use, set `META_VOICE_MODEL=muse-wonder-1.0` and merge the following
entry into `AI_MODEL_PRICING_JSON`, preserving other prices and the budget:

```json
"meta/muse-wonder-1.0": {
  "reservationUsd": 0.25,
  "inputUsdPerMillion": 4,
  "outputUsdPerMillion": 20
}
```

Restart the API and start a new call. To revert the voice model, set
`META_VOICE_MODEL=muse-spark-1.3` and restart. The default in code remains Spark
for hosts without an explicit setting.

Sources checked November 4: [Meta model capabilities](https://dev.meta.ai/docs/models)
and [Standard-mode token pricing](https://dev.meta.ai/docs/pricing-rate-limits).
