# PostgreSQL + MCP Server Implementation Guide

## Architecture Overview

This implementation redesigns the SQLite-based NL2SQL application to use PostgreSQL with Docker and a proper MCP (Model Context Protocol) server architecture.

### New Architecture

```
Frontend ↔ NestJS API ↔ MCP Server ↔ PostgreSQL (Docker)
                        ↕
                   SQL Generation + Execution
                        ↕
                   LangChain + OpenAI
```

### Key Components

1. **PostgreSQL Database**: Running in Docker container with proper schemas
2. **MCP Server**: HTTP server handling both SQL generation and execution
3. **NestJS API**: Communicates with MCP server instead of direct database access
4. **Docker Compose**: Orchestrates all services with proper dependencies

## Implementation Sequence

### Phase 1: Environment Setup

1. **Install Dependencies**:
   ```bash
   npm install pg axios express @types/pg @types/express
   npm uninstall better-sqlite3 @types/better-sqlite3
   ```

2. **Environment Configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with your OpenAI API key and database settings
   ```

### Phase 2: Database Setup

1. **Start PostgreSQL**:
   ```bash
   npm run docker:up postgres
   ```

2. **Verify Database**:
   ```bash
   npm run docker:logs:db
   ```

### Phase 3: MCP Server Deployment

1. **Build MCP Server**:
   ```bash
   npm run build:mcp
   ```

2. **Start MCP Server**:
   ```bash
   npm run start:mcp
   ```

3. **Test MCP Server**:
   ```bash
   curl http://localhost:3001/health
   ```

### Phase 4: API Server Deployment

1. **Build API Server**:
   ```bash
   npm run build:api
   ```

2. **Start API Server**:
   ```bash
   npm run start:dev
   ```

3. **Test API Health**:
   ```bash
   curl http://localhost:3000/api/query/health
   ```

### Phase 5: Full Docker Deployment

1. **Complete Docker Setup**:
   ```bash
   npm run docker:build
   npm run docker:up
   ```

2. **Monitor Logs**:
   ```bash
   npm run docker:logs
   ```

## Available Scripts

### Docker Commands
- `npm run docker:up` - Start all services
- `npm run docker:down` - Stop all services
- `npm run docker:restart` - Restart all services
- `npm run docker:logs` - View all logs
- `npm run docker:logs:api` - View API logs only
- `npm run docker:logs:mcp` - View MCP server logs only
- `npm run docker:logs:db` - View database logs only
- `npm run docker:build` - Build all Docker images
- `npm run docker:clean` - Stop and remove all containers/volumes

### Development Commands
- `npm run start:dev` - Start API in development mode
- `npm run start:mcp` - Start MCP HTTP server
- `npm run start:mcp:stdio` - Start MCP stdio server
- `npm run dev:full` - Start PostgreSQL + MCP + API for development
- `npm run build` - Build all TypeScript projects
- `npm run build:api` - Build API only
- `npm run build:mcp` - Build MCP server only

## API Endpoints

### NestJS API (Port 3000)
- `POST /api/query` - Process natural language queries
- `GET /api/query/health` - API and MCP health check
- `GET /api/query/schema` - Get database schema

### MCP Server (Port 3001)
- `POST /nl-query` - Natural language to SQL with execution
- `POST /nl2sql` - Natural language to SQL generation only
- `POST /query` - Direct SQL execution
- `GET /schema` - Database schema information
- `GET /health` - MCP server health check

## Configuration

### Environment Variables

```bash
# Database Configuration
POSTGRES_DB=sql_ai_db
POSTGRES_USER=sql_ai_user
POSTGRES_PASSWORD=sql_ai_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# Security
ALLOW_WRITE_SQL=false

# Server Ports
API_PORT=3000
MCP_SERVER_PORT=3001

# MCP Configuration
MCP_SERVER_URL=http://localhost:3001
```

## Database Schema

### Tables

**contacts**
- `id` SERIAL PRIMARY KEY
- `first_name` VARCHAR(255) NOT NULL
- `last_name` VARCHAR(255) NOT NULL
- `created_at` TIMESTAMP WITH TIME ZONE NOT NULL
- `updated_at` TIMESTAMP WITH TIME ZONE NOT NULL

**cases**
- `id` SERIAL PRIMARY KEY
- `topic` VARCHAR(500) NOT NULL
- `created_at` TIMESTAMP WITH TIME ZONE NOT NULL
- `updated_at` TIMESTAMP WITH TIME ZONE NOT NULL

### Indexes
- `idx_contacts_created_at` on `contacts(created_at)`
- `idx_contacts_name` on `contacts(first_name, last_name)`
- `idx_cases_created_at` on `cases(created_at)`
- `idx_cases_topic` on `cases(topic)`

## Testing the Implementation

### Basic Health Check
```bash
# Check API health
curl http://localhost:3000/api/query/health

# Check MCP server directly
curl http://localhost:3001/health
```

### Natural Language Query Test
```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "show me recent contacts"}'
```

### Direct MCP Server Test
```bash
curl -X POST http://localhost:3001/nl-query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "count all contacts"}'
```

## Customizing SQL Generation

The SQL generation prompts are stored in external files for easy customization:

**File**: `apps/mcp/prompts/nl2sql-system.prompt`

You can modify this file to:
- Add new table schemas
- Update query generation rules
- Add more examples
- Customize PostgreSQL-specific features

After modifying the prompt file, restart the MCP server to reload the changes.

## Security Features

1. **Query Safety**: Only SELECT queries allowed by default
2. **SQL Injection Protection**: Parameterized queries support
3. **Connection Pooling**: PostgreSQL connection pool with limits
4. **Input Validation**: Comprehensive input validation on all endpoints
5. **Error Handling**: Sanitized error messages to prevent information leakage

## Monitoring and Logging

### Health Checks
- API health endpoint includes MCP server status
- MCP server health endpoint includes database connectivity
- Docker health checks for all containers

### Logging
- Structured logging with different levels
- Request/response logging for HTTP calls
- SQL query execution logging
- Console output matching original behavior

## Troubleshooting

### Common Issues

1. **PostgreSQL Connection Failed**
   - Check if PostgreSQL container is running: `docker ps`
   - Verify environment variables in `.env`
   - Check PostgreSQL logs: `npm run docker:logs:db`

2. **MCP Server Unreachable**
   - Verify MCP server is running: `curl http://localhost:3001/health`
   - Check MCP server logs: `npm run docker:logs:mcp`
   - Ensure correct `MCP_SERVER_URL` in environment

3. **OpenAI API Errors**
   - Verify `OPENAI_API_KEY` is set correctly
   - Check API quota and billing
   - Test with a simpler model like `gpt-3.5-turbo`

4. **Permission Errors**
   - Ensure Docker daemon is running
   - Check file permissions for PostgreSQL data directory
   - Verify user has Docker access rights

### Useful Debug Commands

```bash
# Check all running containers
docker ps

# View container logs
docker logs sql-ai-postgres
docker logs sql-ai-mcp
docker logs sql-ai-api

# Connect to PostgreSQL directly
docker exec -it sql-ai-postgres psql -U sql_ai_user -d sql_ai_db

# Check network connectivity
docker network ls
docker network inspect sql-ai-challenge_sql-ai-network
```

## Migration from SQLite

If migrating from the previous SQLite implementation:

1. **Data Export** (if needed):
   ```bash
   sqlite3 db/app.db ".dump" > data_export.sql
   ```

2. **Clean Old Files**:
   ```bash
   rm -f db/app.db*
   ```

3. **Update Code References**:
   - All direct database access has been replaced with MCP client calls
   - SQLite-specific SQL has been converted to PostgreSQL syntax
   - Connection management is now handled by MCP server

This implementation provides a robust, scalable foundation for the NL2SQL application with proper separation of concerns and modern architecture patterns.