import { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse as csvParse } from "csv-parse/sync";
import { XMLParser } from "fast-xml-parser";
import pLimit from "p-limit";
import { prisma } from "../../utils/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { runHealthCheck, healthCheckToRecord } from "../../modules/health-checker/index.js";
import { malwareCheck } from "../../modules/security/malwareCheck.js";
import { spamFilter, checkDuplicate } from "../../modules/security/spamFilter.js";
import { validateUrlFormat, hashUrl, normalizeUrl } from "../../utils/urlNormalizer.js";
import { deductCredit } from "../../modules/credits/creditService.js";
import { indexingSignalQueue } from "../../queues/index.js";
import { logger } from "../../utils/logger.js";

const MAX_BATCH = parseInt(process.env.MAX_URLS_PER_BATCH ?? "500", 10);
const SIGNALS = ["google_indexing_api", "gsc_url_inspect", "sitemap_ping", "rss_webSub", "indexnow", "crawl_trigger"];

const submitSchema = z.object({
  urls: z.array(z.string().min(1)).max(MAX_BATCH),
  projectId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  skipHealthCheck: z.boolean().default(false),
});

const sitemapSubmitSchema = z.object({
  sitemapUrl: z.string().url(),
  projectId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

async function processUrls(
  rawUrls: string[],
  userId: string,
  projectId: string,
  campaignId: string | undefined,
  skipHealthCheck: boolean,
  source: string
) {
  const results: any[] = [];
  let creditsUsed = 0;
  let healthFailed = 0;
  let alreadyIndexed = 0;
  let duplicates = 0;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });

  // Step 1: Validate and pre-process all URLs.
  // p-limit caps outbound HTTP concurrency so a 500-URL batch doesn't fire
  // 500 simultaneous external requests (health check + malware check per URL).
  const limit = pLimit(15);
  const settled = await Promise.allSettled(
    rawUrls.map((rawUrl) => limit(async () => {
      const formatCheck = validateUrlFormat(rawUrl);
      if (!formatCheck.valid) {
        return { url: rawUrl, status: "rejected", reason: formatCheck.reason };
      }

      const url = normalizeUrl(rawUrl);

      const spam = await spamFilter(url, userId);
      if (!spam.allowed) {
        return { url, status: "rejected", reason: spam.reason };
      }

      const dup = await checkDuplicate(url, userId);
      if (dup.isDuplicate) {
        return { url, status: "duplicate", existingId: dup.existingId };
      }

      const malware = await malwareCheck(url);
      if (!malware.safe) {
        return { url, status: "malware", reason: `Flagged as ${malware.threatType}` };
      }

      if (!skipHealthCheck) {
        const health = await runHealthCheck(url);
        if (!health.isIndexable) {
          return { url, status: "health_failed", health, reasons: health.failReasons };
        }
        return { url, status: "valid", health };
      }

      return { url, status: "valid", health: null };
    }))
  );

  // Flatten settled results — treat rejections as errors
  const processed = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    logger.error({ err: s.reason, url: rawUrls[i] }, "URL pre-processing threw unexpectedly");
    return { url: rawUrls[i], status: "rejected", reason: "Internal processing error" };
  });

  // Step 2: Count valid URLs and check credit sufficiency
  const validItems = processed.filter((p) => p.status === "valid");
  if (validItems.length > user.creditsBalance) {
    throw new Error(`Insufficient credits. Need ${validItems.length}, have ${user.creditsBalance}.`);
  }

  // Step 3: Create URL records and fire signals
  for (const item of processed) {
    if (item.status === "rejected" || item.status === "malware") {
      results.push({ url: item.url, status: "rejected", reason: item.reason });
      continue;
    }

    if (item.status === "duplicate") {
      duplicates++;
      results.push({ url: item.url, status: "duplicate", id: item.existingId });
      continue;
    }

    if (item.status === "health_failed") {
      healthFailed++;
      results.push({ url: item.url, status: "health_failed", reasons: item.reasons });
      continue;
    }

    try {
      const urlRecord = await prisma.url.create({
        data: {
          userId,
          projectId,
          campaignId,
          url: item.url,
          urlHash: hashUrl(item.url),
          status: "signals_firing",
          source: source as any,
        },
      });

      if (item.health) {
        await prisma.urlHealthCheck.create({ data: healthCheckToRecord(urlRecord.id, item.health) });
      }

      await deductCredit(userId, urlRecord.id, `URL indexing: ${item.url}`);
      creditsUsed++;

      for (const signalType of SIGNALS) {
        await indexingSignalQueue.add("signal", {
          urlId: urlRecord.id,
          url: item.url,
          userId,
          signalType,
          isRetry: false,
        }, { priority: 1 });
      }

      results.push({ url: item.url, id: urlRecord.id, status: "submitted", health: item.health });
    } catch (err: any) {
      logger.error({ err, url: item.url }, "URL submission error");
      results.push({ url: item.url, status: "error", reason: err.message });
    }
  }

  return { results, creditsUsed, healthFailed, alreadyIndexed, duplicates };
}

export default async function urlRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // POST /api/urls/health-check
  app.post("/health-check", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { urls } = z.object({ urls: z.array(z.string()).max(20) }).parse(req.body);
    const results = await Promise.allSettled(urls.map((url) => runHealthCheck(url)));
    return reply.send(results.map((r) => r.status === "fulfilled" ? r.value : { error: "Check failed" }));
  });

  // POST /api/urls/submit
  app.post("/submit", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const userId = (req as any).user.id;
    const body = submitSchema.parse(req.body);

    // Verify the project belongs to this user
    const project = await prisma.project.findFirst({ where: { id: body.projectId, userId } });
    if (!project) return reply.status(404).send({ error: "Project not found" });

    if (body.campaignId) {
      const campaign = await prisma.campaign.findFirst({ where: { id: body.campaignId, userId } });
      if (!campaign) return reply.status(404).send({ error: "Campaign not found" });
    }

    const { results, creditsUsed, healthFailed, alreadyIndexed, duplicates } = await processUrls(
      body.urls, userId, body.projectId, body.campaignId, body.skipHealthCheck, "dashboard"
    );
    const submitted = results.filter((r) => r.status === "submitted").length;
    return reply.send({ submitted, queued: submitted, healthFailed, alreadyIndexed, duplicates, creditsUsed, urls: results });
  });

  // POST /api/urls/submit/csv
  app.post("/submit/csv", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, async (req, reply) => {
    const userId = (req as any).user.id;
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "No file uploaded" });

    const { projectId, campaignId } = z.object({
      projectId: z.string().uuid().optional(),
      campaignId: z.string().uuid().optional(),
    }).parse(req.query);

    if (projectId) {
      const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
      if (!project) return reply.status(404).send({ error: "Project not found" });
    }
    if (campaignId) {
      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } });
      if (!campaign) return reply.status(404).send({ error: "Campaign not found" });
    }

    // Resolve a default project if none provided
    const resolvedProjectId = projectId ?? (await prisma.project.findFirst({ where: { userId } }))?.id;
    if (!resolvedProjectId) return reply.status(400).send({ error: "No project found. Create a project first." });

    const buffer = await data.toBuffer();
    const records = csvParse(buffer, { columns: true, skip_empty_lines: true });
    const urls: string[] = records.map((r: any) => r.url ?? r.URL ?? Object.values(r)[0]).filter(Boolean);

    const { results, creditsUsed, healthFailed } = await processUrls(
      urls.slice(0, MAX_BATCH), userId, resolvedProjectId, campaignId, false, "bulk_csv"
    );
    return reply.send({ submitted: results.filter((r) => r.status === "submitted").length, creditsUsed, healthFailed, total: urls.length });
  });

  // POST /api/urls/submit/sitemap
  app.post("/submit/sitemap", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, async (req, reply) => {
    const userId = (req as any).user.id;
    const body = sitemapSubmitSchema.parse(req.body);

    // SSRF protection: re-validate the sitemap URL through the same validator that blocks private IPs
    const urlCheck = validateUrlFormat(body.sitemapUrl);
    if (!urlCheck.valid) return reply.status(400).send({ error: `Invalid sitemap URL: ${urlCheck.reason}` });

    if (body.projectId) {
      const project = await prisma.project.findFirst({ where: { id: body.projectId, userId } });
      if (!project) return reply.status(404).send({ error: "Project not found" });
    }
    if (body.campaignId) {
      const campaign = await prisma.campaign.findFirst({ where: { id: body.campaignId, userId } });
      if (!campaign) return reply.status(404).send({ error: "Campaign not found" });
    }

    const resolvedProjectId = body.projectId ?? (await prisma.project.findFirst({ where: { userId } }))?.id;
    if (!resolvedProjectId) return reply.status(400).send({ error: "No project found. Create a project first." });

    const axios = (await import("axios")).default;
    // maxRedirects:0 prevents SSRF via open redirect — a public URL could 301 to
    // 169.254.169.254 (cloud metadata) after passing the validateUrlFormat check.
    const resp = await axios.get(body.sitemapUrl, { timeout: 10000, maxRedirects: 0 });
    const parser = new XMLParser();
    const parsed = parser.parse(resp.data);
    const urls: string[] = (parsed?.urlset?.url ?? []).map((u: any) => u.loc).filter(Boolean);

    const { results, creditsUsed, healthFailed } = await processUrls(
      urls.slice(0, MAX_BATCH), userId, resolvedProjectId, body.campaignId, false, "sitemap_import"
    );
    return reply.send({ submitted: results.filter((r) => r.status === "submitted").length, creditsUsed, healthFailed, total: urls.length });
  });

  // GET /api/urls/export — MUST be registered before /:id to avoid being shadowed
  app.get("/export", async (req, reply) => {
    const userId = (req as any).user.id;
    const { projectId, status } = req.query as any;

    // Stream in chunks to avoid loading 10k rows into memory at once
    const PAGE_SIZE = 1000;
    const chunks: string[] = ["URL,Status,Submitted,Indexed At,Retry Count,Credits Charged"];
    let cursor: string | undefined;

    while (true) {
      const rows = await prisma.url.findMany({
        where: { userId, ...(projectId ? { projectId } : {}), ...(status ? { status } : {}) },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, url: true, status: true, createdAt: true, indexedAt: true, retryCount: true, creditCharged: true },
      });

      for (const u of rows) {
        const safeUrl = u.url.startsWith("=") || u.url.startsWith("+") || u.url.startsWith("-") || u.url.startsWith("@")
          ? `\t${u.url}` : u.url;
        chunks.push(`"${safeUrl}","${u.status}","${u.createdAt.toISOString()}","${u.indexedAt?.toISOString() ?? ""}","${u.retryCount}","${u.creditCharged}"`);
      }

      if (rows.length < PAGE_SIZE) break;
      cursor = rows[rows.length - 1].id;
    }

    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", "attachment; filename=urls.csv");
    return reply.send(chunks.join("\n"));
  });

  // GET /api/urls
  app.get("/", async (req, reply) => {
    const userId = (req as any).user.id;
    const { projectId, campaignId, status } = req.query as any;
    const { limit, offset } = paginationSchema.parse(req.query);

    const where = { userId, ...(projectId ? { projectId } : {}), ...(campaignId ? { campaignId } : {}), ...(status ? { status } : {}) };

    const [urls, total] = await Promise.all([
      prisma.url.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: { healthChecks: { take: 1, orderBy: { checkedAt: "desc" } }, signals: { orderBy: { attemptedAt: "desc" } } },
      }),
      prisma.url.count({ where }),
    ]);

    return reply.send({ urls, total });
  });

  // GET /api/urls/:id
  app.get("/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const url = await prisma.url.findFirst({
      where: { id, userId },
      include: {
        healthChecks: { orderBy: { checkedAt: "desc" } },
        signals: { orderBy: { attemptedAt: "desc" } },
        verifications: { orderBy: { checkedAt: "desc" } },
      },
    });
    if (!url) return reply.status(404).send({ error: "URL not found" });
    return reply.send(url);
  });

  // GET /api/urls/:id/health
  app.get("/:id/health", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const url = await prisma.url.findFirst({ where: { id, userId } });
    if (!url) return reply.status(404).send({ error: "URL not found" });
    const checks = await prisma.urlHealthCheck.findMany({ where: { urlId: id }, orderBy: { checkedAt: "desc" } });
    return reply.send(checks);
  });

  // GET /api/urls/:id/signals
  app.get("/:id/signals", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const url = await prisma.url.findFirst({ where: { id, userId } });
    if (!url) return reply.status(404).send({ error: "URL not found" });
    const signals = await prisma.indexingSignal.findMany({ where: { urlId: id }, orderBy: { attemptedAt: "desc" } });
    return reply.send(signals);
  });

  // GET /api/urls/:id/verifications
  app.get("/:id/verifications", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const url = await prisma.url.findFirst({ where: { id, userId } });
    if (!url) return reply.status(404).send({ error: "URL not found" });
    const verifications = await prisma.verificationCheck.findMany({ where: { urlId: id }, orderBy: { checkedAt: "desc" } });
    return reply.send(verifications);
  });

  // POST /api/urls/:id/resubmit
  app.post("/:id/resubmit", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const urlRecord = await prisma.url.findFirst({ where: { id, userId } });
    if (!urlRecord) return reply.status(404).send({ error: "URL not found" });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });
    if (user.creditsBalance < 1) return reply.status(402).send({ error: "Insufficient credits" });

    await deductCredit(userId, id, `Manual re-submit: ${urlRecord.url}`);

    for (const signalType of SIGNALS) {
      await indexingSignalQueue.add("signal", { urlId: id, url: urlRecord.url, userId, signalType, isRetry: true });
    }

    await prisma.url.update({ where: { id }, data: { status: "signals_firing", retryCount: { increment: 1 } } });
    return reply.send({ message: "URL re-submitted for indexing" });
  });

  // POST /api/urls/:id/verify
  app.post("/:id/verify", {
    config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
  }, async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const urlRecord = await prisma.url.findFirst({ where: { id, userId } });
    if (!urlRecord) return reply.status(404).send({ error: "URL not found" });

    const { verifyUrl } = await import("../../modules/verification/index.js");
    const result = await verifyUrl(id, urlRecord.url);
    return reply.send(result);
  });

  // DELETE /api/urls/:id
  app.delete("/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const url = await prisma.url.findFirst({ where: { id, userId } });
    if (!url) return reply.status(404).send({ error: "URL not found" });
    await prisma.url.delete({ where: { id } });
    return reply.send({ message: "URL deleted" });
  });
}
