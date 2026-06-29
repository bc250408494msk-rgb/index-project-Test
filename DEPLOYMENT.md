# IndexMeNow — Deployment Record (plain English)

A running diary of how this app went from "works on my laptop" to "live on the
internet," what we changed, and what's left. Last updated: **2026-06-29**.

---

## The big picture (how it's hosted)

- **Your domain** `dashboard.primewellmedsolutions.com` lives in **Hostinger**, but
  Hostinger only does the **DNS** (the address book). It does NOT run the app.
- **Railway** runs everything: the **API** (backend), the **Web** (frontend),
  **PostgreSQL** (database), and **Redis** (cache/queues).
- The browser only ever talks to the **Web** service. The Web service quietly
  forwards `/api/*` calls to the **API** service behind the scenes (a "proxy").
  This is why there are no cross-site/cookie/CORS problems.

```
You / clients ─▶ dashboard.primewellmedsolutions.com (Web on Railway)
                        │  (forwards /api/* internally)
                        ▼
                 API on Railway ─▶ PostgreSQL + Redis
```

---

## What we did, step by step

### 1. Made the code production-ready ✅
- CORS now accepts your real domain (via `ALLOWED_ORIGINS`).
- Frontend calls the API through the same domain (the proxy), not a separate URL.
- Admin login is seeded from environment variables (`ADMIN_EMAIL`/`ADMIN_PASSWORD`).
- The API refuses to start if a required setting is missing (safety check).
- Added Railway config files and a production start command.
- Fixed a batch of TypeScript build errors (BullMQ/Redis types, etc.).

### 2. Deployed on Railway ✅
- Added PostgreSQL and Redis.
- Deployed the **API** service and the **Web** service from the same GitHub repo.
- Set the environment variables on each service.

### 3. Set up the database ✅
- Ran the migration (`prisma migrate deploy`) → created all the tables.
- Seeded the database → created your **admin account** + default settings.

### 4. Connected your domain ✅
- Added the domain in Railway, then added the **CNAME + TXT** records in Hostinger.
- SSL (the padlock / https) was issued automatically.
- Live at **https://dashboard.primewellmedsolutions.com**.

### 5. Tested + fixed real bugs we found ✅
- Submit was rejecting URLs → fixed the validation.
- Success message showed "undefined" → fixed the field names.
- You must **create a Project first**, then submit URLs (that's by design).
- Made email-verification a switch (`REQUIRE_EMAIL_VERIFICATION`) so logins aren't
  blocked before email is ready.

### 6. Full senior code review + improvements ✅
- Made the **sitemaps / RSS feeds public** so Google/Bing can actually read them.
- Fixed the sitemap signal (Google shut off its old "ping" in 2023).
- Added `.env.production.example` (the full list of settings, per service).
- Added a **"Verify now"** button and a built-in **Google diagnostic** tool.

### 7. Google verification + indexing setup ⏳ (waiting on Google)
- Google removed "search the entire web" for new Custom Search engines (Jan 2026),
  so we switched verification to the **Search Console API** (`VERIFICATION_METHOD=gsc`).
  This reuses the SAME Google service account as the indexing signals — one setup,
  two jobs.
- Created a Google Cloud **service account**, enabled the **Indexing API** +
  **Search Console API**, and put its JSON key on Railway.
- Verified `primewellmedsolutions.com` as a **Domain property** in Search Console
  and added the service account as an **Owner**.
- **Everything is configured correctly.** It's now just waiting for Google to
  "activate" the new owner (propagation — can take from minutes to a few hours).

### Other settings
- **Resend email** ✅ done
- **Admin password changed** ✅ done

---

## What's left

| Thing | Status | Action |
|-------|--------|--------|
| Google owner activation | ⏳ waiting on Google | Re-run the diagnostic until it shows `200` |
| Confirm email actually delivers | optional | Use "Forgot password" and check your inbox |
| Turn email verification back on | optional | Set `REQUIRE_EMAIL_VERIFICATION=true` once email is confirmed |
| IndexNow (Bing/Yandex) | optional | Set `INDEXNOW_KEY` if you want Bing coverage |

---

## Handy commands & links

**Check if Google is ready** (open in browser while logged in as admin):
```
https://dashboard.primewellmedsolutions.com/api/admin/diag/google?url=https://primewellmedsolutions.com/
```
When `inspectionTest` shows `"httpStatus": 200` → Google is live. Then **Resubmit**
a URL → the `google indexing api` and `gsc url inspect` signals go green → click
**Verify now** twice → status becomes **indexed**.

**Re-run the database migration** (Railway → API service → Console):
```
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

**Re-seed the admin/settings** (Railway → API service → Console):
```
node_modules/.bin/tsx packages/database/prisma/seed.ts
```

**All environment variables**: see [`.env.production.example`](.env.production.example).

**Deploys** happen automatically when you `git push` to the `main` branch.

---

## The 6 indexing signals — what actually works

| Signal | Reality |
|--------|---------|
| `google_indexing_api` | Strongest. Works once Google activates the owner. |
| `gsc_url_inspect` | Reads real index status. Same activation. |
| `indexnow` | Bing/Yandex only (not Google). Optional. |
| `sitemap_ping` | Adds URL to your crawlable sitemap (Google's old ping is dead). |
| `rss_webSub` | Publishes to your RSS feed + hubs. Supplementary. |
| `crawl_trigger` | Adds URL to your public discovery pages. |
