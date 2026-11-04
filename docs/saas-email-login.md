# SaaS email-code login

Signed-in navigation (2026-10-31): `/login` and `/verify` now use a server-side
guest-only layout. Valid sessions redirect to `/search` after saved onboarding,
or `/onboarding` when setup is incomplete. Signed-out/expired sessions can still
access login. No browser-local completion flag is used for this decision.
Local HTTP checks passed for both redirects on both pages, plus signed-out and
revoked sessions returning to login. Temporary fixture accounts were removed;
no email or model call was made.

Local sign-in repair (2026-10-31): a running Next.js development server returned
HTML 404 for the existing request-code route. Restarting the verified frontend
server restored routing. The local Origin check now uses the request Host header
when Next exposes its `0.0.0.0` bind address in `request.url`; production still
requires the configured `SAAS_APP_ORIGIN`. Browser login/OTP handling now reports a
safe service error for HTML or malformed JSON instead of a raw parser exception.
HTTP checks passed for local JSON 400 and cross-origin JSON 403; auth/onboarding
regressions, TypeScript and targeted lint passed. The engine server was not needed.
Local PostgreSQL was reachable. No live email was sent during these checks.
An initial SMTP DNS failure cleared on recheck; Brevo SMTP connection and
authentication then passed. Relay acceptance of a real login email and inbox
delivery still require the user's sign-in attempt.

Event-developed Next.js implementation, 2026-10-31. SaaS routes live under
`apps/web/app/api/auth/`; the pre-existing engine remains in `apps/api` with its
own password/JWT authentication. No engine token or model credential is sent to
the browser by this implementation.

## Configuration

Use `apps/web/.env.local` (server-only, ignored by Git), following
`apps/web/.env.example`. Required: `SAAS_DATABASE_URL`, `SAAS_AUTH_SECRET` (random,
at least 32 characters), `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY`,
`BREVO_SENDER_EMAIL`, and optionally `BREVO_SENDER_NAME`. `SAAS_APP_ORIGIN` is
mandatory in production and must exactly match the browser's origin.

SMTP uses `smtp-relay.brevo.com:587` with required STARTTLS. The SMTP login comes
from Brevo's SMTP settings and may differ from the sender address. The sender
must be approved in Brevo. See [Brevo's SMTP instructions](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
Secrets must never have a `NEXT_PUBLIC_` prefix. No SMTP key is stored in code or
documentation. Restart Next.js after changing its environment.

From `apps/web/`, with local PostgreSQL running:

```powershell
node --env-file=.env.local scripts/migrate-auth.cjs
node --env-file=.env.local scripts/check-auth.cjs
```

The migration is explicitly local-only, transactional, repeatable and serialized
with the existing schema advisory lock. It assumes the existing engine's
`public.users` table; no separate server in `apps/` is created. The engine does
not load this Next.js auth migration or its environment file.

## Contract

| Route | Behavior |
| --- | --- |
| `POST /api/auth/email/request-code` | JSON `{email}`; sends a code, sets browser-bound HttpOnly challenge cookie; returns expiry and resend cooldown |
| `POST /api/auth/email/verify-code` | JSON `{email,code}`; consumes code and creates session; returns user and sets HttpOnly session cookie |
| `GET /api/auth/session` | Returns `{user}`; 401 when signed out |
| `POST /api/auth/logout` | Revokes server session and expires auth cookies |

Mutations require a matching Origin; JSON requests are bounded to 2 KiB. Responses
are not cacheable; provider/database errors are sanitized. Codes expire in 10
minutes, permit five failed guesses, and are invalidated by resend. Resend requires
60 seconds between attempts, with five sends per email in an hour. Database-backed
global limits allow 30 send requests and 300 well-formed verification requests per
minute across instances. These are conservative initial limits, not per-IP limits;
production ingress should add abuse controls appropriate to its trusted proxy.

Only a server-secret HMAC of the code and hashes of browser/session tokens are
stored. Code consumption, account resolution and session creation share a
transaction/row lock. SMTP failure leaves the challenge unusable while retaining
resend limits. SMTP success only means relay acceptance, not inbox delivery.

Successful email verification reuses the existing engine user by normalized email.
New users get a non-password marker `!email-code-only`, which the existing password
verifier rejects. Existing passwords are never overwritten. Ambiguous pre-existing
case variants fail closed. Sessions use independent random tokens, expire after
seven days and are revocable; they are not engine JWTs. Production cookies use
Secure, HttpOnly, SameSite=Lax and the `__Host-` prefix.

The login and OTP screens call these routes. Per-route layouts protect `/search`,
`/factory`, `/studio`, `/settings`, `/developer` and `/entity`, redirecting signed-out
visitors to `/login`. `/onboarding` is now also protected, following the owner's
subsequent request. `/entities`, its child pages, and the `/entity/new` alias are
also session-protected now that UI preview work is complete. New private pages must opt into
the shared `RequireSession` layout. Logout revokes the session. Each future
SaaS data route must independently authenticate and scope access; the layout alone
is not API authorization. Existing sample profiles, Spaces and search data are
still placeholders. Social sign-in remains a separate unimplemented flow.

## Maintenance and validation scope

Expired sessions and challenges can be deleted by a scheduled maintenance task;
keep challenges for at least a day after expiry to preserve hourly limits. Such
scheduling is not implemented. Database-role isolation/RLS remain separate work.

`scripts/check-auth.ts` creates and drops an isolated temporary schema with a fake
mailer. It does not send mail, touch real accounts, start workers or invoke models.
Real Brevo delivery and browser end-to-end behavior require separate validation.

Local validation on 2026-10-31: auth migration applied to the existing database;
isolated PostgreSQL integration checks passed, including session rotation/expiry
and hourly resend limits. Next.js HTTP checks passed for signed-out sessions (401),
cross-origin mutations (403), invalid email (400), oversized JSON (413), logout
(200), and no-store responses. Targeted auth lint passed. An initial frontend
TypeScript check passed; the final rerun encountered concurrent onboarding UI errors
(`saveCustomUserIdentity` export and unsupported `alienColor` configuration). Those
ongoing UI changes were preserved. These checks did not send email or exercise a
full browser sign-in. Concurrent onboarding integration also adds an `isNewUser`
response flag and post-login onboarding navigation; onboarding completion is not
validated by the auth checks.

Logout follow-up (2026-10-31): the sidebar now handles network failures, prevents
duplicate clicks and uses a full redirect to discard in-memory app/router state.
Logout without a valid-shaped session clears stale cookies without a database
dependency. Unsigned `dev-session-` tokens are rejected; public UI preview routes
remain available. Local HTTP checks with a temporary database-backed session passed
for revocation, expiry of both cookies, rejected token replay, protected-route
redirect and repeated logout. Fixture accounts were removed; targeted lint and the
isolated auth regression checks passed. A browser button-click test was not run.
