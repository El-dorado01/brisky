# Space Studio

Studio turns a Space's ordered shortlist into a saved Brief or Storyline. Moments
remains the browser/player; the duplicate Assets tab has been removed from Studio.
Choose moments, arrange their order, optionally add a direction, and create. Saved
documents open in `/studio`, with section citations, source playback, copy and
Markdown download. Suggestions appear separately from sourced sections.

The library offers title/space search and Brief/Storyline filters over loaded
creations, with Load more for later pages. Cards show previews and status. The
reading view has a section outline, optional direction, reading-time estimate,
supporting citations, a complete source list and a sticky copy/download toolbar.
On smaller screens the document gets the full reading width; All creations returns
to the library. These controls do not change generated or stored document content.

The Next SaaS API owns authentication and saved outputs. The Brisky engine reads
indexed evidence and calls the configured AI provider. Meta, Baseten and Gemini
adapters share the document contract; this change does not switch the provider.
Studio uses saved analysis, not a fresh inspection of every original recording.

## Local setup

Run the existing spaces migration from `apps/web`:

```powershell
node --env-file=.env.local scripts/migrate-spaces.cjs
```

Use the existing `SAAS_DATABASE_URL` and server-only `BRISKY_ENGINE_URL`. The engine
needs `SPACE_REPLIES_ENABLED=true` and its configured provider credentials. No
additional Studio key is required. The worker need not run to create from already
indexed moments. Paid generation uses the existing cumulative AI ledger and cap.

Routes: `POST /api/spaces/:spaceId/studio` accepts a request UUID, `format` and
`goal`; `GET /api/studio` lists owned outputs; `GET /api/studio/:id` loads one.
The internal engine route is `POST /api/v1/saas-engine/studio/generate`, protected
by the existing SaaS session guard. Source ranges and evidence are read server-side.

Requests snapshot 1–20 shortlisted moments and their source versions. A short
database transaction claims a two-minute lease, then inference runs outside the
transaction. Publication rechecks ownership/source versions and the lease. Reusing
a completed request returns its saved document. A failed identical request can
retry; a changed shortlist requires a new request. One generation runs per Space.
Changed or unavailable sources remain readable as document text but cannot be
opened as if they were the original citation. Downloads link back to authenticated
Studio rather than embedding private media. Deleting a Space cascades its outputs.

Validation: API build, 69 Studio/conversation/provider tests, web types/lint, isolated PostgreSQL
checks (no real library edits), and synthetic 390/1280px browser checks. Real model
output quality remains distinct from synthetic UI acceptance. With explicit owner
approval, one live Meta Brief from saved 24–32-second Drive moment analysis passed:
two sections, one valid citation, persisted readback, source availability and cached
retry. Temporary test Space/session removed; no video/audio sent. This is one live
example, not an accuracy benchmark. Reels, rendered
video, timeline/NLE exports and expressive speech are outside this first output.

The live example also exposed overconfident timing language from a broader indexed
scene description. Studio now explicitly labels that context and instructs the
model not to claim those events occur within the exact selected seconds. This
wording fix passed contract checks but has not had another paid model evaluation.
