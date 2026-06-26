# URL Indexing Tool — Complete Project Requirements
**Version:** 4.0 (Developer Edition)
**Document Type:** Full Build Specification
**Prepared By:** Lead Developer
**Payment System:** Excluded — Admin assigns credits only
**Goal:** 100% working, original indexing tool — not a clone

---

## DEVELOPER NOTES (Read First)

This document is written from a senior developer's perspective with deep knowledge of how Google indexing works. The following principles guide every decision in this document:

1. **Google does not guarantee indexing** — our tool maximizes signals but cannot force Google. The tool must be honest about this.
2. **Quality signals beat quantity** — one good Google Indexing API call beats 100 ping services.
3. **URL health is critical** — submitting a non-indexable URL wastes credits and damages trust.
4. **Verification must be accurate** — false "indexed" results destroy credibility.
5. **The retry system must be smart** — blind re-submission without diagnosing the problem doesn't help.
6. **Security is not optional** — a public URL submission tool is a massive abuse target.
7. **Every background job must be observable** — if something breaks silently, users lose trust.

---

## TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Complete System Workflow](#2-complete-system-workflow)
3. [Tech Stack](#3-tech-stack)
4. [System Architecture](#4-system-architecture)
5. [Database Schema](#5-database-schema)
6. [User Roles & Permissions](#6-user-roles--permissions)
7. [Module 1 — URL Health Checker](#7-module-1--url-health-checker)
8. [Module 2 — Security & Filtering Layer](#8-module-2--security--filtering-layer)
9. [Module 3 — Indexing Signal Engine](#9-module-3--indexing-signal-engine)
10. [Module 4 — Sitemap Engine](#10-module-4--sitemap-engine)
11. [Module 5 — RSS Feed Network](#11-module-5--rss-feed-network)
12. [Module 6 — Crawl Trigger System](#12-module-6--crawl-trigger-system)
13. [Module 7 — IndexNow Integration](#13-module-7--indexnow-integration)
14. [Module 8 — Verification Engine](#14-module-8--verification-engine)
15. [Module 9 — Retry & Recovery System](#15-module-9--retry--recovery-system)
16. [Module 10 — Credit System](#16-module-10--credit-system)
17. [Module 11 — Job Queue & Background Processing](#17-module-11--job-queue--background-processing)
18. [Frontend — Dashboard](#18-frontend--dashboard)
19. [Public REST API](#19-public-rest-api)
20. [WordPress Plugin](#20-wordpress-plugin)
21. [Notification System](#21-notification-system)
22. [Admin Panel](#22-admin-panel)
23. [Security Requirements](#23-security-requirements)
24. [Performance & Reliability](#24-performance--reliability)
25. [Observability & Monitoring](#25-observability--monitoring)
26. [Acceptance Criteria](#26-acceptance-criteria)
27. [Project Folder Structure](#27-project-folder-structure)
28. [Appendix A — Environment Variables](#appendix-a--environment-variables)
29. [Appendix B — All API Endpoints](#appendix-b--all-api-endpoints)

---

## 1. PROJECT OVERVIEW

### 1.1 What This Tool Does
A professional SaaS platform that helps website owners and SEO professionals accelerate Google and Bing indexing of their web pages. The tool:

- Validates URLs are technically indexable before submission
- Fires multiple independent indexing signals simultaneously
- Monitors indexing status automatically every 24 hours
- Intelligently retries failed submissions with diagnosis
- Auto-refunds credits for URLs that remain unindexed after 10 days

### 1.2 What Makes This Tool Different
Most indexing tools blindly submit URLs and call it done. This tool:

- **Checks before charging** — health check catches unindexable URLs before wasting a credit
- **Multi-signal approach** — 6 independent signals fired in parallel (not sequential)
- **Smart retry** — re-diagnosis before retry, not blind re-submission
- **Honest verification** — uses multiple sources to confirm indexing, not just one
- **Full observability** — users see exactly what happened for every signal, every check
- **Intelligent queue** — priority-based processing, not simple FIFO

### 1.3 Credit Model
- Admin assigns credits manually to users
- 1 credit = 1 URL indexing attempt
- Credits never expire
- Auto-refund after 10 days if URL not indexed
- Health check failures do NOT consume credits

---

## 2. COMPLETE SYSTEM WORKFLOW

```
USER SUBMITS URL(s)
        │
        ▼
┌───────────────────────┐
│  SECURITY FILTER      │  ← Spam check, malware check,
│  (synchronous)        │    rate limit, auth check
└───────────┬───────────┘
            │ PASS
            ▼
┌───────────────────────┐
│  URL HEALTH CHECK     │  ← HTTP status, noindex, robots.txt,
│  (synchronous)        │    canonical, redirect, page size,
└───────────┬───────────┘    SSL validity, response time
            │
     ┌──────┴──────┐
  FAILED         PASSED
     │               │
     ▼               ▼
Show issues     ALREADY INDEXED CHECK
No credit       (Google CSE / isindexed.com)
charged              │
              ┌──────┴──────┐
          INDEXED        NOT INDEXED
              │               │
              ▼               ▼
      Mark               DEDUCT 1 CREDIT
      already_indexed    (atomic transaction)
      No charge               │
                              ▼
                   ┌──────────────────────┐
                   │  INDEXING SIGNALS    │
                   │  (all parallel)      │
                   │                      │
                   │  1. Google Index API │
                   │  2. GSC URL Inspect  │
                   │  3. Sitemap Engine   │
                   │  4. RSS + WebSub     │
                   │  5. IndexNow (Bing)  │
                   │  6. Crawl Trigger    │
                   └──────────┬───────────┘
                              │
                              ▼
                   Status = "submitted"
                   All signals logged
                              │
                   ┌──────────┴───────────┐
                   │  DAILY VERIFICATION  │ ← Cron every 24h
                   │  (cron job)          │
                   └──────────┬───────────┘
                              │
                    ┌─────────┴──────────┐
                INDEXED            NOT INDEXED
                    │                    │
                    ▼                    │
              Mark indexed         Day 7 reached?
              Notify user               │
              Done ✅           ┌───────┴────────┐
                               YES              NO
                                │               │
                                ▼          Keep checking
                     RE-DIAGNOSIS CHECK         │
                     (re-run health check)       │
                                │          Day 10 reached?
                    ┌───────────┴────────┐       │
                ISSUES             STILL OK  ┌───┴───┐
                FOUND                │      YES     NO
                    │                ▼       │      │
                    ▼          RE-FIRE    AUTO-  Keep
                 Notify         ALL      REFUND checking
                 user of        SIGNALS  credit
                 new issue      (retry)    │
                                       Notify
                                       user
                                       Done 🔄
```

---

## 3. TECH STACK

### Frontend
| Layer | Technology | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR for dashboard speed, SEO for landing page |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, production-grade UI |
| State | React Query (TanStack) | Server state, caching, background refetch |
| Forms | React Hook Form + Zod | Type-safe validation |
| Charts | Recharts | Lightweight, React-native |
| Tables | TanStack Table | Sortable, filterable, virtualized for large URL lists |

### Backend
| Layer | Technology | Reason |
|---|---|---|
| Runtime | Node.js 20 LTS | Stable, great async support |
| Framework | Fastify | Faster than Express, built-in schema validation |
| ORM | Prisma | Type-safe DB queries, easy migrations |
| Queue | BullMQ + Redis | Reliable job queue with priority, retry, delay |
| Scheduler | BullMQ Repeatable Jobs | More reliable than node-cron for production |
| Auth | JWT (access 15m + refresh 30d) | Stateless, scalable |
| Validation | Zod | Shared with frontend |

### Database
| Layer | Technology |
|---|---|
| Primary | PostgreSQL 15 |
| Cache + Queue | Redis 7 |

### Infrastructure (on your server)
| Service | Tool | Cost |
|---|---|---|
| Email | Resend | Free (3k/month) |
| SSL | Let's Encrypt via Caddy | Free |
| Process Manager | PM2 | Free |
| Reverse Proxy | Caddy or Nginx | Free |
| Monitoring | Sentry (error) + UptimeRobot | Free tier |

---

## 4. SYSTEM ARCHITECTURE

```
                        ┌─────────────────────────────┐
                        │        USERS (Browser)       │
                        │  Next.js (Dashboard + Pages) │
                        └──────────────┬──────────────┘
                                       │ HTTPS
                        ┌──────────────▼──────────────┐
                        │      Fastify API Server      │
                        │  (auth, routes, validation)  │
                        └──┬──────────┬───────────┬───┘
                           │          │           │
                    ┌──────▼──┐  ┌────▼───┐  ┌───▼────┐
                    │Postgres │  │ Redis  │  │BullMQ  │
                    │(data)   │  │(cache) │  │(queues)│
                    └─────────┘  └────────┘  └───┬────┘
                                                  │
                    ┌─────────────────────────────┼──────────────────────┐
                    │                             │                      │
             ┌──────▼──────┐            ┌────────▼──────┐     ┌────────▼──────┐
             │Health Check │            │ Indexing      │     │ Verification  │
             │Worker       │            │ Signal Worker │     │ Worker        │
             └─────────────┘            └───────┬───────┘     └───────┬───────┘
                                                │                     │
                          ┌─────────────────────┼──────┐              │
                          │           │         │      │              │
                    ┌─────▼──┐ ┌─────▼──┐ ┌────▼─┐ ┌──▼───┐   ┌─────▼──────┐
                    │Google  │ │Google  │ │Index │ │RSS + │   │Google CSE  │
                    │Index   │ │Search  │ │Now   │ │Web   │   │isindexed   │
                    │API     │ │Console │ │(Bing)│ │Sub   │   │.com API    │
                    └────────┘ └────────┘ └──────┘ └──────┘   └────────────┘

        Public Routes (crawlable by Google):
        ├── /sitemaps/{user_id}/sitemap.xml
        ├── /feeds/{user_id}/feed.xml
        └── /discover/recent
```

### Queue Architecture (Critical)
```
BullMQ Queues:
├── health-check-queue      (priority: high, concurrency: 20)
├── indexing-signal-queue   (priority: high, concurrency: 10)
│     ├── google-api job
│     ├── gsc-fetch job
│     ├── sitemap-ping job
│     ├── rss-publish job
│     ├── indexnow job
│     └── crawl-trigger job
├── verification-queue      (priority: normal, concurrency: 50)
│     └── repeatable: every 24h
├── retry-queue             (priority: normal, concurrency: 5)
│     └── repeatable: check every 24h, trigger at day 7
└── refund-queue            (priority: normal, concurrency: 5)
      └── repeatable: check every 24h, trigger at day 10
```

---

## 5. DATABASE SCHEMA

### Table: `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| username | VARCHAR(100) | Unique |
| email | VARCHAR(255) | Unique |
| password_hash | VARCHAR(255) | bcrypt min 12 rounds |
| api_key | VARCHAR(64) | Unique, SHA-256 hashed in DB |
| credits_balance | INTEGER | Default: 0 |
| role | ENUM | `user`, `admin`, `support` |
| email_verified | BOOLEAN | Default: false |
| low_credit_threshold | INTEGER | Default: 5 |
| notify_on_indexed | BOOLEAN | Default: true |
| notify_on_refund | BOOLEAN | Default: true |
| notify_on_retry | BOOLEAN | Default: true |
| notify_on_health_fail | BOOLEAN | Default: true |
| is_active | BOOLEAN | Default: true |
| last_login_at | TIMESTAMP | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Table: `projects`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | |
| name | VARCHAR(255) | |
| description | TEXT | Nullable |
| url_count | INTEGER | Default: 0 (cached) |
| indexed_count | INTEGER | Default: 0 (cached) |
| failed_count | INTEGER | Default: 0 (cached) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Table: `campaigns`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| project_id | UUID (FK → projects) | |
| user_id | UUID (FK → users) | |
| name | VARCHAR(255) | |
| description | TEXT | Nullable |
| status | ENUM | `active`, `paused`, `completed` |
| total_urls | INTEGER | Default: 0 |
| indexed_count | INTEGER | Default: 0 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Table: `urls`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | |
| project_id | UUID (FK → projects) | |
| campaign_id | UUID (FK → campaigns) | Nullable |
| url | TEXT | Full URL, max 2048 chars |
| url_hash | VARCHAR(64) | SHA-256 of URL for fast dedup lookup |
| status | ENUM | `queued`, `health_checking`, `health_failed`, `already_indexed`, `signals_firing`, `submitted`, `indexed`, `retry_queued`, `not_indexed`, `refunded` |
| http_status | INTEGER | From health check |
| is_indexable | BOOLEAN | Health check verdict |
| health_fail_reasons | TEXT[] | Array of reason strings |
| signals_fired_at | TIMESTAMP | When indexing signals were sent |
| first_check_at | TIMESTAMP | First verification check |
| last_check_at | TIMESTAMP | Most recent verification check |
| check_count | INTEGER | Default: 0 |
| indexed_at | TIMESTAMP | When confirmed indexed |
| retry_count | INTEGER | Default: 0 |
| retry_fired_at | TIMESTAMP | |
| refunded_at | TIMESTAMP | |
| credit_charged | BOOLEAN | Default: false |
| credit_refunded | BOOLEAN | Default: false |
| source | ENUM | `dashboard`, `api`, `wordpress`, `bulk_csv`, `sitemap_import` |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Index:** `url_hash` + `user_id` for fast duplicate detection

### Table: `url_health_checks`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| url_id | UUID (FK → urls) | |
| http_status | INTEGER | e.g. 200, 301, 404 |
| response_time_ms | INTEGER | Time to first byte |
| is_redirect | BOOLEAN | |
| redirect_chain | JSONB | Array of redirect hops |
| final_url | TEXT | URL after all redirects |
| has_noindex | BOOLEAN | |
| noindex_source | VARCHAR(50) | `meta_tag`, `http_header`, or null |
| robots_blocked | BOOLEAN | |
| robots_directive | TEXT | The blocking rule found |
| canonical_url | TEXT | |
| canonical_mismatch | BOOLEAN | |
| ssl_valid | BOOLEAN | |
| ssl_expiry_days | INTEGER | Days until SSL cert expires |
| page_size_kb | INTEGER | |
| has_content | BOOLEAN | Page has meaningful body content |
| is_indexable | BOOLEAN | Final verdict |
| fail_reasons | TEXT[] | |
| checked_at | TIMESTAMP | |

### Table: `indexing_signals`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| url_id | UUID (FK → urls) | |
| signal_type | ENUM | `google_indexing_api`, `gsc_url_inspect`, `sitemap_ping`, `rss_webSub`, `indexnow`, `crawl_trigger` |
| is_retry | BOOLEAN | Default: false |
| status | ENUM | `pending`, `success`, `failed`, `skipped`, `error` |
| http_response_code | INTEGER | |
| response_summary | TEXT | Truncated response (max 500 chars) |
| error_message | TEXT | If status = error/failed |
| duration_ms | INTEGER | How long the signal took |
| attempted_at | TIMESTAMP | |

### Table: `verification_checks`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| url_id | UUID (FK → urls) | |
| method | ENUM | `google_cse`, `isindexed_api`, `manual` |
| is_indexed | BOOLEAN | |
| raw_response | JSONB | API response snippet |
| checked_at | TIMESTAMP | |

### Table: `credit_transactions`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | |
| type | ENUM | `admin_grant`, `admin_deduct`, `charge`, `auto_refund`, `manual_refund` |
| amount | INTEGER | Positive = added, Negative = deducted |
| balance_before | INTEGER | For audit trail |
| balance_after | INTEGER | |
| description | TEXT | |
| url_id | UUID (FK → urls) | Nullable |
| performed_by | UUID (FK → users) | Admin who made manual change |
| created_at | TIMESTAMP | |

### Table: `sitemap_entries`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| url_id | UUID (FK → urls) | |
| user_id | UUID (FK → users) | |
| last_pinged_at | TIMESTAMP | |
| ping_response_code | INTEGER | |

### Table: `rss_entries`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| url_id | UUID (FK → urls) | |
| user_id | UUID (FK → users) | |
| page_title | TEXT | Fetched from submitted URL |
| page_description | TEXT | Meta description |
| published_at | TIMESTAMP | |
| hub_ping_results | JSONB | Results from each hub ping |

### Table: `notifications`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | |
| type | ENUM | `indexed`, `health_failed`, `refunded`, `retry_triggered`, `low_credits`, `credits_granted`, `system` |
| title | VARCHAR(255) | |
| message | TEXT | |
| url_id | UUID (FK → urls) | Nullable |
| is_read | BOOLEAN | Default: false |
| created_at | TIMESTAMP | |

### Table: `api_keys`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | |
| key_hash | VARCHAR(64) | SHA-256 hash |
| key_prefix | VARCHAR(8) | First 8 chars shown in UI for identification |
| label | VARCHAR(100) | |
| last_used_at | TIMESTAMP | |
| request_count | INTEGER | Total requests made |
| is_active | BOOLEAN | Default: true |
| created_at | TIMESTAMP | |

### Table: `system_settings`
| Column | Type | Notes |
|---|---|---|
| key | VARCHAR(100) (PK) | |
| value | TEXT | |
| description | TEXT | For admin UI |
| updated_at | TIMESTAMP | |
| updated_by | UUID (FK → users) | |

---

## 6. USER ROLES & PERMISSIONS

| Action | user | support | admin |
|---|---|---|---|
| Submit URLs | ✅ | ❌ | ✅ |
| View own data | ✅ | ✅ | ✅ |
| View all users | ❌ | ✅ (read) | ✅ |
| Grant/deduct credits | ❌ | ❌ | ✅ |
| Force reindex (any URL) | ❌ | ❌ | ✅ |
| Access admin panel | ❌ | Limited | ✅ |
| Use public API | ✅ | ❌ | ✅ |
| Ban/unban users | ❌ | ❌ | ✅ |
| Edit system settings | ❌ | ❌ | ✅ |
| View all job logs | ❌ | ❌ | ✅ |

---

## 7. MODULE 1 — URL HEALTH CHECKER

### Purpose
Check every URL before any credit is deducted. A URL that cannot be indexed wastes everyone's time and money. This module is the first line of defense.

### When It Runs
- Synchronously when user submits URLs (before queue)
- Results shown to user before confirmation
- On 7-day retry (re-diagnosis before re-firing signals)
- On-demand via "Re-check Health" button in dashboard

### Check 1: HTTP Status & Reachability
```
Fetch URL with:
  User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1)
  Timeout: 10 seconds
  Follow redirects: YES (up to 5 hops)

Pass: HTTP 200
Warn: HTTP 301/302 (redirect detected — show redirect target)
Fail: HTTP 404 (not found)
Fail: HTTP 403 (forbidden — Googlebot blocked)
Fail: HTTP 410 (gone — page deleted)
Fail: HTTP 5xx (server error)
Fail: Timeout (server too slow)
Fail: DNS resolution failure (domain doesn't exist)
```

### Check 2: SSL Certificate Validity
```
Check SSL cert:
- Is cert valid? (not expired, not self-signed)
- Days until expiry

Fail: Expired SSL cert (Google avoids crawling these)
Warn: SSL expires in < 14 days
Pass: Valid cert, > 14 days remaining
```

### Check 3: Robots.txt Compliance
```
Fetch: {scheme}://{domain}/robots.txt (cached per domain per hour)
Parse rules for:
  User-agent: Googlebot
  User-agent: *

Check if the submitted URL path is disallowed.

Fail: URL path explicitly blocked in robots.txt
Pass: URL is allowed (or no robots.txt found)
```

### Check 4: Meta Robots & X-Robots-Tag
```
Parse HTML <head> for:
  <meta name="robots" content="noindex">
  <meta name="robots" content="noindex, nofollow">
  <meta name="googlebot" content="noindex">

Parse HTTP response headers for:
  X-Robots-Tag: noindex
  X-Robots-Tag: none

Fail: Any noindex directive found
Pass: No noindex found
```

### Check 5: Canonical Tag Check
```
Parse HTML <head> for:
  <link rel="canonical" href="...">

If canonical found:
  - Compare canonical URL to submitted URL
  - Normalize both (lowercase, trailing slash, etc.)

Pass: canonical matches submitted URL
Pass: No canonical tag found
Warn: canonical points to different URL (page defers to another URL)
Fail: canonical points to completely different domain
```

### Check 6: Redirect Chain Analysis
```
Follow all redirects and record:
  - Each hop URL
  - Each hop HTTP status
  - Total redirect count

Fail: More than 3 redirect hops (chain too long)
Warn: 1-3 redirects (submitted URL redirects)
Pass: No redirects

If redirect detected:
  - Show user the final destination URL
  - Offer to submit final URL instead
```

### Check 7: Page Content Validation
```
Check response body:
  - Is body non-empty?
  - Is content-type text/html?
  - Is page size > 0 bytes and < 15MB?
  - Does body contain <html> tag?

Fail: Empty body (blank page)
Fail: Non-HTML content-type (PDF, image submitted as URL)
Warn: Page very small < 500 bytes (likely empty/placeholder)
```

### Check Result Object
```json
{
  "url": "https://example.com/page",
  "is_indexable": true,
  "overall_status": "pass",
  "checks": {
    "http_status": { "status": "pass", "value": 200, "message": "Page is reachable" },
    "ssl": { "status": "pass", "value": true, "expiry_days": 180 },
    "robots_txt": { "status": "pass", "value": false, "message": "Not blocked" },
    "noindex": { "status": "pass", "value": false },
    "canonical": { "status": "warn", "value": "https://example.com/page/", "message": "Canonical has trailing slash difference" },
    "redirect": { "status": "pass", "value": false, "hops": [] },
    "content": { "status": "pass", "size_kb": 45, "has_html": true }
  },
  "fail_reasons": [],
  "warnings": ["Canonical URL has minor trailing slash difference"],
  "checked_at": "2024-01-15T10:30:00Z",
  "response_time_ms": 342
}
```

### UI Behavior
- Run health check immediately when user enters/pastes URLs
- Show results in a table: URL | HTTP | SSL | Robots | Noindex | Canonical | Verdict
- Color coded: ✅ Pass / ⚠️ Warn / ❌ Fail
- On FAIL: block submission for that URL, explain the issue
- On WARN: allow submission, show warning
- "Submit only valid URLs" button when batch has mix of pass/fail
- Cache health check result for 60 minutes (don't re-check same URL repeatedly)

---

## 8. MODULE 2 — SECURITY & FILTERING LAYER

### 8.1 Authentication Guards
```
All URL submission endpoints require:
  - Valid JWT token (dashboard users)
  - OR valid API key in X-API-KEY header (API users)

Reject with 401 if neither present.
```

### 8.2 Rate Limiting (per endpoint)
```
POST /api/urls/submit:
  - 60 URLs / minute / user
  - 500 URLs / hour / user
  - 2000 URLs / day / user

POST /api/auth/login:
  - 5 attempts / 15 minutes / IP

POST /api/urls/check (manual verify):
  - 1 request / URL / hour / user

Public API (X-API-KEY):
  - 100 requests / minute / key
  - 5000 requests / day / key

All admin endpoints:
  - 120 requests / minute / admin
```

### 8.3 URL Format Validation
```
Reject if:
  - Not a valid URL format (RFC 3986)
  - Protocol is not http:// or https://
  - URL is localhost, 127.0.0.1, or any RFC 1918 private IP
    (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
  - URL is an internal/special address (.local, .internal, .test)
  - URL length > 2048 characters
  - URL contains null bytes or control characters
  - Domain has no TLD (e.g. http://example)
```

### 8.4 Malware & Phishing Check
```
Integration: Google Safe Browsing API v4 (FREE)
Endpoint: POST https://safebrowsing.googleapis.com/v4/threatMatches:find

Threat types checked:
  - MALWARE
  - SOCIAL_ENGINEERING (phishing)
  - UNWANTED_SOFTWARE
  - POTENTIALLY_HARMFUL_APPLICATION

If threat detected:
  - Reject URL
  - Log blocked attempt (url, user_id, threat_type, timestamp)
  - Notify admin (if repeated offender)
  - Return 422 with message: "URL flagged as potentially harmful"

Cache Safe Browsing results in Redis: 4 hours TTL
(Safe Browsing results are cached by Google for 5 hours anyway)
```

### 8.5 Spam & Abuse Detection
```
Reject if:
  - Same URL submitted by same user more than 3 times in 24 hours
  - More than 500 URLs in a single batch request
  - URL domain is in system-level blacklist (admin-managed)
  - User account is banned (is_active = false)
  - User has 0 credits (before health check even runs)

Soft block (warn, allow admin override):
  - Same domain submitted more than 50 times in 1 hour by same user
  - More than 1000 URLs from same user in 24 hours
```

### 8.6 Duplicate Detection
```
Before adding to queue:
  - Hash the URL: SHA-256(normalized_url)
  - normalized_url = lowercase, strip trailing slash, decode %encoding
  - Check url_hash in urls table WHERE user_id = ? AND status NOT IN ('not_indexed', 'refunded')
  - If duplicate found: skip, show user "already submitted"

This prevents users from accidentally re-submitting same URL.
```

---

## 9. MODULE 3 — INDEXING SIGNAL ENGINE

### Overview
All 6 signals fire in parallel via BullMQ. Each signal is an independent job. Failure of one does not block others. Each attempt is fully logged.

### Signal 1: Google Indexing API
**What it does:** Directly tells Google "this URL has been updated, please crawl it"

**Setup required:**
1. Create Google Cloud project
2. Enable Google Indexing API
3. Create Service Account, download JSON key
4. Add service account as **Owner** in Google Search Console for your domain

**API Call:**
```http
POST https://indexing.googleapis.com/v3/urlNotifications:publish
Authorization: Bearer {oauth2_token_from_service_account}
Content-Type: application/json

{
  "url": "https://example.com/page",
  "type": "URL_UPDATED"
}
```

**Response handling:**
```
200 OK → success, log it
429 Too Many Requests → back off, retry in 60s
403 Forbidden → service account not authorized for this domain
400 Bad Request → URL format issue
```

**Important note:** Google Indexing API officially supports Job Postings and Live Stream pages. For other content, the tool uses its own domain-level GSC access. Users do NOT need to give us their GSC access.

### Signal 2: Google Search Console URL Inspection API
**What it does:** Requests Google to fetch and render the URL (same as clicking "Request Indexing" in GSC)

```http
POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
Authorization: Bearer {oauth2_token}
Content-Type: application/json

{
  "inspectionUrl": "https://example.com/page",
  "siteUrl": "https://example.com/"
}
```

**Note:** This requires the property `https://example.com/` to be verified in our GSC. This is the tool's own GSC account, not the user's.

### Signal 3: Sitemap Ping
Covered in Module 4. Fires after URL is added to dynamic sitemap.

### Signal 4: RSS + WebSub Ping
Covered in Module 5. Fires after URL is published to RSS feed.

### Signal 5: IndexNow
Covered in Module 7. Notifies Bing and other engines.

### Signal 6: Crawl Trigger
Covered in Module 6.

### Signal Logging
Every signal attempt saved in `indexing_signals` table:
```json
{
  "url_id": "uuid",
  "signal_type": "google_indexing_api",
  "status": "success",
  "http_response_code": 200,
  "response_summary": "urlNotificationMetadata published",
  "duration_ms": 312,
  "attempted_at": "2024-01-15T10:35:00Z",
  "is_retry": false
}
```

---

## 10. MODULE 4 — SITEMAP ENGINE

### How It Works
Every submitted URL is added to a dynamic XML sitemap hosted on our server. Google crawls sitemaps frequently and discovers new URLs this way.

### User Sitemap URL
```
https://yourdomain.com/sitemaps/{user_id}/sitemap.xml
```

### Sitemap Format
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

### Auto-Ping After Update
Immediately after adding URL to sitemap:
```
Google ping:
GET https://www.google.com/ping?sitemap=https://yourdomain.com/sitemaps/{user_id}/sitemap.xml

Bing ping:
GET https://www.bing.com/ping?sitemap=https://yourdomain.com/sitemaps/{user_id}/sitemap.xml
```

### Sitemap Splitting
- If user has > 1,000 URLs → split into multiple sitemaps of 1,000 each
- Create sitemap index:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://yourdomain.com/sitemaps/{user_id}/sitemap-1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://yourdomain.com/sitemaps/{user_id}/sitemap-2.xml</loc>
  </sitemap>
</sitemapindex>
```

### Important Developer Note
The sitemap is served dynamically from PostgreSQL — NOT static files. The route handler queries the DB and renders XML on the fly. This ensures it's always up to date without file management.

---

## 11. MODULE 5 — RSS FEED NETWORK

### Purpose
RSS feeds are one of the oldest and most reliable content discovery mechanisms. Google's crawlers and WebSub hubs actively monitor RSS feeds for new content.

### Feed URLs
```
Per-user feed:
  https://yourdomain.com/feeds/{user_id}/feed.xml

Per-project feed:
  https://yourdomain.com/feeds/{user_id}/projects/{project_id}/feed.xml

Per-campaign feed:
  https://yourdomain.com/feeds/{user_id}/campaigns/{campaign_id}/feed.xml

Global "fresh pages" feed (last 100 submissions, all users):
  https://yourdomain.com/feeds/global/recent.xml
```

### RSS Feed Format
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Fresh Indexed Pages</title>
    <link>https://yourdomain.com</link>
    <description>Recently submitted pages for Google indexing</description>
    <lastBuildDate>{RFC 2822 date}</lastBuildDate>
    <atom:link href="https://yourdomain.com/feeds/{user_id}/feed.xml"
               rel="self" type="application/rss+xml"/>
    <atom:link href="https://pubsubhubbub.appspot.com/"
               rel="hub"/>
    <item>
      <title>{page title fetched from URL}</title>
      <link>{submitted URL}</link>
      <guid isPermaLink="true">{submitted URL}</guid>
      <pubDate>{RFC 2822 date of submission}</pubDate>
      <description>{meta description fetched from URL}</description>
    </item>
  </channel>
</rss>
```

### Page Title & Description Fetching
When URL is submitted, fetch its `<title>` and `<meta name="description">` to populate RSS item. This makes the RSS feed meaningful to crawlers, not just a list of URLs.

### WebSub (PubSubHubbub) Hub Pinging
After adding URL to RSS feed, ping WebSub hubs to notify them of updated content:

```http
POST https://pubsubhubbub.appspot.com/
Content-Type: application/x-www-form-urlencoded

hub.mode=publish&hub.url=https://yourdomain.com/feeds/{user_id}/feed.xml
```

Hubs to ping:
- `https://pubsubhubbub.appspot.com/`
- `https://hub.w3.org/`
- `https://pubsubhubbub.superfeedr.com/`

### Important Developer Note
RSS feeds served dynamically from DB — not static files. Route handler queries `rss_entries` and renders XML. Keep feed to last 50 items per feed to keep size manageable.

---

## 12. MODULE 6 — CRAWL TRIGGER SYSTEM

### Purpose
Maintain public pages on the tool's domain that Google crawls frequently. When a new URL is added to these pages, Google discovers and follows the link to the submitted URL.

### Developer Note
This works because Google trusts frequently-updated pages and follows their outbound links quickly. This is a legitimate SEO signal — not a hack.

### Discovery Pages (Public, No Login Required)

#### Page 1: Global Recent Submissions
```
URL: https://yourdomain.com/discover/recent
Content: Last 100 submitted URLs (all users, just URLs — no user info shown)
Updates: On every URL submission
Format: Clean HTML page with anchor links
Crawl target: Listed in our main sitemap with changefreq=hourly
```

#### Page 2: Fresh Today
```
URL: https://yourdomain.com/discover/fresh
Content: All URLs submitted in last 24 hours
Updates: Real-time
Crawl target: Listed in sitemap with changefreq=hourly
```

#### Page 3: Per-User Discovery Page
```
URL: https://yourdomain.com/discover/u/{user_id}
Content: User's last 50 submitted URLs
Updates: On every user submission
Note: Shows only URLs, no user identity
```

### Crawl Trigger Implementation
```javascript
// When a URL is submitted:
// 1. Add URL to discover/recent page (DB query, served dynamically)
// 2. Add URL to discover/fresh page
// 3. Add URL to user's discovery page
// 4. Update sitemap to include discovery pages with new lastmod timestamp
// 5. Ping Google sitemap to signal content change
```

### Main Sitemap of the Tool (not user sitemaps)
```xml
<!-- https://yourdomain.com/sitemap.xml -->
<url>
  <loc>https://yourdomain.com/discover/recent</loc>
  <changefreq>hourly</changefreq>
  <priority>0.9</priority>
</url>
<url>
  <loc>https://yourdomain.com/discover/fresh</loc>
  <changefreq>hourly</changefreq>
  <priority>0.9</priority>
</url>
```

---

## 13. MODULE 7 — INDEXNOW INTEGRATION

### What Is IndexNow
An open protocol (supported by Bing, Yandex, Seznam, Naver) where you notify search engines of new/updated URLs instantly. One API call, multiple search engines notified.

### Setup (One-Time)
1. Generate a random key (UUID or random string)
2. Place a text file on the server:
   `https://yourdomain.com/{indexnow_key}.txt`
   File content = just the key string
3. Done — no account needed

### API Call (Per Submission)
```http
POST https://api.indexnow.org/indexnow
Content-Type: application/json; charset=utf-8

{
  "host": "yourdomain.com",
  "key": "{indexnow_key}",
  "keyLocation": "https://yourdomain.com/{indexnow_key}.txt",
  "urlList": [
    "https://example.com/page1",
    "https://example.com/page2"
  ]
}
```

**Response:**
```
200 OK → URLs accepted
202 Accepted → URLs received, will process
400 Bad Request → invalid URL format
422 Unprocessable → key not found / invalid
429 Too Many Requests → slow down
```

### Batching Strategy
- Collect all URLs from a submission batch
- Send in single IndexNow call (up to 10,000 URLs per call)
- Log each response in `indexing_signals` table

### Important Note
IndexNow does NOT work for Google. It's for Bing and partners only. Don't mislead users about this — clearly label it as "Bing & other search engines" in the UI.

---

## 14. MODULE 8 — VERIFICATION ENGINE

### Purpose
Reliably determine whether a submitted URL has been indexed by Google. This is harder than it sounds — verification must be accurate, not fast.

### Developer Warning
Do NOT use `site:` search queries via a scraper/browser automation. Google blocks scrapers and this will get your IPs banned. Use only official APIs.

### Verification Methods

#### Method A: Google Custom Search API (Primary)
```http
GET https://www.googleapis.com/customsearch/v1
  ?key={GOOGLE_CSE_API_KEY}
  &cx={SEARCH_ENGINE_ID}
  &q=site:{submitted_url}
  &num=1

If response.searchInformation.totalResults > 0 → indexed
If response.searchInformation.totalResults = 0 → not indexed
```

Setup: Create a Custom Search Engine at cse.google.com, set to search the entire web.

**Rate limit:** 100 free queries/day. For higher volume: use isindexed.com as primary.

#### Method B: isindexed.com API (High Volume)
```http
GET https://api.isindexed.com/v1/check
  ?url={submitted_url}
  &apikey={ISINDEXED_API_KEY}

Response: { "indexed": true/false, "timestamp": "..." }
```

### Verification Strategy
```
Low volume (< 100 URLs/day total):
  → Use Google CSE API (free)

High volume (> 100 URLs/day):
  → Use isindexed.com API as primary
  → Use Google CSE as spot-check / confirmation

For any URL showing "indexed" for first time:
  → Run a SECOND verification 1 hour later to confirm
  → Only mark as indexed after 2 consecutive positive results
  (Prevents false positives from Google's inconsistent results)
```

### Verification Schedule
```
Day 1: Check 24h after submission
Day 2: Check again
Day 3: Check again
Day 4: Check again
Day 5: Check again
Day 6: Check again
Day 7: Check + trigger retry if not indexed
Day 8: Check again (post-retry)
Day 9: Check again
Day 10: Final check → auto-refund if still not indexed
```

### Caching
- Cache verification results in Redis with 20-hour TTL
- Never check same URL twice within 20 hours (avoid API waste)
- Manual "Check Now" bypasses cache once per hour per URL

---

## 15. MODULE 9 — RETRY & RECOVERY SYSTEM

### 7-Day Auto Retry

**Trigger:** URL is still `submitted` (not indexed) at day 7

**Smart Retry Process (not blind re-submission):**

```
Step 1: Re-run URL Health Check
  → Has the URL changed? New issues?
  → If new health issues found:
      - Update health check record
      - Notify user: "Your URL now has issues that prevent indexing: [reasons]"
      - Do NOT re-fire signals (they would fail anyway)
      - Wait for user to fix issues, offer manual re-submit

Step 2: If health check still passes:
  → Re-fire ALL 6 indexing signals (mark is_retry = true in logs)
  → Update url.retry_count = retry_count + 1
  → Update url.retry_fired_at = NOW()
  → Update url.status = 'submitted' (reset check cycle)
  → Send notification: "We re-submitted your URL for indexing after 7 days"

Step 3: Continue daily verification for days 8-10
```

### 10-Day Auto Refund

**Trigger:** URL still `submitted` or `retry_queued` at day 10

```
Step 1: Final verification check
  → If somehow indexed now → mark indexed, no refund needed

Step 2: If still not indexed:
  → Add +1 credit to user balance (atomic transaction)
  → Insert credit_transaction (type: auto_refund)
  → Update url.status = 'not_indexed'
  → Set url.credit_refunded = true
  → Set url.refunded_at = NOW()
  → Send email + in-app notification

Step 3: Store full diagnostic data:
  → All signals fired + their results
  → All verification checks + their results
  → Health check at retry time
  → This data helps user understand why URL wasn't indexed
```

### Manual Re-submit (User-Initiated)
- User can manually re-submit any URL at any time
- Costs 1 additional credit
- Runs full flow again (security → health → signals)
- Previous attempt data kept for reference

---

## 16. MODULE 10 — CREDIT SYSTEM

### Rules
| Event | Credit Change |
|---|---|
| URL fails security filter | No charge |
| URL fails health check | No charge |
| URL is already indexed | No charge |
| URL is duplicate (already submitted) | No charge |
| URL successfully queued for indexing | -1 credit |
| URL not indexed after 10 days | +1 credit (auto-refund) |
| User manually re-submits URL | -1 credit |
| Admin grants credits | +N credits |
| Admin deducts credits | -N credits |

### Credit Guard (Before Submission)
```javascript
// Before deducting any credit:
const validUrls = urls.filter(url => url.health.is_indexable && !url.already_indexed);
const creditCost = validUrls.length;

if (user.credits_balance < creditCost) {
  throw new Error(`Insufficient credits. Need ${creditCost}, have ${user.credits_balance}`);
}

// Deduct atomically using DB transaction:
await prisma.$transaction([
  prisma.users.update({ where: { id: userId }, data: { credits_balance: { decrement: creditCost } } }),
  prisma.credit_transactions.createMany({ data: transactionRecords })
]);
```

### Balance Display Rules
- Show in header always: "Credits: 45"
- Green: > 20 | Yellow: 5–20 | Red: < 5
- Red badge + alert banner when < 5
- Email alert when drops below user's threshold

### Admin Credit Management
- Admin can grant or deduct any amount
- Must enter a reason (required field)
- All actions logged with `performed_by` admin ID
- User gets email + in-app notification on credit change

---

## 17. MODULE 11 — JOB QUEUE & BACKGROUND PROCESSING

### Queue Structure
```javascript
// health-check-queue
// Priority: HIGH | Concurrency: 20
// Each job: { urlId, url, userId }
// Timeout: 15 seconds per job

// indexing-signal-queue
// Priority: HIGH | Concurrency: 10
// Each job: { urlId, signalType, url, isRetry }
// Timeout: 30 seconds per job
// Max retries: 3 (with exponential backoff: 30s, 2m, 10m)

// verification-queue
// Priority: NORMAL | Concurrency: 50
// Repeatable: every 24 hours
// Each job: { urlId, url, checkCount, submittedAt }

// retry-queue
// Priority: NORMAL | Concurrency: 5
// Runs: every 24 hours
// Finds URLs at day 7 and triggers retry

// refund-queue
// Priority: NORMAL | Concurrency: 5
// Runs: every 24 hours
// Finds URLs at day 10 and processes refund
```

### Job Failure Handling
```
On job failure:
  1. Log error with full stack trace
  2. Increment retry count
  3. If max retries reached:
     - Mark signal as 'failed' in indexing_signals
     - Do NOT refund credit (failure of one signal ≠ complete failure)
     - Alert admin via Sentry if systematic failure
  4. Continue with other signals (parallel, independent)
```

### Queue Dashboard (Admin)
- Admin panel shows live queue stats:
  - Jobs waiting / active / completed / failed per queue
  - Failed job details + error messages
  - Ability to retry failed jobs manually
  - Clear stuck jobs

---

## 18. FRONTEND — DASHBOARD

### 18.1 Landing Page (/)
**Keep it simple and honest:**
- Hero: "Submit URLs. Get Indexed Faster."
- How it works (4 steps): Submit → Health Check → Signals → Monitor
- Key features: Health check, 6 signals, daily verify, smart retry, auto-refund
- Stats counter: Total URLs indexed through the tool
- CTA: "Get Started" → Register

### 18.2 Auth Pages
- `/register` — username, email, password, confirm password, terms checkbox
- `/login` — email/username + password
- `/forgot-password` — email input
- `/reset-password/:token` — new password + confirm

### 18.3 Dashboard Home (`/dashboard`)

**Header bar:**
- Credit balance (color-coded)
- Notification bell (unread count)
- User menu (account, logout)

**Stats row (5 cards):**
- Total Credits
- Total URLs Submitted
- Indexed ✅
- Pending ⏳
- Refunded 🔄

**Quick Submit:**
- Paste URLs textarea (one per line)
- Project selector
- Campaign selector (optional)
- "Check & Submit" button
- Shows credit cost preview before submit

**Indexing Success Chart:**
- Bar chart: indexed vs submitted per day
- Toggle: 7d / 30d / 90d

**Recent Activity:**
- Last 10 URL status changes with timestamps and status badges

### 18.4 Projects Page (`/dashboard/projects`)
- Create / list / edit / delete projects
- Each project card: name, URL count, indexed/total progress bar, date

### 18.5 Campaigns Page (`/dashboard/campaigns`)
- Create / list / edit / delete campaigns
- Associate campaigns with projects
- Campaign card: name, project, URL count, indexed count, status badge

### 18.6 Project Detail (`/dashboard/projects/:id`)
**URL Table columns:**
- URL (truncated, full on hover)
- Health badge (pass/warn/fail)
- Status badge (queued/submitted/indexed/failed/refunded)
- Signals (6 small icons showing each signal status)
- Submitted date
- Indexed date (or —)
- Retries
- Actions: View Details / Re-submit / Delete

**Filters:** All / Submitted / Indexed / Health Failed / Not Indexed / Refunded
**Bulk actions:** Delete / Re-submit selected
**Export:** CSV button

### 18.7 URL Detail Drawer / Page
When user clicks on a URL, open a side drawer showing:

**Section 1: Health Check**
```
✅ HTTP 200 — Page reachable (342ms)
✅ SSL Valid — 180 days remaining
✅ Robots.txt — Not blocked
✅ No Noindex — Indexing allowed
⚠️ Canonical — Points to https://example.com/page/ (trailing slash)
✅ No Redirect Chain
✅ Content — 45KB, valid HTML
```

**Section 2: Indexing Signals**
```
Signal               Status    Time    Response
─────────────────────────────────────────────
Google Indexing API  ✅        312ms   200 OK
GSC URL Inspect      ✅        890ms   200 OK
Sitemap Ping         ✅        124ms   200 OK
RSS + WebSub         ✅         98ms   Published
IndexNow (Bing)      ✅        201ms   202 Accepted
Crawl Trigger        ✅         12ms   Updated
```

**Section 3: Verification History**
Table of every daily check: Date | Method | Result

**Section 4: Timeline**
Visual timeline: Submitted → Signals Fired → Day 1 Check → ... → Indexed/Refunded

### 18.8 Submit URLs Flow
```
Step 1: Choose input method
  - Paste manually (textarea)
  - CSV file upload
  - Sitemap URL import
  - Sitemap file upload

Step 2: Health check runs automatically
  - Table shows each URL + health results
  - Failed URLs highlighted
  - Option: "Remove failed URLs" / "Submit valid only"

Step 3: Review & assign
  - Select project
  - Select campaign (optional)
  - Credit cost shown: "18 valid URLs = 18 credits (3 failed, not charged)"

Step 4: Confirm & Submit
```

### 18.9 Credits Page (`/dashboard/credits`)
- Large credit balance display
- Transaction table: Date | Type | Amount | Balance After | Description
- Filter by type
- Info: "Credits are assigned by the administrator."

### 18.10 Account Settings (`/dashboard/account`)
- **Profile tab:** username, email, timezone
- **Password tab:** change password
- **Notifications tab:** email toggles per event type, low-credit threshold
- **API Keys tab:** list keys, generate, revoke, copy key (shown only once)

### 18.11 API Docs Page (`/dashboard/api-docs`)
- Introduction
- Authentication
- All endpoint references with examples
- Code tabs: curl / Node.js / PHP / Python
- Rate limits

---

## 19. PUBLIC REST API

### Authentication
All public API requests must include:
```http
X-API-KEY: {user_api_key}
```

### Endpoints

#### Submit URLs
```http
POST /api/v1/submit
Content-Type: application/json
X-API-KEY: {key}

{
  "urls": ["https://example.com/page1", "https://example.com/page2"],
  "project_id": "uuid",          // optional
  "campaign_id": "uuid",         // optional
  "skip_health_check": false     // optional, default false
}

Response 200:
{
  "submitted": 2,
  "queued": 1,
  "already_indexed": 1,
  "health_failed": 0,
  "credits_used": 1,
  "credits_remaining": 44,
  "urls": [
    {
      "url": "https://example.com/page1",
      "id": "uuid",
      "status": "submitted",
      "health": { "is_indexable": true }
    }
  ]
}
```

#### Health Check Only (No Submission)
```http
POST /api/v1/health-check
{
  "urls": ["https://example.com/page"]
}
```

#### Get URL Status
```http
GET /api/v1/urls/{url_id}

Response:
{
  "id": "uuid",
  "url": "https://example.com/page",
  "status": "indexed",
  "indexed_at": "2024-01-17T09:00:00Z",
  "signals": [...],
  "checks": [...]
}
```

#### Get Credit Balance
```http
GET /api/v1/balance

Response: { "credits": 44 }
```

#### List Projects
```http
GET /api/v1/projects
```

#### Bulk Status Check
```http
POST /api/v1/urls/status
{
  "url_ids": ["uuid1", "uuid2", "uuid3"]
}
```

---

## 20. WORDPRESS PLUGIN

### Features
- Auto-submit published posts/pages to the indexing tool
- Auto-submit on post update (optional toggle)
- Manual "Submit for Indexing" button in post editor meta box
- Dashboard widget: credit balance + recent indexing stats
- Health check warning in editor if URL has issues

### Settings Page (WP Admin → Settings → Indexing Tool)
- API Key field (with "Test Connection" button)
- Auto-submit on publish: ON/OFF
- Auto-submit on update: ON/OFF
- Post types: checkboxes (post, page, custom types)
- Show meta box in editor: ON/OFF

### Technical
- WordPress hooks: `publish_post`, `post_updated`, `transition_post_status`
- Calls: `POST /api/v1/submit` with `X-API-KEY` header
- Shows health check result in editor if URL has warnings/failures
- Error handling: if API call fails, log to WP debug log, retry once

---

## 21. NOTIFICATION SYSTEM

### Email Notifications (via Resend)

| Event | Subject | When |
|---|---|---|
| Welcome | Welcome to {tool name} | On registration |
| Email verify | Verify your email | On registration |
| Password reset | Reset your password | On request |
| URL indexed | ✅ Your URL is now indexed | When verified indexed |
| Health check failed | ⚠️ URL cannot be indexed | When health check fails |
| 7-day retry | 🔄 We re-submitted your URL | When retry fires |
| Auto-refund | 💳 Credit refunded | After 10-day refund |
| Low credits | ⚠️ Low credit balance | When below threshold |
| Credits granted | 💳 Credits added | When admin grants |

### In-App Notifications
- Bell icon in header with red badge (unread count)
- Dropdown: last 10 notifications (with type icons)
- Mark all as read button
- Click notification → navigate to relevant URL

### User Preferences
- Toggle each email type ON/OFF per user
- Set low-credit threshold (default: 5)
- Accessible from Account Settings → Notifications tab

---

## 22. ADMIN PANEL

### 22.1 Dashboard
- Total users (chart: daily/monthly)
- Total URLs submitted today / this week / this month
- Indexed vs not indexed (pie chart)
- Signals breakdown (bar chart: which signal has highest success rate)
- Auto-refund rate %
- Average time-to-index (hours) — across all users
- Queue health: jobs waiting / active / failed per queue

### 22.2 Users Management
- Full user list: searchable, sortable, filterable
- User detail: profile, credit history, all projects, all URLs
- Grant/deduct credits form (amount + required reason)
- Ban/unban user
- Reset user's API key

### 22.3 URL Management
- Global URL list with filters
- Force reindex any URL (admin privilege)
- View full health check + signal logs for any URL
- Manually trigger verification check

### 22.4 Job Queue Monitor
- Live view of all BullMQ queues
- Jobs: waiting / active / completed / failed counts
- Failed job details: error message, URL, signal type, retry count
- Retry failed job button
- Clear dead-letter jobs

### 22.5 System Settings
| Setting | Default | Description |
|---|---|---|
| refund_window_days | 10 | Days before auto-refund |
| retry_window_days | 7 | Days before auto-retry |
| low_credit_default | 5 | Default low-credit alert threshold |
| max_urls_per_batch | 500 | Max URLs per submission |
| health_check_timeout_ms | 10000 | Health check timeout |
| malware_check_enabled | true | Toggle Safe Browsing check |
| verification_method | isindexed | `google_cse` or `isindexed` |
| indexnow_enabled | true | Toggle IndexNow signal |
| double_verify_indexed | true | Confirm indexed with 2 checks |

### 22.6 Blocked Domains List
- Admin can add domains to blocklist
- Any URL from blocked domain rejected at submission
- Useful for blocking known spam/abuse sources

---

## 23. SECURITY REQUIREMENTS

- **Passwords:** bcrypt, cost factor 12
- **JWT:** HS256, access token 15 min, refresh token 30 days, httpOnly cookie
- **CSRF:** CSRF token for all state-changing web form submissions
- **API Keys:** Stored as SHA-256 hash, prefix stored for UI display, shown plaintext only once
- **HTTPS:** Enforced at reverse proxy level, HTTP → 301 → HTTPS
- **Headers:** `Helmet.js` for security headers (HSTS, X-Frame-Options, CSP, etc.)
- **SQL:** Prisma ORM only — zero raw SQL with user input
- **XSS:** All user content escaped on output; CSP headers set
- **Input size limits:** Max request body 5MB, max URL list 500 items
- **Admin routes:** `role = 'admin'` check on every admin middleware layer
- **GDPR:** User data export endpoint
- **Audit log:** All admin credit actions logged with admin user ID + timestamp + reason

---

## 24. PERFORMANCE & RELIABILITY

### Response Time Targets
| Endpoint | Target |
|---|---|
| URL submission (API response) | < 500ms (async processing) |
| Health check per URL | < 10s |
| Dashboard page load | < 1.5s |
| Landing page LCP | < 2s |
| Sitemap XML generation | < 300ms |
| RSS feed generation | < 300ms |

### Database Indexes Required
```sql
-- Fast URL lookup and dedup
CREATE INDEX idx_urls_url_hash ON urls(url_hash, user_id);
CREATE INDEX idx_urls_status ON urls(status);
CREATE INDEX idx_urls_submitted_at ON urls(submitted_at);
CREATE INDEX idx_urls_user_id ON urls(user_id);

-- Fast signal lookup
CREATE INDEX idx_signals_url_id ON indexing_signals(url_id);

-- Fast verification lookup
CREATE INDEX idx_verifications_url_id ON verification_checks(url_id);

-- Fast notification lookup
CREATE INDEX idx_notifications_user_id ON notifications(user_id, is_read);
```

### Caching Strategy (Redis)
| Data | TTL | Key Pattern |
|---|---|---|
| Health check result | 60 min | `health:{url_hash}` |
| Verification result | 20 hours | `verify:{url_hash}` |
| Safe Browsing result | 4 hours | `safebrowsing:{url_hash}` |
| robots.txt per domain | 1 hour | `robots:{domain}` |
| User credit balance | 30 sec | `credits:{user_id}` |
| Sitemap XML | 5 min | `sitemap:{user_id}` |
| RSS feed XML | 5 min | `rss:{user_id}` |

---

## 25. OBSERVABILITY & MONITORING

### Application Logging
- Structured JSON logs (Pino logger)
- Log levels: error, warn, info, debug
- Every API request logged: method, path, status, duration, user_id
- Every background job logged: queue, job type, duration, result
- Every external API call logged: service, url, status, duration

### Error Tracking
- Sentry (free tier) for exception monitoring
- Alert on: any unhandled exception, job failure rate > 10%

### Uptime Monitoring
- UptimeRobot (free) for public endpoint monitoring
- Monitor: main app, API health endpoint, sitemap endpoint, RSS endpoint

### Admin Observability
- Queue monitor in admin panel (live BullMQ stats)
- Failed jobs visible with full error details
- Signal success rate per type (tells admin if one signal method is broken)


### Health Endpoint (Public)
```http
GET /health

Response:
{
  "status": "ok",
  "db": "connected",
  "redis": "connected",
  "queues": {
    "health-check": { "waiting": 0, "active": 2 },
    "indexing-signal": { "waiting": 12, "active": 10 }
  },
  "timestamp": "2024-01-15T10:00:00Z"
}
```

---

## 26. ACCEPTANCE CRITERIA

### Backend Engine ✅
- [ ] Security filter rejects malformed URLs, private IPs, malware URLs
- [ ] Rate limiting blocks excessive requests correctly
- [ ] Health check correctly identifies HTTP errors, noindex, robots block, canonical mismatch, SSL issues, redirect chains
- [ ] Health check does NOT charge credits on failure
- [ ] Already-indexed URLs detected before charging credits
- [ ] All 6 indexing signals fire in parallel within 5 minutes
- [ ] Each signal independently logged with status, response, duration
- [ ] Dynamic sitemap generates valid XML and pings Google/Bing
- [ ] RSS feed generates valid RSS 2.0 with correct WebSub ping
- [ ] IndexNow API call succeeds and notifies Bing
- [ ] Crawl trigger pages update on each submission
- [ ] Daily verification cron runs every 24 hours
- [ ] Double-verification before marking URL as indexed (2 consecutive positives)
- [ ] 7-day retry re-runs health check before re-firing signals
- [ ] If health issues found at retry, user notified instead of blind re-fire
- [ ] 10-day auto-refund processes correctly with atomic credit transaction
- [ ] All queue jobs have retry logic with exponential backoff
- [ ] Failed jobs appear in admin queue monitor

### Frontend Dashboard ✅
- [ ] Health check results shown before submission confirmation
- [ ] Failed URLs not included in credit cost calculation
- [ ] URL table shows all 6 signal statuses with icons
- [ ] URL detail drawer shows full health check, signals, and verification history
- [ ] Projects and Campaigns CRUD works correctly
- [ ] CSV and sitemap import work for bulk submission
- [ ] Credit transaction history is accurate
- [ ] Admin can grant/deduct credits with reason
- [ ] Admin queue monitor shows live job stats
- [ ] All admin settings are editable and reflected in system behavior

### Public API ✅
- [ ] API key auth works for all v1 endpoints
- [ ] Submit endpoint returns accurate result breakdown
- [ ] Health-check-only endpoint works without credit deduction
- [ ] Rate limiting enforced per API key

### WordPress Plugin ✅
- [ ] Auto-submit fires on post publish
- [ ] Auto-submit fires on post update (if enabled)
- [ ] Health check warning shown in editor for problematic URLs
- [ ] Settings save and persist correctly

---

## 27. PROJECT FOLDER STRUCTURE

```
/
├── apps/
│   ├── web/                              # Next.js 14 Frontend
│   │   ├── app/
│   │   │   ├── (marketing)/              # Public pages (landing, etc.)
│   │   │   │   └── page.tsx
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   └── forgot-password/page.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx              # Dashboard home
│   │   │   │   ├── projects/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/page.tsx
│   │   │   │   ├── campaigns/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/page.tsx
│   │   │   │   ├── credits/page.tsx
│   │   │   │   ├── account/page.tsx
│   │   │   │   └── api-docs/page.tsx
│   │   │   └── admin/
│   │   │       ├── page.tsx
│   │   │       ├── users/[id]/page.tsx
│   │   │       ├── urls/page.tsx
│   │   │       ├── queues/page.tsx
│   │   │       └── settings/page.tsx
│   │   └── components/
│   │       ├── ui/                       # shadcn/ui primitives
│   │       ├── health/
│   │       │   ├── HealthBadge.tsx
│   │       │   └── HealthCheckTable.tsx
│   │       ├── signals/
│   │       │   ├── SignalStatusIcons.tsx
│   │       │   └── SignalLogTable.tsx
│   │       ├── urls/
│   │       │   ├── UrlTable.tsx
│   │       │   ├── UrlDetailDrawer.tsx
│   │       │   └── SubmitUrlFlow.tsx
│   │       └── dashboard/
│   │           ├── StatsCards.tsx
│   │           └── IndexingChart.tsx
│   │
│   └── api/                              # Fastify Backend
│       └── src/
│           ├── routes/
│           │   ├── auth/
│           │   ├── projects/
│           │   ├── campaigns/
│           │   ├── urls/
│           │   ├── credits/
│           │   ├── user/
│           │   ├── admin/
│           │   ├── public/               # Sitemap, RSS, Discover pages
│           │   │   ├── sitemaps.ts
│           │   │   ├── feeds.ts
│           │   │   └── discover.ts
│           │   └── v1/                   # Public API
│           ├── modules/
│           │   ├── health-checker/
│           │   │   ├── httpCheck.ts
│           │   │   ├── sslCheck.ts
│           │   │   ├── robotsCheck.ts
│           │   │   ├── noindexCheck.ts
│           │   │   ├── canonicalCheck.ts
│           │   │   ├── redirectCheck.ts
│           │   │   └── contentCheck.ts
│           │   ├── security/
│           │   │   ├── malwareCheck.ts
│           │   │   ├── spamFilter.ts
│           │   │   └── rateLimit.ts
│           │   ├── signals/
│           │   │   ├── googleIndexingApi.ts
│           │   │   ├── gscUrlInspect.ts
│           │   │   ├── sitemapEngine.ts
│           │   │   ├── rssFeedPublisher.ts
│           │   │   ├── indexNow.ts
│           │   │   └── crawlTrigger.ts
│           │   ├── verification/
│           │   │   ├── googleCse.ts
│           │   │   └── isIndexedApi.ts
│           │   ├── retry/
│           │   │   └── retryLogic.ts
│           │   └── credits/
│           │       └── creditService.ts
│           ├── workers/
│           │   ├── healthCheckWorker.ts
│           │   ├── indexingSignalWorker.ts
│           │   ├── verificationWorker.ts
│           │   ├── retryWorker.ts
│           │   └── refundWorker.ts
│           ├── queues/
│           │   └── index.ts              # BullMQ queue definitions
│           ├── middleware/
│           │   ├── authenticate.ts
│           │   ├── adminOnly.ts
│           │   ├── apiKeyAuth.ts
│           │   └── rateLimit.ts
│           └── utils/
│               ├── logger.ts
│               ├── urlNormalizer.ts
│               └── googleAuth.ts        # Service account OAuth
│
├── packages/
│   ├── database/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── wordpress-plugin/
│       ├── indexing-tool.php
│       ├── admin/settings-page.php
│       └── includes/api-client.php
│
├── docker-compose.yml                    # PostgreSQL + Redis
├── .env.example
└── README.md
```

---

## APPENDIX A: ENVIRONMENT VARIABLES

```env
# ── App ──────────────────────────────────────────────────────
NODE_ENV=production
APP_URL=https://yourdomain.com
API_URL=https://api.yourdomain.com
PORT=3001

# ── Database ─────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/indexing_tool

# ── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── JWT ──────────────────────────────────────────────────────
JWT_SECRET=minimum-32-character-random-secret-here
JWT_REFRESH_SECRET=different-minimum-32-character-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

# ── Email (Resend — FREE) ─────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Indexing Tool

# ── Google Service Account ────────────────────────────────────
# Paste full JSON key as single line (or use file path)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}

# ── Google APIs (FREE) ────────────────────────────────────────
GOOGLE_CUSTOM_SEARCH_API_KEY=AIzaSy...
GOOGLE_CUSTOM_SEARCH_CX=0123456789abcdef0
GOOGLE_SAFE_BROWSING_API_KEY=AIzaSy...

# ── isindexed.com ─────────────────────────────────────────────
ISINDEXED_API_KEY=your_key_here

# ── IndexNow (Bing — FREE) ────────────────────────────────────
INDEXNOW_KEY=your-random-uuid-key
INDEXNOW_KEY_URL=https://yourdomain.com/your-random-uuid-key.txt

# ── Sentry (FREE tier) ────────────────────────────────────────
SENTRY_DSN=https://xxx@oyyy.ingest.sentry.io/zzz

# ── System Config ─────────────────────────────────────────────
REFUND_WINDOW_DAYS=10
RETRY_WINDOW_DAYS=7
LOW_CREDIT_DEFAULT_THRESHOLD=5
MAX_URLS_PER_BATCH=500
HEALTH_CHECK_TIMEOUT_MS=10000
MALWARE_CHECK_ENABLED=true
DOUBLE_VERIFY_INDEXED=true
VERIFICATION_METHOD=isindexed
```

---

## APPENDIX B: ALL API ENDPOINTS

### Auth
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/verify-email/:token
```

### User
```
GET    /api/user/me
PUT    /api/user/profile
PUT    /api/user/password
GET    /api/user/notifications
PUT    /api/user/notifications/read-all
PUT    /api/user/notifications/:id/read
GET    /api/user/preferences
PUT    /api/user/preferences
GET    /api/user/api-keys
POST   /api/user/api-keys
DELETE /api/user/api-keys/:id
```

### Projects
```
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id
GET    /api/projects/:id/stats
```

### Campaigns
```
GET    /api/campaigns
POST   /api/campaigns
GET    /api/campaigns/:id
PUT    /api/campaigns/:id
DELETE /api/campaigns/:id
```

### URLs
```
POST   /api/urls/health-check             (check only, no submit)
POST   /api/urls/submit                   (paste / bulk)
POST   /api/urls/submit/csv              (CSV file upload)
POST   /api/urls/submit/sitemap          (sitemap URL or file)
GET    /api/urls                          (user's all URLs, filterable)
GET    /api/urls/:id
GET    /api/urls/:id/health
GET    /api/urls/:id/signals
GET    /api/urls/:id/verifications
POST   /api/urls/:id/resubmit
POST   /api/urls/:id/verify              (manual check now)
DELETE /api/urls/:id
GET    /api/urls/export                   (CSV download)
```

### Credits
```
GET    /api/credits/balance
GET    /api/credits/transactions
```

### Public (no login, crawlable)
```
GET    /sitemaps/:user_id/sitemap.xml
GET    /sitemaps/:user_id/sitemap-index.xml
GET    /feeds/:user_id/feed.xml
GET    /feeds/:user_id/projects/:project_id/feed.xml
GET    /feeds/:user_id/campaigns/:campaign_id/feed.xml
GET    /feeds/global/recent.xml
GET    /discover/recent
GET    /discover/fresh
GET    /discover/u/:user_id
GET    /health
```

### Public API (X-API-KEY auth)
```
POST   /api/v1/health-check
POST   /api/v1/submit
POST   /api/v1/urls/status               (bulk status)
GET    /api/v1/urls/:id
GET    /api/v1/balance
GET    /api/v1/projects
```

### Admin
```
GET    /api/admin/stats
GET    /api/admin/users
GET    /api/admin/users/:id
POST   /api/admin/users/:id/credits
PUT    /api/admin/users/:id/status
GET    /api/admin/urls
POST   /api/admin/urls/:id/reindex
POST   /api/admin/urls/:id/verify
GET    /api/admin/queues
POST   /api/admin/queues/:queue/retry/:job_id
GET    /api/admin/settings
PUT    /api/admin/settings
GET    /api/admin/blocklist
POST   /api/admin/blocklist
DELETE /api/admin/blocklist/:id
```

---

*End of Document — URL Indexing Tool Requirements v4.0*
*Developer Edition — Built for 100% working, original tool*
*No payment system — Admin credit assignment only*
