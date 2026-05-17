#!/bin/bash
# Starcom LeadGen - Scheduled Agent Runner
# Add to crontab: 0 2 * * * /opt/starcom-leadgen/scripts/run-agents.sh

set -e

# Configuration
APP_DIR="/opt/starcom-leadgen"
LOG_DIR="${APP_DIR}/logs"
LOG_FILE="${LOG_DIR}/agents-$(date +%Y%m%d).log"

# Create log directory if not exists
mkdir -p "$LOG_DIR"

# Log start time
echo "========================================" >> "$LOG_FILE"
echo "Starcom LeadGen Agent Runner" >> "$LOG_FILE"
echo "Started at: $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

# Change to app directory
cd "$APP_DIR"

# Run agents in Docker
echo "Running agents..." >> "$LOG_FILE"
docker-compose -f docker-compose.production.yml run --rm backend \
  npx tsx src/agents-runner.ts civd pengadaan bjb airnav pamjaya \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

# Log completion
echo "----------------------------------------" >> "$LOG_FILE"
echo "Completed at: $(date)" >> "$LOG_FILE"
echo "Exit code: $EXIT_CODE" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Rotate logs older than 30 days
find "$LOG_DIR" -name "agents-*.log" -mtime +30 -delete

# Send notification on failure (optional)
if [ $EXIT_CODE -ne 0 ]; then
  echo "Agent execution failed with code $EXIT_CODE" | \
    mail -s "Starcom LeadGen Alert" admin@starcom.com || true
fi

exit $EXIT_CODE
