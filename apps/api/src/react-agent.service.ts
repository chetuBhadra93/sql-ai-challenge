import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DbService } from './db.service';
import { ReactQueryResult } from './types';

@Injectable()
export class ReactAgentService {
  private readonly logger = new Logger(ReactAgentService.name);
  private llm: ChatOpenAI | null = null;

  constructor(private readonly dbService: DbService) {
    this.initializeLLM();
  }

  private initializeLLM(): void {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY!,
      modelName: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0
    });
    this.logger.log('ReAct LLM initialized');
  }

  private async executeAction(action: string, input: string): Promise<string> {
    switch (action.toLowerCase()) {
      case 'sql-query':
        return await this.executeSqlQuery(input);
      case 'schema-inspector':
        return await this.inspectSchema(input);
      case 'error-analyzer':
        return await this.analyzeError(input);
      default:
        return JSON.stringify({ error: `Unknown action: ${action}` });
    }
  }

  private async executeSqlQuery(query: string): Promise<string> {
    try {
      this.logger.log(`Executing SQL query: ${query}`);
      
      if (!/^\s*select\s/i.test(query.trim())) {
        return JSON.stringify({
          error: 'Only SELECT queries are allowed',
          query: query
        });
      }

      const rows = await this.dbService.execSelect(query);
      this.logger.log(`Query executed successfully, returned ${rows.length} rows`);
      
      return JSON.stringify({
        success: true,
        rowCount: rows.length,
        data: rows
      });
    } catch (error) {
      this.logger.error(`SQL query failed: ${error.message}`);
      return JSON.stringify({
        error: error.message,
        query: query,
        success: false
      });
    }
  }

  private async inspectSchema(input: string): Promise<string> {
    try {
      const command = input.trim().toLowerCase();
      this.logger.log(`Inspecting schema: ${command}`);

      if (command === 'tables') {
        const query = `
          SELECT table_name, table_type
          FROM information_schema.tables 
          WHERE table_schema = 'public'
          ORDER BY table_name
        `;
        const rows = await this.dbService.execSelect(query);
        return JSON.stringify({ success: true, tables: rows });
      } 
      
      else if (command.startsWith('describe ')) {
        const tableName = command.replace('describe ', '').trim();
        const query = `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `;
        const rows = await this.dbService.execSelect(query, [tableName]);
        if (rows.length === 0) {
          return JSON.stringify({ error: `Table '${tableName}' not found`, tableName });
        }
        return JSON.stringify({ success: true, tableName, columns: rows });
      }
      
      else if (command.startsWith('sample ')) {
        const tableName = command.replace('sample ', '').trim();
        const checkQuery = `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        `;
        const tableExists = await this.dbService.execSelect(checkQuery, [tableName]);
        if (tableExists.length === 0) {
          return JSON.stringify({ error: `Table '${tableName}' not found`, tableName });
        }
        
        const query = `SELECT * FROM ${tableName} LIMIT 3`;
        const rows = await this.dbService.execSelect(query);
        return JSON.stringify({ success: true, tableName, sampleRows: rows, rowCount: rows.length });
      }
      
      else {
        return JSON.stringify({
          error: 'Invalid command. Use: tables, describe <table>, or sample <table>',
          command: input
        });
      }
    } catch (error) {
      this.logger.error(`Schema inspection failed: ${error.message}`);
      return JSON.stringify({ error: error.message, command: input });
    }
  }

  private async analyzeError(errorInput: string): Promise<string> {
    try {
      this.logger.log(`Analyzing error: ${errorInput.substring(0, 100)}...`);
      
      let errorMessage = errorInput;
      let originalQuery = null;
      
      try {
        const parsed = JSON.parse(errorInput);
        if (parsed.error) {
          errorMessage = parsed.error;
          originalQuery = parsed.query;
        }
      } catch {
        // Not JSON, treat as plain error message
      }

      let errorType = 'UNKNOWN_ERROR';
      const errorLower = errorMessage.toLowerCase();

      if (errorLower.includes('syntax error')) {
        errorType = 'SYNTAX_ERROR';
      } else if (errorLower.includes('relation') && errorLower.includes('does not exist')) {
        errorType = 'RELATION_NOT_FOUND';
      } else if (errorLower.includes('column') && errorLower.includes('does not exist')) {
        errorType = 'COLUMN_NOT_FOUND';
      } else if (errorLower.includes('only select statements are allowed')) {
        errorType = 'SAFETY_GUARD';
      }

      const suggestions = [];
      switch (errorType) {
        case 'SYNTAX_ERROR':
          suggestions.push('Check SQL syntax for missing commas, parentheses, or quotes');
          break;
        case 'RELATION_NOT_FOUND':
          suggestions.push('Check table name spelling - available tables: contacts, cases, recent_activity');
          break;
        case 'COLUMN_NOT_FOUND':
          suggestions.push('Verify column name spelling and case');
          break;
        case 'SAFETY_GUARD':
          suggestions.push('Only SELECT queries are allowed for security');
          break;
        default:
          suggestions.push('Review the query for common SQL errors');
      }

      return JSON.stringify({
        errorType,
        originalError: errorMessage,
        originalQuery,
        suggestions,
        canRetry: ['SYNTAX_ERROR', 'RELATION_NOT_FOUND', 'COLUMN_NOT_FOUND', 'SAFETY_GUARD'].includes(errorType)
      });
    } catch (error) {
      this.logger.error(`Error analysis failed: ${error.message}`);
      return JSON.stringify({
        error: 'Failed to analyze error',
        originalError: errorInput
      });
    }
  }

  async processQuery(prompt: string): Promise<ReactQueryResult> {
    if (!this.llm) {
      throw new Error('LLM not initialized');
    }

    const startTime = Date.now();
    const maxIterations = parseInt(process.env.REACT_MAX_ITERATIONS || '5');
    
    const reasoning: string[] = [];
    const observations: string[] = [];
    const sqlQueries: string[] = [];
    let allQueryResults: any[] = [];
    let iteration = 0;

    try {
      this.logger.log(`Processing ReAct query: ${prompt}`);

      const systemPrompt = `You are a SQL assistant that uses tools to answer questions about a PostgreSQL database.

Available tools:
- sql-query: Execute SELECT queries on the database
- schema-inspector: Inspect database schema (use "tables", "describe <table>", or "sample <table>")
- error-analyzer: Analyze SQL errors and get suggestions

Database schema:
- contacts: id, first_name, last_name, created_at, updated_at
- cases: id, topic, created_at, updated_at  
- recent_activity: view with type, id, description, created_at

Use this EXACT format for your responses:
Thought: [your reasoning about what to do]
Action: [tool name: sql-query, schema-inspector, or error-analyzer]  
Action Input: [the input for the tool]

OR when you have the final answer:
Thought: I now have the final answer
Final Answer: [your final response]

Be concise and focused on SQL data retrieval only.`;

      let context = '';
      let finalAnswer = '';

      while (iteration < maxIterations && !finalAnswer) {
        iteration++;
        
        const messages = [
          new SystemMessage(systemPrompt),
          new HumanMessage(`${context}\n\nQuestion: ${prompt}\n\nPlease respond with Thought, Action, and Action Input, OR with Thought and Final Answer if you're ready to conclude.`)
        ];

        const response = await this.llm.invoke(messages);
        const responseText = response.content as string;
        
        this.logger.log(`ReAct iteration ${iteration}: ${responseText.substring(0, 100)}...`);

        // Parse the response
        const thoughtMatch = responseText.match(/Thought:\s*(.*?)(?=Action:|Final Answer:|$)/s);
        const actionMatch = responseText.match(/Action:\s*(.*?)(?=Action Input:|$)/s);
        const actionInputMatch = responseText.match(/Action Input:\s*(.*?)(?=$)/s);
        const finalAnswerMatch = responseText.match(/Final Answer:\s*(.*?)(?=$)/s);

        if (thoughtMatch) {
          const thought = thoughtMatch[1].trim();
          reasoning.push(thought);
          this.logger.log(`Thought: ${thought}`);
        }

        if (finalAnswerMatch) {
          finalAnswer = finalAnswerMatch[1].trim();
          this.logger.log(`Final Answer: ${finalAnswer}`);
          break;
        }

        if (actionMatch && actionInputMatch) {
          const action = actionMatch[1].trim();
          const actionInput = actionInputMatch[1].trim();
          
          this.logger.log(`Action: ${action}, Input: ${actionInput}`);
          
          // Execute the action
          const observation = await this.executeAction(action, actionInput);
          observations.push(observation);
          
          // If this was a SQL query, track it
          if (action.toLowerCase() === 'sql-query') {
            sqlQueries.push(actionInput);
            
            // Try to extract the data from the observation
            try {
              const obsResult = JSON.parse(observation);
              if (obsResult.success && obsResult.data) {
                // Accumulate results from all successful queries
                allQueryResults = allQueryResults.concat(obsResult.data);
              }
            } catch {
              // Ignore parsing errors
            }
          }

          // Add to context for next iteration
          context += `\nAction: ${action}\nAction Input: ${actionInput}\nObservation: ${observation}`;
        } else {
          // If we can't parse the action, break
          reasoning.push('Unable to parse action from response');
          break;
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.logger.log(`ReAct query completed in ${duration}ms with ${iteration} iterations`);

      return {
        sql: sqlQueries,
        reasoning,
        observations,
        rows: allQueryResults,
        iterations: iteration,
        success: true
      };

    } catch (error) {
      this.logger.error(`ReAct query failed: ${error.message}`, error.stack);

      return {
        sql: sqlQueries,
        reasoning: [`Error: ${error.message}`],
        observations: [`Failed to complete query processing`],
        rows: [],
        iterations: iteration,
        success: false
      };
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.llm !== null;
  }
}