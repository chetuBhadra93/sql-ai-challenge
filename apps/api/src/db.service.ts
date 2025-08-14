import { Injectable, Logger } from '@nestjs/common';
import Database from 'better-sqlite3';

@Injectable()
export class DbService {
  private readonly logger = new Logger(DbService.name);
  private readonly db: Database.Database;

  constructor() {
    const path = process.env.SQLITE_PATH || './db/app.db';
    this.db = new Database(path, { fileMustExist: true });
    this.logger.log(`Connected SQLite at ${path}`);
  }

  // SELECT-only guard by default
  execSelect<T = unknown>(sql: string, params: any[] = []): T[] {
    if (String(process.env.ALLOW_WRITE_SQL) !== 'true') {
      if (!/^\s*select\s/i.test(sql)) {
        throw new Error('Guard: Only SELECT statements are allowed.');
      }
    }
    const stmt = this.db.prepare(sql);
    // Heuristic: if query likely returns rows
    return stmt.raw().all(...params) as T[];
  }
}