-- PostgreSQL Schema for Media Intel Phase 2
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
  original_path VARCHAR(1024),
  proxy_status VARCHAR(32) DEFAULT 'ready',
  availability VARCHAR(32) DEFAULT 'available',
  parent_asset_id VARCHAR(64) REFERENCES media_assets(id) ON DELETE SET NULL,
  relationship_type VARCHAR(32) DEFAULT 'original',
  phash VARCHAR(64),
  cost_usd DOUBLE PRECISION DEFAULT 0,
  cost_per_source_minute_usd DOUBLE PRECISION DEFAULT 0,
  frames_analyzed INT DEFAULT 0,
  scene_count INT DEFAULT 0,
  index_duration_ms INT DEFAULT 0,
  analysis_version INT DEFAULT 2,
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
  status VARCHAR(32) NOT NULL DEFAULT 'waiting',
  stage VARCHAR(64) DEFAULT 'waiting',
  progress INT DEFAULT 0,
  error TEXT,
  attempts INT DEFAULT 0,
  provider VARCHAR(64) DEFAULT 'google',
  model VARCHAR(64) DEFAULT 'gemini-2.5-flash',
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
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS provider VARCHAR(64) DEFAULT 'google';
ALTER TABLE indexing_jobs ADD COLUMN IF NOT EXISTS model VARCHAR(64) DEFAULT 'gemini-2.5-flash';

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


