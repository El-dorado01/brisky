const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const eqIdx = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const apiDir = path.join(__dirname, '..', 'apps', 'api');
const Pool = require(require.resolve('pg', { paths: [apiDir] })).Pool;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/media_intel',
});

async function main() {
  console.log('=== P1 Database Index Migration ===');
  const client = await pool.connect();

  try {
    // 1. Drop old mismatched index if present
    console.log('Step 1: Dropping legacy mismatched GIN index (idx_segments_fts)...');
    await client.query(`DROP INDEX IF EXISTS idx_segments_fts;`);
    console.log('✓ Legacy index dropped (if it existed).');

    // 2. Create immutable FTS generator function and aligned multi-modal GIN index on 'simple' configuration
    console.log('\nStep 2: Creating immutable FTS function and multi-modal GIN index...');
    await client.query(`
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
    `);

    const startGin = Date.now();
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_segments_fts_simple ON media_segments USING GIN (
        media_segment_search_text(title, description, transcript_text, actions, visual_objects, on_screen_text)
      );
    `);
    console.log(`✓ Multi-modal GIN index created in ${Date.now() - startGin}ms.`);

    // 3. Create HNSW Vector Index on media_segments.embedding (using halfvec(3072) for > 2000 dimensions)
    console.log('\nStep 3: Creating HNSW vector index (idx_segments_embedding_hnsw)...');
    const startHnsw = Date.now();
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_segments_embedding_hnsw ON media_segments 
        USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops) 
        WITH (m = 16, ef_construction = 64);
      `);
      console.log(`✓ HNSW halfvec(3072) vector index created in ${Date.now() - startHnsw}ms.`);
    } catch (hnswErr) {
      console.warn('HNSW halfvec failed:', hnswErr.message);
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_segments_embedding_hnsw ON media_segments 
          USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);
        `);
        console.log(`✓ HNSW halfvec fallback created in ${Date.now() - startHnsw}ms.`);
      } catch (fallbackErr) {
        console.warn('Note: pgvector 3072-dim indexing requires pgvector >= 0.7.0 for halfvec. Exact KNN sequential scan will continue to be used seamlessly:', fallbackErr.message);
      }
    }

    // 4. Verify Indexes exist in pg_indexes
    console.log('\nStep 4: Verifying indexes in PostgreSQL metadata...');
    const indexCheck = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'media_segments' AND indexname IN ('idx_segments_fts_simple', 'idx_segments_embedding_hnsw');
    `);
    for (const r of indexCheck.rows) {
      console.log(`✓ ${r.indexname}`);
    }

    // 5. Test EXPLAIN on FTS query
    console.log('\nStep 5: Testing query plan for FTS...');
    const explainFts = await client.query(`
      EXPLAIN SELECT id FROM media_segments 
      WHERE media_segment_search_text(title, description, transcript_text, actions, visual_objects, on_screen_text) @@ to_tsquery('simple', 'pharmacology:*');
    `);
    console.log('FTS Plan:');
    for (const r of explainFts.rows) {
      console.log('  ', r['QUERY PLAN']);
    }

    console.log('\n=== P1 Index Migration Completed Successfully ===');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
