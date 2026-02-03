#!/bin/bash

# CrowTerminal Companion - macOS Build Script
# This script builds the desktop app for macOS (Intel and Apple Silicon)

set -e

echo "🍎 Building CrowTerminal Companion for macOS..."

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

# Package for macOS
echo "📦 Packaging for macOS..."
npm run package:mac

echo "✅ Build complete!"
echo "📁 Output: release/"

# List built artifacts
ls -la release/*.dmg release/*.zip 2>/dev/null || echo "No DMG/ZIP files found"
