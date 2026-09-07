import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const connectionString = this.configService.get<string>(
      'DATABASE_URL',
      'postgresql://postgres:postgrespassword@localhost:5432/media_intel',
    );

    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      this.logger.error(`Unexpected PostgreSQL client error: ${err.message}`, err.stack);
    });

    await this.runMigrations();
  }

  async onModuleDestroy() {
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
      const res = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      if (duration > 300) {
        this.logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}`);
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Database query error: ${message} (Query: ${text.substring(0, 120)})`);
      throw err;
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
          await client.query(sql);
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
