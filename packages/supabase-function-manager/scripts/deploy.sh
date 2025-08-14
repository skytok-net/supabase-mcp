#!/bin/bash
set -e

echo "🚀 Deploying Supabase Edge Function Manager..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must be run from the supabase-function-manager directory"
    echo "   Current directory: $(pwd)"
    exit 1
fi

# Check if function directory exists
if [ ! -d "functions/supabase-function-manager" ]; then
    echo "❌ Error: Function directory not found: functions/supabase-function-manager"
    exit 1
fi

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed"
    echo "   Install it from: https://supabase.com/docs/guides/cli"
    echo ""
    echo "   Alternative: Manual deployment instructions:"
    echo "   1. Copy the function to your Supabase instance:"
    echo "      cp -r functions/supabase-function-manager /path/to/supabase/functions/"
    echo "   2. If using oneshot policy, the function should be available immediately"
    echo "   3. If using per_worker policy, restart the edge runtime:"
    echo "      docker compose restart supabase_edge_runtime"
    exit 1
fi

# Parse command line arguments
VERIFY_JWT="--no-verify-jwt"
IMPORT_MAP=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --verify-jwt)
            VERIFY_JWT=""
            shift
            ;;
        --no-verify-jwt)
            VERIFY_JWT="--no-verify-jwt"
            shift
            ;;
        --import-map)
            IMPORT_MAP="--import-map functions/supabase-function-manager/deno.json"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --verify-jwt         Enable JWT verification (default: disabled)"
            echo "  --no-verify-jwt      Disable JWT verification"
            echo "  --import-map         Use import map from deno.json"
            echo "  -h, --help          Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Deploy the function
echo "📦 Deploying edge function..."
echo "   Function: supabase-function-manager"
echo "   JWT Verification: $([ -z "$VERIFY_JWT" ] && echo "enabled" || echo "disabled")"
echo "   Import Map: $([ -n "$IMPORT_MAP" ] && echo "enabled" || echo "disabled")"

# Construct deployment command
DEPLOY_CMD="supabase functions deploy supabase-function-manager"

if [ -n "$VERIFY_JWT" ]; then
    DEPLOY_CMD="$DEPLOY_CMD $VERIFY_JWT"
fi

if [ -n "$IMPORT_MAP" ]; then
    DEPLOY_CMD="$DEPLOY_CMD $IMPORT_MAP"
fi

echo "   Command: $DEPLOY_CMD"
echo ""

# Execute deployment
if $DEPLOY_CMD; then
    echo "✅ Edge function deployed successfully!"
    echo ""
    echo "🎯 Function is now available at:"
    echo "   https://your-supabase-host/functions/v1/supabase-function-manager"
    echo ""
    echo "📋 Test the deployment:"
    echo "   curl -X GET https://your-supabase-host/functions/v1/supabase-function-manager/functions \\"
    echo "     -H \"Authorization: Bearer your-service-role-key\""
    echo ""
    echo "🔧 Configure your MCP server:"
    echo "   node mcp-server-supabase --self-hosted \\"
    echo "     --host-url=https://your-supabase-host \\"
    echo "     --service-role-key=your-service-role-key"
else
    echo "❌ Deployment failed!"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Check if you're logged in to Supabase CLI:"
    echo "      supabase login"
    echo ""
    echo "   2. Check if you're linked to the correct project:"
    echo "      supabase projects list"
    echo "      supabase link --project-ref your-project-ref"
    echo ""
    echo "   3. Manual deployment option:"
    echo "      cp -r functions/supabase-function-manager /path/to/supabase/functions/"
    echo "      docker compose restart supabase_edge_runtime  # if not using oneshot policy"
    exit 1
fi
