# Saved-moment thumbnails

Event-developed integration replaces the Space result cards' vector illustrations
with actual source frames and adds those frames as player posters. Existing Brisky
media lookup, FFmpeg installation and proxy storage are reused.

The browser loads `GET /api/spaces/{spaceId}/moments/{momentId}/thumbnail` using its
session cookie. The SaaS handler checks the saved moment/Space/source ownership and
supplies the persisted start/end times to the engine. Browser query parameters cannot
change the selected range. The session-guarded engine endpoint independently checks
source ownership and duration before accessing files or its thumbnail cache.

`MomentThumbnailService` samples the midpoint of the saved range with local FFmpeg.
It scales and center-crops to a 640x440 JPEG (the cards' 16:11 ratio); CSS fills the
existing cards with `object-cover`. The same image is the inspector player poster.
This is a deterministic source frame, not an AI-generated picture or an evaluated
best-frame selection. Center cropping can omit content near the original frame edges.

Disk cache keys include the owner, source, exact range, file size/mtime and rendering
version. Concurrent identical requests share one task. One decoder runs at a time,
with at most 16 pending distinct requests and a 20-second decoder timeout; excessive
pending work is rejected for later retry. Partial outputs use unique temporary names
and are removed after failures. The on-disk cache lives under
`STORAGE_ROOT/moment-thumbnails`; automatic eviction is not implemented yet.
HTTP responses remain private/no-store so cached files still require authorization.
No indexing jobs, workers or AI calls are started. Existing remote proxy hydration
can still follow the engine's connector path; cloud behavior remains unverified.

Cards show a loading state and an unavailable/retry state when no frame can be
displayed. Audio-only sources cannot produce a video frame and use that fallback.

## Actual validation (2026-10-31)

- Engine/frontend TypeScript and targeted frontend lint passed.
- Six thumbnail-policy/API-contract tests passed: ownership denial, invalid/overlong
  ranges, preparing sources, retry after failure, generated contract and route coverage.
- Existing real Nest/PostgreSQL conversation fixture checks still passed.
- Real browser/SaaS/engine evaluation passed with a generated video containing red
  and blue sections. Two saved ranges of the same file produced the correct distinct
  colors, 640x440 JPEGs, exact card ratio and `object-cover`; repeated responses reused
  identical image bytes. Other authenticated owners and unauthenticated requests were
  denied. The existing citation playback/range checks also passed.
- Mobile (390px) and desktop (1280px) screenshots were inspected. Temporary accounts,
  source rows and generated MP4 were removed; derived synthetic JPEG cache entries
  remain local. No personal footage or paid inference was used.

See [recorded browser results](hackathon-evidence/2026-10-31-saas-thumbnails.json).
Repeat on the local Windows/Chrome setup, with Next.js, the engine and PostgreSQL
running (indexing workers can stay off):

```powershell
node --env-file=apps/web/.env.local scripts/check-saas-thumbnails.cjs
```

Real-footage thumbnail usefulness, physical mobile devices, cloud availability,
broader codec support and cache eviction still need separate evaluation/work.

2026-11-02 update: indexed Drive assets without a playable preview now use an owned,
in-range saved keyframe nearest the moment midpoint, then crop it to the same card
size. Storage and symlink boundaries are checked before decoding. Actual generation
and authenticated thumbnail routes passed for three such sources; no AI image
synthesis or new preview jobs are needed. A saved frame may differ from the precise
midpoint. Missing in-range evidence still yields an unavailable/preparing response.
