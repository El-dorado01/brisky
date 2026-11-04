# Google Drive and Factory integration

Event-developed SaaS integration, 2026-10-31. This reuses Brisky's pre-existing
Google OAuth client, encrypted connector accounts, folder enumeration, sync/indexing
and media records. It does not introduce a new Drive connector or indexing engine.

## What is connected

- Factory and its Connectors modal load the signed-in user's real accounts and
  indexing status through authenticated Next.js routes. Sample accounts, files,
  activity and fabricated completion/latency metrics have been removed. Unknown
  historical metrics are shown as unavailable. The status snapshot contains at most
  100 recently updated source rows; overall counts include all owned assets.
- Google Drive Add starts a session-bound OAuth flow. The Google callback returns
  to Next.js, which validates a signed, ten-minute HttpOnly state cookie bound to
  the current SaaS session, clears it, and forwards the code to the authenticated
  engine. Google credentials and tokens remain in the engine's private environment
  and encrypted connector storage. No developer JWT signing key is shared.
- Manage browses My Drive folders/subfolders, maintains selections across navigation,
  saves watched folders, offers explicit sync and disconnect, and displays errors.
  Saving folders does not start indexing. Status refreshes every ten seconds while
  the Factory document is visible. UI stages show actual current processing rows;
  unavailable per-stage historical metrics are not invented.
- The onboarding Google Drive choice now uses the shared multicolor
  `GoogleDriveIcon` used elsewhere in the connector UI.

The engine's new `/api/v1/saas-engine/connectors` routes require the unexpired SaaS
session and scope queries/actions to its owner. Next.js `/api/connectors` and
`/api/indexing` expose only same-origin session-authenticated operations; mutations
also validate Origin. Encrypted tokens and raw provider errors are not returned.

The legacy developer OAuth flow also received a security correction: arbitrary
base64 user-ID state and the first-user fallback were removed. State is now random,
one-use, ten-minute and bound to a browser HttpOnly cookie. Its state registry is
process-local: restarting the engine invalidates outstanding legacy links, and a
shared state store is needed before load-balancing that legacy flow. The SaaS flow
uses the signed browser/session cookie instead of that registry. Google still enforces
one-use authorization codes; exactly-once linking under concurrent callbacks is not claimed.

## Configuration and live setup

Private engine root `.env`:

```dotenv
GOOGLE_CLIENT_ID=<existing OAuth web client ID>
GOOGLE_CLIENT_SECRET=<existing OAuth web client secret>
GOOGLE_SAAS_REDIRECT_URI=http://localhost:3000/api/connectors/google-drive/callback
CONNECTOR_ENCRYPTION_KEY=<existing stable connector encryption key>
SAAS_DRIVE_SYNC_ENABLED=false
```

Existing `GOOGLE_REDIRECT_URI` is retained for the separate developer callback.
Do not regenerate the encryption key: existing accounts depend on it. The Next.js
environment needs only its existing session/database settings and `BRISKY_ENGINE_URL`.
Production also requires the explicit `SAAS_APP_ORIGIN`, secure HTTPS callbacks and
the corresponding Google OAuth client configuration.

In the Google Cloud project owning that OAuth client:

1. Google Auth Platform → Clients → the Web application client (also reachable
   through APIs & Services → Credentials).
2. Add `http://localhost:3000/api/connectors/google-drive/callback` under Authorized
   redirect URIs and save; preserve existing URIs.
3. APIs & Services → Library → Google Drive API → enable if needed.
4. Google Auth Platform → Audience → Test users: add the account to connect if the
   application is in Testing.
5. In Brisky, open Factory → Connectors → Google Drive Add, complete Google consent,
   then Manage → select and save folders.

The redirect URI must match exactly. See [Google's web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

Sync is implemented but locally gated off. Before enabling `SAAS_DRIVE_SYNC_ENABLED`,
validate the indexing provider/embedding path and turn on the required workers with
the owner's authorization. The current Baseten conversation profile has unvalidated
media paths and Google embeddings remain affected by the unfunded Gemini account.
No workers, automatic connector polling or paid indexing were started by this work.

## Validation and outstanding checks

- Engine/frontend TypeScript and targeted frontend lint passed.
- Eleven engine tests across SaaS connector policy, existing sync correctness and
  API contract coverage passed. Pure local OAuth state checks cover session binding,
  expiry, wrong nonce, tampering and missing-secret rejection.
- Actual local Chrome/Next.js/engine/PostgreSQL checks passed with temporary accounts
  and connector/media fixtures: real Factory account/file/progress display, owner-only
  data, no encrypted-token exposure, folder persistence, cross-owner denial, Origin
  validation, disabled sync, callback URL generation, OAuth denial/cookie consumption
  and replay rejection, disconnect retaining media, and unauthenticated denial.
- Mobile (390px) and desktop (1280px) modal screenshots were inspected. Temporary
  fixtures were deleted. An empty-body JSON header defect found during this check
  was corrected so DELETE and bodyless sync reach their handlers.

See [recorded results](hackathon-evidence/2026-10-31-saas-drive.json). Repeat locally:

```powershell
node scripts/check-drive-oauth-state.cjs
node --env-file=apps/web/.env.local scripts/check-saas-drive.cjs
```

No Google consent/token/folder API calls, personal media, workers or inference were
used in these tests. Actual Google consent, token exchange/refresh, remote folder
browsing and indexing remain unverified pending the owner's Google setup and login.
Folder browsing currently inherits the existing connector's first-100-folders-per-parent
limit; folder pagination and shared-drive browsing were not added in this change.

## Factory interaction update

The owner reports real Google Drive connection succeeded; real folder management
has not yet been confirmed by the owner. Manage now opens a separate centered modal
on desktop and a bottom drawer below 768px. Back, Cancel, close, Escape and drawer
dismissal return to Connectors. If folder selections differ from the last saved
selection, an alert offers Keep editing or Discard changes before returning. Saving
clears the dirty state. Both dialog types use native focus trapping and the shared
drawer motion/handle; the shared hook retains its previous breakpoint for other views.

Factory uses animated Hugeicons glyphs for controls, pipeline stages and connector
catalog icons. The Google Drive brand SVG remains the shared multicolor mark.
The Connectors action stays on the canvas below the mobile header, and
canvas details use a native modal portal covering the full viewport, including the
header. Desktop canvas details remain a right-side panel.

Local browser checks with temporary account data and browser-intercepted folder
fixtures passed separate views, Back/Cancel/Escape, focus, the unsaved warning and
both choices, mobile bottom anchoring, desktop centering, header action placement,
and full 390x844 mobile detail coverage. Screenshots were inspected. No actual
Drive folder/API calls, worker activity or inference was used. See
[dialog evidence](hackathon-evidence/2026-10-31-drive-dialogs.json).

The subsequent Manage layout refinement uses larger body text and touch targets,
a clearer account summary, searchable folder list, selection chips/removal, distinct
sync controls, and a persistent Save/Cancel footer. Save is disabled for unchanged
selections; sync is disabled until changed selections are saved. Folder-load errors
have their own retry and are not displayed as empty folders. The current breadcrumb
is disabled so clicking it cannot leave the browser stuck in a loading state.
Disconnect is a red destructive action with a confirmation that offers Keep connected.
The existing unsaved-change warning remains in place. Mobile connectors returned to
the canvas at the owner's request. Bottom drawers and the full-screen mobile detail
panel use eased transform entrance motion and respect reduced-motion preferences.
Mobile/desktop browser checks passed the refined layout, folder filter, persisted
selection changes, disabled unchanged-save/unsaved-sync states, and cancelling the
red Disconnect confirmation without removing the account. Temporary local data and
intercepted folder responses were used; see [layout evidence](hackathon-evidence/2026-10-31-drive-manage-layout.json).
