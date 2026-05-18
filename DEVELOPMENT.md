# Starcom LeadGen - Local Development Guide

## Quick Start (Docker)

### 1. Prerequisites

- Docker & Docker Compose installed
- Git
- `.env` file configured (copy from `.env.example`)

### 2. Start Development Environment

```bash
# Start all services (PostgreSQL, Web, Backend)
npm run dev:start

# Services will be available at:
# - PostgreSQL: localhost:5433
# - Web Dashboard: http://localhost:3100
# - Backend: Container running (for manual commands)
```

### 3. Run Database Migration

```bash
npm run dev:migrate
```

### 4. Run Scraping Agents

```bash
# Run single agent
npm run dev:agent civd

# Run multiple agents
docker-compose exec backend npx tsx src/agents-runner.ts civd pengadaan bjb
```

### 5. View Logs

```bash
# All services
npm run dev:logs

# Specific service
npm run dev:logs:web
npm run dev:logs:backend
npm run dev:logs:db
```

### 6. Stop Environment

```bash
npm run dev:stop
```

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev:start` | Start all services |
| `npm run dev:stop` | Stop all services |
| `npm run dev:restart` | Restart all services |
| `npm run dev:logs` | View all logs (live) |
| `npm run dev:logs:web` | View web dashboard logs |
| `npm run dev:logs:backend` | View backend logs |
| `npm run dev:logs:db` | View database logs |
| `npm run dev:shell:backend` | Open shell in backend container |
| `npm run dev:shell:web` | Open shell in web container |
| `npm run dev:shell:db` | Open PostgreSQL shell |
| `npm run dev:migrate` | Run database migrations |
| `npm run dev:agent <name>` | Run specific agent |
| `npm run dev:reset` | Reset environment (deletes all data) |
| `npm run dev:clean` | Clean up Docker resources |
| `npm run dev:help` | Show all commands |

---

## Development Workflow

### Hot Reload Enabled ✨

All code changes are automatically reflected:

**Backend:**
- Edit files in `src/` → Changes detected instantly
- No need to rebuild container

**Frontend:**
- Edit files in `web/src/` → Next.js hot reload
- Changes appear in browser immediately

### Run Agents in Development

```bash
# Option 1: Using npm script
npm run dev:agent civd

# Option 2: Direct docker-compose exec
docker-compose exec backend npx tsx src/agents-runner.ts civd pengadaan

# Option 3: Shell into container
npm run dev:shell:backend
npx tsx src/agents-runner.ts civd
```

### Database Operations

```bash
# Run migrations
npm run dev:migrate

# Access PostgreSQL shell
npm run dev:shell:db

# Query from shell
docker-compose exec postgres psql -U sales salesdb -c "SELECT COUNT(*) FROM raw_leads;"
```

### Debugging

**Backend Debugging:**
```bash
# Shell into backend container
npm run dev:shell:backend

# Check logs
npm run dev:logs:backend

# Test database connection
npx tsx -e "import {pool} from './src/config/database.js'; pool.query('SELECT NOW()').then(r => console.log(r.rows)).finally(() => pool.end())"
```

**Frontend Debugging:**
```bash
# Shell into web container
npm run dev:shell:web

# Check Next.js build
npm run build

# View logs
npm run dev:logs:web
```

---

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 5433 (PostgreSQL)
lsof -i :5433

# Check what's using port 3100 (Web)
lsof -i :3100

# Stop conflicting service or change ports in docker-compose.yml
```

### Database Connection Error

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check database health
docker-compose exec postgres pg_isready -U sales

# Restart database
npm run dev:restart
```

### Containers Won't Start

```bash
# Check logs for errors
npm run dev:logs

# Clean up and restart
npm run dev:clean
npm run dev:start
```

### Reset Everything

```bash
# WARNING: This deletes all data
npm run dev:reset
```

---

## Environment Variables

Create `.env` file in project root:

```env
# Database
DATABASE_URL=postgres://sales:sales123@localhost:5433/salesdb?sslmode=disable

# Claude AI
ANTHROPIC_API_KEY=your_api_key_here

# Pengadaan.com (Optional)
PENGADAAN_EMAIL=your_email
PENGADAAN_PASSWORD=your_password

# CIVD (Optional)
CIVD_USERNAME=starcom_username
CIVD_PASSWORD=starcom_password
```

---

## File Structure

```
starcom-leadgen/
├── docker-compose.yml              # Local development setup
├── docker-compose.production.yml   # Production setup (uses GHCR images)
├── Dockerfile                      # Production backend image
├── Dockerfile.dev                  # Development backend image
├── web/
│   ├── Dockerfile                  # Production web image
│   └── Dockerfile.dev              # Development web image
└── scripts/
    └── dev.sh                      # Development helper script
```

---

## Tips

### 1. Fast Feedback Loop

```bash
# Terminal 1: Watch logs
npm run dev:logs:backend

# Terminal 2: Edit code in src/
# Terminal 3: Run agents
npm run dev:agent civd
```

### 2. Database Inspection

```bash
# Quick query
docker-compose exec postgres psql -U sales salesdb -c "SELECT source, COUNT(*) FROM raw_leads GROUP BY source;"

# Interactive shell
npm run dev:shell:db
\dt                    # List tables
\d raw_leads           # Describe table
SELECT * FROM raw_leads LIMIT 5;
```

### 3. Clean Start

```bash
# Stop everything
npm run dev:stop

# Clean volumes (deletes data)
docker-compose down -v

# Fresh start
npm run dev:start
npm run dev:migrate
```

---

## Production vs Development

| Aspect | Development | Production |
|--------|-------------|------------|
| Images | Built locally | Pulled from GHCR |
| Hot Reload | ✅ Enabled | ❌ Disabled |
| Volumes | Source code mounted | No mounts |
| Database | Local (port 5433) | Remote/Docker |
| Logs | Verbose | Minimal |
| Build Time | Longer (dev deps) | Faster (prod deps) |

---

## Next Steps

1. ✅ Start development environment: `npm run dev:start`
2. ✅ Run migrations: `npm run dev:migrate`
3. ✅ Test agents: `npm run dev:agent civd`
4. ✅ Open dashboard: http://localhost:3100
5. ✅ Make code changes and see hot reload in action! 🔥

For production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md).
