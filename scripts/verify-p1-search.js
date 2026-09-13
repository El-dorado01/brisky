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
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/brisky',
});

async function run() {
  console.log('=== Verifying P1 Search Retrieval ===');

  // Test 1: Verify Index Scan on media_segment_search_text
  const explain = await pool.query(`
    EXPLAIN ANALYZE SELECT id, title 
    FROM media_segments 
    WHERE media_segment_search_text(title, description, transcript_text, actions, visual_objects, on_screen_text) @@ to_tsquery('simple', 'respiratory:* | pharmacology:*');
  `);
  console.log('\nEXPLAIN ANALYZE for Multi-Term OR Query:');
  for (const r of explain.rows) {
    console.log('  ', r['QUERY PLAN']);
  }

  // Test 2: Check matching rows for multi-word query that previously might have dropped out
  const query = await pool.query(`
    WITH scored AS (
      SELECT id, title, start_time, end_time,
             ts_rank_cd(media_segment_search_text(title, description, transcript_text, actions, visual_objects, on_screen_text), to_tsquery('simple', 'respiratory:* & pharmacology:*')) AS and_rank,
             ts_rank_cd(media_segment_search_text(title, description, transcript_text, actions, visual_objects, on_screen_text), to_tsquery('simple', 'respiratory:* | pharmacology:*')) AS or_rank
      FROM media_segments
      WHERE media_segment_search_text(title, description, transcript_text, actions, visual_objects, on_screen_text) @@ to_tsquery('simple', 'respiratory:* | pharmacology:*')
    )
    SELECT * FROM scored
    ORDER BY (and_rank * 2.5 + or_rank) DESC
    LIMIT 5;
  `);

  console.log('\nRetrieved segments for "respiratory pharmacology":', query.rows.length);
  for (const r of query.rows) {
    console.log(`- [${r.start_time}s - ${r.end_time}s] ${r.title} (and_rank: ${r.and_rank}, or_rank: ${r.or_rank})`);
  }

  await pool.end();
}

run().catch(console.error);
