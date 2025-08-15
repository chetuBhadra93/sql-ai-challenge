import { Body, Controller, Post } from '@nestjs/common';
import { Nl2SqlService } from './nl2sql.service';
import { DbService } from './db.service';
import { TableEmbeddingsService } from './table-embeddings.service';
import { QueryMode, ReactQueryResult, Nl2SqlResult } from './types';

@Controller('api/query')
export class QueryController {
  constructor(
    private readonly nl2sql: Nl2SqlService,
    private readonly db: DbService,
    private readonly tableEmbeddings: TableEmbeddingsService,
  ) {}

  @Post()
  async handle(@Body() body: { prompt: string; mode?: QueryMode }) {
    const { prompt, mode = 'direct' } = body;

    if (mode === 'react') {
      return await this.handleReactQuery(prompt);
    } else {
      return await this.handleDirectQuery(prompt);
    }
  }

  private async handleDirectQuery(prompt: string) {
    const { sql } = await this.nl2sql.translate(prompt);
    const rows = await this.db.execSelect(sql);

    // Required behavior: print to Node console
    console.log('\n--- NL→SQL (Direct) ---');
    console.log('Prompt:', prompt);
    console.log('SQL:', sql);
    console.log('Rows:', rows.length);
    console.table(rows);

    return { sql, rows };
  }

  private async handleReactQuery(prompt: string) {
    const result = await this.nl2sql.process(prompt, 'react');

    // Check if this is a direct mode fallback (Nl2SqlResult instead of ReactQueryResult)
    if ('sql' in result && typeof result.sql === 'string') {
      // This is a fallback to direct mode - convert to ReactQueryResult format
      const directResult = result as Nl2SqlResult;
      const rows = await this.db.execSelect(directResult.sql);

      const reactResult: ReactQueryResult = {
        sql: [directResult.sql],
        reasoning: ['Fallback to direct mode due to ReAct being disabled'],
        observations: ['Direct SQL generation used'],
        rows: rows,
        iterations: 1,
        success: true,
      };

      // Enhanced console logging for ReAct mode (fallback)
      console.log('\n--- NL→SQL (ReAct - Fallback) ---');
      console.log('Prompt:', prompt);
      console.log('Mode: ReAct Agent (Fallback to Direct)');
      console.log('Success:', reactResult.success);
      console.log('Iterations:', reactResult.iterations);
      console.log('SQL Queries:', reactResult.sql);
      console.log('Reasoning Steps:', reactResult.reasoning);
      console.log('Observations:', reactResult.observations);
      console.log('Final Rows:', reactResult.rows.length);
      if (reactResult.rows.length > 0) {
        console.table(reactResult.rows.slice(0, 10));
      }

      return reactResult;
    }

    // This is a proper ReactQueryResult
    const reactResult = result as ReactQueryResult;

    // For ReAct mode, if rows are empty, execute the final SQL to get actual data
    if (
      reactResult.success &&
      reactResult.sql?.length > 0 &&
      (!reactResult.rows || reactResult.rows.length === 0)
    ) {
      try {
        const finalSql = reactResult.sql[reactResult.sql.length - 1];
        reactResult.rows = await this.db.execSelect(finalSql);
      } catch (error) {
        console.warn('Failed to execute final SQL from ReAct agent:', error.message);
      }
    }

    // Enhanced console logging for ReAct mode
    console.log('\n--- NL→SQL (ReAct) ---');
    console.log('Prompt:', prompt);
    console.log('Mode: ReAct Agent');
    console.log('Success:', reactResult.success);
    console.log('Iterations:', reactResult.iterations);
    console.log('SQL Queries:', reactResult.sql);
    console.log('Reasoning Steps:', reactResult.reasoning);
    console.log('Observations:', reactResult.observations);
    console.log('Final Rows:', reactResult.rows?.length || 0);
    if (reactResult.rows && reactResult.rows.length > 0) {
      console.table(reactResult.rows.slice(0, 10)); // Limit console output to 10 rows
    }

    return reactResult;
  }

  @Post('match')
  async match(@Body() body: { table: string; topK?: number }) {
    const { table, topK = 5 } = body;
    
    try {
      const matches = await this.tableEmbeddings.findBestTableMatch(table, topK);
      
      console.log('\n--- Table Vector Search ---');
      console.log('Query:', table);
      console.log('Matches found:', matches.length);
      console.table(matches.map(m => ({
        table: m.metadata.tableName,
        score: m.score.toFixed(4),
        description: m.metadata.description || 'No description'
      })));

      return { 
        count: matches.length, 
        results: matches.map(match => ({
          tableName: match.metadata.tableName,
          score: match.score,
          description: match.metadata.description
        }))
      };
    } catch (error) {
      console.error('Error in table matching:', error.message);
      return { 
        count: 0, 
        results: [],
        error: error.message 
      };
    }
  }

  @Post('init-embeddings')
  async initEmbeddings() {
    try {
      await this.tableEmbeddings.initializeEmbeddings();
      return { success: true, message: 'Embeddings initialized successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
