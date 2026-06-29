import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { prisma } from "../../utils/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { getRedis } from "../../utils/redis.js";

const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60;

const profileSchema = z.object({
  username: z.string().min(3).max(100).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
  timezone: z.string().max(50).optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(128),
});

const preferencesSchema = z.object({
  notifyOnIndexed: z.boolean().optional(),
  notifyOnRefund: z.boolean().optional(),
  notifyOnRetry: z.boolean().optional(),
  notifyOnHealthFail: z.boolean().optional(),
  notifyOnLowCredits: z.boolean().optional(),
  notifyOnCreditsGranted: z.boolean().optional(),
  lowCreditThreshold: z.number().int().min(1).max(1000).optional(),
});

export default async function userRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // GET /api/user/me
  app.get("/me", async (req, reply) => {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, username: true, email: true, role: true, creditsBalance: true, emailVerified: true, timezone: true, lowCreditThreshold: true, notifyOnIndexed: true, notifyOnRefund: true, notifyOnRetry: true, notifyOnHealthFail: true, notifyOnLowCredits: true, notifyOnCreditsGranted: true, createdAt: true },
    });
    return reply.send(user);
  });

  // PUT /api/user/profile
  app.put("/profile", async (req, reply) => {
    const userId = (req as any).user.id;
    const body = profileSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: userId }, data: body, select: { id: true, username: true, email: true, timezone: true } });
    return reply.send(user);
  });

  // PUT /api/user/password
  app.put("/password", async (req, reply) => {
    const userId = (req as any).user.id;
    const body = passwordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      return reply.status(400).send({ error: "Current password is incorrect" });
    }
    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Revoke current refresh token so existing sessions must re-login
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      try {
        const payload = (req.server as any).jwt.verify(refreshToken) as { jti?: string };
        if (payload.jti) {
          await getRedis().setex(`blacklist:jti:${payload.jti}`, REFRESH_TOKEN_TTL, "1");
        }
      } catch {
        // Expired or invalid — nothing to revoke
      }
    }

    reply
      .clearCookie("accessToken", { path: "/" })
      .clearCookie("refreshToken", { path: "/api/auth" });
    return reply.send({ message: "Password updated. Please log in again." });
  });

  // DELETE /api/user/account
  app.delete("/account", async (req, reply) => {
    const userId = (req as any).user.id;

    // Revoke the current refresh token before deleting the account
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      try {
        const payload = (req.server as any).jwt.verify(refreshToken) as { jti?: string };
        if (payload.jti) {
          await getRedis().setex(`blacklist:jti:${payload.jti}`, REFRESH_TOKEN_TTL, "1");
        }
      } catch { /* already expired — fine */ }
    }

    // Cascade delete handles all related records (URLs, signals, verifications, etc.)
    // BullMQ jobs that are in-flight will fail gracefully when they can't find the URL
    // record — the worker catch blocks handle this silently.
    await prisma.user.delete({ where: { id: userId } });

    reply
      .clearCookie("accessToken", { path: "/" })
      .clearCookie("refreshToken", { path: "/api/auth" });
    return reply.send({ message: "Account deleted" });
  });

  // GET /api/user/notifications
  app.get("/notifications", async (req, reply) => {
    const userId = (req as any).user.id;
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return reply.send(notifications);
  });

  // PUT /api/user/notifications/read-all
  app.put("/notifications/read-all", async (req, reply) => {
    const userId = (req as any).user.id;
    await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return reply.send({ message: "All notifications marked as read" });
  });

  // PUT /api/user/notifications/:id/read
  app.put("/notifications/:id/read", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    await prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return reply.send({ message: "Notification marked as read" });
  });

  // GET /api/user/preferences
  app.get("/preferences", async (req, reply) => {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { notifyOnIndexed: true, notifyOnRefund: true, notifyOnRetry: true, notifyOnHealthFail: true, notifyOnLowCredits: true, notifyOnCreditsGranted: true, lowCreditThreshold: true },
    });
    return reply.send(user);
  });

  // PUT /api/user/preferences
  app.put("/preferences", async (req, reply) => {
    const userId = (req as any).user.id;
    const body = preferencesSchema.parse(req.body);
    await prisma.user.update({ where: { id: userId }, data: body });
    return reply.send({ message: "Preferences updated" });
  });

  // GET /api/user/stats
  app.get("/stats", async (req, reply) => {
    const userId = (req as any).user.id;
    const [total, indexed, pending, healthFailed, refunded] = await Promise.all([
      prisma.url.count({ where: { userId } }),
      prisma.url.count({ where: { userId, status: "indexed" } }),
      prisma.url.count({ where: { userId, status: { in: ["submitted", "signals_firing"] } } }),
      prisma.url.count({ where: { userId, status: "health_failed" } }),
      prisma.url.count({ where: { userId, status: "refunded" } }),
    ]);
    return reply.send({ total, indexed, pending, healthFailed, refunded });
  });

  // GET /api/user/api-keys
  app.get("/api-keys", async (req, reply) => {
    const userId = (req as any).user.id;
    const keys = await prisma.apiKey.findMany({
      where: { userId },
      select: { id: true, keyPrefix: true, label: true, isActive: true, lastUsedAt: true, requestCount: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(keys);
  });

  // POST /api/user/api-keys
  app.post("/api-keys", async (req, reply) => {
    const userId = (req as any).user.id;
    const { label } = z.object({ label: z.string().min(1).max(100) }).parse(req.body);

    const rawKey = `imn_${randomBytes(32).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    const apiKey = await prisma.apiKey.create({
      data: { userId, keyHash, keyPrefix, label },
      select: { id: true, keyPrefix: true, label: true, createdAt: true },
    });

    // Return raw key only once
    return reply.status(201).send({ ...apiKey, key: rawKey, warning: "Save this key — it will not be shown again." });
  });

  // DELETE /api/user/api-keys/:id
  app.delete("/api-keys/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    await prisma.apiKey.updateMany({ where: { id, userId }, data: { isActive: false } });
    return reply.send({ message: "API key revoked" });
  });
}
