# Local SaaS database foundation

Implemented during the hackathon on 2026-10-31. This is new persistence for the
SaaS workspace, built on the pre-existing PostgreSQL engine database. It does not
implement SaaS HTTP routes, email login, grounded chat or Studio generation.

`apps/api/src/modules/database/saas-schema.sql` creates a separate `saas` schema:

| Table | Purpose |
| --- | --- |
| `spaces` | Owner, title, initial query, pin state and timestamps |
| `messages` | User/assistant text with unique positive sequence numbers per Space |
| `moments` | Source asset and finite timestamp range, title and notes |
| `message_moments` | Ordered source citations belonging to the same owner and Space |
| `shortlist_items` | Ordered selections from a Space's saved moments |

Existing accounts remain in `public.users`; existing engine media remain in
`public.media_assets`. No accounts or media were copied. Composite foreign keys
prevent references to another owner's assets or another Space's messages/moments.
Deleting a Space removes its messages, citations, moments and shortlist, preserving
engine media. Deleting an engine asset removes dependent saved references.
Source references use asset IDs and timestamp ranges, not transient search segment IDs.

The API applies this file after the engine schema in the existing transaction and
advisory lock. The schema has no PUBLIC privileges. This is a namespace and data
integrity boundary, not full database-role isolation: the existing local connection
uses the database owner. RLS and dedicated application roles are not implemented.
Future SaaS queries must always derive `user_id` from authenticated context and
scope reads and writes accordingly. Foreign keys alone do not protect SELECTs.

The Next.js Spaces service now validates ranges against current media duration, allocates message
sequence numbers under a Space row lock, maintains `updated_at`, and replaces/reorders
shortlists transactionally. See [SaaS Spaces](saas-spaces.md). The deferred position uniqueness constraint supports
swapping positions within a transaction. No duration-dependent cross-table CHECK
or inference-derived truth claim is introduced here.

Validation and application:

```powershell
node --env-file=.env scripts/check-saas-schema.cjs
node --env-file=.env scripts/check-saas-schema.cjs --apply
```

Both commands require localhost PostgreSQL. Tests use rollback-only fixtures;
`--apply` then commits only the schema DDL in a separate transaction. On 2026-10-31,
live local checks passed for repeated application, cross-owner/Space foreign keys,
duplicate message ordering, invalid/non-finite ranges and Space deletion cascades.
The schema was applied locally; API TypeScript checking also passed. No worker,
email delivery or paid model inference was started, and `.env` was unchanged.

Email-code authentication is now a separate Next.js SaaS implementation under
`apps/web/app/api/auth/`, with its own `apps/web/server/auth-schema.sql` migration
and private `apps/web/.env.local`. Existing `public.users` remains shared for user
IDs; new email-only accounts use a marker rejected by the engine password verifier.
See [SaaS login](saas-email-login.md) for configuration and validation boundaries.

Onboarding now adds owner-scoped `saas.workspaces` and `saas.user_profiles` through
the Next.js migration, with authenticated GET/PUT routes and persistent completion.
See [onboarding](saas-onboarding.md) for the distinction between a workspace and a
saved search Space, as well as media-source and identity limits.
