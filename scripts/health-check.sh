#!/bin/bash
# Starcom LeadGen - Health Check Script
# Use this for monitoring and alerting

set -e

APP_DIR="/opt/starcom-leadgen"
cd "$APP_DIR"

echo "🏥 Starcom LeadGen Health Check"
echo "================================"
echo ""

# Check Docker containers
echo "📦 Docker Containers:"
docker-compose -f docker-compose.production.yml ps
echo ""

# Check database connectivity
echo "🗄️  Database Status:"
if docker exec starcom-leadgen-db pg_isready -U sales > /dev/null 2>&1; then
  echo "✅ PostgreSQL is ready"

  # Get database stats
  TOTAL_LEADS=$(docker exec starcom-leadgen-db psql -U sales -d salesdb -t -c "SELECT COUNT(*) FROM raw_leads WHERE status = 'active';" | tr -d ' ')
  echo "   Total active leads: $TOTAL_LEADS"

  # Leads by source
  echo "   Breakdown by source:"
  docker exec starcom-leadgen-db psql -U sales -d salesdb -t -c "SELECT '   - ' || source || ': ' || COUNT(*) FROM raw_leads WHERE status = 'active' GROUP BY source ORDER BY COUNT(*) DESC;"
else
  echo "❌ PostgreSQL is not ready"
  exit 1
fi
echo ""

# Check web dashboard
echo "🌐 Web Dashboard:"
if curl -sf http://localhost:3100 > /dev/null; then
  echo "✅ Dashboard is accessible"
else
  echo "❌ Dashboard is not accessible"
  exit 1
fi
echo ""

# Check disk usage
echo "💾 Disk Usage:"
df -h "$APP_DIR" | tail -n 1
echo ""

# Check recent agent runs
echo "🤖 Recent Agent Runs:"
if [ -d "$APP_DIR/logs" ]; then
  LATEST_LOG=$(ls -t "$APP_DIR/logs"/agents-*.log 2>/dev/null | head -n 1)
  if [ -n "$LATEST_LOG" ]; then
    echo "   Latest log: $(basename "$LATEST_LOG")"
    echo "   Modified: $(stat -c %y "$LATEST_LOG" | cut -d. -f1)"
  else
    echo "   No logs found"
  fi
else
  echo "   Log directory not found"
fi
echo ""

echo "✅ All health checks passed!"
exit 0
