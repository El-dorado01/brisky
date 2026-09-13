const fs = require('fs');
const path = require('path');

// Manually parse .env if present
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

// Resolve pg and ioredis from apps/api/node_modules
const apiDir = path.join(__dirname, '..', 'apps', 'api');
const Pool = require(require.resolve('pg', { paths: [apiDir] })).Pool;
const Redis = require(require.resolve('ioredis', { paths: [apiDir] }));

async function main() {
  console.log('--- CLEAN SLATE INITIALIZATION ---');

  // 1. Wipe Storage Directories
  const storageDirs = [
    path.join(__dirname, '..', 'storage', 'uploads'),
    path.join(__dirname, '..', 'storage', 'proxies'),
    path.join(__dirname, '..', 'storage', 'thumbnails'),
    path.join(__dirname, '..', 'storage', 'scratch'),
  ];

  for (const dir of storageDirs) {
    if (fs.existsSync(dir)) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        fs.rmSync(itemPath, { recursive: true, force: true });
      }
      console.log(`[Storage] Cleared ${dir} (${items.length} items removed)`);
    } else {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[Storage] Created directory ${dir}`);
    }
  }

  // 2. Clear Database Records
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/brisky';
  let pool;
  try {
    pool = new Pool({ connectionString: dbUrl });
    await pool.query('SELECT 1');
    console.log('[PostgreSQL] Connected successfully to ' + dbUrl);

    // Truncate tables with CASCADE
    await pool.query(`
      TRUNCATE TABLE indexing_jobs, media_observations, media_segments, media_assets CASCADE;
    `);
    console.log('[PostgreSQL] Truncated indexing_jobs, media_observations, media_segments, media_assets.');

    // Remove users except re-seeding demo user
    await pool.query('TRUNCATE TABLE users CASCADE;');
    console.log('[PostgreSQL] Truncated users table.');

    // Seed default demo user: demo@brisky.local / demopassword123
    const { scryptSync, randomBytes } = require('crypto');
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync('demopassword123', salt, 64).toString('hex');
    const passwordHash = `${salt}:${hash}`;
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, name)
      VALUES ($1, $2, $3)
      RETURNING id, email, name;
    `, ['demo@brisky.local', passwordHash, 'Demo Creator']);
    console.log(`[PostgreSQL] Re-seeded default user: ${userRes.rows[0].email} (${userRes.rows[0].id})`);

  } catch (err) {
    console.warn('[PostgreSQL] Could not clear database (DB might be offline or unreachable):', err.message);
  } finally {
    if (pool) await pool.end().catch(() => undefined);
  }

  // 3. Clear Redis Queues
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  let redis;
  try {
    redis = new Redis({ host: redisHost, port: redisPort, connectTimeout: 3000, lazyConnect: true });
    await redis.connect();
    console.log('[Redis] Connected successfully to Redis at ' + redisHost + ':' + redisPort);
    const keys = await redis.keys('bull:indexing:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Redis] Deleted ${keys.length} BullMQ queue keys.`);
    } else {
      console.log('[Redis] No BullMQ queue keys found.');
    }
  } catch (err) {
    console.warn('[Redis] Could not clear Redis (Redis might be offline or unreachable):', err.message);
  } finally {
    if (redis) redis.disconnect();
  }

  console.log('--- CLEAN SLATE COMPLETE ---');
}

main().catch((err) => {
  console.error('Fatal error during clean slate:', err);
  process.exit(1);
});
