import { Injectable, Logger } from '@nestjs/common';
import fuzzysort from 'fuzzysort';

type SpiderTables = Array<{
  db_id: string;
  table_names?: string[];
  table_names_original?: string[];
  foreign_keys?: [number, number][];
  column_names?: [number, string][];
}>;

@Injectable()
export class OpenTablesService {
  private readonly log = new Logger(OpenTablesService.name);
  private corpus: string[] = [];
  private fuseIndex?: ReturnType<(typeof fuzzysort)['go']>;
  private built = false;

  // Build the big list once, keep in memory
  async initCorpus(force = false) {
    if (this.built && !force) return;
    const fromSpider = await this.loadSpiderTables();
    const all = new Set<string>(fromSpider);
    this.corpus = Array.from(all);
    this.built = true;
    this.log.log(`Open table corpus ready: ${this.corpus.length} names`);
  }

  private async loadSpiderTables(): Promise<string[]> {
    const url = process.env.OPEN_TABLES_SPIDER_URL!;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Spider fetch failed: HTTP ${res.status}`);
    const data = (await res.json()) as SpiderTables;

    // Flatten to "db.table" strings; prefer cleaned table_names if present
    const names: string[] = [];
    for (const db of data) {
      const tnames =
        (db.table_names && db.table_names.length ? db.table_names : db.table_names_original) ?? [];
      for (const t of tnames) {
        if (!t) continue;
        names.push(`${db.db_id}.${t}`);
        names.push(t); // also add raw table name for better recall
      }
    }
    return names;
  }

  async suggestTables(query: string, topK = 10, minScore = -10000) {
    if (!this.built) await this.initCorpus();
    // fuzzysort just needs the array; it returns scored results
    const results = fuzzysort.go(query, this.corpus, { limit: topK });
    return results
      .filter((r) => r.score >= minScore)
      .map((r) => ({
        table: r.target,
        score: r.score, // higher is better
      }));
  }

  // Batch version
  async suggestForList(queries: string[], topK = 10, minScore = -10000) {
    if (!this.built) await this.initCorpus();
    return Promise.all(queries.map((q) => this.suggestTables(q, topK, minScore)));
  }
}
