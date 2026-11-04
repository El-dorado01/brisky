# SaaS onboarding persistence

Event-developed on 2026-10-31. The existing onboarding UI previously wrote only
browser-local values. It now loads and saves account-owned settings through Next.js
Route Handlers and local PostgreSQL. The pre-existing Brisky media engine remains
separate; no model, indexing worker or email is invoked by onboarding.

## API and storage

`GET /api/onboarding` returns `{user, completed, profile, workspace}` for the current
session. `PUT /api/onboarding` accepts:

```json
{
  "displayName": "Creator Name",
  "creatorType": "creator",
  "aliases": ["me", "I"],
  "workspaceName": "Main Studio",
  "workspaceIcon": "film",
  "connectorPreference": "gdrive"
}
```

Both routes require a valid server session. PUT requires a matching Origin and
JSON bounded to 8 KiB. Unexpected fields (including email and user IDs) are rejected.
Ownership and account email always come from the authenticated user, not the form
or query string. Names are bounded to 100 characters; there are at most 20 aliases
of 64 characters, normalized and deduplicated. Workflow, icon and connector choices
are allowlisted.

`saas.workspaces` stores owner/name/icon. `saas.user_profiles` stores aliases,
workflow, source preference, first workspace and completion timestamp. A composite
foreign key prevents another owner's workspace being linked. The existing
`public.users.name` is updated within the same transaction. A user-row lock makes
concurrent saves reuse the first workspace rather than creating duplicates.

The auth migration now includes these tables:

```powershell
# From apps/web/, with local PostgreSQL on:
node --env-file=.env.local scripts/migrate-auth.cjs
node --env-file=.env.local scripts/check-auth.cjs
```

## Frontend behavior and limits

At the owner's subsequent request, `/onboarding` is now protected by the shared
session layout; signed-out visits redirect to `/login`. The temporary UI-preview
notice has been removed. Authenticated visits load saved values.
Launch saves before navigating; errors remain visible with form values intact.
Skip persists valid defaults and no media-source preference. Email verification
uses the database completion record to decide whether onboarding is needed;
browser-local completion flags are no longer authoritative. The sidebar now reads
the real session name/email instead of the sample account. A compatibility identity
cache supports existing entity UI components, with no fabricated face/voice enrollment.

A workspace here is a named SaaS workspace, not a saved search conversation in
`saas.spaces`; media search and conversation APIs remain separate work. Source
selection saves a preference only. It does not perform Drive OAuth, import files,
load a sample archive, enroll faces/voices or create confirmed engine appearances.
Aliases are persisted profile settings; search identity grounding still requires
engine people/appearance records. No such capabilities are claimed by completion.

Local validation: repeatable migration applied; isolated PostgreSQL tests passed for
profile persistence, name updates, alias normalization, repeated/concurrent saves,
validation, owner foreign keys, user deletion cascades and database-backed login
routing. HTTP checks passed for authentication, cross-origin rejection, reload,
repeat save, separate accounts and rejected ownership spoofing. Temporary test
accounts were removed. Full browser interaction and live connector behavior were
not tested.

The final whole-frontend TypeScript run reported concurrent Entities UI errors for
an undefined `isMobile` variable; those unrelated ongoing edits were preserved.
Targeted lint passed for all changed onboarding/auth/sidebar files and the
integration checks.

Audience update (2026-10-31): onboarding now offers personal memories, learning,
work, creative projects and general exploration, with neutral collection/alias
defaults and navigation labels. The existing `creatorType` API field and
`creator_type` column are retained for compatibility; new values are `personal`,
`learning`, `work`, `creative`, `exploring`. Legacy values remain accepted and
existing profiles are not rewritten. On screen, legacy creative roles map to
creative projects and legacy teams map to work. Local migration and persistence
tests passed for all five new values without duplicating workspaces. These are
audience preferences, not new specialized model capabilities or demo commitments.
