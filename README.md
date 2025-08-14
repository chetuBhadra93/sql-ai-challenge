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
# Start both PostgreSQL and API (DB listens on 5432 inside the network; host maps to 5433 by default)
docker-compose up -d

# Or start only PostgreSQL (host port maps to 5433 by default)
docker-compose -f docker-compose.postgres.yml up -d

# Override the host port if needed (e.g., use 5432 instead of the default 5433)
POSTGRES_PORT=5432 docker-compose -f docker-compose.postgres.yml up -d
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
npm run docker:db          # Start PostgreSQL on 5432 by default
# If local Postgres is running on 5432, map Docker to 5433 instead:
POSTGRES_PORT=5433 npm run docker:db

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
# PostgreSQL Database Only (host port defaults to 5433)
docker-compose -f docker-compose.postgres.yml up -d

# Or map to 5432 if you prefer the standard port
POSTGRES_PORT=5432 docker-compose -f docker-compose.postgres.yml up -d

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
- **Port**: `5433` (host default). Inside Docker network the DB listens on `5432`. You can override the host port via `POSTGRES_PORT`.
- **Database**: `sql_ai_db`
- **Username**: `sql_ai_user` 
- **Password**: `sql_ai_password`

## Development

You have several options for running the application in development mode:

### Option 1: Quick Development (Recommended)
```bash
# Start PostgreSQL in Docker and API locally with hot reload
npm run start:dev:docker

# If you have a local Postgres running on 5432, bind Docker to 5433 and point the API at it:
POSTGRES_PORT=5433 npm run docker:db
POSTGRES_PORT=5433 npm run start:dev
```
This command sequence ensures the app connects to the Dockerized DB when 5432 is already used by a local Postgres.

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
- **Port Access**: API runs on `localhost:3000`. PostgreSQL maps to `localhost:5433` by default on the host; inside Docker it's `postgres:5432`. Override host port with `POSTGRES_PORT` if needed.
- **Environment**: Make sure your `.env` file has the correct `OPENAI_API_KEY`

### Troubleshooting
- Error: `role "sql_ai_user" does not exist` during `npm run start:dev`
  - Cause: App connected to local Postgres on 5432 instead of the Docker DB.
  - Fix: Start Docker DB on 5433 and run the API with `POSTGRES_PORT=5433`.

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `OPENAI_MODEL`: OpenAI model to use (default: gpt-4o-mini)
- `POSTGRES_HOST`: PostgreSQL host (default: localhost)
- `POSTGRES_PORT`: PostgreSQL host port (default: 5433; inside Docker it remains 5432)
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