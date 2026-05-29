# Starcom LeadGen - Deployment Guide

## Prerequisites

- Docker & Docker Compose installed
- PostgreSQL 15+
- Node.js 18+ (for development)
- GitHub account with repository access

## Production Deployment

### 1. Server Setup

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Create app directory
sudo mkdir -p /opt/starcom-leadgen
sudo chown $USER:$USER /opt/starcom-leadgen
cd /opt/starcom-leadgen

# Clone repository
git clone https://github.com/andripriyatnaputra/salesleadgen.git .
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

**Required variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `POSTGRES_PASSWORD` - Database password
- `ANTHROPIC_API_KEY` - Claude AI API key

**Optional variables:**
- `PENGADAAN_TOKEN` / `PENGADAAN_COOKIE` / `PENGADAAN_EMAIL` + `PENGADAAN_PASSWORD` - Pengadaan.com auth (pilih salah satu)
- `CIVD_USERNAME` / `CIVD_PASSWORD` - CIVD credentials
- `HUNTER_API_KEY` - Email enrichment service

### 3. Run Database Migration

```bash
# Start PostgreSQL only
docker-compose -f docker-compose.production.yml up -d postgres

# Wait for database to be ready
sleep 10

# Run migrations
docker-compose -f docker-compose.production.yml run --rm backend npx tsx database/migrate.ts
```

### 4. Start All Services

```bash
# Start all containers
docker-compose -f docker-compose.production.yml up -d

# Check status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f
```

### 5. Access Dashboard

Open browser: `http://your-server-ip:3100`

## GitHub Actions CI/CD Setup

### 1. Add GitHub Secrets

Go to: `https://github.com/andripriyatnaputra/salesleadgen/settings/secrets/actions`

Add the following secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `DEPLOY_HOST` | Production server IP | `202.50.203.136` |
| `DEPLOY_USER` | SSH user for deployment | `it` |
| `DEPLOY_SSH_KEY` | Private SSH key | `-----BEGIN RSA PRIVATE KEY-----...` |

### 2. Generate SSH Key for Deployment

```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -C "deploy@starcom-leadgen" -f ~/.ssh/starcom_deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/starcom_deploy.pub user@server-ip

# Copy private key content for GitHub Secret
cat ~/.ssh/starcom_deploy
```

### 3. Make Docker Images Public (Important!)

GitHub Container Registry packages are private by default. Make them public:

1. Go to: https://github.com/users/andripriyatnaputra/packages
2. Click on `salesleadgen-backend` → **Package settings** → Change visibility to **Public**
3. Click on `salesleadgen-web` → **Package settings** → Change visibility to **Public**

**Why?** Production server needs to pull images without authentication.

### 4. Trigger Deployment

Deployment is triggered automatically on:
- Push to `main` branch
- Manual trigger via GitHub Actions UI

```bash
# Push to main branch
git add .
git commit -m "Deploy to production"
git push origin main
```

**What happens:**
1. ✅ GitHub Actions builds Docker images
2. ✅ Pushes to GitHub Container Registry (GHCR)
3. ✅ SSH to production server
4. ✅ Pulls latest images from GHCR
5. ✅ Restarts containers with new images
6. ✅ Runs database migrations

## Manual Agent Execution

### Run Specific Agents

```bash
# Run all agents
docker-compose -f docker-compose.production.yml run --rm backend npx tsx src/agents-runner.ts civd pengadaan bjb airnav pamjaya

# Run single agent
docker-compose -f docker-compose.production.yml run --rm backend npx tsx src/agents-runner.ts civd

# Run CIVD with procurement list file
docker-compose -f docker-compose.production.yml run --rm backend npx tsx src/agents-runner.ts civd-file
```

### Schedule with Cron

```bash
# Edit crontab
crontab -e

# Add daily scraping at 2 AM
0 2 * * * cd /opt/starcom-leadgen && docker-compose -f docker-compose.production.yml run --rm backend npx tsx src/agents-runner.ts civd pengadaan bjb airnav pamjaya >> /var/log/starcom-leadgen.log 2>&1
```

## Database Backup

```bash
# Backup database
docker exec starcom-leadgen-db pg_dump -U sales salesdb > backup_$(date +%Y%m%d).sql

# Restore database
cat backup_20260517.sql | docker exec -i starcom-leadgen-db psql -U sales salesdb
```

## Monitoring

### View Container Logs

```bash
# All containers
docker-compose -f docker-compose.production.yml logs -f

# Specific service
docker-compose -f docker-compose.production.yml logs -f backend
docker-compose -f docker-compose.production.yml logs -f web
docker-compose -f docker-compose.production.yml logs -f postgres
```

### Container Stats

```bash
docker stats starcom-leadgen-backend starcom-leadgen-web starcom-leadgen-db
```

### Database Stats

```bash
# Connect to database
docker exec -it starcom-leadgen-db psql -U sales salesdb

# Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Count leads by source
SELECT source, COUNT(*) FROM raw_leads GROUP BY source;
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose -f docker-compose.production.yml logs

# Restart specific service
docker-compose -f docker-compose.production.yml restart backend
```

### Database connection issues

```bash
# Check database health
docker exec starcom-leadgen-db pg_isready -U sales

# Check connection string in .env
cat .env | grep DATABASE_URL
```

### Port already in use

```bash
# Check what's using port 3100
sudo lsof -i :3100

# Stop conflicting service or change port in docker-compose.production.yml
```

## Update Deployment

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml build --no-cache
docker-compose -f docker-compose.production.yml up -d

# Run migrations if needed
docker-compose -f docker-compose.production.yml run --rm backend npx tsx database/migrate.ts
```

## Security Recommendations

1. **Change default passwords** in `.env`
2. **Use strong PostgreSQL password**
3. **Enable firewall** on server
4. **Use HTTPS** with reverse proxy (nginx/caddy)
5. **Restrict database access** to localhost only
6. **Rotate API keys** regularly
7. **Enable GitHub branch protection** for main branch

## Performance Optimization

1. **Database indexing** - Already configured in schema.sql
2. **Docker resource limits** - Add to docker-compose.production.yml:
   ```yaml
   services:
     backend:
       deploy:
         resources:
           limits:
             cpus: '2'
             memory: 2G
   ```
3. **Log rotation** - Configure logrotate for container logs
4. **CDN for static assets** - Use Cloudflare for Next.js assets

## Support

For issues, please check:
- GitHub Issues: https://github.com/andripriyatnaputra/salesleadgen/issues
- Documentation: README.md
- CLAUDE.md for project context
