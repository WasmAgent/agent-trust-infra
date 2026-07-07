#!/bin/bash
# End-to-end marketplace demo
# This script demonstrates the full flow: publish → browse → inspect → verify

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI_BIN="$CLI_ROOT/cli/src/index.ts"

echo "🏪 Agent Marketplace Demo"
echo "=========================="
echo ""

echo "📋 Step 1: Browse Marketplace"
echo "-------------------------------"
bun "$CLI_BIN" marketplace browse
echo ""

echo "📋 Step 2: Inspect Data Analyst Agent"
echo "----------------------------------------"
bun "$CLI_BIN" marketplace inspect data-analyst/listing.json
echo ""

echo "📋 Step 3: Verify Trust Chain"
echo "-------------------------------"
bun "$CLI_BIN" marketplace verify data-analyst/listing.json
echo ""

echo "✅ Demo Complete!"
echo ""
echo "This demo showed:"
echo "  1. Marketplace browse - discover available agents"
echo "  2. Marketplace inspect - view full listing details"
echo "  3. Marketplace verify - verify trust chain before download"
echo ""
echo "Try the same flow with other agents:"
echo "  bun cli/src/index.ts marketplace verify coding-assistant/listing.json"
echo "  bun cli/src/index.ts marketplace verify customer-support/listing.json"
