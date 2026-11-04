# People identity backend

2026-11-01 current pilot update: bounded, user-triggered local face suggestions
and explicit confirmation are implemented. Owner-opted-in archive scanning now
generates review suggestions through the standalone worker; automatic identity
confirmation, voice identity and validated recognition accuracy remain pending.
See [archive API/worker scope](face-archive-processing.md). The tagging dialog now
uses an advisory reference-selection check before saving, with an explicit manual
fallback. Its session-only bridge is documented in
[local face matching](local-face-matching.md). Earlier validation/status statements
below describe the original manual foundation, rather than the full current pilot.

2026-11-01 UI update: the SaaS now has an owner-scoped session bridge and connected
manual teaching UI. See [the teaching workflow](people-teaching-ui.md). The original
developer routes below retain Bearer authentication; SaaS bridge routes use the
separate existing SaaS-session guard.

Status: event-developed manual identity/appearance foundation, confirmed-appearance
search and scoped conversation verification through media search. Automatic face
matching, voice identity and live Meta inference remain unimplemented/unvalidated.
See [conversation scope and evidence requirements](conversation-verification.md).
Existing indexing, object descriptions and search remain pre-existing foundations.

All routes below use the existing API prefix and authenticated Bearer session. The owner
comes from the session, never the request body. No frontend files were changed.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/people` | List owned people |
| POST | `/people` | Create a person |
| PUT | `/people/:id` | Replace name, aliases and self flag |
| DELETE | `/people/:id` | Delete person and cascade their appearances |
| POST | `/people/:id/appearances` | Manually confirm an appearance in owned media |
| GET | `/people/:id/appearances` | List appearances, including rejected ones |
| PATCH | `/people/appearances/:id` | Set status to `confirmed` or `rejected` |
| DELETE | `/people/appearances/:id` | Remove an appearance, undoing the tag |
| POST | `/people/search` | Resolve people and retrieve overlapping confirmed ranges |

Person body (POST or PUT):

```json
{"name":"Uncle Dave","aliases":["my uncle","Dave"],"isMe":false}
```

`name` is required (1-120 characters after trimming). `aliases` defaults to `[]`,
with at most 20 strings of 120 characters each. `isMe` defaults to false. PUT is
replacement, not a partial update. Only one person per owner can be `isMe=true`;
unset the old selection first or receive 409. Aliases and names can be shared by
multiple people; ambiguity resolution is future work, not an arbitrary first match.

Person responses have `id`, `name`, `aliases`, `isMe`, `createdAt`, `updatedAt`.

Appearance body:

```json
{"assetId":"source-asset-id","start_s":12,"end_s":16,"frame_s":13.5,"box":[0.1,0.2,0.25,0.3]}
```

Bounds are seconds in the original source, with
`0 <= start_s <= frame_s < end_s <= 604800`. The source must have known duration
covering the range. `box` is normalized `[x,y,width,height]` in the original
displayed frame at `frame_s`, entirely inside the image. It anchors the selected
person; it does not claim tracking or detection throughout the range. Manual tags
are user assertions, not model-verified evidence of an interaction.

Responses contain `id`, `personId`, `assetId`, `start_s`, `end_s`, `frame_s`, `box`,
`status`, `origin`, `createdAt`, `updatedAt`. Origin is currently always `manual`;
new tags are `confirmed`. PATCH body: `{"status":"rejected"}` or
`{"status":"confirmed"}`. Unknown body fields are rejected. Duplicate submissions
currently create separate tags; clients should not retry POST blindly.

Both list routes accept `limit` (1-100, default 50) and `after` (last UUID).
Responses: `{items,count,hasMore,nextAfter}`. Ordering is UUID ascending, not
chronological. This is a bounded directory traversal, not a snapshot; concurrent
inserts may require a refresh. Rejected appearances remain visible for review and
must not be treated as positive search evidence.

POST returns 201; other successful routes return 200. Invalid input returns 400;
missing sessions 401; absent or inaccessible resources 404. An appearance range
beyond known source duration also returns 404 without distinguishing ownership.
People/appearance tables use composite owner foreign keys and deletion cascades.
The existing server database role and authenticated application queries enforce
access; this milestone does not introduce direct database access or RLS sessions.

## Confirmed-appearance search

Both existing `/media/search` entry points now try local personal-reference resolution
before calling query-understanding or evidence models. Known names and aliases match
whole normalized phrases, case-insensitively, with Unicode normalization. Longer
names take priority over nested labels. This is deterministic matching, not general
language understanding or fuzzy name recognition.

Contextual self references (e.g. `where I was`, `me with`, `with me`, `myself`) use
the explicitly marked self profile. The convenience phrase `find me a red car`
does not add a self constraint. Unknown supported `my uncle`/other family references
request clarification. Arbitrary unknown names are not reliably detected automatically;
use explicit `references` below to require resolution. Relationships are owner-provided
aliases, never inferred from a face or a person's age.

When no references are detected, existing media search continues. Otherwise all
references must resolve before retrieval. Repeated aliases of one person collapse
to one identity constraint. Ambiguous aliases return all owner-scoped candidates
with `identitySearch.status: needs_clarification`, no results and no model fallback.

Use the dedicated endpoint to select candidates or specify reference phrases:

```json
{
  "query": "Find where I was talking to my uncle",
  "references": ["me", "my uncle"],
  "selections": [{"reference":"my uncle","personId":"candidate-uuid-from-clarification"}],
  "limit": 15
}
```

`query` is required (1-2000 characters). `references`, when supplied, must contain
1-8 nonempty phrases of at most 120 characters; these explicitly define which people
to require, without replacing the original query. `selections` has at most 8 distinct
reference/personId pairs. A chosen ID must be an owned candidate for that same phrase;
stale, forged or unrelated choices return 400. Optional `assetId` restricts the source.
`limit` is an integer 1-100, default 15. The dedicated route returns 200 and a search
response without the media endpoint's `query`/`count` wrapper. It has the same 30-second
deadline and disconnect cancellation context as other searches; interrupted work returns
an incomplete response rather than asserting that nobody appears.

Returned `identitySearch` metadata includes references/candidates, resolution status,
`evidenceScope: manual_appearance_overlap`, `queryConditionsVerified: false` and
`hasMore`. `hasMore` means refine by source or raise the bounded limit; there is no
search cursor in this milestone. Resolution fails visibly if the owner has more than
1000 profiles, rather than silently ignoring identities beyond a truncated directory.

Retrieval uses only current, confirmed, manually supplied appearance ranges in owned,
non-offline media, within its current known duration. Every required person must have
a range covering the same instant. The query intersects each person's union of ranges
and merges overlapping/touching result intervals. Sharing a recording at different
times is insufficient; endpoints that merely touch between different people do not
create a positive-duration overlap. Rejected or deleted tags stop contributing on the
next query. No result cache preserves a rejected identity assignment.

Results carry original-source `startTime`/`endTime`, `matchType`/`winningPath: identity`,
and `playbackUrl` pointing to the existing authenticated stream with a media time fragment.
Their `segmentId` starts with `identity:` and identifies a computed result window, not
a persisted `media_segments` row. The legacy `score: 1` is a fixed retrieval rank for
these manual matches, not a recognition probability. No transcript is invented.

This only retrieves user-asserted co-presence. Queries about conversation, actions,
dates or other conditions are **not verified**, even if the people match. Responses
keep `hasExactMatch: false`, `stage2Verified: false`, `matchQuality: related` and
`verificationStatus: insufficient_evidence`. `/people/search` remains retrieval-only.
The existing media search verify phase can now add a separate `conversationVerification`
assessment for conversation queries; it does not claim that other query conditions
were verified. See the conversation contract linked above. Clearly detected exclusions, alternatives, temporal
sequences and spoken-mention ambiguity request clarification instead of assuming
co-presence semantics. This rule-based parser is intentionally limited; it does not
establish that every possible natural-language condition was understood.

## Validation and next steps

On 2026-10-30, all 32 people/OpenAPI tests and API `tsc --noEmit` passed without Docker
or paid calls. Tests cover malformed bounds/boxes, forged fields, missing owners,
conflict handling, pagination and correction admission.

With Docker enabled by the owner on 2026-10-30, rollback-only PostgreSQL checks passed
for new schema block reapplication, cross-owner foreign keys, single-self uniqueness,
invalid face boxes and deletion cascades. A minimal Nest/Fastify app using the real
session guard, people controller/service and PostgreSQL also passed create/list/update/
delete, pagination, timestamp preservation, reject/reconfirm, duplicate-self conflict,
out-of-duration rejection and cross-owner access-denial checks. No workers, Redis or
paid inference were used. Fixtures and schema changes were rolled back.

These checks do not validate the full application startup/migration, concurrent
transactions, browser integration or recognition quality. The people routes are now
included in the served API contract and generated `docs/openapi.json`.

Next: evaluate a recognition model on agreed footage before adding automatic matching.
Docker can stay off during model selection and local design work.

Prepared check: `node scripts/check-people-identities.cjs` with `DATABASE_URL`
provided securely in the process environment. It assumes the existing base schema
is installed, applies the new schema block twice inside a rolled-back transaction,
and checks owner foreign keys, single-self uniqueness, invalid face boxes and person
deletion cascades. It then invokes `scripts/people-http-validation.cjs` for real
authenticated route checks in the same rollback transaction. The helper wraps SQL
statements in savepoints so deliberately rejected writes do not abort the fixture
transaction. Requests are sequential; this does not test concurrent behavior.
The check starts only an in-process fixture HTTP app, not the full API or workers.

The expanded 2026-10-30 PostgreSQL/HTTP checks also passed reference resolution,
union/intersection windows, disconnected intervals, touching endpoints, rejected
bridge tags, bounded-result reporting, ambiguous alias selection, invalid selections,
source filtering, offline-source exclusion and owner isolation. These checks exercise
the dedicated route with real SQL. Local tests exercise the existing media search
integration and model bypass; a full production API/bootstrap or browser session is
not claimed. No workers, paid calls or personal footage were used.

Final local regression run: 80 tests across people CRUD, identity resolution/search,
existing media search integration, OpenAPI inventory/synchronization and scene
verification passed; API `tsc --noEmit` passed.

On Node 22, `node --env-file=.env scripts/check-people-identities.cjs` loads the
connection setting without printing credentials. Only loopback database hosts are
accepted. The script does not make a persistent schema upgrade; normal API startup
will apply the schema through the existing migration mechanism.
