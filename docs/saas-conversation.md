# Conversational replies in Spaces

Event-developed integration, 2026-10-31. This extends the pre-existing engine's
retrieval and provider/budget infrastructure and the previously added SaaS persistence.
It does not relabel those foundations as new hackathon work.

## What is connected

1. Next.js saves the user's message before requesting a reply.
2. A short PostgreSQL transaction claims that message. Only one reply may run per
   Space. The database connection is released before remote work starts.
3. The SaaS server sends bounded history and selected source ranges to the engine.
   It forwards the HttpOnly session token server-to-server; no model key or engine
   JWT secret is copied into the SaaS environment or sent to browser JavaScript.
4. A dedicated engine integration guard resolves the unexpired, hashed SaaS session
   to its owner. Core developer JWT authentication remains separate.
5. The active model plans whether to search, discuss selected evidence, clarify, or
   respond conversationally. Search queries use the conversation to resolve follow-ups.
6. When needed, the existing owner-scoped verified-search pipeline retrieves candidates.
   The conversation service re-reads original owned index segments within those ranges.
   User notes and old assistant messages are not treated as source evidence.
7. A model-generated answer references allowed evidence IDs. The SaaS checks source
   ownership/ranges again, then atomically saves evidence, assistant text, citations,
   usage metadata and completion state. Citation chips select the saved source moment.

New code: `apps/api/src/modules/conversation/`, provider method `spaceConversation`,
shared policy/parser `pipeline/space-conversation.ts`, `apps/web/server/space-replies-core.ts`,
`engine-reply.ts`, and `apps/web/app/api/spaces/[spaceId]/reply/route.ts`.

## Provider, naturalness and evidence

Baseten is selected for the owner-authorized local pilot, pinned to the sponsor's
Meta model; Google configuration and the separate direct Meta adapter remain available.
Provider adapters use system-level conversation policies and the existing metered request
paths. Every paid attempt must satisfy existing model pricing and budget controls;
there is no unmetered SaaS SDK or canned-answer fallback.

The policy asks for natural, relevant plain-text replies, conversational continuity,
clarifying questions only when useful, and a distinction between evidence and ideas.
The parser rejects malformed responses, invented/duplicate citation IDs, unsupported
phase transitions and evidence-backed answer responses with no citations.

Retrieved evidence is currently labelled **indexed**, even when retrieval used an
engine verification stage. The reply model receives stored transcript/description
text, not original audiovisual media. It must not claim fresh visual or speech
verification. Whole original index ranges supply citation timestamps; partial overlapping
segments are not relabelled as precisely timed quotes. Incomplete searches retain that
status instead of establishing a library-wide negative result.

Reference validation is structural, not proof that every generated sentence follows
from its sources. Prompt-injection resistance, naturalness, semantic faithfulness,
quoted-text accuracy and real retrieval quality need broader evaluation. The later
Baseten pilot provides limited synthetic-text evidence and token cost estimates;
the earlier fixture replies establish plumbing only. See [pilot results](baseten-adapter.md).

## Activation and local setup

`apps/web/.env.local` now has the server-only connection:

```dotenv
BRISKY_ENGINE_URL=http://127.0.0.1:3001
```

Next.js uses port 3000. Run the engine on **3001**, overriding its existing root
`PORT=3000` for that process, when ready for live testing. The engine needs its usual
local infrastructure. Do not start Docker, indexing workers or paid inference merely
to run these fixture checks.

Live conversation generation is opt-in on the engine:

```dotenv
SPACE_REPLIES_ENABLED=false
```

It remains disabled by default. The current local test process overrides it to
`true` for the authorized Baseten pilot, with model pricing and the explicit $3
allowance recorded in the existing ledger. A running engine with the
flag disabled does not generate replies; messages remain saved and retryable.

Schema application, from `frontend`:

```powershell
node --env-file=.env.local scripts/migrate-spaces.cjs
```

The canonical SaaS schema adds distinct transcript/description/evidence fields and
`saas.reply_runs`. It was applied locally. The integration guard currently reads the
shared local `saas.sessions` table; separately hosted databases would need an explicit
authentication delegation design. Do not share engine signing keys to work around that.

## API and recovery

- SaaS: `POST /api/spaces/:id/reply` with `{messageId}`. Session and matching Origin
  are required. Clients cannot provide assistant text, evidence or owner IDs.
- Engine integration: `POST /api/v1/saas-engine/reply`, authenticated with the SaaS
  session by the server. Never expose that token to browser JavaScript.
- Developer engine: `POST /api/v1/conversation/reply`, using the existing developer
  JWT guard. Stateless response; SaaS history persistence is independent.
- Engine context: up to 20 history messages/32,000 total characters, and 20 selected
  ranges. Notes are bounded separately and never used as transcript proof.
- Each source range contributes up to two overlapping original indexed segments;
  at most 20 unique evidence ranges enter a reply, prioritized for source coverage.
- A completed request returns its saved answer on retry without another model call.
  Concurrent requests are refused; new messages wait while a nonexpired claim runs.
- A failed attempt retains the user message and allows manual retry. An expired lease
  cannot publish a late answer. New claims can recover an expired run.
- Engine work has an 80-second overall deadline; SaaS transport has a 95-second
  timeout and a 512 KB response bound; claims expire after two minutes.

The browser automatically asks for a reply for a newly created Space or submitted
follow-up. Reloads restore saved answers and poll an already running job, without
automatically re-running failed inference. A manual retry button handles outages.
Claims are not a background queue: a crash after remote billing but before database
commit can require a second paid attempt on manual retry. Exactly-once provider
billing is not claimed. Unknown outcomes retain existing budget reservations.

Saved citation playback is now connected through the owner-scoped SaaS/engine bridge;
see [playback scope and generated-video validation](saas-source-playback.md).
Generated Studio outputs remain separate work. Citations
select an inspector whose player uses the saved source timestamps.

## Checks performed

- Offline Jest checks for contract validation, Google/Meta adapter routing, engine
  orchestration, source ownership, opt-in activation and session authentication.
- Isolated PostgreSQL tests for assistant/citation persistence, cached completion,
  concurrent claims, failed-engine recovery, foreign citations, expired leases and cascades.
- Real Nest/Fastify route checks against local PostgreSQL and original index rows,
  using fixture search/model providers; cross-owner and expired-session denial.
- Local browser/Next.js checks with a fixture engine restricted to a temporary test
  session: initial answer, follow-up history/shortlist scope, citation chips, refresh
  without regeneration, outage and manual retry. Mobile/desktop screenshots inspected.
- Engine/frontend TypeScript and targeted frontend lint checks.

Commands:

```powershell
# From frontend
node --env-file=.env.local scripts/check-spaces.cjs
# From repository root; real local DB, model/search fixtures only
node --env-file=apps/web/.env.local scripts/check-conversation-http.cjs
```

The checks listed above used no actual model inference, personal footage, email
delivery or indexing worker. All fixture users, sessions, sources and temporary
schemas were cleaned up. Separately, the 2026-10-31 [Baseten adapter pilot](baseten-adapter.md)
performed four real synthetic-text inference requests. A subsequent live browser
check used the actual SaaS/engine/Baseten path: initial greeting, selected-source
follow-up, a saved 10–20 second citation, cached retry and refresh without regeneration
all passed. Temporary users and sources were removed. See [recorded live SaaS output](hackathon-evidence/2026-10-31-baseten-saas-live.json).
The source transcript was synthetic; retrieval, actual media playback and real-footage
accuracy were not tested. The local engine is configured for Baseten testing,
with conversation replies enabled for its current process and workers/polling off.


2026-11-02 UX update: source results live in a dedicated Moments panel rather than
inside the conversation flow. The launcher above the composer shows the saved
moment count. Desktop screens at least 1280px dock the panel beside chat; smaller
screens use a full-screen drawer. Citation cards open/select/play their source
without a second search through the results. The player scrolls within this panel,
leaving chat position intact. Browser autoplay policy can still require native Play.
Simple action matches may refine a wide inspection interval to an independently
verified 8-second clip around the model's timestamp anchor; this is not frame-exact
event boundary detection. Existing saved citation ranges are preserved.


2026-11-02 whole-video narration: sourceMetadata comes from authenticated original
media rows, so original duration remains known even for a short citation. An explicit
whole/full/entire-video narration request with one selected source loads its full
indexed timeline (up to 20 segments), repaired speech and timestamped frame analysis.
Coverage checks distinguish a complete indexed span from gaps; neither means a
model noticed every detail. Replies must not claim a fresh viewing of saved analysis.
Normal conversation keeps selected excerpts scoped. Optional fresh full-source
reinspection is a future background workflow, not an automatic narration cost.

Response actions appear below each assistant response: Copy, browser read-aloud/stop,
and Open cited moments when present. Copy/speech failure states are visible. These
do not regenerate historical replies or persist feedback votes; failed-reply retry
remains the existing separate control.

## Remembered details and search scope (November 4)

A relative clause such as ?a lady that throws something at a hippo? must not
restrict collection search to an old selected clip. Explicit source references
and conversational pronouns still support within-video follow-ups. Collection,
archive, across and all-clips requests remove that implicit source filter.

For imperfect recollection, retrieved evidence retains its exact-query rejection
or uncertainty. The answer may offer one distinctive supported alternative and
name the missing detail; it must not claim an exact/verified match, infer private
identity or silently relax explicit exclusions. Throwing and catching use video
evidence. This is shared engine behavior, independent of selected AI provider.

Validation: 48 targeted tests; live Meta hippo query returned a qualified
watermelon/hippo citation instead of the unrelated prior source. This does not
establish correctness for arbitrary reasoning tasks or exhaustive search recall.
