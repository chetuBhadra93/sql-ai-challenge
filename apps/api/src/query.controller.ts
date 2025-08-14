import { Body, Controller, Post } from '@nestjs/common';
import { Nl2SqlService } from './nl2sql.service';
import { DbService } from './db.service';

@Controller('api/query')
export class QueryController {
  constructor(
    private readonly nl2sql: Nl2SqlService,
    private readonly db: DbService
  ) {}

  @Post()
  async handle(@Body() body: { prompt: string }) {
    const { prompt } = body;
    const { sql } = await this.nl2sql.translate(prompt);
    const rows = this.db.execSelect(sql);

    // Required behavior: print to Node console
    console.log('\n--- NL→SQL ---');
    console.log('Prompt:', prompt);
    console.log('SQL:', sql);
    console.log('Rows:', rows.length);
    console.table(rows);

    return { sql, rows }; // optional: let frontend render
  }
}