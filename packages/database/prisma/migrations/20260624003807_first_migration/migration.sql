-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin', 'support');

-- CreateEnum
CREATE TYPE "UrlStatus" AS ENUM ('queued', 'health_checking', 'health_failed', 'already_indexed', 'signals_firing', 'submitted', 'indexed', 'retry_queued', 'not_indexed', 'refunded');

-- CreateEnum
CREATE TYPE "UrlSource" AS ENUM ('dashboard', 'api', 'wordpress', 'bulk_csv', 'sitemap_import');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('google_indexing_api', 'gsc_url_inspect', 'sitemap_ping', 'rss_webSub', 'indexnow', 'crawl_trigger');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('pending', 'success', 'failed', 'skipped', 'error');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('google_cse', 'isindexed_api', 'manual');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('active', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('admin_grant', 'admin_deduct', 'charge', 'auto_refund', 'manual_refund');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('indexed', 'health_failed', 'refunded', 'retry_triggered', 'low_credits', 'credits_granted', 'system');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "api_key" VARCHAR(64),
    "credits_balance" INTEGER NOT NULL DEFAULT 0,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verify_token" VARCHAR(255),
    "email_verify_expires_at" TIMESTAMP(3),
    "password_reset_token" VARCHAR(255),
    "password_reset_expires_at" TIMESTAMP(3),
    "low_credit_threshold" INTEGER NOT NULL DEFAULT 5,
    "notify_on_indexed" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_refund" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_retry" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_health_fail" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_low_credits" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_credits_granted" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "url_count" INTEGER NOT NULL DEFAULT 0,
    "indexed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'active',
    "total_urls" INTEGER NOT NULL DEFAULT 0,
    "indexed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "urls" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "url" TEXT NOT NULL,
    "url_hash" VARCHAR(64) NOT NULL,
    "status" "UrlStatus" NOT NULL DEFAULT 'queued',
    "http_status" INTEGER,
    "is_indexable" BOOLEAN,
    "health_fail_reasons" TEXT[],
    "signals_fired_at" TIMESTAMP(3),
    "first_check_at" TIMESTAMP(3),
    "last_check_at" TIMESTAMP(3),
    "check_count" INTEGER NOT NULL DEFAULT 0,
    "indexed_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "retry_fired_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "credit_charged" BOOLEAN NOT NULL DEFAULT false,
    "credit_refunded" BOOLEAN NOT NULL DEFAULT false,
    "source" "UrlSource" NOT NULL DEFAULT 'dashboard',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "url_health_checks" (
    "id" TEXT NOT NULL,
    "url_id" TEXT NOT NULL,
    "http_status" INTEGER,
    "response_time_ms" INTEGER,
    "is_redirect" BOOLEAN NOT NULL DEFAULT false,
    "redirect_chain" JSONB,
    "final_url" TEXT,
    "has_noindex" BOOLEAN NOT NULL DEFAULT false,
    "noindex_source" VARCHAR(50),
    "robots_blocked" BOOLEAN NOT NULL DEFAULT false,
    "robots_directive" TEXT,
    "canonical_url" TEXT,
    "canonical_mismatch" BOOLEAN NOT NULL DEFAULT false,
    "ssl_valid" BOOLEAN,
    "ssl_expiry_days" INTEGER,
    "page_size_kb" INTEGER,
    "has_content" BOOLEAN NOT NULL DEFAULT true,
    "is_indexable" BOOLEAN NOT NULL DEFAULT false,
    "fail_reasons" TEXT[],
    "warnings" TEXT[],
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "url_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexing_signals" (
    "id" TEXT NOT NULL,
    "url_id" TEXT NOT NULL,
    "signal_type" "SignalType" NOT NULL,
    "is_retry" BOOLEAN NOT NULL DEFAULT false,
    "status" "SignalStatus" NOT NULL DEFAULT 'pending',
    "http_response_code" INTEGER,
    "response_summary" VARCHAR(500),
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexing_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_checks" (
    "id" TEXT NOT NULL,
    "url_id" TEXT NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "is_indexed" BOOLEAN NOT NULL,
    "raw_response" JSONB,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "url_id" TEXT,
    "performed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitemap_entries" (
    "id" TEXT NOT NULL,
    "url_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_pinged_at" TIMESTAMP(3),
    "ping_response_code" INTEGER,

    CONSTRAINT "sitemap_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rss_entries" (
    "id" TEXT NOT NULL,
    "url_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "page_title" TEXT,
    "page_description" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hub_ping_results" JSONB,

    CONSTRAINT "rss_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "url_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_prefix" VARCHAR(8) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "blocked_domains" (
    "id" TEXT NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "reason" TEXT,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_api_key_key" ON "users"("api_key");

-- CreateIndex
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

-- CreateIndex
CREATE INDEX "campaigns_project_id_idx" ON "campaigns"("project_id");

-- CreateIndex
CREATE INDEX "campaigns_user_id_idx" ON "campaigns"("user_id");

-- CreateIndex
CREATE INDEX "urls_url_hash_user_id_idx" ON "urls"("url_hash", "user_id");

-- CreateIndex
CREATE INDEX "urls_status_idx" ON "urls"("status");

-- CreateIndex
CREATE INDEX "urls_created_at_idx" ON "urls"("created_at");

-- CreateIndex
CREATE INDEX "urls_user_id_idx" ON "urls"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "urls_url_hash_user_id_key" ON "urls"("url_hash", "user_id");

-- CreateIndex
CREATE INDEX "url_health_checks_url_id_idx" ON "url_health_checks"("url_id");

-- CreateIndex
CREATE INDEX "indexing_signals_url_id_idx" ON "indexing_signals"("url_id");

-- CreateIndex
CREATE INDEX "verification_checks_url_id_idx" ON "verification_checks"("url_id");

-- CreateIndex
CREATE INDEX "credit_transactions_user_id_idx" ON "credit_transactions"("user_id");

-- CreateIndex
CREATE INDEX "credit_transactions_url_id_idx" ON "credit_transactions"("url_id");

-- CreateIndex
CREATE UNIQUE INDEX "sitemap_entries_url_id_key" ON "sitemap_entries"("url_id");

-- CreateIndex
CREATE INDEX "sitemap_entries_user_id_idx" ON "sitemap_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rss_entries_url_id_key" ON "rss_entries"("url_id");

-- CreateIndex
CREATE INDEX "rss_entries_user_id_idx" ON "rss_entries"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_domains_domain_key" ON "blocked_domains"("domain");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "urls" ADD CONSTRAINT "urls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "urls" ADD CONSTRAINT "urls_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "urls" ADD CONSTRAINT "urls_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_health_checks" ADD CONSTRAINT "url_health_checks_url_id_fkey" FOREIGN KEY ("url_id") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indexing_signals" ADD CONSTRAINT "indexing_signals_url_id_fkey" FOREIGN KEY ("url_id") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_checks" ADD CONSTRAINT "verification_checks_url_id_fkey" FOREIGN KEY ("url_id") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_url_id_fkey" FOREIGN KEY ("url_id") REFERENCES "urls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_entries" ADD CONSTRAINT "sitemap_entries_url_id_fkey" FOREIGN KEY ("url_id") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_entries" ADD CONSTRAINT "sitemap_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rss_entries" ADD CONSTRAINT "rss_entries_url_id_fkey" FOREIGN KEY ("url_id") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rss_entries" ADD CONSTRAINT "rss_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_url_id_fkey" FOREIGN KEY ("url_id") REFERENCES "urls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
