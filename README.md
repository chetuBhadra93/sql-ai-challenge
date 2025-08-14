# SQL AI Challenge

A Natural Language to SQL application using NestJS, PostgreSQL, LangChain, and OpenAI.

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- OpenAI API key

## Quick Setup

### 1. Clone and Install
```bash
git clone <repository-url>
cd sql-ai-challenge
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
```
Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=your-openai-api-key-here
```

### 3. Database Setup (Docker)
Start PostgreSQL in Docker:
```bash
npm run docker:db
```
This starts PostgreSQL on `localhost:5433` with the database `sql_ai_db`.

### 4. Start the API
```bash
npm run start:dev
```
The API will be available at `http://localhost:3000`.

## Testing the Application

Test with a simple query:
```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "How many contacts are in the database?"}'
```

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start API with hot reload |
| `npm run docker:db` | Start PostgreSQL in Docker |
| `npm run docker:db:stop` | Stop PostgreSQL container |
| `npm run docker:psql` | Connect to PostgreSQL |
| `npm run build` | Build the application |
| `npm test` | Run tests |

## Database Connection Details

- **Host**: `localhost`
- **Port**: `5433` (or `5432` if you change `POSTGRES_PORT`)
- **Database**: `sql_ai_db`
- **Username**: `sql_ai_user`
- **Password**: `sql_ai_password`

## Environment Variables

Required:
- `OPENAI_API_KEY`: Your OpenAI API key

Optional (with defaults):
- `OPENAI_MODEL`: OpenAI model (default: `gpt-4o-mini`)
- `API_PORT`: API server port (default: `3000`)
- `POSTGRES_HOST`: Database host (default: `localhost`)
- `POSTGRES_PORT`: Database port (default: `5433`)
- `ALLOW_WRITE_SQL`: Allow SQL writes (default: `false`)

## Advanced Features

### ReAct Mode
For complex queries with reasoning:
```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Show me recent contacts and their cases", "mode": "react"}'
```

### Full Docker Setup
To run everything in Docker:
```bash
docker-compose up -d
```

## Troubleshooting

**Port 5432 already in use?**
If you have local PostgreSQL running, the Docker container uses port 5433 by default.

**Database connection errors?**
Make sure PostgreSQL is running: `npm run docker:db`

**API not starting?**
Check your `.env` file has `OPENAI_API_KEY` set.

## Database Schema

- **contacts**: `id`, `first_name`, `last_name`, `created_at`, `updated_at`
- **cases**: `id`, `topic`, `created_at`, `updated_at`
- **recent_activity**: View combining contacts and cases

Sample data is loaded automatically when the database starts.