# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Start infrastructure first (PostgreSQL + Redis via Docker)
docker-compose up -d

# Install all dependencies (run once from root)
npm install

# Start all apps in watch mode (API on :3001, web on :3000)
npm run dev

# Run only the API
cd apps/api && npm run dev        # dotenv-cli loads ../../.env, then: tsx watch src/server.ts

# Run only the frontend
cd apps/web && npm run dev        # next dev -p 3000
```

### Database
```bash
# After schema changes — regenerate Prisma client
npm run db:generate

# Create and apply a new migration (interactive)
npm run db:migrate                # runs: dotenv -e ../../.env -- prisma migrate dev

# Apply migrations in production (no prompt)
cd packages/database && npm run db:migrate:deploy

# Open Prisma Studio (browser-based DB viewer)
npm run db:studio

# Seed the database (9 system settings + default admin user)
cd packages/database && npm run db:seed
# Default admin: admin@indexmenow.com / Admin@123!
```

### Type checking & linting
```bash
npm run type-check                # tsc --noEmit across all packages
npm run lint                      # next lint (web only currently)
npm run build                     # full production build
```

## Critical: Environment loading

All `packages/database` and `apps/api` scripts use `dotenv-cli` to load the root `.env`:
```
"dev": "dotenv -e ../../.env -- tsx watch src/server.ts"
```
**Do NOT** also `import "dotenv/config"` in `server.ts` — that double-loads and causes conflicts.
The root `.env` is the single source of truth for all packages.

## Architecture

### Monorepo layout (Turborepo)
```
apps/api/                  Fastify API + BullMQ workers (Node 20, TypeScript)
apps/web/                  Next.js 14 App Router frontend
packages/database/         Prisma schema + seed (shared by API)
packages/wordpress-plugin/ PHP auto-submit plugin
```

### API (`apps/api/src/`)

**Entry point**: `server.ts` calls `buildApp()` + `startWorkers()`.

**Route prefixes** (registered in `app.ts`):
| Prefix | File | Auth |
|--------|------|------|
| `/api/auth` | `routes/auth/` | Public |
| `/api/user` | `routes/user/` | JWT |
| `/api/projects` | `routes/projects/` | JWT |
| `/api/campaigns` | `routes/campaigns/` | JWT |
| `/api/urls` | `routes/urls/` | JWT |
| `/api/credits` | `routes/credits/` | JWT |
| `/api/admin` | `routes/admin/` | JWT + adminOnly |
| `/api/v1` | `routes/v1/` | API key (`X-API-KEY`) |
| `/` | `routes/public/` | Public |

**Authentication**: JWT stored in httpOnly cookie (`accessToken`) + mirrored to `localStorage` for the axios interceptor. Refresh token is a separate httpOnly cookie. API key auth hashes the key with SHA-256 and looks up `ApiKey.keyHash`.

**Cookie security**: Cookies use `secure: process.env.NODE_ENV === "production"` — NOT `secure: true`. Using `secure: true` on localhost (HTTP) causes browsers to silently drop the cookie, breaking all auth.

**Middleware pattern**: Both `authenticate.ts` and `adminOnly.ts` must use `return reply.status(...).send(...)` — the `return` is required to prevent Fastify from continuing to execute the route handler after a rejection.

**URL submission pipeline** (in `routes/urls/index.ts` → `processUrls()`):
1. `validateUrlFormat()` — blocks private IPs, reserved TLDs
2. `spamFilter()` — domain blocklist, per-user rate, per-domain rate
3. `checkDuplicate()` — `url_hash` lookup, skips already-active URLs
4. `malwareCheck()` — Google Safe Browsing v4 (4h Redis cache)
5. `runHealthCheck()` — 7 checks, 60-min Redis cache
6. `deductCredit()` — atomic Prisma transaction
7. Enqueue 6 indexing signals → `indexingSignalQueue`

**URL deduplication**: Always store `urlHash: hashUrl(normalizeUrl(url))` — never the raw URL string. The `hashUrl()` function is in `utils/urlNormalizer.ts`. The `/api/v1/submit` endpoint stores the hash correctly.

**BullMQ workers** (all started in `workers/index.ts`):
| Worker | Concurrency | Trigger |
|--------|-------------|---------|
| `healthCheckWorker` | 20 | On URL submit |
| `indexingSignalWorker` | 10 | After health pass |
| `verificationWorker` | 50 | 24h after signal fire; repeats daily up to day 10 |
| `retryWorker` | 5 | Repeatable scan every 24h; re-fires signals at day 7 |
| `refundWorker` | 5 | Repeatable scan every 24h; refunds credits at day 10 |

When `indexingSignalWorker` detects all 6 signals for a URL are done, it sets `url.status = 'submitted'` and schedules the first verification job with a 24h delay.

**6 indexing signals** (fired in parallel per URL):
- `google_indexing_api` — POST to `indexing.googleapis.com`
- `gsc_url_inspect` — POST to `searchconsole.googleapis.com`
- `sitemap_ping` — upserts `SitemapEntry`, pings Google + Bing
- `rss_webSub` — upserts `RssEntry`, pings 3 WebSub hubs
- `indexnow` — batch POST to `api.indexnow.org`
- `crawl_trigger` — invalidates `discover:*` Redis keys

**IndexNow guard**: `process.env.INDEXNOW_ENABLED === "false"` disables it. The expression `!process.env.INDEXNOW_ENABLED === false` is broken due to operator precedence — always use the string comparison form.

**Verification** (`modules/verification/`): Checks via Google CSE + isindexed.com API. When `DOUBLE_VERIFY_INDEXED=true` (default), two consecutive positive results are required before marking `status = 'indexed'`.

**Credit system** (`modules/credits/creditService.ts`): All balance mutations use `prisma.$transaction()` for atomicity. Balance is cached in Redis for 30s with key `credits:{userId}`. No payment processing — admin assigns credits only.

**Email** (`services/emailService.ts`): Resend SDK, lazy-initialized via `getResend()`. Returns `null` when `RESEND_API_KEY` is absent and skips silently in dev. Never construct `new Resend(undefined)` at module load.

**Redis cache keys**:
| Key pattern | TTL | Content |
|-------------|-----|---------|
| `health:{urlHash}` | 60m | Health check result |
| `verify:cse:{urlHash}` | 20h | Google CSE result |
| `verify:isindexed:{urlHash}` | 20h | isindexed.com result |
| `safebrowsing:{urlHash}` | 4h | Safe Browsing threat status |
| `robots:{domain}` | 1h | robots.txt content |
| `credits:{userId}` | 30s | Credit balance |
| `sitemap:{userId}` | 5m | Sitemap XML |
| `discover:recent` | 60s | Recent URLs page |

**Fastify 5 plugin versions** — use v5-compatible versions only:
- `@fastify/helmet@^12`
- `@fastify/cors@^10`
- `@fastify/cookie@^10`
- `@fastify/multipart@^9`
- `@fastify/rate-limit@^10`

Plugins targeting Fastify 4 (e.g. helmet v9/v11) throw `expected '4.x' fastify version` and crash startup.

### Frontend (`apps/web/`)

**Route groups**:
- `app/(marketing)/` — public landing page
- `app/(auth)/` — login, register, forgot-password
- `app/dashboard/` — main user area (projects, URLs, credits, account)
- `app/dashboard/campaigns/` — campaign CRUD
- `app/dashboard/api-docs/` — API key management + endpoint reference
- `app/admin/` — admin panel (users, queues, settings)
- `app/admin/urls/` — searchable URL table with force-reindex

**Data fetching**: TanStack Query (`staleTime: 30s`, `retry: 1`). All API calls go through the typed helpers in `lib/api.ts` (`authApi`, `userApi`, `projectApi`, `urlApi`, `creditApi`, `adminApi`).

**Auth flow**: On login, `accessToken` is saved to `localStorage`. The axios interceptor in `lib/api.ts` attaches it as `Authorization: Bearer`. On 401, it auto-refreshes via `/api/auth/refresh` (uses httpOnly refresh cookie), then retries the original request.

**Middleware** (`middleware.ts`): Runs on Edge runtime, reads `req.cookies.get("accessToken")`, redirects unauthenticated requests on `/dashboard/*` and `/admin/*` to `/login?from=<path>`.

**Path alias**: `@/*` maps to `./` (the `apps/web/` root), not `./src/`. Configured in `apps/web/tsconfig.json` with `"moduleResolution": "bundler"`.

**Tailwind CSS**: Requires `postcss.config.js` at `apps/web/postcss.config.js`. Without this file, Tailwind classes are parsed but styles never apply.

**shadcn/ui components**: All Radix UI primitives are installed in `package.json`. Component wrappers live in `apps/web/components/ui/`. Currently present: button, input, label, badge, card, textarea, separator, table, tabs, switch, alert, progress, scroll-area, select, dialog, toast, toaster, dropdown-menu.

**Toast system**: `hooks/use-toast.ts` manages toast state; `components/ui/toaster.tsx` renders the portal; `<Toaster />` is mounted in `app/layout.tsx`.

**Key shared components**:
- `components/signals/SignalStatusIcons.tsx` — 6 letter badges showing per-signal status for a URL
- `components/health/HealthBadge.tsx` — Pass/Warn/Fail indicator
- `components/health/HealthCheckTable.tsx` — 7-column table showing per-check results before URL submission (step 1 of the 2-step submit flow on the dashboard)
- `components/urls/UrlDetailDrawer.tsx` — full detail panel with health checks, signals, verification history, timeline

### Database schema (`packages/database/prisma/schema.prisma`)

14 tables: `User`, `Project`, `Campaign`, `Url`, `UrlHealthCheck`, `IndexingSignal`, `VerificationCheck`, `CreditTransaction`, `ApiKey`, `BlockedDomain`, `Notification`, `SystemSetting`, `SitemapEntry`, `RssEntry`.

Key constraint: `@@unique([urlHash, userId])` on `Url` prevents duplicate submissions per user. URL deduplication uses SHA-256 hash of the normalized URL.

### WordPress plugin (`packages/wordpress-plugin/`)

Three files: `indexing-tool.php` (bootstrap, hooks, meta box, dashboard widget), `includes/api-client.php` (WP HTTP API wrapper), `admin/settings-page.php` (settings UI). Hooks into `transition_post_status` to auto-submit on publish/update. Calls `/api/v1/submit` with `X-API-KEY` header.

## Environment setup

Copy `.env.example` to `.env` in the repo root. The minimum required vars to run locally:
- `DATABASE_URL`, `REDIS_URL` — provided by `docker-compose up -d`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — any random 32+ char strings
- `RESEND_API_KEY` — for email sending (use `onboarding@resend.dev` as `EMAIL_FROM` during dev without a verified domain)
- `GOOGLE_SERVICE_ACCOUNT_JSON` — for Google Indexing API + GSC signals
- `GOOGLE_CUSTOM_SEARCH_API_KEY` + `GOOGLE_CUSTOM_SEARCH_CX` — for verification

Set `MALWARE_CHECK_ENABLED=false` and `DOUBLE_VERIFY_INDEXED=false` to skip those checks during development.

## Known development limitations

- **Email verification**: Not required for login. Users can log in immediately after registration.
- **IndexNow**: Requires a publicly accessible key file URL. Silently skips on localhost.
- **Google Indexing API / GSC**: Requires a service account with Search Console property access. Workers fail gracefully when not configured.
- **Malware check**: Set `MALWARE_CHECK_ENABLED=false` in dev to skip the Google Safe Browsing API call.
