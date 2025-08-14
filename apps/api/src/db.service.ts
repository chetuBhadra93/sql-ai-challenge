import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DbService {
  private readonly logger = new Logger(DbService.name);
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'sql_ai_db',
      user: process.env.POSTGRES_USER || 'sql_ai_user',
      password: process.env.POSTGRES_PASSWORD || 'sql_ai_password',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    this.logger.log(`Connected to PostgreSQL at ${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}`);
  }

  // SELECT-only guard by default
  async execSelect<T = unknown>(sql: string, params: any[] = []): Promise<T[]> {
    if (String(process.env.ALLOW_WRITE_SQL) !== 'true') {
      if (!/^\s*select\s/i.test(sql)) {
        throw new Error('Guard: Only SELECT statements are allowed.');
      }
    }
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('PostgreSQL connection pool closed');
  }
}