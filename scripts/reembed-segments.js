const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Parse .env if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// Resolve pg from apps/api
const apiDir = path.join(__dirname, '..', 'apps', 'api');
const Pool = require(require.resolve('pg', { paths: [apiDir] })).Pool;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/media_intel',
});

function getPythonBinary() {
  const projectRoot = path.join(__dirname, '..');
  const venvWin = path.resolve(projectRoot, 'services/whisper-transcriber/.venv/Scripts/python.exe');
  const venvUnix = path.resolve(projectRoot, 'services/whisper-transcriber/.venv/bin/python');
  if (fs.existsSync(venvWin)) return venvWin;
  if (fs.existsSync(venvUnix)) return venvUnix;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runEmbedBatch(texts) {
  return new Promise((resolve, reject) => {
    const pythonBin = getPythonBinary();
    const scriptPath = path.resolve(__dirname, '..', 'services/whisper-transcriber/embed.py');

    const child = spawn(pythonBin, [scriptPath], { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`embed.py exited with code ${code}: ${stderr}`));
      }
      try {
        const trimmed = stdout.trim();
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        const parsed = JSON.parse(trimmed.slice(start, end + 1));
        resolve(parsed.vectors);
      } catch (err) {
        reject(new Error(`Failed to parse JSON: ${err.message}`));
      }
    });

    child.stdin.write(JSON.stringify(texts));
    child.stdin.end();
  });
}

async function main() {
  console.log('=== Starting Local Embedding Migration (all-MiniLM-L6-v2) ===');
  const t0 = Date.now();

  const res = await pool.query(
    `SELECT id, asset_id, title, description, transcript_text, visual_objects, actions, on_screen_text
     FROM media_segments
     ORDER BY asset_id, start_time ASC`
  );

  const segments = res.rows;
  console.log(`Found ${segments.length} segments to re-embed.`);

  if (segments.length === 0) {
    console.log('No segments found. Exiting.');
    await pool.end();
    return;
  }

  const BATCH_SIZE = 40;
  let updatedCount = 0;

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    const texts = batch.map((s) => {
      return [
        s.title,
        s.description,
        (s.visual_objects || []).join(', '),
        (s.actions || []).join(', '),
        s.transcript_text,
        (s.on_screen_text || []).join(' '),
      ]
        .filter(Boolean)
        .join('. ');
    });

    const b0 = Date.now();
    const vectors = await runEmbedBatch(texts);
    const batchElapsed = Date.now() - b0;

    for (let j = 0; j < batch.length; j++) {
      const seg = batch[j];
      const vec = vectors[j];
      const vecStr = `[${vec.join(',')}]`;

      await pool.query(
        `UPDATE media_segments
         SET embedding = $1::vector,
             model = 'all-MiniLM-L6-v2',
             provider = 'local-onnx'
         WHERE id = $2`,
        [vecStr, seg.id]
      );
      updatedCount++;
    }

    console.log(
      `Re-embedded segments ${i + 1} to ${Math.min(i + BATCH_SIZE, segments.length)} / ${segments.length} (${batchElapsed}ms)`
    );
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`\nSUCCESS: Successfully re-embedded ${updatedCount} segments in ${totalElapsed}s using all-MiniLM-L6-v2!`);
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
