# Starcom LeadGen

Sistem lead generation otomatis untuk PT Starcom Solusindo menggunakan Claude AI.

[![Deploy to Production](https://github.com/andripriyatnaputra/salesleadgen/actions/workflows/deploy.yml/badge.svg)](https://github.com/andripriyatnaputra/salesleadgen/actions/workflows/deploy.yml)

## 🎯 Tentang Proyek

Sistem ini secara otomatis mengumpulkan, mengklasifikasikan, dan mengkualifikasi tender IT dari berbagai sumber publik di Indonesia untuk PT Starcom Solusindo.

### Fitur Utama

- ✅ **Multi-Source Scraping**: CIVD, Pengadaan.com, BJB, Airnav, PAM Jaya
- ✅ **AI Classification**: Filter otomatis tender IT-relevant menggunakan Claude
- ✅ **Smart Filtering**: Date validation, keyword matching, exclusion list
- ✅ **Database Storage**: PostgreSQL dengan deduplication
- ✅ **Web Dashboard**: Real-time monitoring dengan Next.js
- ✅ **Docker Ready**: Production-ready containerization
- ✅ **CI/CD**: Automated deployment via GitHub Actions

## 🏢 Target ICP

**Industri Prioritas:**
- Migas & Pertambangan
- Pemerintah & BUMN
- Perbankan
- Manufaktur
- Kesehatan & Pendidikan

**Kebutuhan:**
- Jaringan (LAN/WAN, Fiber, WiFi)
- IT Infrastructure (Server, Hardware, Data Center)
- Software Development
- Sistem Integrasi
- Cybersecurity
- CCTV & Cloud Services

## 📊 Tech Stack

- **Runtime**: Node.js 18+ / TypeScript
- **AI Model**: Claude Sonnet 4.5 (Anthropic)
- **Database**: PostgreSQL 15
- **Frontend**: Next.js 14 (App Router)
- **HTTP Client**: Axios + Cheerio
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions

## 🚀 Quick Start

### Development

```bash
# Clone repository
git clone https://github.com/andripriyatnaputra/salesleadgen.git
cd salesleadgen

# Install dependencies
npm install
cd web && npm install && cd ..

# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Start database (Docker)
docker-compose up -d postgres

# Run database migration
npx tsx database/migrate.ts

# Run scraping agents
npm run agents civd pengadaan bjb airnav pamjaya

# Start web dashboard (in separate terminal)
cd web
npm run dev
```

Dashboard: http://localhost:3100

### Production (Docker)

```bash
# Setup environment
cp .env.example .env
nano .env  # Configure production values

# Start all services
docker-compose -f docker-compose.production.yml up -d

# Run migrations
docker-compose -f docker-compose.production.yml run --rm backend npx tsx database/migrate.ts

# View logs
docker-compose -f docker-compose.production.yml logs -f
```

Dashboard: http://your-server:3100

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guide.

## 📁 Project Structure

```
starcom-leadgen/
├── src/
│   ├── agents/
│   │   └── sources/
│   │       ├── civdAgent.ts              # CIVD website scraper
│   │       ├── civdProcurementParser.ts  # SKK MIGAS procurement list parser
│   │       ├── pengadaanAgent.ts         # Pengadaan.com scraper
│   │       ├── bjbAgent.ts               # Bank BJB scraper
│   │       ├── airnavAgent.ts            # Airnav Indonesia scraper
│   │       └── pamJayaAgent.ts           # PAM Jaya scraper
│   ├── config/
│   │   ├── claude.ts                     # Type definitions & ICP config
│   │   └── database.ts                   # PostgreSQL connection & repositories
│   ├── agents-runner.ts                  # Manual agent executor
│   └── output/                           # JSON output (gitignored)
├── web/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                  # Home dashboard
│   │   │   ├── dashboard/page.tsx        # Run agents UI
│   │   │   ├── raw-leads/page.tsx        # Raw leads table
│   │   │   ├── outreach/page.tsx         # Outreach emails
│   │   │   └── api/                      # Next.js API routes
│   │   ├── components/                   # Reusable components
│   │   └── lib/                          # Utilities
│   └── Dockerfile                        # Web container
├── database/
│   ├── schema.sql                        # Database schema
│   └── migrate.ts                        # Migration script
├── .github/
│   └── workflows/
│       └── deploy.yml                    # CI/CD pipeline
├── Dockerfile                            # Backend container
├── docker-compose.production.yml         # Production orchestration
├── DEPLOYMENT.md                         # Deployment guide
├── CLAUDE.md                             # AI agent instructions
└── README.md                             # This file
```

## 🤖 Available Agents

| Agent | Source | Status | Data Type |
|-------|--------|--------|-----------|
| `civd` | https://civd.skkmigas.id | ✅ Active | CIVD website tenders |
| `civd-file` | Local file | ✅ Active | SKK MIGAS procurement list 2026 |
| `pengadaan` | https://tender.pengadaan.com | ✅ Active | Government tenders |
| `bjb` | https://eproc.bankbjb.co.id | ✅ Active | Bank BJB tenders |
| `airnav` | https://eproc.airnavindonesia.co.id | ✅ Active | Airnav tenders |
| `pamjaya` | https://eproc.pamjaya.co.id | ✅ Active | PAM Jaya tenders |

### Running Agents

```bash
# Run all agents
npm run agents civd pengadaan bjb airnav pamjaya

# Run specific agent
npm run agents civd

# Run CIVD procurement list parser
npm run agents civd-file

# Docker
docker-compose -f docker-compose.production.yml run --rm backend npx tsx src/agents-runner.ts civd pengadaan
```

## 📊 Database Schema

### Tables

- **`raw_leads`** - Scraped tender data
- **`processed_leads`** - AI classification & scoring results
- **`outreach_emails`** - Generated outreach emails
- **`scraping_runs`** - Agent execution history

### Key Features

- ✅ Automatic deduplication (ON CONFLICT DO NOTHING)
- ✅ INSERT-only mode (data accumulation, no overwrites)
- ✅ Indexed for performance
- ✅ Supports BIGINT for large tender values

## 🔧 Environment Variables

See [.env.example](.env.example) for all configuration options.

**Required:**
```env
DATABASE_URL=postgres://sales:sales123@localhost:5433/salesdb
ANTHROPIC_API_KEY=your_api_key_here
```

**Optional:**
```env
PENGADAAN_EMAIL=your_email@example.com
PENGADAAN_PASSWORD=your_password
CIVD_USERNAME=starcom_username
CIVD_PASSWORD=starcom_password
HUNTER_API_KEY=your_hunter_key
```

## 🔄 CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically:

1. **Build & Test** - TypeScript check, build Next.js
2. **Docker Build** - Build and push images to GitHub Container Registry
3. **Deploy** - SSH to production server, pull images, restart containers

### Setup GitHub Secrets

Required secrets for deployment:
- `DEPLOY_HOST` - Server IP address
- `DEPLOY_USER` - SSH username
- `DEPLOY_SSH_KEY` - Private SSH key

See [DEPLOYMENT.md](DEPLOYMENT.md#github-actions-cicd-setup) for details.

## 📈 Performance

- **Scraping Rate**: ~2.5s delay between requests (respects robots.txt)
- **Database**: INSERT-only mode, no overwrites
- **Filtering**: 3-layer validation (status, date, IT-relevance)
- **Deduplication**: Automatic via unique lead_id constraint

### Current Stats

- Total Leads: 78+
- Sources: 5 (CIVD, PENGADAAN, BJB, AIRNAV, PAM_JAYA)
- Industries: 4 (BUMN, Migas, Pemerintah, Perbankan)
- Categories: 5 (IT-Infrastructure, Software, Jaringan, Sistem-Integrasi, Cloud)

## 🛡️ Security Best Practices

1. ✅ Environment variables in `.env` (never commit)
2. ✅ Rate limiting on scraping
3. ✅ PostgreSQL password authentication
4. ✅ Docker network isolation
5. ✅ GitHub Secrets for CI/CD credentials
6. ⚠️ TODO: Enable HTTPS with reverse proxy
7. ⚠️ TODO: Add authentication to web dashboard

## 🐛 Troubleshooting

### Database Connection Error

```bash
# Check PostgreSQL status
docker ps | grep postgres

# Check connection string
echo $DATABASE_URL

# Restart database
docker-compose restart postgres
```

### Agent Returns 0 Leads

- Check if website is accessible
- Verify API endpoints (BJB uses API, not HTML scraping)
- Check date filters (only current month or future)
- Review IT keyword filters in agent code

### Dashboard Shows Stale Data

- Dashboard reads from PostgreSQL, not `raw-leads.json`
- Refresh page to reload from database
- Check `/api/stats` and `/api/raw-leads` endpoints

## 📝 Development Notes

### Adding New Agent

1. Create new file in `src/agents/sources/newAgent.ts`
2. Implement `fetchNewTenders(): Promise<Lead[]>`
3. Add IT keyword filtering with `isITRelevant()`
4. Add date validation with `isDateValid()`
5. Update `agents-runner.ts` to include new agent
6. Add to `LeadSource` type in `src/config/claude.ts`

### Database Migrations

```bash
# Create migration
# Edit database/schema.sql

# Run migration
npx tsx database/migrate.ts
```

## 📄 License

Internal use only - PT Starcom Solusindo

## 🤝 Contributing

This is a private project for PT Starcom Solusindo. For issues or improvements, contact the development team.

## 📞 Support

- **Email**: andripriyatnaputra@gmail.com
- **GitHub**: https://github.com/andripriyatnaputra/salesleadgen
- **Documentation**: See CLAUDE.md for AI agent instructions

---

**Built with ❤️ using Claude Sonnet 4.5**
