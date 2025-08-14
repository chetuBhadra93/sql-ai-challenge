import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Nl2SqlResult } from './types';

@Injectable()
export class Nl2SqlService {
  private readonly logger = new Logger(Nl2SqlService.name);

  private readonly DB_SCHEMA = `
DATABASE SCHEMA:
Tables:
  contacts(id INTEGER, first_name TEXT, last_name TEXT, created_at TEXT)
  cases(id INTEGER, topic TEXT, created_at TEXT)

QUERY GENERATION RULES:
1. ONLY generate SELECT queries for reading data from contacts and cases tables
2. For ANY request that involves writing, updating, deleting, or creating data: SELECT 'No data available' as message LIMIT 1
3. For requests beyond simple data retrieval: SELECT 'No data available' as message LIMIT 1
4. ALWAYS add "LIMIT 10" to data queries unless user explicitly asks for "all", "count", or specifies a different number
5. For greetings like "hi", "hello": SELECT 'Hello! Ask me about contacts or cases.' as message LIMIT 1
6. For vague queries, default to the most relevant table based on keywords:
   - Keywords like "people", "users", "contacts", "names" → use contacts table
   - Keywords like "issues", "cases", "topics", "problems" → use cases table
   - If unclear, default to contacts table
7. Use proper WHERE clauses for filtering based on user criteria
8. For counting: use COUNT(*) without LIMIT
9. For date ranges: compare created_at as 'YYYY-MM-DD' strings
10. Generate ONLY ANSI SQL compatible with SQLite
11. Return ONLY the final SQL, no explanation

EXAMPLES:
- "hi" → SELECT 'Hello! Ask me about contacts or cases.' as message LIMIT 1
- "create user" → SELECT 'No data available' as message LIMIT 1
- "delete contacts" → SELECT 'No data available' as message LIMIT 1
- "update records" → SELECT 'No data available' as message LIMIT 1
- "show me users" → SELECT * FROM contacts LIMIT 10
- "recent contacts" → SELECT * FROM contacts ORDER BY created_at DESC LIMIT 10
- "all contacts" → SELECT * FROM contacts
- "count contacts" → SELECT COUNT(*) FROM contacts
- "first 5 contacts" → SELECT * FROM contacts LIMIT 5
`;

  async translate(prompt: string): Promise<Nl2SqlResult> {
    const allowWrites = process.env.ALLOW_WRITE_SQL === 'true';
    
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY!,
      modelName: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0
    });

    const system = [
      'You are an expert SQL query generator that converts natural language to precise SQL queries.',
      'You MUST follow the database schema and rules exactly as specified below.',
      '',
      this.DB_SCHEMA,
      '',
      allowWrites
        ? 'WRITE OPERATIONS: Permitted (INSERT/UPDATE/DELETE allowed)'
        : 'SECURITY CONSTRAINT: Generate ONLY SELECT queries. Never INSERT/UPDATE/DELETE/DROP/ALTER.',
      '',
      'CRITICAL: Analyze the user\'s intent carefully.',
      'If the request involves anything other than SELECT operations, respond with: SELECT \'No data available\' as message LIMIT 1',
      'For valid SELECT requests, use the examples above as guidance.',
      'ALWAYS include LIMIT 10 for data queries unless explicitly requested otherwise.'
    ].join('\n');

    const user = `Question: ${prompt}\n\nReturn ONLY the SQL for SQLite.`;

    const resp = await llm.invoke([
      new SystemMessage(system),
      new HumanMessage(user)
    ]);

    let sql = String(resp.content).trim();

    // Safety: enforce SELECT-only unless allowWrites
    if (!allowWrites && !/^select\s/i.test(sql)) {
      if (/^\s*```sql/i.test(sql)) {
        sql = sql.replace(/^\s*```sql/i, '').replace(/```$/, '').trim();
      }
      if (!/^select\s/i.test(sql)) {
        throw new Error('Guard: Non-SELECT SQL generated. Aborting.');
      }
    }

    // Normalize code block wrappers if present
    sql = sql.replace(/^\s*```sql/i, '').replace(/^\s*```/, '').replace(/```$/, '').trim();

    this.logger.log(`Generated SQL: ${sql}`);
    return { sql };
  }
}