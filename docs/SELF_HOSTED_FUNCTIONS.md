# Self-Hosted Supabase Edge Functions Management

## Problem Statement

Self-hosted Supabase instances do not expose the same Management API endpoints for edge functions as Supabase Cloud. This creates a significant limitation when trying to use the MCP server remotely with self-hosted instances like `https://supabase.brius.com`.

**Current limitations:**
- No `/v1/projects/{ref}/functions` API endpoints in self-hosted instances
- Edge functions are managed via direct filesystem access on the server
- The MCP server cannot access remote server filesystems or execute Docker commands
- No remote management capabilities for edge functions

## Research Findings

### Edge Function Management in Supabase

**Cloud Supabase:**
- Full Management API with comprehensive edge function endpoints
- Functions deployed via API calls to `/v1/projects/{ref}/functions/deploy`
- Remote management through authenticated API calls

**Self-Hosted Supabase:**
- Edge functions stored in `volumes/functions/` directory
- Functions deployed by placing files in filesystem and restarting `supabase_edge_runtime` service
- No management API endpoints exposed
- Requires direct server access for function management

## Proposed Solution Strategy

After analyzing the options, the **Edge Function approach** is recommended for the following reasons:

1. **Seamless Integration**: Edge functions run within the Supabase ecosystem with native access to database and auth
2. **Secure**: Leverages existing Supabase authentication and authorization
3. **Scalable**: Uses Supabase's edge runtime for optimal performance
4. **Remote Access**: Accessible via HTTP/RPC calls from the MCP server
5. **Maintainable**: Self-contained within the Supabase instance

## Implementation Plan

### Phase 1: Edge Function Management Service

Create a dedicated edge function (`supabase-function-manager`) that provides a management API for other edge functions:

```typescript
// /functions/supabase-function-manager/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req: Request) => {
  const { method } = req
  const url = new URL(req.url)
  
  // Authenticate using Supabase service role
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  const token = authHeader.split(' ')[1]
  // Validate service role token
  
  switch (method) {
    case 'GET':
      if (url.pathname === '/functions') {
        return await listFunctions()
      } else if (url.pathname.startsWith('/functions/')) {
        const functionName = url.pathname.split('/')[2]
        return await getFunction(functionName)
      }
      break
      
    case 'POST':
      if (url.pathname === '/functions') {
        const functionData = await req.json()
        return await deployFunction(functionData)
      }
      break
      
    case 'DELETE':
      if (url.pathname.startsWith('/functions/')) {
        const functionName = url.pathname.split('/')[2]
        return await deleteFunction(functionName)
      }
      break
  }
  
  return new Response('Not Found', { status: 404 })
})

async function listFunctions() {
  // Query database for function metadata
  // Return list of functions with metadata
}

async function getFunction(name: string) {
  // Retrieve function code and metadata from database
  // Return function details
}

async function deployFunction(functionData: any) {
  // Store function code and metadata in database
  // Trigger function deployment process
  // Return deployment status
}

async function deleteFunction(name: string) {
  // Remove function from database
  // Trigger cleanup process
  // Return deletion status
}
```

### Phase 2: Database Schema

Create database tables to store edge function metadata and code:

```sql
-- Store edge function definitions
CREATE TABLE IF NOT EXISTS edge_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  version INTEGER DEFAULT 1,
  entrypoint_path VARCHAR(255) DEFAULT 'index.ts',
  import_map_path VARCHAR(255),
  verify_jwt BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store function files
CREATE TABLE IF NOT EXISTS edge_function_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id UUID REFERENCES edge_functions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store deployment history
CREATE TABLE IF NOT EXISTS edge_function_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id UUID REFERENCES edge_functions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_edge_functions_name ON edge_functions(name);
CREATE INDEX IF NOT EXISTS idx_edge_functions_slug ON edge_functions(slug);
CREATE INDEX IF NOT EXISTS idx_edge_function_files_function_id ON edge_function_files(function_id);
CREATE INDEX IF NOT EXISTS idx_edge_function_deployments_function_id ON edge_function_deployments(function_id);
```

### Phase 3: Function Deployment Automation

Create a background process or webhook system to handle actual function deployment:

```typescript
// Background deployment service
async function deployToFilesystem(functionData: EdgeFunction) {
  // This would be implemented as either:
  // 1. A separate Node.js service running on the Supabase server
  // 2. A webhook triggered by database changes
  // 3. A scheduled function that processes pending deployments
  
  const functionPath = `/path/to/supabase/volumes/functions/${functionData.name}`
  
  // Create function directory
  await Deno.mkdir(functionPath, { recursive: true })
  
  // Write function files
  for (const file of functionData.files) {
    await Deno.writeTextFile(
      `${functionPath}/${file.name}`, 
      file.content
    )
  }
  
  // Update function metadata
  if (functionData.import_map_path) {
    // Create or update deno.json for import map
  }
  
  // Restart edge runtime service
  const process = new Deno.Command("docker", {
    args: ["compose", "restart", "supabase_edge_runtime"],
    cwd: "/path/to/supabase"
  })
  
  await process.output()
  
  // Update deployment status in database
  await updateDeploymentStatus(functionData.id, 'deployed')
}
```

### Phase 4: MCP Server Integration

Update the self-hosted platform to use the edge function management service:

```typescript
// In self-hosted-platform.ts
async listEdgeFunctions(): Promise<EdgeFunction[]> {
  const response = await fetch(`${this.hostUrl}/functions/v1/supabase-function-manager/functions`, {
    headers: {
      'Authorization': `Bearer ${this.serviceRoleKey}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Failed to list functions: ${response.statusText}`)
  }
  
  return await response.json()
}

async deployEdgeFunction(
  projectId: string,
  options: DeployEdgeFunctionOptions
): Promise<Omit<EdgeFunction, 'files'>> {
  const response = await fetch(`${this.hostUrl}/functions/v1/supabase-function-manager/functions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(options)
  })
  
  if (!response.ok) {
    throw new Error(`Failed to deploy function: ${response.statusText}`)
  }
  
  return await response.json()
}

async getEdgeFunction(
  projectId: string, 
  functionSlug: string
): Promise<EdgeFunction> {
  const response = await fetch(
    `${this.hostUrl}/functions/v1/supabase-function-manager/functions/${functionSlug}`,
    {
      headers: {
        'Authorization': `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    }
  )
  
  if (!response.ok) {
    throw new Error(`Failed to get function: ${response.statusText}`)
  }
  
  return await response.json()
}
```

## Directory Structure

```
packages/
├── mcp-server-supabase/          # Existing MCP server
└── supabase-function-manager/    # New edge function management service
    ├── package.json
    ├── README.md
    ├── functions/
    │   └── supabase-function-manager/
    │       ├── index.ts           # Main edge function
    │       └── deno.json          # Deno configuration
    ├── sql/
    │   ├── schema.sql             # Database schema
    │   └── functions.sql          # Database functions
    └── scripts/
        ├── deploy.sh              # Deployment script
        └── setup.sh               # Initial setup
```

## Prerequisites and Configuration

### Edge Runtime Policy Configuration

Before installing the function management system, you **must** configure your self-hosted Supabase edge runtime for hot reload support. The edge runtime supports three policy types:

| Policy | Hot Reload | Performance | Use Case |
|--------|------------|-------------|----------|
| `oneshot` | ✅ Instant | Low | **Development (Recommended)** |
| `per_request` | ⚠️ Limited | Medium | Testing |
| `per_worker` | ❌ Requires restart | High | Production |

#### Option 1: Docker Compose Configuration (Recommended)

Modify your `docker-compose.yml` file for the edge functions service:

```yaml
services:
  functions:
    container_name: supabase-edge-functions
    image: supabase/edge-runtime:v1.67.4
    restart: unless-stopped
    volumes:
      - ./volumes/functions:/home/deno/functions:Z
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      JWT_SECRET: ${JWT_SECRET}
      SUPABASE_URL: http://kong:8000
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
      SUPABASE_DB_URL: postgresql://postgres:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      VERIFY_JWT: "${FUNCTIONS_VERIFY_JWT}"
    command:
      - "start"
      - "--main-service"
      - "/home/deno/functions/main"
      - "--policy=oneshot"          # Enable hot reload
      - "--port=9998"
    ports:
      - "9998:9998"
```

#### Option 2: Supabase CLI Configuration

In your `supabase/config.toml`:

```toml
[edge_runtime]
enabled = true
# Configure one of the supported request policies: `oneshot`, `per_worker`, `per_request`
# Use `oneshot` for hot reload, or `per_worker` for production
policy = "oneshot"
# Port to attach the Chrome inspector for debugging edge functions
inspector_port = 8083
```

#### Option 3: Environment Variable

Add to your environment:

```bash
export FUNCTIONS_POLICY=oneshot
```

**⚠️ IMPORTANT**: You must restart your Supabase services after changing the policy configuration:

```bash
docker compose down
docker compose up -d
```

### Filesystem Permissions

Ensure the edge runtime container can write to the functions directory:

```bash
# Set proper permissions for the functions volume
sudo chown -R 1000:1000 ./volumes/functions/
sudo chmod -R 755 ./volumes/functions/
```

## Installation Instructions

### 1. Add Database Schema

```sql
-- Run this SQL in your self-hosted Supabase instance
\i sql/schema.sql
\i sql/functions.sql
```

### 2. Deploy Management Function

```bash
# Navigate to your self-hosted Supabase directory
cd /path/to/your/supabase

# Copy the function manager
cp -r packages/supabase-function-manager/functions/supabase-function-manager ./functions/

# Deploy the function (if using CLI)
supabase functions deploy supabase-function-manager --no-verify-jwt

# Or manually copy to volumes/functions/ and restart
cp -r functions/supabase-function-manager volumes/functions/
# With oneshot policy, restart is optional but recommended for first deployment
docker compose restart supabase_edge_runtime
```

### 3. Verify Hot Reload Configuration

Test that hot reload is working:

```bash
# Check if the policy is correctly set
docker logs supabase-edge-functions 2>&1 | grep -i "policy"

# Should show: "Using policy: oneshot" or similar
```

### 4. Configure MCP Server

```bash
# Use the MCP server with self-hosted instance
node packages/mcp-server-supabase/dist/transports/stdio.js \
  --self-hosted \
  --host-url=https://supabase.brius.com \
  --service-role-key=your-service-role-key \
  --project-ref=your-project-id
```

## Deployment Workflow

### How Hot Reload Works

With `oneshot` policy configured, the deployment workflow is:

1. **MCP Server** sends deployment request to management function
2. **Management Function** stores function code and metadata in database
3. **Background Process** writes files to `volumes/functions/` directory
4. **Edge Runtime** detects filesystem changes via file watcher
5. **Function Available** immediately at `https://your-host/functions/v1/function-name`

### Deployment Verification

After deploying a function, verify it's working:

```bash
# Test function availability
curl -X POST https://your-host/functions/v1/your-function \
  -H "Authorization: Bearer your-anon-key" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Check function logs
docker logs supabase-edge-functions 2>&1 | grep "your-function"
```

## Troubleshooting

### Common Issues

#### 1. Functions Not Hot Reloading

**Symptoms**: Functions require container restart to become active

**Solutions**:
```bash
# Check current policy
docker logs supabase-edge-functions 2>&1 | grep -i "policy\|oneshot"

# If not oneshot, update docker-compose.yml and restart
docker compose down
docker compose up -d functions

# Verify policy change took effect
docker logs supabase-edge-functions 2>&1 | tail -20
```

#### 2. Permission Denied Errors

**Symptoms**: `Error: EACCES: permission denied` when deploying functions

**Solutions**:
```bash
# Fix filesystem permissions
sudo chown -R 1000:1000 ./volumes/functions/
sudo chmod -R 755 ./volumes/functions/

# Check Docker volume mount permissions
docker inspect supabase-edge-functions | grep -A 5 "Mounts"
```

#### 3. Management Function Not Found

**Symptoms**: `404 Not Found` when calling management function

**Solutions**:
```bash
# Check if management function is deployed
ls -la volumes/functions/supabase-function-manager/

# Verify function is accessible
curl -X GET https://your-host/functions/v1/supabase-function-manager/functions \
  -H "Authorization: Bearer your-service-role-key"

# If missing, redeploy
cp -r packages/supabase-function-manager/functions/supabase-function-manager ./volumes/functions/
```

#### 4. Database Connection Issues

**Symptoms**: Functions can deploy but can't access database

**Solutions**:
```bash
# Check database environment variables
docker logs supabase-edge-functions 2>&1 | grep -i "database\|postgres"

# Test database connectivity from container
docker exec -it supabase-edge-functions sh
psql "postgresql://postgres:password@db:5432/postgres" -c "SELECT 1;"
```

#### 5. JWT Authentication Errors

**Symptoms**: `Invalid JWT` or `Unauthorized` errors

**Solutions**:
```bash
# Verify JWT_SECRET matches across services
docker exec supabase-auth printenv JWT_SECRET
docker exec supabase-edge-functions printenv JWT_SECRET

# Check service role key is correct
docker exec supabase-edge-functions printenv SUPABASE_SERVICE_ROLE_KEY
```

### Debug Mode

Enable verbose logging for troubleshooting:

```yaml
# In docker-compose.yml
services:
  functions:
    command:
      - "start"
      - "--main-service"
      - "/home/deno/functions/main"
      - "--policy=oneshot"
      - "--verbose"              # Enable debug logging
      - "--port=9998"
```

### Performance Monitoring

Monitor function performance and resource usage:

```bash
# Monitor container resources
docker stats supabase-edge-functions

# Check function execution times
docker logs supabase-edge-functions 2>&1 | grep -E "duration|ms"

# Monitor filesystem usage
df -h ./volumes/functions/
du -sh ./volumes/functions/*
```

## Production Considerations

### Performance Tuning

For production deployments, consider these optimizations:

#### 1. Switch to `per_worker` Policy

```yaml
# Production configuration
command:
  - "start"
  - "--main-service"/home/deno/functions/main
  - "--policy=per_worker"     # Better performance
  - "--max-parallelism=4"     # Adjust based on CPU cores
  - "--port=9998"
```

#### 2. Resource Limits

```yaml
services:
  functions:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
        reservations:
          memory: 512M
          cpus: '0.25'
```

#### 3. Health Checks

```yaml
services:
  functions:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9998/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Monitoring and Logging

Set up comprehensive monitoring:

#### 1. Log Aggregation

```yaml
services:
  functions:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

#### 2. Metrics Collection

Integrate with monitoring systems:

```bash
# Export metrics to Prometheus
curl http://localhost:9998/metrics
```

## Security Considerations

1. **Service Role Key**: The management function must validate the service role key
2. **Function Validation**: Validate and sanitize function code before deployment
3. **Access Control**: Implement proper authorization checks
4. **Audit Logging**: Log all function management operations
5. **Rate Limiting**: Implement rate limiting for API calls
6. **Network Security**: Use HTTPS for all function communications
7. **Container Security**: Run edge runtime with minimal privileges
8. **Function Isolation**: Ensure functions cannot access each other's data

### Security Best Practices

```bash
# Use secrets for sensitive environment variables
docker secret create jwt_secret jwt_secret.txt
docker secret create service_role_key service_role_key.txt
```

```yaml
# In docker-compose.yml
services:
  functions:
    secrets:
      - jwt_secret
      - service_role_key
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret
      SERVICE_ROLE_KEY_FILE: /run/secrets/service_role_key
```

## Testing Strategy

1. **Unit Tests**: Test individual function management operations
2. **Integration Tests**: Test MCP server integration with management service
3. **E2E Tests**: Test full deployment workflow
4. **Performance Tests**: Test function deployment performance
5. **Security Tests**: Test authentication and authorization

## Future Enhancements

1. **Function Templates**: Pre-built function templates for common use cases
2. **Version Management**: Advanced versioning and rollback capabilities
3. **Monitoring Integration**: Function performance and error monitoring
4. **CI/CD Integration**: GitHub Actions workflow for function deployment
5. **Multi-Environment Support**: Development, staging, and production environments

## Benefits

- **Remote Management**: Full edge function management from MCP server
- **Consistent API**: Same interface as cloud Supabase
- **Scalable**: Handles multiple functions efficiently
- **Secure**: Uses Supabase's built-in security model
- **Maintainable**: Self-contained within Supabase ecosystem
- **Extensible**: Easy to add new management features

This approach provides a comprehensive solution for managing edge functions in self-hosted Supabase instances while maintaining compatibility with the existing MCP server architecture.
