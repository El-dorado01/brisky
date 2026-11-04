# Saved-source playback

Event-developed SaaS integration extends Brisky's pre-existing owner-scoped media
lookup, proxy cache and source streaming. It does not introduce a new indexing or
video-processing engine.

The Space inspector's `SourcePreview` now loads the selected saved moment through
`GET /api/spaces/{spaceId}/moments/{momentId}/playback`. The Next.js handler resolves
the session, checks ownership and the moment/Space/source association, then streams
the engine response without buffering the full file. Only the server forwards the
session token to the private engine; engine credentials and filesystem paths stay
off the browser. `HEAD` checks readiness before mounting the video.

The engine integration uses `GET`/`HEAD /api/v1/saas-engine/media/{id}/stream`, guarded
by the existing unexpired SaaS session check and owner-scoped `getStreamInfo`.
Single byte ranges support seeking, suffix ranges and open-ended ranges; malformed
or unsatisfiable requests return 416. Responses are private/no-store. Disconnects
close the file stream. HEAD preserves file length and sends no body.

Playback starts at the saved range's original timestamp and pauses at its end;
seeks outside the range are clamped. This is browser playback of the original or
existing proxy, not a newly extracted clip or a frame-accurate edit. Native controls
remain available if a browser requires another user gesture to start playback.
Selecting another moment resets the player. Missing/unplayable media and a preview
still being prepared have retry states. This route does not enqueue proxy jobs or
start workers. Existing remote proxy hydration can still use the engine's connector
path, which has not been validated by the local test.

## Validation scope

Engine TypeScript, frontend TypeScript and targeted lint checks pass. Unit/HTTP
checks cover exact byte responses, metadata-only HEAD, malformed/unsatisfiable ranges,
and the no-job behavior of a missing SaaS preview. Existing conversation fixture
checks still pass with the added controller dependency.

The browser evaluation passed with a locally generated blue MP4 and temporary accounts,
not personal footage. It checked exact range bytes, HEAD and 416, citation selection,
start at 10 seconds, pause at 12 seconds, seek clamping, incorrect Space associations,
and both unauthenticated and cross-owner denial at the SaaS/engine boundaries.
Mobile (390px) and desktop (1280px) screenshots were inspected. Temporary accounts,
source rows and generated media were removed. See [recorded results](hackathon-evidence/2026-10-31-saas-playback.json).
No AI calls were made. Real cloud-media availability, format
compatibility and mobile-device playback remain separate evaluations.

Repeat on this local Windows setup with Chrome installed, Next.js and the engine
running, and Docker PostgreSQL available (workers can remain off):

```powershell
node --env-file=apps/web/.env.local scripts/check-saas-playback.cjs
```

## 2026-11-02: Play originals directly from a connected source

When no local playable preview exists, the authenticated SaaS playback endpoint now
opens an owner-scoped, versioned connector read session and proxies byte ranges from
the original. It does not enqueue a preview, retain an original on disk, or call an
AI model. HEAD checks metadata without reading source bytes. Full/open/suffix ranges,
Content-Length/Content-Range, backpressure, exact byte bounds and disconnect cleanup
apply. Unexpected upstream ranges and changed source identities are rejected.

Drive file versions also change for metadata edits. A changed version is accepted
only if size and the stored content MD5 still match; missing identity evidence or
changed content requires resync. The source is validated again before streaming.
Codec support remains the browser's; this is not an automatic transcoding service.
The Space player continues to seek/pause/clamp to the saved original-source range.

This extends pre-existing source/connector primitives with a new SaaS remote playback
fallback. 33 focused playback/conversation tests, the API build, and web TypeScript/lint passed.
The actual Drive/SaaS route passed HEAD (12,388,744 bytes), a 1,024-byte starting
range, a 512-byte suffix, invalid-range rejection and unauthenticated denial, without
AI calls or retaining an original copy. Browser decode/range-clamp acceptance is
being checked separately.

Actual isolated Chrome playback also passed for that saved Drive result: the original
52.823946s, 576x1024 video decoded and played after a user click, and seeking beyond
the saved 0-20s range paused/clamped at its end. No screenshots, model calls, real chat
writes or retained original copies were made; the temporary browser/session was removed.


2026-11-02 playback modes: the player still starts at the cited range and pauses at
its end by default. **Full video** explicitly removes that UI range restriction;
**Back to moment** restores it and returns to the citation start when outside it.
This uses the same authenticated original-source stream, with no reindex or second
master copy. Tagging in full-video mode can choose frames across the original;
ordinary moment mode keeps tagging within the cited range.

Follow-up lookup is independent of playback mode: a referential follow-up with one
selected source searches that owned original asset, not only the selected excerpt.
Explicit wider-library requests remain unrestricted. Find/timestamp requests cannot
be answered solely from an old excerpt if the planner chooses answer/reply instead
of search. Hug/embrace queries now use moving-video verification. A checked excerpt
still does not establish exact event onset/offset; replies must not label its range
boundaries as exact event timing without evidence.


Separate real Drive browser acceptance passed: playback defaulted to the cited
0-20s range and clamped at its end; Full video successfully sought to 26s; Back to
moment returned to the citation start and restored range restrictions. No inference,
saved chat writes or additional retained original were involved.
