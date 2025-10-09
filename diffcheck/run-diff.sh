#!/bin/bash

# Simple script runner for the diff tool
# This allows running without npm install if ts-node is available globally

echo "🚀 Running Solidity Source Diff Tool..."
echo "========================================="

# Check if ts-node is available
if command -v ts-node >/dev/null 2>&1; then
    echo "✅ Using global ts-node"
    ts-node diff-sources.ts
elif command -v npx >/dev/null 2>&1; then
    echo "✅ Using npx with ts-node"
    npx ts-node diff-sources.ts
else
    echo "❌ Neither ts-node nor npx found. Please install Node.js and TypeScript."
    echo "💡 Try: npm install -g typescript ts-node"
    exit 1
fi 