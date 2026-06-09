#!/bin/bash
# Quick deployment script for Starcom LeadGen
# Usage: ./scripts/deploy.sh [production|staging]

set -e  # Exit on error

ENV=${1:-production}
COMPOSE_FILE="docker-compose.production.yml"

echo "🚀 Starcom LeadGen - Deployment Script"
echo "Environment: $ENV"
echo ""

# Check if running on server
if [ ! -d "/opt/starcom-leadgen" ]; then
    echo "⚠️  Warning: Not running in /opt/starcom-leadgen"
    echo "This script is intended for production server deployment."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 1: Pull latest code
echo "📥 Step 1: Pulling latest code from GitHub..."
git pull origin main
echo "✅ Code updated"
echo ""

# Step 2: Pull latest Docker images
echo "🐳 Step 2: Pulling latest Docker images from GHCR..."
docker pull ghcr.io/andripriyatnaputra/salesleadgen-backend:latest
docker pull ghcr.io/andripriyatnaputra/salesleadgen-web:latest
echo "✅ Images updated"
echo ""

# Step 3: Stop old containers
echo "🛑 Step 3: Stopping old containers..."
docker-compose -f $COMPOSE_FILE down
echo "✅ Containers stopped"
echo ""

# Step 4: Start new containers
echo "▶️  Step 4: Starting new containers..."
docker-compose -f $COMPOSE_FILE up -d
echo "✅ Containers started"
echo ""

# Step 5: Wait for services to be ready
echo "⏳ Step 5: Waiting for services to be ready..."
sleep 10

# Check backend health
echo "🔍 Checking backend health..."
for i in {1..30}; do
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Backend is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Backend health check failed after 30 attempts"
        exit 1
    fi
    echo "   Attempt $i/30..."
    sleep 2
done

# Check web health
echo "🔍 Checking web frontend..."
for i in {1..30}; do
    if curl -f http://localhost:3100/ > /dev/null 2>&1; then
        echo "✅ Web frontend is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Web health check failed after 30 attempts"
        exit 1
    fi
    echo "   Attempt $i/30..."
    sleep 2
done
echo ""

# Step 6: Run database migrations
echo "🗄️  Step 6: Running database migrations..."
docker-compose -f $COMPOSE_FILE exec -T backend npx tsx database/migrate.ts || {
    echo "⚠️  Migration failed or already up to date"
}
echo "✅ Migrations complete"
echo ""

# Step 7: Clean up old images
echo "🧹 Step 7: Cleaning up old Docker images..."
docker image prune -f
echo "✅ Cleanup complete"
echo ""

# Final status
echo "═══════════════════════════════════════════════════════════"
echo "✅ Deployment Complete!"
echo ""
echo "Services:"
echo "  - Backend API:  http://localhost:3001"
echo "  - Web Dashboard: http://localhost:3100"
echo ""
echo "Useful commands:"
echo "  - View logs:     docker-compose -f $COMPOSE_FILE logs -f"
echo "  - Check status:  docker-compose -f $COMPOSE_FILE ps"
echo "  - Stop:          docker-compose -f $COMPOSE_FILE down"
echo "═══════════════════════════════════════════════════════════"
