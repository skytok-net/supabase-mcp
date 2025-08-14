# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains the Supabase MCP (Model Context Protocol) Server, which enables AI assistants to connect directly with Supabase projects. The MCP standardizes how Large Language Models (LLMs) communicate with external services like Supabase, allowing them to perform tasks such as managing tables, fetching config, querying data, and more.

The server supports both Supabase Cloud instances and self-hosted Supabase installations.

## Common Commands

### Installation

```bash
npm install --ignore-scripts
```

The `--ignore-scripts` flag is important on recent versions of MacOS to avoid issues with the `libpg-query` transient dependency.

### Build

```bash
npm run build
```

This builds the packages `@supabase/mcp-utils` and `@supabase/mcp-server-supabase`.

### Test

Run all tests:
```bash
npm run test
```

Run specific test types:
```bash
# Unit tests
npm run test:unit --workspace @supabase/mcp-server-supabase

# E2E tests
npm run test:e2e --workspace @supabase/mcp-server-supabase

# Integration tests
npm run test:integration --workspace @supabase/mcp-server-supabase
```

Get test coverage:
```bash
npm run test:coverage
```

### Format Code

Format code:
```bash
npm run format
```

Check formatting:
```bash
npm run format:check
```

### Inspect MCP Server

Test your local server with the MCP Inspector:
```bash
npm run inspect
```

### Generate Management API Types

Generate TypeScript types for the Supabase Management API:
```bash
npm run generate:management-api-types --workspace @supabase/mcp-server-supabase
```

## Project Architecture

### Repository Structure

- `/packages/mcp-server-supabase`: Main server package
- `/packages/mcp-server-postgrest`: PostgREST MCP server
- `/packages/mcp-utils`: Shared utility functions
- `/docs`: Documentation files

### Core Components

1. **MCP Server (`packages/mcp-server-supabase/src/server.ts`)**
   - Creates the main MCP server using the MCP protocol
   - Configures enabled features and tools
   - Manages server initialization

2. **Platform Interface (`packages/mcp-server-supabase/src/platform/types.ts`)**
   - Defines the interface for interacting with Supabase
   - Abstracts the API calls to make testing easier

3. **API Platform (`packages/mcp-server-supabase/src/platform/api-platform.ts`)**
   - Implements the platform interface using the Supabase Management API
   - Handles authentication and API requests to Supabase Cloud

4. **Self-Hosted Platform (`packages/mcp-server-supabase/src/platform/self-hosted-platform.ts`)**
   - Implements the platform interface for self-hosted Supabase instances
   - Uses the Supabase JS client to interact with the REST API
   - Provides direct PostgreSQL connections when available

4. **Tool Groups**
   - Tools are organized into functional groups:
     - `account-tools.ts`: Organization and project management
     - `branching-tools.ts`: Development branch operations
     - `database-operation-tools.ts`: SQL execution and migrations
     - `debugging-tools.ts`: Logs and advisors
     - `development-tools.ts`: Project URLs, API keys, TypeScript types
     - `docs-tools.ts`: Documentation search
     - `edge-function-tools.ts`: Edge function management
     - `storage-tools.ts`: Storage bucket operations

5. **CLI Entry Point (`packages/mcp-server-supabase/src/transports/stdio.ts`)**
   - Command-line interface for starting the MCP server
   - Handles command-line arguments and environment variables

### Data Flow

1. AI Assistant sends a request to the MCP Server
2. MCP Server routes the request to the appropriate tool
3. Tool uses the Platform interface to interact with Supabase
4. Platform makes API calls to Supabase Management API
5. Results are returned to the AI Assistant

### Feature Groups

The server supports several feature groups that can be enabled/disabled:
- `docs`: Documentation search
- `account`: Organization and project management
- `database`: SQL execution and migrations
- `debug`: Logs and advisors
- `development`: Project URLs, API keys, TypeScript types
- `functions`: Edge function management
- `branching`: Development branch operations
- `storage`: Storage bucket operations

## Development Workflow

When developing with branching:

1. Create a development branch using `create_branch`
2. Apply migrations with `apply_migration` to track schema changes
3. Test changes by connecting to the development branch
4. Merge changes to production with `merge_branch`
5. If needed, rebase a branch using `rebase_branch` to handle migration drift

## Security Best Practices

1. Always use `--read-only` flag to restrict database operations
2. Scope the server to a specific project with `--project-ref`
3. Don't connect to production data; use development branches
4. Only use the MCP server internally, not for end users
5. Review all tool calls before executing them

## Using Self-Hosted Supabase

When connecting to self-hosted Supabase instances:

1. Use `--self-hosted` flag to enable self-hosted mode
2. Provide the URL to your instance with `--host-url=<your-supabase-url>`
3. Authenticate using your service role key with `--service-role-key=<your-key>`
4. For better performance with database operations, use `--pg-connection=<connection-string>`
5. For remote edge function management, install the supabase-function-manager (see `docs/SELF_HOSTED_FUNCTIONS.md`)
6. Be aware that certain features (branching, organization management) are unavailable in self-hosted mode

### Edge Function Management

Self-hosted Supabase instances do not expose Management API endpoints for edge functions. The MCP server now uses an edge function management service approach:

- **Without management service**: Edge function operations return empty results with helpful instructions
- **With management service**: Full remote edge function management via the `supabase-function-manager` edge function
- **See documentation**: Detailed setup instructions are available in `docs/SELF_HOSTED_FUNCTIONS.md`
