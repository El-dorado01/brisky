# Brisky web

Next.js SaaS UI and server API: email-code login, onboarding, Spaces, messages,
shortlists and the authenticated engine bridge.

From the repository root:

```sh
pnpm --dir apps/web install --frozen-lockfile
pnpm dev:web
```

Or from this directory:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:3000**. Configure this directory's `.env.local` from
`.env.example`; preserve it if already configured. This app retains its own pnpm
workspace, lockfile and pinned version.

Login requires PostgreSQL and Brevo SMTP settings. Media/Drive operations also need
the engine on port 3001; indexing needs Redis and workers. See [root startup](../../README.md).

```sh
pnpm build
pnpm start
pnpm lint
pnpm auth:check
pnpm spaces:check
```

Database checks require local PostgreSQL. Migration commands: `pnpm auth:migrate` and
`pnpm spaces:migrate`; review the target database first. Secrets stay server-side.
Engine/provider credentials belong in the root `.env`. See
[environment setup](../../docs/environment-configuration.md).

Voice acknowledgement audio ships in `public/audio/brisky` (generic generated text
only): 17 variants x 6 voices. Every account uses the same public cached files.
No model download/generation is needed on startup. Private reply read-aloud goes
through authenticated configured speech routes. In `meta-mms` mode both read-aloud
and previews use local Meta MMS; Gemini acknowledgement files are not requested.
See [Meta voice setup](../../docs/meta-mms-voice.md), [voice scope](../../docs/saas-voice.md)
and `node scripts/generate-voice-acknowledgements.cjs` from the root for an offline
missing-asset report; generation requires explicit bounded options.
