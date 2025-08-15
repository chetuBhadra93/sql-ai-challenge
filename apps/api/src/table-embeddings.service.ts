import { Injectable, Logger } from '@nestjs/common';
import { DbService } from './db.service';
import { PineconeService } from './pinecone.service';

interface TableInfo {
  name: string;
  description?: string;
}

@Injectable()
export class TableEmbeddingsService {
  private readonly logger = new Logger(TableEmbeddingsService.name);

  constructor(
    private readonly db: DbService,
    private readonly pinecone: PineconeService,
  ) {}

  async getTablesFromDatabase(): Promise<TableInfo[]> {
    try {
      const sql = `
        SELECT 
          table_name as name,
          COALESCE(
            obj_description(c.oid),
            'Table: ' || table_name
          ) as description
        FROM information_schema.tables t
        LEFT JOIN pg_class c ON c.relname = t.table_name
        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;
      
      const tables = await this.db.execSelect<TableInfo>(sql);
      this.logger.log(`Found ${tables.length} tables in database`);
      return tables;
    } catch (error) {
      this.logger.error('Error fetching tables from database:', error.message);
      return [];
    }
  }

  async initializeEmbeddings(): Promise<void> {
    try {
      await this.pinecone.initialize();
      const tables = await this.getTablesFromDatabase();
      
      if (tables.length === 0) {
        this.logger.warn('No tables found in database');
        return;
      }

      await this.pinecone.upsertTableEmbeddings(tables);
      this.logger.log(`Successfully created embeddings for ${tables.length} tables`);
    } catch (error) {
      this.logger.error('Error initializing embeddings:', error.message);
      throw error;
    }
  }

  async findBestTableMatch(query: string, topK: number = 5) {
    try {
      const matches = await this.pinecone.searchSimilarTables(query, topK);
      this.logger.log(`Found ${matches.length} table matches for query: "${query}"`);
      return matches;
    } catch (error) {
      this.logger.error('Error searching for table matches:', error.message);
      throw error;
    }
  }
}