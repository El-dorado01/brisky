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
const { GoogleGenAI } = require(require.resolve('@google/genai', { paths: [apiDir] }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/brisky',
});

// Setup key pool
const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const keys = rawKeys.split(',').map((k) => k.trim()).filter(Boolean);
if (keys.length === 0) {
  console.error('No GEMINI_API_KEY found in environment!');
  process.exit(1);
}

const clients = keys.map((key) => new GoogleGenAI({ apiKey: key }));
let keyIdx = 0;
function getClient() {
  const client = clients[keyIdx % clients.length];
  keyIdx++;
  return client;
}

async function getEmbedding(text, retries = 5) {
  const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = getClient();
      const res = await client.models.embedContent({
        model,
        contents: text,
      });
      const values = res.embeddings?.[0]?.values;
      if (values && values.length > 0) return values;
      throw new Error('Empty embedding values');
    } catch (err) {
      lastErr = err;
      // On rate limit or error, rotate key immediately and wait
      keyIdx++;
      const is429 = err?.status === 429 || String(err).includes('429') || String(err).includes('RESOURCE_EXHAUSTED');
      const waitMs = is429 ? 3000 * attempt : 1000 * attempt;
      console.warn(`Embedding attempt ${attempt} warning (${is429 ? '429 Rate Limit' : err.message}); rotating key and waiting ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function main() {
  console.log('=== Starting Gemini 3072-Dimensional Re-embedding Migration ===');
  console.log(`Using ${keys.length} API key(s) in pool`);

  // Ensure column is unconstrained during update
  await pool.query('ALTER TABLE media_segments ALTER COLUMN embedding TYPE vector;');

  const { rows: segments } = await pool.query(`
    SELECT id, title, description, visual_objects, actions, transcript_text, on_screen_text
    FROM media_segments
    WHERE embedding IS NULL OR vector_dims(embedding) != 3072
    ORDER BY id
  `);

  console.log(`Found ${segments.length} remaining segments to re-embed with Gemini.`);

  const t0 = Date.now();
  let completed = 0;
  const batchSize = 5;

  for (let i = 0; i < segments.length; i += batchSize) {
    const chunk = segments.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (seg) => {
        const text = [
          seg.title,
          seg.description,
          (seg.visual_objects || []).join(', '),
          (seg.actions || []).join(', '),
          seg.transcript_text,
          (seg.on_screen_text || []).join(' '),
        ]
          .filter(Boolean)
          .join('. ');

        const cleanText = text.trim() || seg.title || 'video moment';
        const vector = await getEmbedding(cleanText);
        const vectorStr = '[' + vector.join(',') + ']';

        await pool.query(
          'UPDATE media_segments SET embedding = $1::vector, provider = $2, model = $3 WHERE id = $4',
          [vectorStr, 'google', 'gemini-embedding-001', seg.id]
        );
      })
    );

    completed += chunk.length;
    console.log(`Re-embedded ${completed} / ${segments.length} segments (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  console.log('\nApplying vector(3072) constraint to media_segments.embedding...');
  await pool.query('ALTER TABLE media_segments ALTER COLUMN embedding TYPE vector(3072);');

  // Verification check
  const check = await pool.query(
    'SELECT vector_dims(embedding) as dims, count(*) as count FROM media_segments WHERE embedding IS NOT NULL GROUP BY vector_dims(embedding)'
  );
  console.log('\nVerification:', check.rows);

  console.log(`\nSUCCESS: Re-embedded all ${segments.length} segments to 3072 dimensions in ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
