# IndexMeNow

A full-stack SaaS platform that accelerates Google indexing for your URLs by firing 6 simultaneous indexing signals and tracking verification over a 10-day window. Built with Fastify, Next.js 14, PostgreSQL, Redis, and BullMQ.

## Features

- **6-signal indexing**: Google Indexing API, Google Search Console URL Inspect, Sitemap ping (Google + Bing), RSS/WebSub hub notifications, IndexNow (Bing), and crawl-trigger cache busting — all fired in parallel per URL
- **7-point health check**: validates each URL before consuming a credit (reachability, robots.txt, canonical, redirects, noindex, etc.)
- **10-day verification cycle**: daily checks via Google CSE and isindexed.com; auto-refunds the credit if not indexed by day 10
- **Credit system**: admin assigns credits; 1 credit = 1 URL indexing attempt; atomic transactions with Redis-cached balance
- **Projects & Campaigns**: organise URLs for clients or content groups
- **API key access**: submit URLs programmatically via `POST /api/v1/submit` with `X-API-KEY`
- **WordPress plugin**: auto-submits on publish/update via `transition_post_status` hook
- **Admin panel**: manage users, view BullMQ queue state, configure system settings, force-reindex URLs
- **Real-time signal status**: per-signal badge tracking in the URL detail drawer

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Fastify 5, TypeScript, Node 20 |
| Job queues | BullMQ + Redis 7 |
| ORM | Prisma 5 + PostgreSQL 15 |
| Frontend | Next.js 14 App Router, React 18 |
| UI | Tailwind CSS, shadcn/ui (Radix primitives) |
| Data fetching | TanStack Query v5 |
| Auth | JWT (httpOnly cookies) |
| Email | Resend SDK |
| Monorepo | Turborepo + npm workspaces |
| Containerised infra | Docker Compose (Postgres + Redis) |

## Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL and Redis)
- npm 11+

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/MSharazKhalid/index-project.git
cd index-project
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in at minimum:

| Variable | How to get it |
|----------|--------------|
| `DATABASE_URL` | Already set for Docker — leave as-is |
| `REDIS_URL` | Already set for Docker — leave as-is |
| `JWT_SECRET` | Any random 32+ character string (used for both access + refresh tokens) |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys → Create |
| `EMAIL_FROM` | Use `onboarding@resend.dev` while testing (no domain needed) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud Console → IAM → Service Accounts → Create key (JSON), paste as single line |
| `GOOGLE_CUSTOM_SEARCH_API_KEY` | Google Cloud Console → APIs → Custom Search JSON API → Credentials |
| `GOOGLE_CUSTOM_SEARCH_CX` | [programmablesearchengine.google.com](https://programmablesearchengine.google.com) → Create engine → get CX ID |
| `GOOGLE_SAFE_BROWSING_API_KEY` | Google Cloud Console → APIs → Safe Browsing API → Credentials |

**During development**, disable the heavy checks:
```env
MALWARE_CHECK_ENABLED=false
DOUBLE_VERIFY_INDEXED=false
```

### 3. Start infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 and Redis on port 6379.

### 4. Set up the database

> **Important:** always run these three commands in order — generate must come first.

```bash
# 1. Generate the Prisma client (required after every fresh clone or schema change)
npm run db:generate

# 2. Apply migrations
cd packages/database && npm run db:migrate:deploy

# 3. Seed system settings + default admin user
npm run db:seed
```

Default admin credentials: `admin@indexmenow.com` / `Admin@123!`

> If you skip `db:generate` you will get:
> `Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.`

### 5. Run the app

```bash
# From repo root — starts API (:3001) + frontend (:3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
index-project/
├── apps/
│   ├── api/               # Fastify API server + BullMQ workers
│   │   └── src/
│   │       ├── middleware/     # authenticate, adminOnly
│   │       ├── modules/        # credits, signals, verification
│   │       ├── routes/         # auth, user, projects, urls, admin, v1
│   │       ├── services/       # emailService
│   │       ├── utils/          # urlNormalizer, prisma, redis, logger
│   │       └── workers/        # healthCheck, indexingSignal, verification, retry, refund
│   └── web/               # Next.js 14 App Router frontend
│       ├── app/
│       │   ├── (auth)/         # login, register, forgot-password
│       │   ├── (marketing)/    # landing page
│       │   ├── admin/          # admin panel
│       │   └── dashboard/      # user dashboard
│       ├── components/
│       │   ├── ui/             # shadcn/ui component wrappers
│       │   ├── signals/        # SignalStatusIcons
│       │   ├── health/         # HealthBadge
│       │   └── urls/           # UrlDetailDrawer
│       ├── hooks/              # use-toast
│       └── lib/                # api.ts (typed axios), utils.ts
├── packages/
│   ├── database/          # Prisma schema (14 tables) + seed
│   └── wordpress-plugin/  # Auto-submit WP plugin
├── .env.example
├── docker-compose.yml
└── turbo.json
```

## API Reference

All endpoints require `Content-Type: application/json`.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (sets httpOnly cookies) |
| POST | `/api/auth/logout` | Clear cookies |
| POST | `/api/auth/refresh` | Rotate tokens using refresh cookie |
| GET | `/api/auth/verify-email/:token` | Verify email address |
| POST | `/api/auth/forgot-password` | Send reset link |
| POST | `/api/auth/reset-password` | Set new password |

### URL Submission (JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/urls/submit` | Submit URLs for indexing (deducts credits) |
| GET | `/api/urls` | List URLs with filters |
| GET | `/api/urls/:id` | URL detail with signals + verification history |

### Public API (API Key)

```bash
curl -X POST https://your-domain.com/api/v1/submit \
  -H "X-API-KEY: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com/page1", "https://example.com/page2"]}'
```

Response:
```json
{
  "submitted": 2,
  "health_failed": 0,
  "duplicate": 0,
  "credits_used": 2,
  "results": [...]
}
```

## URL Lifecycle

```
submitted → health check → signals firing → submitted → verifying → indexed
                ↓                                              ↓
           health_failed                              not_indexed → refunded (day 10)
```

- **Day 0**: Health check + 6 signals fired
- **Day 1–10**: Daily verification checks
- **Day 7**: Retry — signals re-fired if still not indexed
- **Day 10**: Auto-refund if still not indexed

## WordPress Plugin

1. Copy `packages/wordpress-plugin/` to your WordPress `wp-content/plugins/` directory
2. Activate **IndexMeNow Auto-Submit** in WP Admin → Plugins
3. Go to **Settings → IndexMeNow** and enter your API key + API URL
4. Posts now auto-submit on publish/update

## Admin Panel

Login as admin and navigate to `/admin`:

- **Users** — view all users, adjust credit balance, enable/disable accounts
- **URLs** — search and filter all submitted URLs, force-reindex
- **Queues** — monitor BullMQ job counts (active, waiting, failed) per worker
- **Settings** — configure system-wide defaults (refund window, retry window, credit thresholds)

## Troubleshooting

### Reset Docker containers (wipe all local data and start fresh)

```bash
# Stop and remove both containers + their volumes
docker rm -f indexmenow_redis indexmenow_postgres
docker volume rm index-project-test_postgres_data index-project-test_redis_data

# Then start fresh
docker-compose up -d
npm run db:generate
cd packages/database && npm run db:migrate:deploy && npm run db:seed
```

> Use this when: the database is in a broken state, you want a clean slate after schema changes, or migrations are failing unexpectedly.

### Prisma client not initialized

```
Error: @prisma/client did not initialize yet. Please run "prisma generate"
```

Run `npm run db:generate` from the repo root, then retry.

### Port already in use

```bash
# Kill whatever is on port 5432 or 6379
npx kill-port 5432 6379
# Or just remove the containers (see above)
```

---

## Development Commands

```bash
npm run dev            # Start all apps (Turborepo watch)
npm run build          # Production build
npm run type-check     # TypeScript check across all packages
npm run lint           # ESLint (web)
npm run db:migrate     # Create + apply new Prisma migration
npm run db:generate    # Regenerate Prisma client after schema change
npm run db:studio      # Open Prisma Studio at localhost:5555
npm run db:seed        # Seed system settings + admin user
```

## License

MIT
