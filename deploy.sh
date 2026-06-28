#!/bin/bash

# ============================================================================
# Smart Wallet - Automated Build & Deploy Script
# ============================================================================
# This script automates the complete build, sync, and deployment process
# Usage: ./deploy.sh [commit-message]
# ============================================================================

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Get commit message from argument or use default
COMMIT_MESSAGE="${1:-Update: Automated deployment}"

echo ""
echo "============================================================================"
echo "  Smart Wallet - Automated Deployment"
echo "============================================================================"
echo ""

# Step 1: Build the project
print_step "Step 1/6: Building project..."
npm run build
print_success "Build completed successfully"
echo ""

# Step 2: Sync with Capacitor Android
print_step "Step 2/6: Syncing with Capacitor Android..."
npx cap sync android
print_success "Capacitor sync completed"
echo ""

# Step 3: Open Android Studio (optional - this will open Android Studio)
print_step "Step 3/6: Opening Android Studio..."
print_warning "Android Studio will open. You can close it after verification."
npx cap open android &
print_success "Android Studio launched"
echo ""

# Give user time to see Android Studio opening
sleep 2

# Step 4: Git operations
print_step "Step 4/6: Staging changes..."
git add .
print_success "All changes staged"
echo ""

print_step "Step 5/6: Committing changes..."
git commit -m "$COMMIT_MESSAGE"
print_success "Changes committed: $COMMIT_MESSAGE"
echo ""

# Step 5: Push to main branch
print_step "Step 6/6: Pushing to main branch..."
git push origin main
print_success "Changes pushed to main branch"
echo ""

# Step 6: EAS Update
print_step "Publishing EAS update..."
npx eas update --branch main --message "$COMMIT_MESSAGE"
print_success "EAS update published successfully"
echo ""

# Final summary
echo "============================================================================"
echo -e "${GREEN}✓ DEPLOYMENT COMPLETE${NC}"
echo "============================================================================"
echo ""
echo "Summary:"
echo "  • Build: ✓ Completed"
echo "  • Capacitor Sync: ✓ Completed"
echo "  • Android Studio: ✓ Opened"
echo "  • Git Commit: ✓ Pushed to main"
echo "  • EAS Update: ✓ Published"
echo ""
echo "Commit Message: $COMMIT_MESSAGE"
echo ""
echo "============================================================================"
