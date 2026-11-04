# Judge setup rehearsal — November 4, 2026

This rehearsal checks event-developed integration with the declared pre-existing
engine. It does not attribute the original indexing engine to the hackathon.

## Environment and isolation

Used the publicly cloned pinned engine at `49b7e71`, installed both frozen
lockfiles into fresh `node_modules`, and built the API, worker and production
web application. Package downloads reused the host's package cache where
available; this was not a new operating-system installation. A newly created,
empty PostgreSQL database separated fresh-account checks from the owner's
library. PostgreSQL/Redis containers and verified Python/model downloads were
reused. No worker consumer or automatic sync was started.

The isolated API used port 4011; the clean production web build used 4010 for
the empty database and 4012 for existing-library checks. Those extra servers
were stopped after the rehearsal. The original API and Docker services were
left running. Temporary test sessions/Spaces were removed; original Spaces,
media and budget history were preserved.

## Results

| Check | Result and scope |
| --- | --- |
| Frozen dependency installation | Passed for root engine and independent web workspace. Existing pnpm cache reused; no lockfile changes. |
| API and worker builds | Passed; worker import check and lifecycle test passed without consuming jobs. |
| First engine startup | Passed against an empty database, including engine/workspace schema migrations. |
| Email-code schema | Missing after engine startup by design; explicit `auth:migrate` passed. Setup guide corrected to require it before first login. |
| Authentication/onboarding | Database integration checks passed with fake delivery, including one-use codes, browser binding, expiry, logout and persisted setup. No email sent. |
| SMTP connection | Existing Brevo credentials authenticated; delivery to a real inbox was not exercised. |
| Workspace checks | Found and corrected the stale pre-monorepo schema path in `check-spaces.ts`; checks then passed for CRUD, ownership, shortlists, citations, reply leases and retries. |
| Production web build | Passed after configuring its server environment. Building without the required database environment fails; setup must precede build/start. |
| Fresh authenticated HTTP flow | Passed session lookup, onboarding save, Space create/rename/delete, Meta/MMS configuration, local WAV synthesis and API health. |
| Local Meta embeddings | Freshly compiled engine returned finite 1024-dimensional LASER2 vectors using shared verified model files. No paid call. |
| Desktop/mobile UI | Isolated Chrome loaded desktop Search and mobile Factory/settings with no horizontal overflow; logged-in `/login` redirected away. Screenshots retained privately. Not a full visual audit of every modal. |
| Real Drive playback | Through the clean production web build using the existing account/library: HEAD, byte ranges, suffix seek, invalid-range rejection and unauthenticated denial passed. No original master retained or AI called by this check. |
| Existing indexed thumbnails | Three source thumbnails validated at 640×440. No AI call. |
| Studio | Existing previously approved 24–32s text analysis produced a Meta brief with three sections and a source citation; persistence and cached retry passed. Temporary test Space removed. |
| Voice relay | Clean application used generated speech fixtures through real Meta ASR/dialogue and local MMS. Greeting, interruption, tool-result audio, origin checks and single-use tickets passed. Tool evidence was explicitly synthetic, not a real media search. First greeting audio arrived about 3.852s after input ended in this run; not a latency guarantee. |

All paid checks retained the original append-only journal and $30 cumulative
ceiling. Reservations are admission holds, not provider invoices. Automatic face
matching remained disabled; no facial-recognition accuracy claim is made.

## Explicit remaining acceptance checks

- A genuinely new Google OAuth client/account authorization round trip. Existing
  Drive credentials were reused for source playback; that does not verify a new
  judge's consent-screen setup.
- A complete new Save & Sync → live worker → finished indexing run under this
  pinned Meta-only setup. Worker startup/import checks are not that run; earlier
  development indexing is separate evidence.
- Real inbox code delivery and end-to-end human login. Fake mail plus SMTP
  authentication are narrower checks.
- Human microphone, Nigerian accent, acoustic echo, interruption timing and
  perceived voice quality. Generated fixtures cannot establish these.
- A clean operating system and fresh Python/model downloads. The setup's pinned
  hashes were verified previously, but this rehearsal reused those downloads.

These limits must accompany the passed checks. The standalone event sample
runner has a different UI and synthetic catalogue; it is not a substitute for
the full-application rehearsal above.
