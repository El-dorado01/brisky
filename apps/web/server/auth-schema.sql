-- SaaS authentication, separate from engine JWT/password authentication.
CREATE SCHEMA IF NOT EXISTS saas;
REVOKE ALL ON SCHEMA saas FROM PUBLIC;
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users(lower(email));
CREATE TABLE IF NOT EXISTS saas.email_challenges (
  email TEXT PRIMARY KEY,
  id UUID NOT NULL UNIQUE,
  browser_hash CHAR(64) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','ready','failed','consumed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INTEGER NOT NULL DEFAULT 1 CHECK (send_count > 0)
);
CREATE INDEX IF NOT EXISTS email_challenges_expiry_idx ON saas.email_challenges(expires_at);
CREATE TABLE IF NOT EXISTS saas.sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON saas.sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON saas.sessions(expires_at);
CREATE TABLE IF NOT EXISTS saas.auth_rate_limits (
  key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0)
);

CREATE TABLE IF NOT EXISTS saas.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  icon TEXT NOT NULL CHECK (icon IN ('mic','film','video','folder','rocket','star','music','briefcase','home','sparkles')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,id)
);
CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON saas.workspaces(user_id,created_at,id);
CREATE TABLE IF NOT EXISTS saas.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  creator_type TEXT NOT NULL CHECK (creator_type IN ('podcaster','producer','creator','team')),
  aliases TEXT[] NOT NULL CHECK (cardinality(aliases) BETWEEN 1 AND 20 AND array_position(aliases,NULL) IS NULL),
  first_workspace_id UUID NOT NULL,
  connector_preference TEXT NOT NULL CHECK (connector_preference IN ('gdrive','local','sample','none')),
  onboarding_completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,first_workspace_id) REFERENCES saas.workspaces(user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS profiles_workspace_idx ON saas.user_profiles(user_id,first_workspace_id);
-- Broader use cases; retain legacy values so existing profiles remain valid.
ALTER TABLE saas.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_creator_type_check;
ALTER TABLE saas.user_profiles ADD CONSTRAINT user_profiles_creator_type_check
  CHECK (creator_type IN ('personal','learning','work','creative','exploring','podcaster','producer','creator','team'));
