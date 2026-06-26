import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../utils/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { adminOnly } from "../../middleware/adminOnly.js";
import { adminGrantCredits } from "../../modules/credits/creditService.js";
import { getQueues } from "../../queues/index.js";

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);
  app.addHook("onRequest", adminOnly);

  // GET /api/admin/stats
  app.get("/stats", async (_req, reply) => {
    const [totalUsers, totalUrls, indexedUrls, refundedUrls, submittedToday] = await Promise.all([
      prisma.user.count(),
      prisma.url.count(),
      prisma.url.count({ where: { status: "indexed" } }),
      prisma.url.count({ where: { status: "refunded" } }),
      prisma.url.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
    ]);

    const signalSuccessRates = await prisma.indexingSignal.groupBy({
      by: ["signalType", "status"],
      _count: { id: true },
      where: { status: { in: ["success", "failed"] } },
    });

    const queues = getQueues();
    const queueStats: Record<string, any> = {};
    for (const [name, q] of Object.entries(queues)) {
      const [waiting, active, completed, failed] = await Promise.all([
        q.getWaitingCount(), q.getActiveCount(), q.getCompletedCount(), q.getFailedCount(),
      ]);
      queueStats[name] = { waiting, active, completed, failed };
    }

    return reply.send({ totalUsers, totalUrls, indexedUrls, refundedUrls, submittedToday, signalSuccessRates, queueStats });
  });

  // GET /api/admin/users
  app.get("/users", async (req, reply) => {
    const { search, limit = "50", offset = "0" } = req.query as any;
    const users = await prisma.user.findMany({
      where: search ? { OR: [{ email: { contains: search } }, { username: { contains: search } }] } : {},
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
      skip: parseInt(offset),
      select: { id: true, username: true, email: true, role: true, creditsBalance: true, isActive: true, emailVerified: true, lastLoginAt: true, createdAt: true },
    });
    const total = await prisma.user.count();
    return reply.send({ users, total });
  });

  // GET /api/admin/users/:id
  app.get("/users/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        projects: true,
        creditTransactions: { orderBy: { createdAt: "desc" }, take: 20 },
        _count: { select: { urls: true } },
      },
    });
    if (!user) return reply.status(404).send({ error: "User not found" });
    return reply.send(user);
  });

  // POST /api/admin/users/:id/credits
  app.post("/users/:id/credits", async (req, reply) => {
    const adminId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const { amount, reason } = z.object({ amount: z.number().int().min(-9999).max(9999), reason: z.string().min(1).max(500) }).parse(req.body);
    await adminGrantCredits(adminId, id, amount, reason);
    return reply.send({ message: `${Math.abs(amount)} credit(s) ${amount > 0 ? "granted" : "deducted"}` });
  });

  // PUT /api/admin/users/:id/status
  app.put("/users/:id/status", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    await prisma.user.update({ where: { id }, data: { isActive } });
    return reply.send({ message: `User ${isActive ? "activated" : "banned"}` });
  });

  // DELETE /api/admin/users/:id
  app.delete("/users/:id", async (req, reply) => {
    const adminId = (req as any).user.id;
    const { id } = req.params as { id: string };
    if (id === adminId) return reply.status(400).send({ error: "You cannot delete your own account" });
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!user) return reply.status(404).send({ error: "User not found" });
    if (user.role === "admin") return reply.status(400).send({ error: "Cannot delete another admin account" });
    await prisma.user.delete({ where: { id } });
    return reply.send({ message: "User permanently deleted" });
  });

  // GET /api/admin/urls
  app.get("/urls", async (req, reply) => {
    const { status, userId, limit = "50", offset = "0" } = req.query as any;
    const urls = await prisma.url.findMany({
      where: { ...(status ? { status } : {}), ...(userId ? { userId } : {}) },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: { user: { select: { username: true, email: true } } },
    });
    const total = await prisma.url.count({ where: { ...(status ? { status } : {}), ...(userId ? { userId } : {}) } });
    return reply.send({ urls, total });
  });

  // POST /api/admin/urls/:id/reindex
  app.post("/urls/:id/reindex", async (req, reply) => {
    const adminId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const urlRecord = await prisma.url.findUnique({ where: { id } });
    if (!urlRecord) return reply.status(404).send({ error: "URL not found" });
    const { indexingSignalQueue } = await import("../../queues/index.js");
    const SIGNALS = ["google_indexing_api", "gsc_url_inspect", "sitemap_ping", "rss_webSub", "indexnow", "crawl_trigger"];
    for (const signalType of SIGNALS) {
      await indexingSignalQueue.add("signal", { urlId: id, url: urlRecord.url, userId: urlRecord.userId, signalType, isRetry: true });
    }
    return reply.send({ message: "Force reindex queued" });
  });

  // POST /api/admin/urls/:id/verify
  app.post("/urls/:id/verify", async (req, reply) => {
    const { id } = req.params as { id: string };
    const urlRecord = await prisma.url.findUnique({ where: { id } });
    if (!urlRecord) return reply.status(404).send({ error: "URL not found" });
    const { verifyUrl } = await import("../../modules/verification/index.js");
    const result = await verifyUrl(id, urlRecord.url);
    return reply.send(result);
  });

  // GET /api/admin/queues
  app.get("/queues", async (_req, reply) => {
    const queues = getQueues();
    const stats: Record<string, any> = {};
    for (const [name, q] of Object.entries(queues)) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        q.getWaitingCount(), q.getActiveCount(), q.getCompletedCount(), q.getFailedCount(), q.getDelayedCount(),
      ]);
      const failedJobs = await q.getFailed(0, 20);
      stats[name] = { waiting, active, completed, failed, delayed, failedJobs: failedJobs.map((j) => ({ id: j.id, name: j.name, data: j.data, reason: j.failedReason, timestamp: j.timestamp })) };
    }
    return reply.send(stats);
  });

  // POST /api/admin/queues/:queue/retry/:jobId
  app.post("/queues/:queue/retry/:jobId", async (req, reply) => {
    const { queue, jobId } = req.params as { queue: string; jobId: string };
    const queues = getQueues();
    const q = queues[queue as keyof typeof queues];
    if (!q) return reply.status(404).send({ error: "Queue not found" });
    const job = await q.getJob(jobId);
    if (!job) return reply.status(404).send({ error: "Job not found" });
    await job.retry();
    return reply.send({ message: "Job retried" });
  });

  // GET /api/admin/settings
  app.get("/settings", async (_req, reply) => {
    const settings = await prisma.systemSetting.findMany();
    return reply.send(settings);
  });

  // PUT /api/admin/settings
  app.put("/settings", async (req, reply) => {
    const adminId = (req as any).user.id;
    const body = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value, updatedBy: adminId },
        create: { key, value, updatedBy: adminId },
      });
    }
    return reply.send({ message: "Settings updated" });
  });

  // GET /api/admin/blocklist
  app.get("/blocklist", async (_req, reply) => {
    const list = await prisma.blockedDomain.findMany({ orderBy: { createdAt: "desc" } });
    return reply.send(list);
  });

  // POST /api/admin/blocklist
  app.post("/blocklist", async (req, reply) => {
    const adminId = (req as any).user.id;
    const { domain, reason } = z.object({ domain: z.string().min(1), reason: z.string().optional() }).parse(req.body);
    const entry = await prisma.blockedDomain.create({ data: { domain: domain.toLowerCase(), reason, addedBy: adminId } });
    return reply.status(201).send(entry);
  });

  // DELETE /api/admin/blocklist/:id
  app.delete("/blocklist/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.blockedDomain.delete({ where: { id } });
    return reply.send({ message: "Domain removed from blocklist" });
  });
}
