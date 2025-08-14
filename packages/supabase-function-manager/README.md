# Supabase Edge Function Manager

A dedicated edge function service that provides remote management capabilities for self-hosted Supabase instances. This service enables the MCP server to deploy, manage, and monitor edge functions without requiring direct filesystem access to the Supabase server.

## Features

- 🚀 **Remote Function Management** - Deploy functions via HTTP API calls
- 🔄 **Hot Reload Support** - Functions become available instantly with `oneshot` policy
- 📦 **Version Management** - Automatic version increment for function updates
- 🗃️ **Database Storage** - Function code and metadata stored in Supabase database
- 🔒 **Secure Authentication** - Uses Supabase service role key for authentication
- 📁 **File Management** - Support for multiple files per function
- 🎯 **Import Maps** - Support for Deno import maps and configuration

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   MCP Server    │────▶│  Function Manager    │────▶│   File System   │
│  (Remote)       │     │   Edge Function      │     │  /home/deno/    │
└─────────────────┘     └──────────────────────┘     │  functions/     │
                                  │                   └─────────────────┘
                                  ▼
                        ┌──────────────────────┐
                        │  Supabase Database   │
                        │  - edge_functions    │
                        │  - function_files    │
                        │  - deployments       │
                        └──────────────────────┘
```

## Installation

### 1. Prerequisites

Ensure your self-hosted Supabase instance is configured with hot reload support:

```yaml
# docker-compose.yml
services:
  functions:
    command:
      - "start"
      - "--main-service"
      - "/home/deno/functions/main"
      - "--policy=oneshot"  # Enable hot reload
```

### 2. Database Setup

```bash
cd packages/supabase-function-manager
./scripts/setup.sh
```

Or manually apply the schema:

```bash
psql "postgresql://postgres:password@localhost:5432/postgres" -f sql/schema.sql
psql "postgresql://postgres:password@localhost:5432/postgres" -f sql/functions.sql
```

### 3. Deploy the Function

```bash
./scripts/deploy.sh --no-verify-jwt
```

Or manually copy to your Supabase functions directory:

```bash
cp -r functions/supabase-function-manager /path/to/supabase/functions/
```

## Usage

### List Functions

```bash
curl -X GET https://your-host/functions/v1/supabase-function-manager/functions \
  -H "Authorization: Bearer your-service-role-key"
```

### Deploy a Function

```bash
curl -X POST https://your-host/functions/v1/supabase-function-manager/functions \
  -H "Authorization: Bearer your-service-role-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "hello-world",
    "files": [
      {
        "name": "index.ts",
        "content": "Deno.serve(() => new Response(\"Hello World!\"))"
      }
    ],
    "entrypoint_path": "index.ts"
  }'
```

### Get a Specific Function

```bash
curl -X GET https://your-host/functions/v1/supabase-function-manager/functions/hello-world \
  -H "Authorization: Bearer your-service-role-key"
```

### Delete a Function

```bash
curl -X DELETE https://your-host/functions/v1/supabase-function-manager/functions/hello-world \
  -H "Authorization: Bearer your-service-role-key"
```

## API Reference

### `GET /functions`

List all deployed edge functions.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "hello-world",
    "slug": "hello-world",
    "version": 1,
    "status": "ACTIVE",
    "entrypoint_path": "index.ts",
    "import_map_path": null,
    "import_map": false,
    "verify_jwt": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "files": [
      {
        "name": "index.ts",
        "content": "Deno.serve(() => new Response(\"Hello World!\"))"
      }
    ]
  }
]
```

### `GET /functions/:name`

Get a specific edge function by name.

### `POST /functions`

Deploy a new edge function or update an existing one.

**Request Body:**
```json
{
  "name": "function-name",
  "files": [
    {
      "name": "index.ts",
      "content": "// Function code here"
    }
  ],
  "entrypoint_path": "index.ts",
  "import_map_path": "deno.json",
  "verify_jwt": true
}
```

### `DELETE /functions/:name`

Delete an edge function.

## Configuration

The function manager uses these environment variables:

- `SUPABASE_URL` - The Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (passed via Authorization header)

## Database Schema

The function manager creates these tables:

- `edge_functions` - Function metadata
- `edge_function_files` - Function source files  
- `edge_function_deployments` - Deployment history

## Security

- 🔐 **Service Role Authentication** - Only service role keys can access the API
- 🛡️ **Row Level Security** - Database tables protected by RLS policies
- 🚫 **CORS Protection** - Configurable CORS headers
- ✅ **Input Validation** - All inputs validated before processing

## Troubleshooting

### Function Not Found (404)

1. Check if the function manager is deployed:
   ```bash
   curl https://your-host/functions/v1/supabase-function-manager/functions
   ```

2. Verify the function manager is in your functions directory:
   ```bash
   ls -la volumes/functions/supabase-function-manager/
   ```

### Permission Denied

1. Check service role key is correct
2. Verify database schema was applied
3. Check RLS policies are configured

### Functions Not Hot Reloading

1. Verify `oneshot` policy is configured:
   ```bash
   docker logs supabase-edge-functions | grep -i "policy"
   ```

2. Check filesystem permissions:
   ```bash
   ls -la volumes/functions/
   ```

## Development

### Testing

```bash
# Test database connection
curl -X GET https://your-host/functions/v1/supabase-function-manager/functions

# Test function deployment
curl -X POST https://your-host/functions/v1/supabase-function-manager/functions \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -d '{"name":"test","files":[{"name":"index.ts","content":"Deno.serve(() => new Response(\"test\"))"}]}'

# Verify function is accessible
curl https://your-host/functions/v1/test
```

### Logs

```bash
# View function manager logs
docker logs supabase-edge-functions | grep "supabase-function-manager"

# View deployment logs
docker logs supabase-edge-functions | grep "deploy"
```

## License

MIT License - see the [LICENSE](../../LICENSE) file for details.
