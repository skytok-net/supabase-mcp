#!/bin/bash
set -e

echo "🚀 Setting up Supabase Edge Function Manager..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must be run from the supabase-function-manager directory"
    echo "   Current directory: $(pwd)"
    exit 1
fi

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed"
    echo "   Install it from: https://supabase.com/docs/guides/cli"
    exit 1
fi

# Check for required environment variables
SUPABASE_PROJECT_URL="${SUPABASE_PROJECT_URL:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$SUPABASE_PROJECT_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "⚠️  Warning: Environment variables not set. You'll need to configure them manually:"
    echo "   - SUPABASE_PROJECT_URL"
    echo "   - SUPABASE_SERVICE_ROLE_KEY"
fi

echo "📊 Setting up database schema..."

# Apply database schema
echo "   → Creating tables and indexes..."
if [ -f "sql/schema.sql" ]; then
    if [ -n "$SUPABASE_PROJECT_URL" ]; then
        # Use environment variables if available
        psql "$SUPABASE_PROJECT_URL" -f sql/schema.sql
        echo "   ✅ Database schema applied successfully"
    else
        echo "   ⚠️  Database schema available in sql/schema.sql - apply manually"
    fi
else
    echo "   ❌ Error: sql/schema.sql not found"
    exit 1
fi

# Apply database functions
echo "   → Creating database functions..."
if [ -f "sql/functions.sql" ]; then
    if [ -n "$SUPABASE_PROJECT_URL" ]; then
        psql "$SUPABASE_PROJECT_URL" -f sql/functions.sql
        echo "   ✅ Database functions created successfully"
    else
        echo "   ⚠️  Database functions available in sql/functions.sql - apply manually"
    fi
else
    echo "   ❌ Error: sql/functions.sql not found"
    exit 1
fi

echo ""
echo "🎯 Next steps:"
echo "   1. Deploy the edge function:"
echo "      ./scripts/deploy.sh"
echo ""
echo "   2. Or manually copy to your Supabase functions directory:"
echo "      cp -r functions/supabase-function-manager /path/to/supabase/functions/"
echo ""
echo "   3. Configure your MCP server to use the management service:"
echo "      node mcp-server-supabase --self-hosted \\"
echo "        --host-url=https://your-supabase-host \\"
echo "        --service-role-key=your-service-role-key"
echo ""
echo "✅ Setup complete! The edge function manager is ready to use."
