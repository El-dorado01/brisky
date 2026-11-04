-- Event-developed SaaS persistence. Engine users/media remain in public.
-- Apply after schema.sql, in the same migration transaction/advisory lock.
CREATE SCHEMA IF NOT EXISTS saas;
REVOKE ALL ON SCHEMA saas FROM PUBLIC;
-- Older local databases may not yet have applied the engine ownership index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_asset_owner_identity ON public.media_assets(user_id, id);

CREATE TABLE IF NOT EXISTS saas.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  initial_query TEXT NOT NULL CHECK (length(btrim(initial_query)) BETWEEN 1 AND 12000),
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX IF NOT EXISTS spaces_owner_updated_idx ON saas.spaces(user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS saas.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  space_id UUID NOT NULL,
  sequence_no BIGINT NOT NULL CHECK (sequence_no > 0),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, space_id) REFERENCES saas.spaces(user_id, id) ON DELETE CASCADE,
  UNIQUE (space_id, sequence_no),
  UNIQUE (user_id, space_id, id)
);
CREATE INDEX IF NOT EXISTS messages_owner_space_idx ON saas.messages(user_id, space_id, sequence_no);

-- Stable references to source ranges; never depend on synthetic search segment IDs.
CREATE TABLE IF NOT EXISTS saas.moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  space_id UUID NOT NULL,
  asset_id VARCHAR(64) NOT NULL,
  start_s DOUBLE PRECISION NOT NULL CHECK (start_s >= 0 AND start_s < 'Infinity'::float8),
  end_s DOUBLE PRECISION NOT NULL CHECK (end_s > start_s AND end_s < 'Infinity'::float8),
  title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 500),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 12000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, space_id) REFERENCES saas.spaces(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, asset_id) REFERENCES public.media_assets(user_id, id) ON DELETE CASCADE,
  UNIQUE (user_id, space_id, id),
  UNIQUE (space_id, asset_id, start_s, end_s)
);
CREATE INDEX IF NOT EXISTS moments_owner_space_idx ON saas.moments(user_id, space_id, created_at, id);
CREATE INDEX IF NOT EXISTS moments_owner_asset_idx ON saas.moments(user_id, asset_id);

CREATE TABLE IF NOT EXISTS saas.message_moments (
  user_id UUID NOT NULL,
  space_id UUID NOT NULL,
  message_id UUID NOT NULL,
  moment_id UUID NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (message_id, moment_id),
  UNIQUE (message_id, position),
  FOREIGN KEY (user_id, space_id, message_id) REFERENCES saas.messages(user_id, space_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, space_id, moment_id) REFERENCES saas.moments(user_id, space_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS message_moments_owner_message_idx ON saas.message_moments(user_id, space_id, message_id);
CREATE INDEX IF NOT EXISTS message_moments_owner_moment_idx ON saas.message_moments(user_id, space_id, moment_id);

CREATE TABLE IF NOT EXISTS saas.shortlist_items (
  user_id UUID NOT NULL,
  space_id UUID NOT NULL,
  moment_id UUID NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, moment_id),
  UNIQUE (space_id, position) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (user_id, space_id, moment_id) REFERENCES saas.moments(user_id, space_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS shortlist_owner_moment_idx ON saas.shortlist_items(user_id, space_id, moment_id);

-- Indexed evidence is distinct from user-authored notes and verified original media.
ALTER TABLE saas.moments ADD COLUMN IF NOT EXISTS transcript TEXT NOT NULL DEFAULT '' CHECK(length(transcript)<=12000);
ALTER TABLE saas.moments ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=6000);
ALTER TABLE saas.moments ADD COLUMN IF NOT EXISTS evidence_status TEXT NOT NULL DEFAULT 'saved' CHECK(evidence_status IN ('saved','indexed','matched'));

CREATE TABLE IF NOT EXISTS saas.reply_runs (
  user_id UUID NOT NULL,
  space_id UUID NOT NULL,
  trigger_message_id UUID NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('processing','complete','failed')),
  lease_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  assistant_message_id UUID,
  usage JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(space_id,trigger_message_id),
  FOREIGN KEY(user_id,space_id,trigger_message_id) REFERENCES saas.messages(user_id,space_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,space_id,assistant_message_id) REFERENCES saas.messages(user_id,space_id,id) ON DELETE CASCADE,
  CHECK((state='complete')=(assistant_message_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS reply_runs_one_active_space_idx ON saas.reply_runs(space_id) WHERE state='processing';
CREATE INDEX IF NOT EXISTS reply_runs_owner_space_idx ON saas.reply_runs(user_id,space_id);


-- Event-developed saved Studio documents. No model/network work holds these locks.
CREATE TABLE IF NOT EXISTS saas.studio_outputs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  space_id UUID NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('brief','storyline')),
  goal TEXT NOT NULL DEFAULT '' CHECK(length(goal)<=2000),
  status TEXT NOT NULL CHECK(status IN ('generating','ready','failed')),
  title TEXT NOT NULL DEFAULT 'Creating your document' CHECK(length(title) BETWEEN 1 AND 200),
  input_snapshot JSONB NOT NULL CHECK(jsonb_typeof(input_snapshot)='array'),
  document JSONB CHECK(document IS NULL OR jsonb_typeof(document)='object'),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(sources)='array'),
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,space_id) REFERENCES saas.spaces(user_id,id) ON DELETE CASCADE,
  CHECK(status!='ready' OR document IS NOT NULL),
  CHECK(status!='generating' OR (lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS studio_outputs_owner_recent_idx ON saas.studio_outputs(user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS studio_outputs_owner_space_idx ON saas.studio_outputs(user_id,space_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS studio_outputs_one_active_idx ON saas.studio_outputs(user_id,space_id) WHERE status='generating';
REVOKE ALL ON saas.studio_outputs FROM PUBLIC;
