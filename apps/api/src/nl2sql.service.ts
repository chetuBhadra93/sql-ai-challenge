import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Nl2SqlResult, QueryMode, ReactQueryResult } from './types';
import { ReactAgentService } from './react-agent.service';

@Injectable()
export class Nl2SqlService {
  private readonly logger = new Logger(Nl2SqlService.name);

  constructor(private readonly reactAgentService: ReactAgentService) {}

  private readonly DB_SCHEMA = `
DATABASE SCHEMA (PostgreSQL):
Tables:
  contacts(id SERIAL PRIMARY KEY, first_name VARCHAR(100), last_name VARCHAR(100), created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE)
  cases(id SERIAL PRIMARY KEY, topic TEXT, created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE)

Views:
  recent_activity(type VARCHAR, id INTEGER, description TEXT, created_at TIMESTAMP WITH TIME ZONE)

QUERY GENERATION RULES:
1. ONLY generate SELECT queries for reading data from contacts, cases tables, and recent_activity view
2. For ANY request that involves writing, updating, deleting, or creating data: SELECT 'No data available' as message LIMIT 1
3. For requests beyond simple data retrieval: SELECT 'No data available' as message LIMIT 1
4. ALWAYS add "LIMIT 10" to data queries unless user explicitly asks for "all", "count", or specifies a different number
5. For greetings like "hi", "hello": SELECT 'Hello! Ask me about contacts or cases.' as message LIMIT 1
6. For vague queries, default to the most relevant table based on keywords:
   - Keywords like "people", "users", "contacts", "names" → use contacts table
   - Keywords like "issues", "cases", "topics", "problems" → use cases table
   - Keywords like "recent", "activity", "latest" → use recent_activity view
   - If unclear, default to contacts table
7. Use proper WHERE clauses for filtering based on user criteria
8. For counting: use COUNT(*) without LIMIT
9. For date ranges: use proper timestamp comparisons with PostgreSQL syntax
10. Generate ONLY PostgreSQL-compatible SQL
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
- "recent activity" → SELECT * FROM recent_activity LIMIT 10
`;

  async translate(prompt: string): Promise<Nl2SqlResult> {
    return this.translateDirect(prompt);
  }

  async process(prompt: string, mode: QueryMode = 'direct'): Promise<Nl2SqlResult | ReactQueryResult> {
    this.logger.log(`Processing query in ${mode} mode: ${prompt}`);

    if (mode === 'react') {
      // Check if ReAct mode is enabled
      const reactEnabled = process.env.REACT_MODE_ENABLED === 'true';
      if (!reactEnabled) {
        this.logger.warn('ReAct mode requested but not enabled, falling back to direct mode');
        return this.translateDirect(prompt);
      }

      try {
        return await this.reactAgentService.processQuery(prompt);
      } catch (error) {
        this.logger.error(`ReAct processing failed, falling back to direct mode: ${error.message}`);
        // Graceful fallback to direct mode
        const directResult = await this.translateDirect(prompt);
        return {
          sql: [directResult.sql],
          reasoning: [`ReAct mode failed, used direct translation: ${error.message}`],
          observations: ['Fallback to direct SQL generation'],
          rows: [], // Will be filled by controller
          iterations: 1,
          success: true
        };
      }
    }

    return this.translateDirect(prompt);
  }

  private async translateDirect(prompt: string): Promise<Nl2SqlResult> {
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

    const user = `Question: ${prompt}\n\nReturn ONLY the PostgreSQL SQL.`;

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