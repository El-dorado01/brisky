import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { assertSearchActive, searchSignal, SearchDeadlineError } from '../../common/search-deadline';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;
  private cancellationPool!: Pool;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const connectionString = this.configService.get<string>(
      'DATABASE_URL',
      'postgresql://postgres:postgrespassword@localhost:5432/brisky',
    );

    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    // Separate capacity lets cancellation proceed even when every search connection is busy.
    this.cancellationPool = new Pool({ connectionString, max: 2, idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 1000, query_timeout: 2000 });
    this.cancellationPool.on('error', (err) => this.logger.warn(`Search cancellation connection error: ${err.message}`));

    this.pool.on('error', (err) => {
      this.logger.error(`Unexpected PostgreSQL client error: ${err.message}`, err.stack);
    });

    await this.runMigrations();
  }

  async onModuleDestroy() {
    if (this.cancellationPool) await this.cancellationPool.end();
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL connection pool closed');
    }
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      assertSearchActive();
      const signal = searchSignal();
      const res = signal ? await this.searchQuery<T>(text, params, signal) : await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      if (duration > 300) {
        this.logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}`);
      }
      return res;
    } catch (err) {
      if (searchSignal()?.aborted || err instanceof SearchDeadlineError) throw new SearchDeadlineError();
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Database query error: ${message} (Query: ${text.substring(0, 120)})`);
      throw err;
    }
  }

  private async searchQuery<T extends QueryResultRow>(text: string, params: any[] | undefined,
    signal: AbortSignal): Promise<QueryResult<T>> {
    // A queued pool checkout can complete after the caller times out. Never send SQL then.
    const client = await this.pool.connect();
    let cancellation: Promise<unknown> | undefined;
    let aborted = signal.aborted;
    const cancel = () => {
      aborted = true;
      const pid = (client as PoolClient & { processID: number }).processID;
      cancellation = this.cancellationPool.query('SELECT pg_cancel_backend($1)', [pid])
        .catch((err) => this.logger.warn(`Could not cancel search SQL: ${err.message}`));
    };
    try {
      if (aborted) throw new SearchDeadlineError();
      signal.addEventListener('abort', cancel, { once: true });
      return await client.query<T>(text, params);
    } finally {
      signal.removeEventListener('abort', cancel);
      // Do not reuse the backend before a delayed cancellation has finished targeting it.
      if (cancellation) await cancellation;
      client.release(aborted);
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  private async runMigrations() {
    try {
      const client = await this.pool.connect();
      try {
        const candidates = [
          path.join(__dirname, 'schema.sql'),
          path.resolve(process.cwd(), 'src/modules/database/schema.sql'),
          path.resolve(process.cwd(), 'apps/api/src/modules/database/schema.sql'),
          path.resolve(__dirname, '../../../src/modules/database/schema.sql'),
        ];
        const schemaPath = candidates.find((p) => fs.existsSync(p));
        if (schemaPath) {
          const sql = fs.readFileSync(schemaPath, 'utf8');
          // API and worker can start together. Serialize schema application,
          // including CREATE EXTENSION, which can race despite IF NOT EXISTS.
          await client.query('BEGIN');
          try {
            await client.query('SELECT pg_advisory_xact_lock(624917302)');
            await client.query(sql);
            // Keep SaaS storage separate, but apply it atomically after engine prerequisites.
            const saasSchemaPath = path.join(path.dirname(schemaPath), 'saas-schema.sql');
            if (!fs.existsSync(saasSchemaPath)) throw new Error('saas-schema.sql file not found');
            await client.query(fs.readFileSync(saasSchemaPath, 'utf8'));
            const faceSchemaPath=path.join(path.dirname(schemaPath),'face-schema.sql');
            if(!fs.existsSync(faceSchemaPath))throw new Error('face-schema.sql file not found');
            await client.query(fs.readFileSync(faceSchemaPath,'utf8'));
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          }
          this.logger.log(`PostgreSQL schema migrations applied from ${schemaPath}`);
        } else {
          this.logger.warn('schema.sql file not found; ensure schema is loaded manually');
        }
      } finally {
        client.release();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to apply schema migrations: ${message}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }
}
