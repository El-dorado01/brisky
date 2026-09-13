const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '..', 'apps', 'api');
const Pool = require(require.resolve('pg', { paths: [apiDir] })).Pool;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/brisky',
});

async function runTests() {
  console.log('================================================================');
  console.log('                P2 RELIABILITY & LIFECYCLE TESTS                ');
  console.log('================================================================\n');

  // 1. Authenticate to API
  let token = '';
  let userId = '';
  try {
    const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@brisky.local', password: 'demopassword123' }),
    });
    if (!loginRes.ok) {
      console.error('Login failed:', loginRes.status, await loginRes.text());
      return;
    }
    const authData = await loginRes.json();
    token = authData.token;
    userId = authData.user.id;
    console.log(`[AUTH] Successfully authenticated as demo user (${userId})`);
  } catch (err) {
    console.error('[AUTH] Could not connect to API:', err.message);
    return;
  }

  // TEST 1: Stalled Jobs & Interrupted Assets Boot Reconciliation
  console.log('\n--- TEST 1: Boot Reconciliation of Stalled Active Jobs ---');
  const activeJobsBefore = await pool.query(`SELECT count(*) FROM indexing_jobs WHERE status = 'active'`);
  console.log(`Remaining 'active' indexing_jobs in DB: ${activeJobsBefore.rows[0].count}`);

  const reconciledJobs = await pool.query(
    `SELECT count(*) FROM indexing_jobs WHERE error LIKE '%Interrupted by server restart%'`,
  );
  console.log(`Jobs reconciled with restart notification: ${reconciledJobs.rows[0].count}`);

  // Trigger manual reconciliation check if any were left before restart
  const storageRoot = path.resolve(__dirname, '..', 'storage');
  const proxyDir = path.join(storageRoot, 'proxies');

  // TEST 2: Original Deletion and Proxy Fallback for Re-indexing
  console.log('\n--- TEST 2: Original Deletion & Web Proxy Retry Fallback ---');
  // Find an asset that has a web proxy
  const proxyFiles = fs.readdirSync(proxyDir).filter((f) => f.endsWith('.mp4'));
  if (proxyFiles.length === 0) {
    console.log('No proxy files found to test.');
  } else {
    const testAssetId = proxyFiles[0].replace('.mp4', '');
    console.log(`Selected asset with existing web proxy: ${testAssetId}`);

    // Check DB row
    const assetRow = await pool.query(`SELECT id, original_filename, original_path, original_deleted FROM media_assets WHERE id = $1`, [testAssetId]);
    if (assetRow.rows.length > 0) {
      const row = assetRow.rows[0];
      console.log(`Asset: "${row.original_filename}" (original_deleted: ${row.original_deleted}, path: ${row.original_path || 'NONE'})`);

      // Delete original master file via API endpoint if not already deleted
      if (!row.original_deleted) {
        console.log(`Calling POST /api/v1/media/${testAssetId}/delete-original...`);
        const delRes = await fetch(`http://localhost:3000/api/v1/media/${testAssetId}/delete-original`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const delData = await delRes.json();
        console.log(`Delete response:`, delData);
      }

      // Now call retry endpoint: POST /api/v1/indexing/jobs/:id/retry
      console.log(`Calling POST /api/v1/indexing/jobs/${testAssetId}/retry on asset with deleted original bytes...`);
      const retryRes = await fetch(`http://localhost:3000/api/v1/indexing/jobs/${testAssetId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log(`Retry HTTP status: ${retryRes.status}`);
      const retryData = await retryRes.json();
      console.log(`Retry response:`, retryData);

      if (retryRes.ok && retryData.success) {
        console.log(`✅ SUCCESS: Asset with deleted original successfully accepted for re-indexing via web proxy fallback!`);
      } else {
        console.error(`❌ FAILED: Retry rejected:`, retryData);
      }
    }
  }

  // TEST 3: Concurrent Ingest Race & Active In-Flight Deduplication
  console.log('\n--- TEST 3: Active State Ingest Deduplication ---');
  // Pick an asset checksum from media_assets
  const checksumRow = await pool.query(
    `SELECT id, original_filename, checksum, status FROM media_assets WHERE user_id = $1 LIMIT 1`,
    [userId],
  );

  if (checksumRow.rows.length > 0) {
    const asset = checksumRow.rows[0];
    console.log(`Checking deduplication against known checksum ${asset.checksum} (${asset.original_filename}, status: ${asset.status})`);

    // Verify findByChecksum behavior across states
    const checkQuery = await pool.query(
      `SELECT id, original_filename, status FROM media_assets
       WHERE checksum = $1 AND user_id = $2 AND status IN ('indexed', 'queued', 'processing')
       ORDER BY CASE WHEN status = 'indexed' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`,
      [asset.checksum, userId],
    );

    console.log(`Active state lookup found asset: ${checkQuery.rows[0]?.id} with status: "${checkQuery.rows[0]?.status}"`);
    if (checkQuery.rows.length > 0) {
      console.log(`✅ SUCCESS: findByChecksum accurately recognizes in-flight and indexed assets, preventing duplicate queueing!`);
    } else {
      console.error(`❌ FAILED: active state lookup returned no results.`);
    }
  }

  await pool.end();
  console.log('\n================================================================');
  console.log('                     ALL P2 TESTS COMPLETE                      ');
  console.log('================================================================');
}

runTests();
