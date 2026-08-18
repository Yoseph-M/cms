#!/bin/bash

# CMS Print Agent Release Packaging Script
# Creates a production-ready zip package for Windows deployment

set -e

VERSION="1.0.0"
PACKAGE_NAME="cms-print-agent-v${VERSION}"
BUILD_DIR="./release"

echo "📦 Packaging CMS Print Agent v${VERSION}"
echo "========================================"

# Clean previous build
echo "🧹 Cleaning previous builds..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/$PACKAGE_NAME"

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Copy production files
echo "📋 Copying files..."
cp -r dist "$BUILD_DIR/$PACKAGE_NAME/"
cp package.json "$BUILD_DIR/$PACKAGE_NAME/"
cp package-lock.json "$BUILD_DIR/$PACKAGE_NAME/"
cp .env.example "$BUILD_DIR/$PACKAGE_NAME/"
cp README.md "$BUILD_DIR/$PACKAGE_NAME/"
cp INSTALL_GUIDE.md "$BUILD_DIR/$PACKAGE_NAME/"

# Install production dependencies only
echo "📥 Installing production dependencies..."
cd "$BUILD_DIR/$PACKAGE_NAME"
npm install --production --no-optional
cd ../..

# Create installation script
echo "📝 Creating install.bat..."
cat > "$BUILD_DIR/$PACKAGE_NAME/install.bat" << 'EOF'
@echo off
echo ========================================
echo  CMS Print Agent - Quick Install
echo ========================================
echo.

REM Check for admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires Administrator privileges.
    echo Please right-click and select "Run as Administrator"
    pause
    exit /b 1
)

echo [1/4] Checking Node.js installation...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)
echo     Node.js found!

echo.
echo [2/4] Creating .env from template...
if not exist .env (
    copy .env.example .env
    echo     .env created! Please edit it with your configuration.
) else (
    echo     .env already exists, skipping...
)

echo.
echo [3/4] Installing dependencies (this may take a minute)...
call npm install --production

echo.
echo [4/4] Building agent...
REM Already built, skip

echo.
echo ========================================
echo  Installation Complete!
echo ========================================
echo.
echo NEXT STEPS:
echo 1. Edit .env file with your CMS backend URL and agent token
echo 2. Test the agent: npm start
echo 3. Follow INSTALL_GUIDE.md to set up Windows service
echo.
pause
EOF

# Create version file
echo "Creating VERSION file..."
echo "$VERSION" > "$BUILD_DIR/$PACKAGE_NAME/VERSION"

# Create ZIP archive
echo "🗜️  Creating ZIP archive..."
cd "$BUILD_DIR"
zip -r "$PACKAGE_NAME.zip" "$PACKAGE_NAME" > /dev/null
cd ..

# Calculate size
SIZE=$(du -h "$BUILD_DIR/$PACKAGE_NAME.zip" | cut -f1)

echo ""
echo "✅ Package created successfully!"
echo "📦 Location: $BUILD_DIR/$PACKAGE_NAME.zip"
echo "📏 Size: $SIZE"
echo ""
echo "📋 Package contents:"
echo "   - Compiled JavaScript (dist/)"
echo "   - Production dependencies (node_modules/)"
echo "   - Configuration template (.env.example)"
echo "   - Documentation (README.md, INSTALL_GUIDE.md)"
echo "   - Installation script (install.bat)"
echo ""
echo "🚀 Ready for deployment to Windows POS computers!"
