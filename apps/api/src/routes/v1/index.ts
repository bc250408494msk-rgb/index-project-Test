import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../utils/prisma.js";
import { apiKeyAuth } from "../../middleware/authenticate.js";
import { runHealthCheck } from "../../modules/health-checker/index.js";
import { validateUrlFormat, normalizeUrl, hashUrl } from "../../utils/urlNormalizer.js";
import { deductCredit } from "../../modules/credits/creditService.js";
import { spamFilter, checkDuplicate } from "../../modules/security/spamFilter.js";
import { malwareCheck } from "../../modules/security/malwareCheck.js";
import { indexingSignalQueue } from "../../queues/index.js";

const SIGNALS = ["google_indexing_api", "gsc_url_inspect", "sitemap_ping", "rss_webSub", "indexnow", "crawl_trigger"];

export default async function v1Routes(app: FastifyInstance) {
  app.addHook("onRequest", apiKeyAuth);

  // POST /api/v1/health-check
  app.post("/health-check", async (req, reply) => {
    const { urls } = z.object({ urls: z.array(z.string().url()).max(100) }).parse(req.body);
    const results = await Promise.all(urls.map((url) => runHealthCheck(url)));
    return reply.send(results);
  });

  // POST /api/v1/submit
  app.post("/submit", {
    config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const userId = (req as any).user.id;
    const body = z.object({
      urls: z.array(z.string().url()).max(500),
      project_id: z.string().uuid().optional(),
      campaign_id: z.string().uuid().optional(),
      skip_health_check: z.boolean().default(false),
    }).parse(req.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });
    const results: any[] = [];
    let creditsUsed = 0;
    let healthFailed = 0;
    let alreadyIndexed = 0;

    // Require at least one project
    const projectId = body.project_id ?? (await prisma.project.findFirst({ where: { userId } }))?.id;
    if (!projectId) return reply.status(400).send({ error: "No project found. Create a project first." });

    for (const rawUrl of body.urls) {
      const fmt = validateUrlFormat(rawUrl);
      if (!fmt.valid) { results.push({ url: rawUrl, status: "rejected", reason: fmt.reason }); continue; }

      const url = normalizeUrl(rawUrl);
      const spam = await spamFilter(url, userId);
      if (!spam.allowed) { results.push({ url, status: "rejected", reason: spam.reason }); continue; }

      const dup = await checkDuplicate(url, userId);
      if (dup.isDuplicate) { results.push({ url, status: "duplicate", id: dup.existingId }); continue; }

      const malware = await malwareCheck(url);
      if (!malware.safe) { results.push({ url, status: "rejected", reason: "URL flagged as potentially harmful" }); continue; }

      if (!body.skip_health_check) {
        const health = await runHealthCheck(url);
        if (!health.isIndexable) { healthFailed++; results.push({ url, status: "health_failed", health: { is_indexable: false } }); continue; }
      }

      if (user.creditsBalance - creditsUsed < 1) {
        results.push({ url, status: "error", reason: "Insufficient credits" });
        continue;
      }

      const urlRecord = await prisma.url.create({
        data: { userId, projectId, campaignId: body.campaign_id, url, urlHash: hashUrl(url), status: "signals_firing", source: "api" },
      });

      await deductCredit(userId, urlRecord.id, `API submission: ${url}`);
      creditsUsed++;

      for (const signalType of SIGNALS) {
        await indexingSignalQueue.add("signal", { urlId: urlRecord.id, url, userId, signalType, isRetry: false });
      }

      results.push({ url, id: urlRecord.id, status: "submitted", health: { is_indexable: true } });
    }

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });
    return reply.send({
      submitted: results.filter((r) => r.status === "submitted").length,
      queued: results.filter((r) => r.status === "submitted").length,
      already_indexed: alreadyIndexed,
      health_failed: healthFailed,
      credits_used: creditsUsed,
      credits_remaining: updatedUser.creditsBalance,
      urls: results,
    });
  });

  // POST /api/v1/urls/status
  app.post("/urls/status", async (req, reply) => {
    const userId = (req as any).user.id;
    const { url_ids } = z.object({ url_ids: z.array(z.string().uuid()).max(100) }).parse(req.body);
    const urls = await prisma.url.findMany({ where: { id: { in: url_ids }, userId }, select: { id: true, url: true, status: true, indexedAt: true } });
    return reply.send(urls);
  });

  // GET /api/v1/urls/:id
  app.get("/urls/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const url = await prisma.url.findFirst({
      where: { id, userId },
      include: { signals: { orderBy: { attemptedAt: "desc" } }, verifications: { orderBy: { checkedAt: "desc" } } },
    });
    if (!url) return reply.status(404).send({ error: "URL not found" });
    return reply.send(url);
  });

  // GET /api/v1/balance
  app.get("/balance", async (req, reply) => {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });
    return reply.send({ credits: user.creditsBalance });
  });

  // GET /api/v1/projects
  app.get("/projects", async (req, reply) => {
    const userId = (req as any).user.id;
    const projects = await prisma.project.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return reply.send(projects);
  });
}
