-- Event-developed, review-only local matching. No biometric vectors are persisted.
CREATE UNIQUE INDEX IF NOT EXISTS idx_appearance_owner_identity ON person_appearances(user_id,id);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='person_appearances'::regclass
      AND conname='person_appearances_origin_check' AND pg_get_constraintdef(oid) NOT LIKE '%face_match%') THEN
    ALTER TABLE person_appearances DROP CONSTRAINT person_appearances_origin_check;
    ALTER TABLE person_appearances ADD CONSTRAINT person_appearances_origin_check CHECK(origin IN ('manual','face_match'));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS face_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  person_id UUID NOT NULL,
  reference_id UUID NOT NULL,
  reference_version TIMESTAMPTZ NOT NULL,
  reference_checksum TEXT NOT NULL,
  asset_id VARCHAR(64) NOT NULL,
  asset_checksum TEXT NOT NULL,
  frame_s DOUBLE PRECISION NOT NULL CHECK(frame_s>=0 AND frame_s<604800),
  box DOUBLE PRECISION[] NOT NULL CHECK(cardinality(box)=4 AND array_ndims(box)=1 AND array_lower(box,1)=1 AND array_position(box,NULL) IS NULL AND box[1]>=0 AND box[2]>=0 AND box[3]>0 AND box[4]>0 AND box[1]+box[3]<=1 AND box[2]+box[4]<=1),
  score DOUBLE PRECISION NOT NULL CHECK(score>=-1 AND score<=1),
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,person_id) REFERENCES people(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,asset_id) REFERENCES media_assets(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,reference_id) REFERENCES person_appearances(user_id,id) ON DELETE CASCADE,
  UNIQUE(user_id,person_id,asset_id,asset_checksum,frame_s,box,reference_id,reference_version,model)
);
CREATE INDEX IF NOT EXISTS idx_face_suggestions_person ON face_suggestions(user_id,person_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_face_suggestions_asset ON face_suggestions(user_id,asset_id);
CREATE INDEX IF NOT EXISTS idx_face_suggestions_reference ON face_suggestions(user_id,reference_id);

-- Durable local face-work queue, consumed by apps/workers (not the HTTP API).
-- Owner opt-in is per person. Only review suggestions are emitted.
CREATE TABLE IF NOT EXISTS face_archive_settings (
  user_id UUID NOT NULL,
  person_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,person_id),
  FOREIGN KEY(user_id,person_id) REFERENCES people(user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_face_archive_discovery ON face_archive_settings(discovered_at,user_id,person_id) WHERE enabled;
CREATE TABLE IF NOT EXISTS face_archive_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  person_id UUID NOT NULL,
  asset_id VARCHAR(64) NOT NULL,
  asset_checksum TEXT NOT NULL,
  reference_revision TEXT NOT NULL,
  profile TEXT NOT NULL,
  start_s INTEGER NOT NULL CHECK(start_s>=0 AND start_s<604800),
  end_s DOUBLE PRECISION NOT NULL CHECK(end_s>start_s AND end_s<=start_s+60 AND end_s<=604800),
  source_duration DOUBLE PRECISION NOT NULL CHECK(source_duration>=end_s AND source_duration<=604800),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','blocked','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  error_code TEXT,
  suggested INTEGER NOT NULL DEFAULT 0 CHECK(suggested>=0),
  frames_scanned INTEGER NOT NULL DEFAULT 0 CHECK(frames_scanned>=0),
  reused_from UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,person_id) REFERENCES people(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,asset_id) REFERENCES media_assets(user_id,id) ON DELETE CASCADE,
  UNIQUE(user_id,person_id,asset_id,asset_checksum,reference_revision,profile,start_s)
);
CREATE INDEX IF NOT EXISTS idx_face_archive_claim ON face_archive_jobs(created_at,id) WHERE state='queued';
CREATE INDEX IF NOT EXISTS idx_face_archive_owner ON face_archive_jobs(user_id,person_id,state);
CREATE INDEX IF NOT EXISTS idx_face_archive_asset ON face_archive_jobs(user_id,asset_id);
CREATE INDEX IF NOT EXISTS idx_face_archive_lease ON face_archive_jobs(lease_until) WHERE state='running';
CREATE INDEX IF NOT EXISTS idx_face_archive_content ON face_archive_jobs(user_id,person_id,asset_checksum,reference_revision,profile,start_s) WHERE state='completed';
CREATE UNIQUE INDEX IF NOT EXISTS idx_face_archive_owner_id ON face_archive_jobs(user_id,id);
ALTER TABLE face_archive_jobs DROP CONSTRAINT IF EXISTS face_archive_jobs_reused_from_fkey;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='face_archive_jobs'::regclass AND conname='face_archive_reused_owner_fk') THEN
    ALTER TABLE face_archive_jobs ADD CONSTRAINT face_archive_reused_owner_fk FOREIGN KEY(user_id,reused_from) REFERENCES face_archive_jobs(user_id,id) ON DELETE SET NULL (reused_from);
  END IF;
END $$;
