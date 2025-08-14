# SQL AI Challenge - Natural Language to SQL Application

A backend application that converts natural language queries into SQL using NestJS, PostgreSQL, LangChain, and OpenAI.

## Architecture

```
[React UI] --POST /api/query--> [NestJS Controller]
        -> [Nl2SqlService] -> (LangChain+OpenAI generates SQL; SELECT-only guard; schema-aware)
        -> [DbService executes SQL on PostgreSQL]
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

3. **Start with Docker**:
```bash
# Start both PostgreSQL and API
docker-compose up -d

# Or start only PostgreSQL
docker-compose -f docker-compose.postgres.yml up -d
```

4. **Test with curl**:
```bash
curl -s http://localhost:3000/api/query \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"How many contacts do I have in my database?"}'
```

## Docker Commands

### Using NPM Scripts (Recommended)
```bash
# PostgreSQL Database Only
npm run docker:db          # Start PostgreSQL
npm run docker:db:stop     # Stop PostgreSQL
npm run docker:db:logs     # View PostgreSQL logs
npm run docker:psql        # Connect to PostgreSQL

# Full Application (API + Database)
npm run docker:up          # Start both services
npm run docker:down        # Stop all services
npm run docker:logs        # View all logs
```

### Using Docker Compose Directly
```bash
# PostgreSQL Database Only
docker-compose -f docker-compose.postgres.yml up -d
docker-compose -f docker-compose.postgres.yml down
docker-compose -f docker-compose.postgres.yml logs postgres
docker exec -it sql-ai-postgres psql -U sql_ai_user -d sql_ai_db

# Full Application (API + Database)
docker-compose up -d
docker-compose down
docker-compose logs
docker-compose up --build -d  # Rebuild and start
```

### Database Connection
PostgreSQL is accessible on:
- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `sql_ai_db`
- **Username**: `sql_ai_user` 
- **Password**: `sql_ai_password`

## Development

You have several options for running the application in development mode:

### Option 1: Quick Development (Recommended)
```bash
# Start PostgreSQL in Docker and API locally with hot reload
npm run start:dev:docker
```
This command automatically starts PostgreSQL in Docker, then starts the API locally with hot reload.

### Option 2: Manual Development Setup
```bash
# Start PostgreSQL only
npm run docker:db

# In a separate terminal, start API with hot reload
npm run start:dev
```

### Option 3: Full Docker Development
```bash
# Start both services in Docker (no hot reload)
npm run docker:up
```

### Development Notes:
- **Hot Reload**: Options 1 & 2 provide hot reload for rapid development
- **Database Access**: All options use the same PostgreSQL database in Docker
- **Port Access**: API runs on `localhost:3000`, PostgreSQL on `localhost:5432`
- **Environment**: Make sure your `.env` file has the correct `OPENAI_API_KEY`

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `OPENAI_MODEL`: OpenAI model to use (default: gpt-4o-mini)
- `POSTGRES_HOST`: PostgreSQL host (default: localhost)
- `POSTGRES_PORT`: PostgreSQL port (default: 5432)
- `POSTGRES_DB`: Database name (default: sql_ai_db)
- `POSTGRES_USER`: Database user (default: sql_ai_user)
- `POSTGRES_PASSWORD`: Database password (default: sql_ai_password)
- `ALLOW_WRITE_SQL`: Allow write operations (default: false)
- `API_PORT`: API server port (default: 3000)

## Database Schema

The application includes two tables and one view:
- `contacts`: id (SERIAL), first_name (VARCHAR), last_name (VARCHAR), created_at (TIMESTAMP), updated_at (TIMESTAMP)
- `cases`: id (SERIAL), topic (TEXT), created_at (TIMESTAMP), updated_at (TIMESTAMP)  
- `recent_activity` (view): Combined recent activity from contacts and cases

Sample data is automatically loaded when the PostgreSQL container starts.

## Safety Features

- **SELECT-only by default**: Prevents data modification
- **Connection pooling**: Efficient PostgreSQL connections
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
  "sql": "SELECT COUNT(*) FROM contacts WHERE created_at >= '2024-01-01'::timestamp",
  "rows": [{"count": "42"}]
}
```

## Project Structure

```
├── apps/
│   └── api/                    # NestJS backend
│       ├── src/
│       │   ├── app.module.ts
│       │   ├── query.controller.ts
│       │   ├── nl2sql.service.ts
│       │   ├── db.service.ts
│       │   └── types.ts
│       └── main.ts
├── db/
│   └── postgresql/             # PostgreSQL schema and seed data
│       ├── 01-schema.sql
│       └── 02-seed.sql
├── docker-compose.yml          # PostgreSQL and API containers
├── Dockerfile.api             # API container build
└── package.json
```