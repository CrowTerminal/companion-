#!/bin/bash

# CrowTerminal Companion - Windows Build Script
# This script builds the desktop app for Windows
# Note: Can be run on macOS/Linux with Wine, or natively on Windows via WSL

set -e

echo "🪟 Building CrowTerminal Companion for Windows..."

# Navigate to desktop-app directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist release

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the app
echo "🔨 Building renderer..."
npm run build:renderer

echo "🔨 Building electron..."
npm run build:electron

# Package for Windows
echo "📦 Packaging for Windows..."
npm run package:win

echo "✅ Build complete!"
echo "📁 Output: release/"

# List built artifacts
ls -la release/*.exe 2>/dev/null || echo "No EXE files found"
