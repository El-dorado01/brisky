-- PostgreSQL Schema for Brisky Phase 2
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media Assets Table
CREATE TABLE IF NOT EXISTS media_assets (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(32) DEFAULT 'upload',
  original_filename VARCHAR(512) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  file_size BIGINT DEFAULT 0,
  duration DOUBLE PRECISION DEFAULT 0,
  width INT DEFAULT 0,
  height INT DEFAULT 0,
  fps INT DEFAULT 30,
  codec VARCHAR(64) DEFAULT 'unknown',
  has_audio BOOLEAN DEFAULT false,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  stage VARCHAR(64) DEFAULT 'queued',
  progress INT DEFAULT 0,
  error TEXT,
  original_deleted BOOLEAN DEFAULT false,
  proxy_path VARCHAR(1024),
  thumbnail_path VARCHAR(1024),
  thumbnail_data TEXT,
  original_path VARCHAR(1024),
  proxy_status VARCHAR(32) DEFAULT 'ready',
  availability VARCHAR(32) DEFAULT 'online',
  parent_asset_id VARCHAR(64) REFERENCES media_assets(id) ON DELETE SET NULL,
  relationship_type VARCHAR(32) DEFAULT 'original',
  phash VARCHAR(64),
  cost_usd DOUBLE PRECISION DEFAULT 0,
  cost_per_source_minute_usd DOUBLE PRECISION DEFAULT 0,
  frames_analyzed INT DEFAULT 0,
  scene_count INT DEFAULT 0,
  index_duration_ms INT DEFAULT 0,
  analysis_version INT DEFAULT 2,
  index_version INT DEFAULT 1,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media Segments Table (with 3072-dim embeddings for gemini-embedding-001)
CREATE TABLE IF NOT EXISTS media_segments (
  id VARCHAR(128) PRIMARY KEY,
  asset_id VARCHAR(64) REFERENCES media_assets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  start_time DOUBLE PRECISION NOT NULL,
  end_time DOUBLE PRECISION NOT NULL,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  visual_objects TEXT[] DEFAULT '{}',
  actions TEXT[] DEFAULT '{}',
  transcript_text TEXT DEFAULT '',
  on_screen_text TEXT[] DEFAULT '{}',
  keyframe_path VARCHAR(1024),
  sources TEXT[] DEFAULT '{}',
  provider VARCHAR(64) DEFAULT 'google',
  model VARCHAR(64) DEFAULT 'gemini-2.5-flash',
  embedding vector(3072),
  embedding_384 vector(384),
  embedding_dim INT DEFAULT 3072,
  analysis_version INT DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw Media Observations Table (Durability for auditability and model-agnostic reprocessing)
CREATE TABLE IF NOT EXISTS media_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR(64) REFERENCES media_assets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  observation_type VARCHAR(32) NOT NULL,
  timestamp_start DOUBLE PRECISION,
  timestamp_end DOUBLE PRECISION,
  raw_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing Jobs Table (Observability & BullMQ tracing)
CREATE TABLE IF NOT EXISTS indexing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bull_job_id VARCHAR(128),
  asset_id VARCHAR(64) REFERENCES media_assets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  job_type VARCHAR(64) DEFAULT 'index_asset',
  priority VARCHAR(32) DEFAULT 'normal',
  status VARCHAR(32) NOT NULL DEFAULT 'waiting',
  stage VARCHAR(64) DEFAULT 'waiting',
  progress INT DEFAULT 0,
  error TEXT,
  attempts INT DEFAULT 0,
  provider VARCHAR(64) DEFAULT 'google',
  model VARCHAR(64) DEFAULT 'gemini-2.5-flash',
  segment_start DOUBLE PRECISION,
  segment_end DOUBLE PRECISION,
  bytes_read BIGINT,
  cancel_requested BOOLEAN DEFAULT FALSE,
  timings JSONB DEFAULT '[]',
  cost JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media Registry: Asset Relationships Graph Table (Lineage, Derivatives & Duplicates)
CREATE TABLE IF NOT EXISTS asset_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id VARCHAR(64) REFERENCES media_assets(id) ON DELETE CASCADE,
  target_asset_id VARCHAR(64) REFERENCES media_assets(id) ON DELETE CASCADE,
  relationship_type VARCHAR(32) NOT NULL, -- 'duplicate_of', 'derived_from', 'proxy_of', 'export_of', 'crop_of'
  confidence DOUBLE PRECISION DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_asset_id, target_asset_id, relationship_type)
);

ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS parent_asset_id VARCHAR(64) REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS relationship_type VARCHAR(32) DEFAULT 'original';
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS phash VARCHAR(64);
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS proxy_status VARCHAR(32) DEFAULT 'ready';
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS availability VARCHAR(32) DEFAULT 'available';
ALTER TABLE media_segments ADD COLUMN IF NOT EXISTS embedding_384 vector(384);
ALTER TABLE media_segments ADD COLUMN IF NOT EXISTS embedding_dim INT DEFAULT 3072;
ALTER TABLE media_observations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE media_segments ADD COLUMN IF NOT EXISTS keyframe_paths JSONB DEFAULT '[]';
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS provider VARCHAR(64) DEFAULT 'google';
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS model VARCHAR(64) DEFAULT 'gemini-2.5-flash';
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS job_type VARCHAR(64) DEFAULT 'index_asset';
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS priority VARCHAR(32) DEFAULT 'normal';
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS segment_start DOUBLE PRECISION;
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS segment_end DOUBLE PRECISION;
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS bytes_read BIGINT;
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS access_mode VARCHAR(32) DEFAULT 'full_download';
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS waiting_reason VARCHAR(32);

-- Ephemeral Media Factory: Processing Units & Checkpoints (Phase F2)
CREATE TABLE IF NOT EXISTS media_processing_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR(64) REFERENCES media_assets(id) ON DELETE CASCADE,
  unit_id VARCHAR(128) NOT NULL,
  unit_type VARCHAR(64) NOT NULL,
  start_s DOUBLE PRECISION,
  end_s DOUBLE PRECISION,
  status VARCHAR(32) NOT NULL DEFAULT 'waiting',
  attempts INT DEFAULT 0,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asset_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_units_asset_status ON media_processing_units(asset_id, status);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_assets_checksum_user ON media_assets(checksum, user_id);
CREATE INDEX IF NOT EXISTS idx_assets_user_status ON media_assets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_parent ON media_assets(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_rel_source ON asset_relationships(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_rel_target ON asset_relationships(target_asset_id);
CREATE INDEX IF NOT EXISTS idx_segments_asset ON media_segments(asset_id);
CREATE INDEX IF NOT EXISTS idx_segments_user ON media_segments(user_id);
CREATE INDEX IF NOT EXISTS idx_observations_user ON media_observations(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_asset ON indexing_jobs(asset_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON indexing_jobs(user_id);

-- Immutable FTS document vector generator function
CREATE OR REPLACE FUNCTION media_segment_search_text(
  title text,
  description text,
  transcript_text text,
  actions text[],
  visual_objects text[],
  on_screen_text text[]
) RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('simple',
    regexp_replace(
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(transcript_text, '') || ' ' ||
      coalesce(array_to_string(actions, ' '), '') || ' ' ||
      coalesce(array_to_string(visual_objects, ' '), '') || ' ' ||
      coalesce(array_to_string(on_screen_text, ' '), ''),
      '[-–—]', ' ', 'g'
    )
  );
$$;

-- Full-text search GIN index on media segments ('simple' configuration matching search query)
CREATE INDEX IF NOT EXISTS idx_segments_fts_simple ON media_segments USING GIN (
  media_segment_search_text(title, description, transcript_text, actions, visual_objects, on_screen_text)
);

-- HNSW Cosine Index for pgvector 3072-dimensional vector lookups (halfvec)
CREATE INDEX IF NOT EXISTS idx_segments_embedding_hnsw ON media_segments 
USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- HNSW Cosine Index for pgvector 384-dimensional vector lookups (local all-MiniLM-L6-v2)
CREATE INDEX IF NOT EXISTS idx_segments_embedding_384_hnsw ON media_segments 
USING hnsw (embedding_384 vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Relevance feedback on search results ('this is the moment' / 'wrong')
CREATE TABLE IF NOT EXISTS search_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  asset_id VARCHAR(64) NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  segment_id VARCHAR(64),
  timestamp_sec DOUBLE PRECISION,
  feedback VARCHAR(16) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_feedback_user ON search_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_search_feedback_query ON search_feedback(query);

-- Stage-2 Deep Verification cache
CREATE TABLE IF NOT EXISTS verified_queries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_hash VARCHAR(64) NOT NULL,
  asset_id VARCHAR(64) NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  segment_id VARCHAR(64) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  exact_timestamp DOUBLE PRECISION,
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_verified_query_segment UNIQUE (query_hash, segment_id)
);
CREATE INDEX IF NOT EXISTS idx_verified_queries_hash ON verified_queries(query_hash);

-- AI Query Understanding Cache (Sub-cent search intent & alias cache)
CREATE TABLE IF NOT EXISTS query_understanding_cache (
  query_hash VARCHAR(64) PRIMARY KEY,
  raw_query TEXT NOT NULL,
  clean_search_phrase TEXT NOT NULL,
  core_subject TEXT NOT NULL,
  target_entity TEXT,
  aspect TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  is_compound BOOLEAN NOT NULL DEFAULT false,
  sub_queries JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_query_understanding_hash ON query_understanding_cache(query_hash);

-- Phase 4: Cloud Connectors & Google Drive Account Storage
CREATE TABLE IF NOT EXISTS connector_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL DEFAULT 'google_drive',
  email VARCHAR(255),
  account_name VARCHAR(255),
  encrypted_tokens TEXT NOT NULL,
  selected_folders JSONB DEFAULT '[]',
  sync_cursor VARCHAR(255),
  status VARCHAR(32) DEFAULT 'connected',
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_connector_accounts_user ON connector_accounts(user_id);
ALTER TABLE connector_accounts ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Alter media_assets for Cloud Connectors (Google Drive)
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS external_file_id VARCHAR(255);
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS connector_account_id UUID REFERENCES connector_accounts(id) ON DELETE SET NULL;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS drive_modified_time TIMESTAMPTZ;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS drive_web_view_link VARCHAR(1024);
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS proxy_remote_id VARCHAR(255);
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS thumbnail_remote_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_assets_external_file ON media_assets(external_file_id, user_id);
CREATE INDEX IF NOT EXISTS idx_assets_connector_acc ON media_assets(connector_account_id);
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS thumbnail_data TEXT;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS index_version INT DEFAULT 1;



