# Self-Hosted Supabase MCP Server

This document provides instructions for using the MCP Server with self-hosted Supabase instances.

## Overview

The Supabase MCP Server supports both Supabase Cloud and self-hosted instances. Self-hosted instances have some different requirements and limitations compared to Cloud instances.

## Requirements

- Node.js 18.0.0 or higher
- A self-hosted Supabase instance
- Service role key for your Supabase instance

## Configuration

To use the MCP server with a self-hosted Supabase instance, run:

```bash
node packages/mcp-server-supabase/dist/transports/stdio.cjs \
  --self-hosted \
  --host-url=https://your-supabase-instance \
  --service-role-key=your-service-role-key \
  --project-ref=your-project-id
```

### Parameters

- `--self-hosted`: Indicates that you're connecting to a self-hosted instance
- `--host-url`: The URL of your self-hosted Supabase instance
- `--service-role-key`: Your service role key (must have full database access)
- `--project-ref`: A reference ID for your project (can be any identifier you choose)
- `--pg-connection`: (Optional) PostgreSQL connection string for direct database access

## Features

### SQL Execution

The MCP server can execute SQL queries against your self-hosted Supabase database using:

1. The `exec_sql` RPC function (must be installed on your database)
2. Direct PostgreSQL connection (if `--pg-connection` is provided)

To enable the `exec_sql` RPC function, run this SQL against your database:

```sql
CREATE OR REPLACE FUNCTION public.exec_sql(query TEXT, read_only BOOLEAN DEFAULT false)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    -- If read_only is true, set the transaction to read-only
    IF read_only THEN
        SET TRANSACTION READ ONLY;
    END IF;
    
    -- Execute the query and return the result as JSON
    EXECUTE 'SELECT array_to_json(array_agg(row_to_json(t))) FROM (' || query || ') t' INTO result;
    
    -- Return empty array if no results
    IF result IS NULL THEN
        result := '[]'::JSON;
    END IF;
    
    RETURN result;
END;
$$;

-- Grant execute permission to the service role
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT, BOOLEAN) TO service_role;
```

### Edge Functions

Self-hosted instances can use edge functions through the `supabase-function-manager` edge function. See [SELF_HOSTED_FUNCTIONS.md](SELF_HOSTED_FUNCTIONS.md) for detailed setup instructions.

### Database Operations

The following database operations are supported for self-hosted instances:

- List tables (`list_tables`)
- List extensions (`list_extensions`)
- Execute SQL queries (`execute_sql`)
- Apply migrations (`apply_migration`)

## Limitations

Some features available in Supabase Cloud are not fully supported in self-hosted mode:

- Branching (not supported)
- Organization management (limited)
- Security advisors (not supported)
- Performance advisors (not supported)
- Logs (limited access)

## Troubleshooting

### SQL Query Errors

If you encounter SQL syntax errors, ensure:

1. The `exec_sql` function is properly installed in your database
2. The service role key has sufficient permissions
3. The query does not contain syntax that's incompatible with your PostgreSQL version

### Node.js Version Issues

The MCP server requires Node.js 18.0.0 or higher. If you encounter errors related to ES modules or syntax issues, check your Node.js version:

```bash
node --version
```

If using an older version, we recommend upgrading to Node.js 18 or higher. The MCP server is compiled to support both modern ES modules and CommonJS for backwards compatibility.

### Connection Issues

If you cannot connect to your self-hosted instance:

1. Verify the host URL is correct and accessible
2. Ensure the service role key is valid
3. Check that your Supabase instance is running
4. Verify network connectivity between your machine and the Supabase instance

## Best Practices

1. Always use the `--read-only` flag when executing queries that don't modify data
2. For better performance with database operations, provide a direct PostgreSQL connection with `--pg-connection`
3. Keep your service role key secure and don't expose it in scripts or logs
4. Consider using environment variables for sensitive information