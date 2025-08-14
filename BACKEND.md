# BACKEND.md — NL→SQL via MCP (NestJS, TypeScript)

> Build a tiny app that turns plain-English into SQL, executes it on a real DB, and prints results to the Node console.  
> Stack: **NestJS (TypeScript)** + **MCP** (Model Context Protocol) + **LangChain** + **OpenAI**.  
> DB: **SQLite** with seed data.

---

## 1) Overview

### Flow
```
[React UI] --POST /api/query--> [NestJS Controller]
        -> [Nl2SqlService] --(MCP client)--> [MCP Server: nl2sql]
        -> (LangChain+OpenAI generates SQL; SELECT-only guard; schema-aware)
        -> [DbService executes SQL on SQLite]
        -> Results logged to Node console (and returned to UI)
```

### Why this setup?
- **MCP** cleanly isolates “NL→SQL” as a tool you can swap/extend later.
- **LangChain + OpenAI** gives strong NL→SQL quality while keeping prompts/configs in code.
- **SQLite** makes local demo trivial; switch to MySQL/Postgres/SQL Server by swapping the driver.

---

## 2) Repo layout

```
.
├─ apps/
│  ├─ api/                     # NestJS backend
│  │  ├─ src/
│  │  │  ├─ app.module.ts
│  │  │  ├─ query.controller.ts
│  │  │  ├─ nl2sql.service.ts        # MCP client -> calls MCP tool
│  │  │  ├─ db.service.ts            # SQLite adapter (SELECT-only)
│  │  │  └─ types.ts
│  │  ├─ main.ts
│  │  └─ tsconfig.json
│  └─ mcp/
│     ├─ nl2sql.server.ts      # MCP server (LangChain + OpenAI)
│     └─ tsconfig.json
├─ db/
│  ├─ schema.sql
│  └─ seed.sql
├─ scripts/
│  └─ seed.ts                   # Optional JS seeder (alternative to seed.sql)
├─ web/                         # Minimal React page (textarea + submit)
├─ .env.example
├─ package.json
└─ BACKEND.md (this file)
```

---

## 3) Prereqs

- Node 18+ (or 20+ recommended)
- pnpm or npm or yarn
- OpenAI API key

---

## 4) Install

```bash
# clone your repo, then:
pnpm install
# or: npm install
```

### Key deps
- NestJS: `@nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs`
- MCP SDK (server + client): `@modelcontextprotocol/sdk @modelcontextprotocol/client`
- LangChain + OpenAI: `langchain @langchain/openai zod`
- SQLite driver: `better-sqlite3`
- Utils: `dotenv`

Install explicitly (if needed):

```bash
pnpm add @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs
pnpm add @modelcontextprotocol/sdk @modelcontextprotocol/client
pnpm add langchain @langchain/openai zod
pnpm add better-sqlite3 dotenv
pnpm add -D typescript ts-node ts-node-dev @types/node @nestjs/cli
```

---

## 5) Environment

Create **.env** at repo root (or inside `apps/api/`—just ensure it’s loaded):

```env
# OpenAI
OPENAI_API_KEY=sk-***
OPENAI_MODEL=gpt-4o-mini

# DB (SQLite file path)
SQLITE_PATH=./db/app.db

# Safety: allow only SELECT by default
ALLOW_WRITE_SQL=false
```

> You can swap `OPENAI_MODEL` later (e.g., `gpt-4o`, `gpt-4.1-mini`). Keep costs low by default.

---

## 6) Database

We use **SQLite** stored at `SQLITE_PATH`. Create DB and seed:

### Option A: pure SQL

`db/schema.sql`
```sql
PRAGMA journal_mode=WAL;

DROP TABLE IF EXISTS contacts;
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

DROP TABLE IF EXISTS cases;
CREATE TABLE cases (
  id INTEGER PRIMARY KEY,
  topic TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

`db/seed.sql`
```sql
-- Generate 127 contacts with created_at spanning 2023..2025
WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n+1 FROM seq WHERE n < 127
)
INSERT INTO contacts (id, first_name, last_name, created_at)
SELECT
  n,
  'First'||n,
  'Last'||n,
  CASE
    WHEN n % 3 = 0 THEN '2023-06-01'
    WHEN n % 3 = 1 THEN '2024-06-01'
    ELSE '2025-06-01'
  END
FROM seq;

-- Ensure at least 2 "help" cases between 2023 and 2025
INSERT INTO cases (id, topic, created_at) VALUES
  (1, 'Need help with onboarding', '2023-05-10'),
  (2, 'Help: account locked',       '2024-11-20'),
  (3, 'General question',           '2022-01-01'),
  (4, 'Billing support',            '2026-02-02');
```

Create and seed (Node one-liner):

```bash
node -e "const Database=require('better-sqlite3');const fs=require('fs');const db=new Database(process.env.SQLITE_PATH||'./db/app.db');db.exec(fs.readFileSync('./db/schema.sql','utf8'));db.exec(fs.readFileSync('./db/seed.sql','utf8'));console.log('DB ready at',process.env.SQLITE_PATH||'./db/app.db')"
```

### Option B: JS seeder

`scripts/seed.ts` (optional alternative) provided in repo—runs the same inserts.
---

## 7) MCP Server (LangChain + OpenAI)

`apps/mcp/nl2sql.server.ts`
```ts
#!/usr/bin/env ts-node
import 'dotenv/config';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/transports/stdio';
import { ChatOpenAI } from '@langchain/openai';

// Minimal schema prompt – you can enhance with live introspection if you wish
const DB_SCHEMA = `
Tables:
  contacts(id INTEGER, first_name TEXT, last_name TEXT, created_at TEXT)
  cases(id INTEGER, topic TEXT, created_at TEXT)

Rules:
- Generate ONLY ANSI SQL compatible with SQLite.
- Default to SELECT-only. Never write/alter data unless 'allowWrites' is true.
- Use correct table/column names exactly as shown.
- If counting, use COUNT(*).
- For date ranges, compare created_at as ISO strings: 'YYYY-MM-DD'.
- Return ONLY the final SQL, no explanation.
`;

const Output = z.object({ sql: z.string() });

async function main() {
  const server = new Server(
    { name: 'nl2sql-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.tool(
    {
      name: 'nl2sql.generate',
      description: 'Translate a natural-language question into a safe SQL SELECT.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          allowWrites: { type: 'boolean', default: false }
        },
        required: ['prompt']
      }
    },
    async (args) => {
      const allowWrites = !!args.allowWrites;
      const llm = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
        modelName: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0
      });

      // Few-shot style instruction
      const system = [
        'You are a senior SQL developer.',
        DB_SCHEMA,
        allowWrites
          ? 'Writes are permitted.'
          : 'DO NOT generate INSERT/UPDATE/DELETE/DROP/ALTER. SELECT-only.'
      ].join('\n\n');

      const user = `Question: ${args.prompt}\n\nReturn ONLY the SQL for SQLite.`;

      const resp = await llm.invoke([{ role: 'system', content: system }, { role: 'user', content: user }]);

      let sql = String(resp.content).trim();

      // Safety: enforce SELECT-only unless allowWrites
      if (!allowWrites && !/^select\s/i.test(sql)) {
        // Try to coerce; if still not SELECT, reject.
        if (/^\s*```sql/i.test(sql)) sql = sql.replace(/^\s*```sql/i, '').replace(/```$/,'').trim();
        if (!/^select\s/i.test(sql)) {
          throw new Error('Guard: Non-SELECT SQL generated. Aborting.');
        }
      }

      // Normalize code block wrappers if present
      sql = sql.replace(/^\s*```sql/i, '').replace(/^\s*```/, '').replace(/```$/, '').trim();

      return { content: [{ type: 'text', text: JSON.stringify(Output.parse({ sql })) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error('MCP server failed:', e);
  process.exit(1);
});
```

> This MCP server provides one tool: **`nl2sql.generate`**. It prompts OpenAI (via LangChain) with schema and guardrails and returns a JSON string `{ sql }`.

Run it standalone for sanity:

```bash
ts-node apps/mcp/nl2sql.server.ts
```

(Keep it running when testing, or let Nest spawn it on demand.)
---

## 8) NestJS backend

`apps/api/src/types.ts`
```ts
export type Nl2SqlResult = { sql: string };
```

`apps/api/src/db.service.ts`
```ts
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
```

`apps/api/src/nl2sql.service.ts`
```ts
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/transports/stdio';
import { v4 as uuid } from 'uuid';
import { Nl2SqlResult } from './types';

@Injectable()
export class Nl2SqlService {
  private readonly logger = new Logger(Nl2SqlService.name);

  async translate(prompt: string): Promise<Nl2SqlResult> {
    // Spawn the MCP server; in prod you might keep it hot/shared.
    const child = spawn('node', [
      // compiled JS path in dist; for dev with ts-node adjust accordingly
      'dist/apps/mcp/nl2sql.server.js'
    ], { stdio: ['pipe', 'pipe', 'inherit'] });

    const transport = new StdioClientTransport(child);
    const client = new Client({ name: 'nest-mcp-client', version: '1.0.0' }, { capabilities: {} });

    await client.connect(transport);

    const res = await client.callTool({
      name: 'nl2sql.generate',
      arguments: { prompt, allowWrites: process.env.ALLOW_WRITE_SQL === 'true' },
      id: uuid()
    });

    // Tool returns JSON string in text content; parse it
    const payloadText = (res?.content?.[0] as any)?.text ?? '{}';
    const payload = JSON.parse(payloadText) as Nl2SqlResult;

    this.logger.log(`Generated SQL: ${payload.sql}`);
    return payload;
  }
}
```

`apps/api/src/query.controller.ts`
```ts
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
```

`apps/api/src/app.module.ts`
```ts
import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { DbService } from './db.service';
import { Nl2SqlService } from './nl2sql.service';

@Module({
  controllers: [QueryController],
  providers: [DbService, Nl2SqlService],
})
export class AppModule {}
```

`apps/api/main.ts`
```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  app.enableCors();
  await app.listen(3000);
  console.log('API listening on http://localhost:3000');
}
bootstrap();
```
---

## 9) Minimal UI (optional but recommended)

A simple React page in `web/` that POSTs `{ prompt }` to `/api/query` and shows the SQL/rows. (Not included here to keep this file backend-focused.)

---

## 10) Run locally

1) **Seed DB**
```bash
node -e "const Database=require('better-sqlite3');const fs=require('fs');const db=new Database(process.env.SQLITE_PATH||'./db/app.db');db.exec(fs.readFileSync('./db/schema.sql','utf8'));db.exec(fs.readFileSync('./db/seed.sql','utf8'));console.log('DB ready')"
```

2) **Start API (dev)**
```bash
pnpm ts-node apps/api/main.ts
# or with ts-node-dev / nest start -w if you prefer hot reload
```

3) **Test with curl**
```bash
curl -s http://localhost:3000/api/query   -H 'Content-Type: application/json'   -d '{"prompt":"How many contacts do I have in my database?"}'
```

Expect to see in the **Node console**:
```
--- NL→SQL ---
Prompt: How many contacts do I have in my database?
SQL: SELECT COUNT(*) as count FROM contacts;
Rows: 1
┌─────────┬───────┐
│ (index) │ count │
├─────────┼───────┤
│    0    │  127  │
└─────────┴───────┘
```

Try the second example:
```bash
curl -s http://localhost:3000/api/query   -H 'Content-Type: application/json'   -d '{"prompt":"How many cases with topic containing help between 2023 and 2025?"}'
```
Expected result: `2` cases.

---

## 11) Safety / Guardrails

- **SELECT-only** enforced by default (`ALLOW_WRITE_SQL=false`).
- MCP server prompt instructs SELECT-only and validates result.
- Backend rejects non-SELECT when guard is on.
- Flip `ALLOW_WRITE_SQL=true` to allow writes (only for trusted use).

---

## 12) Passing schema context to MCP

This demo uses a static schema string. To enable **schema introspection**:

- Read `sqlite_master` in `DbService` to dynamically generate `DB_SCHEMA` (table + columns), then:
  - Pass it to MCP server via env var, or
  - Add a second MCP tool `schema.describe` and have Nest call it before `nl2sql.generate`, concatenating into the system prompt.

---

## 13) Follow-ups / Context

To support conversational follow-ups (“now show me the last 10”), add a lightweight context store in `Nl2SqlService` that:
- Keeps last SQL + result schema (column names)
- Appends that to the MCP system prompt for the next call

---

## 14) Tests (basic)

Add a minimal e2e test (Jest) that:
1) Seeds DB
2) Calls `/api/query` with the two example prompts
3) Asserts:
   - SQL starts with `SELECT`
   - Returned rows match expected shape
   - Console prints are invoked (spy `console.table`)

---

## 15) Docker (optional)

`Dockerfile`
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
ENV SQLITE_PATH=/app/db/app.db
CMD ["node", "apps/api/main.js"]
```

> For MCP server, either bake compiled JS into the image or run it as a sidecar. In local dev, spawning the child process (as shown) is fine.

---

## 16) Known limitations / trade-offs

- NL→SQL quality depends on the model + prompt. For tougher schemas, include more metadata (indexes, foreign keys, sample rows).
- We prioritize **guardrails** over maximal flexibility; writes are disabled by default.
- The MCP server is spawned per request for simplicity; production should keep a **hot** MCP process or a pool.

---

## 17) Submission checklist

- [ ] Public repo or zip with source
- [ ] This README/BACKEND.md
- [ ] Scripts to seed DB
- [ ] Clear run instructions
- [ ] Notes on MCP/processor wiring and safety

---

## 18) Troubleshooting

- **“Guard: Non-SELECT SQL generated”**  
  Model tried to write; tighten prompt or set `ALLOW_WRITE_SQL=true` (not recommended for demos).

- **OpenAI auth errors**  
  Ensure `.env` has `OPENAI_API_KEY` and the model name is valid.

- **Empty results**  
  Reseed DB; verify `SQLITE_PATH` points to the same file both for seeding and runtime.

- **MCP client fails to connect**  
  Ensure the path `dist/apps/mcp/nl2sql.server.js` exists (compile first) or adapt spawn to `ts-node` during dev.
