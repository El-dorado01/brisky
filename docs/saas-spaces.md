# SaaS Spaces, messages and shortlists

Event-developed persistence in the Next.js app. The pre-existing Brisky media engine
and its public developer API remain separate. This work uses the previously added
`saas` tables and shared owner IDs from `public.users`; it does not introduce another
API server or change model providers.

## Local setup

Use the existing private `apps/web/.env.local` settings: `SAAS_DATABASE_URL` and
`SAAS_AUTH_SECRET`. No new keys are needed. PostgreSQL must be running; the engine
server, workers, SMTP delivery and paid inference are not required for Spaces CRUD.
The engine users/media schema and SaaS authentication migration must already exist.

From `frontend`:

```powershell
node --env-file=.env.local scripts/migrate-spaces.cjs
node --env-file=.env.local scripts/check-spaces.cjs
```

The migration is local-only and applies the canonical
`apps/api/src/modules/database/saas-schema.sql` under the shared migration lock.
The check creates and removes an isolated temporary schema, including source fixtures.

## API

All routes require the SaaS session cookie. JSON responses disable caching. Every
mutation requires a matching Origin; JSON bodies have byte limits. User IDs are
derived from the session, never accepted from the client. Unknown fields are rejected.

| Route | Behavior |
| --- | --- |
| `GET /api/spaces?before=<space UUID>` | Up to 50 spaces, immutable creation order, `nextCursor` |
| `POST /api/spaces` | `{id,query,title?}`; create space and first user message atomically |
| `GET /api/spaces/:id` | Consistent snapshot of space, ordered messages, source moments and shortlist IDs |
| `PATCH /api/spaces/:id` | `{title?,pinned?}` |
| `DELETE /api/spaces/:id` | Cascade messages, moments and shortlist; retain library files |
| `POST /api/spaces/:id/messages` | `{id,content}`; append a user message |
| `GET /api/spaces/:id/sources?after=<asset ID>` | Owner's library filenames/durations, 100 per page |
| `POST /api/spaces/:id/moments` | `{assetId,startS,endS,title?,notes?}`; save an owned source range |
| `PUT /api/spaces/:id/shortlist` | `{momentIds:[...]}`; atomic full replacement, supplied order retained |

Space/message IDs are client-generated UUIDs. Retrying the same ID/content is safe;
reuse with changed content returns 409. Message sequence numbers are allocated under
a Space row lock. The same lock serializes shortlist changes and moment inserts.
Identical source ranges reuse an existing moment. Unknown/unowned spaces or sources
return 404. Source duration must be known and positive; ranges must be finite and fit
within that duration. Shortlist members must belong to the same owner and Space.

Current safety bounds: 1,000 spaces per user, 1,000 messages and 500 moments per Space,
12,000 characters per user message/query, 200 per Space title. The detail response is
bounded by those limits. The UI loads source pages up to 1,000 files; a larger library
will need a searchable picker. Concurrent full shortlist replacements use last-write
semantics; cross-tab conflict resolution is not implemented.

## Connected UI and boundaries

The sidebar loads real spaces, including loading/error/empty states. Search submission
creates a saved Space; `?space=<UUID>` supports reloads, back/forward navigation and
copyable private links. Menus rename, pin/unpin, copy a link, export saved messages as
plain text, and delete. The composer persists user messages and preserves text on a
failed save. Space Studio adds source ranges, saves/removes/clears shortlists, and
persists their ordering. Sample spaces/results and canned assistant replies no longer
populate this flow.

The subsequent [conversation integration](saas-conversation.md) now implements an
owner-scoped engine search/reply bridge, saved assistant messages and source citation
chips, with fixture checks. Live generation is opt-in; the current Baseten pilot
passed a real browser/SaaS/engine flow using synthetic indexed text. Source moments
can also be saved manually from owned library files. Saved citations now have
[owner-scoped source playback](saas-source-playback.md), checked with generated local
video. Upload/connector UI integration and generated outputs remain separate work;
result cards now use [range-specific source-frame thumbnails](saas-moment-thumbnails.md)
with player posters and loading/retry states. Baseten is the local pilot provider.
Persistence-only checks do not make model calls.

## Validation

The isolated PostgreSQL check covers repeated schema application, create/update/delete,
pagination, cross-account and cross-Space rejection, retry deduplication, concurrent
message ordering, owned source ranges, invalid durations/ranges, shortlist order and
rollback, and cascades that retain source media. TypeScript, targeted lint, and local
browser/API checks are tracked in the hackathon contribution record. These checks do
not establish production isolation, multi-tab conflict handling, or model accuracy.
