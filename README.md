# SQL AI Challenge - Natural Language to SQL Application

A backend application that converts natural language queries into SQL using NestJS, MCP (Model Context Protocol), LangChain, and OpenAI.

## Architecture

```
[React UI] --POST /api/query--> [NestJS Controller]
        -> [Nl2SqlService] --(MCP client)--> [MCP Server: nl2sql]
        -> (LangChain+OpenAI generates SQL; SELECT-only guard; schema-aware)
        -> [DbService executes SQL on SQLite]
        -> Results logged to Node console (and returned to UI)
```

## Quick Start

1. **Install dependencies**:
```bash
npm install
```

2. **Setup environment**:
```bash
cp .env.example .env
# Add your OpenAI API key to .env
```

3. **Build the application**:
```bash
npm run build
```

4. **Seed the database**:
```bash
npm run seed:db
```

5. **Start the API**:
```bash
npm start
```

6. **Test with curl**:
```bash
curl -s http://localhost:3000/api/query \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"How many contacts do I have in my database?"}'
```

## Development

Start in development mode with hot reload:
```bash
npm run start:dev
```

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `OPENAI_MODEL`: OpenAI model to use (default: gpt-4o-mini)
- `SQLITE_PATH`: Path to SQLite database file (default: ./db/app.db)
- `ALLOW_WRITE_SQL`: Allow write operations (default: false)

## Database Schema

The application includes two tables:
- `contacts`: id, first_name, last_name, created_at
- `cases`: id, topic, created_at

Sample data includes 127 contacts and 4 cases for testing various queries.

## Safety Features

- **SELECT-only by default**: Prevents data modification
- **Multi-layer validation**: MCP server + NestJS service guards
- **Schema-aware prompts**: Accurate SQL generation
- **Error handling**: Graceful failure modes

## API Endpoints

### POST /api/query
Convert natural language to SQL and execute.

**Request:**
```json
{
  "prompt": "How many contacts were created in 2024?"
}
```

**Response:**
```json
{
  "sql": "SELECT COUNT(*) FROM contacts WHERE created_at LIKE '2024%'",
  "rows": [[42]]
}
```

## Project Structure

```
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── query.controller.ts
│   │   │   ├── nl2sql.service.ts
│   │   │   ├── db.service.ts
│   │   │   └── types.ts
│   │   └── main.ts
│   └── mcp/                    # MCP server
│       └── nl2sql.server.ts
├── db/
│   ├── schema.sql
│   └── seed.sql
├── scripts/
│   └── seed.ts
└── package.json
```