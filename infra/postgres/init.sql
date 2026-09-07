-- Runs only on first Postgres volume init.
-- The API also ensures this on boot so existing volumes still get pgvector.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
