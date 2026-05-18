#!/bin/bash
# Development Helper Script

set -e

COMMAND=${1:-help}

case "$COMMAND" in
  start)
    echo "🚀 Starting development environment..."
    docker-compose up -d
    echo ""
    echo "✅ Services started:"
    echo "   - PostgreSQL: localhost:5433"
    echo "   - Web Dashboard: http://localhost:3100"
    echo "   - Backend: Running (use 'npm run dev:agent' to run agents)"
    echo ""
    echo "📝 View logs: npm run dev:logs"
    ;;

  stop)
    echo "🛑 Stopping development environment..."
    docker-compose down
    echo "✅ All services stopped"
    ;;

  restart)
    echo "🔄 Restarting development environment..."
    docker-compose restart
    echo "✅ Services restarted"
    ;;

  logs)
    docker-compose logs -f
    ;;

  logs:web)
    docker-compose logs -f web
    ;;

  logs:backend)
    docker-compose logs -f backend
    ;;

  logs:db)
    docker-compose logs -f postgres
    ;;

  shell:backend)
    docker-compose exec backend sh
    ;;

  shell:web)
    docker-compose exec web sh
    ;;

  shell:db)
    docker-compose exec postgres psql -U sales salesdb
    ;;

  migrate)
    echo "📊 Running database migrations..."
    docker-compose exec backend npx tsx database/migrate.ts
    echo "✅ Migrations completed"
    ;;

  agent)
    if [ -z "$2" ]; then
      echo "Usage: npm run dev:agent <agent-name>"
      echo "Example: npm run dev:agent civd"
      exit 1
    fi
    echo "🤖 Running agent: $2"
    docker-compose exec backend npx tsx src/agents-runner.ts "$2"
    ;;

  reset)
    echo "⚠️  Resetting development environment (deletes all data)..."
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
      docker-compose down -v
      docker-compose up -d
      sleep 5
      docker-compose exec backend npx tsx database/migrate.ts
      echo "✅ Environment reset complete"
    else
      echo "❌ Reset cancelled"
    fi
    ;;

  clean)
    echo "🧹 Cleaning up Docker resources..."
    docker-compose down -v
    docker system prune -f
    echo "✅ Cleanup complete"
    ;;

  help)
    echo "Starcom LeadGen - Development Helper"
    echo ""
    echo "Usage: npm run dev:<command>"
    echo ""
    echo "Commands:"
    echo "  start           Start all services (database, web, backend)"
    echo "  stop            Stop all services"
    echo "  restart         Restart all services"
    echo "  logs            View all logs (live)"
    echo "  logs:web        View web dashboard logs"
    echo "  logs:backend    View backend logs"
    echo "  logs:db         View database logs"
    echo "  shell:backend   Open shell in backend container"
    echo "  shell:web       Open shell in web container"
    echo "  shell:db        Open PostgreSQL shell"
    echo "  migrate         Run database migrations"
    echo "  agent <name>    Run specific agent (e.g., civd, pengadaan)"
    echo "  reset           Reset environment (deletes all data)"
    echo "  clean           Clean up Docker resources"
    echo ""
    echo "Examples:"
    echo "  npm run dev:start"
    echo "  npm run dev:agent civd"
    echo "  npm run dev:logs:web"
    ;;

  *)
    echo "❌ Unknown command: $COMMAND"
    echo "Run 'npm run dev:help' for available commands"
    exit 1
    ;;
esac
