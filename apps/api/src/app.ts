import Fastify from "fastify";
import { ZodError } from "zod";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import * as Sentry from "@sentry/node";

import { logger } from "./utils/logger.js";
import { getRedis } from "./utils/redis.js";
import { checkDatabaseConnection } from "./utils/prisma.js";
import { getQueues } from "./queues/index.js";

// Routes
import authRoutes from "./routes/auth/index.js";
import userRoutes from "./routes/user/index.js";
import projectRoutes from "./routes/projects/index.js";
import campaignRoutes from "./routes/campaigns/index.js";
import urlRoutes from "./routes/urls/index.js";
import creditRoutes from "./routes/credits/index.js";
import adminRoutes from "./routes/admin/index.js";
import publicRoutes from "./routes/public/index.js";
import v1Routes from "./routes/v1/index.js";

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
}

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own Pino instance
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024, // 5MB max body
  });

  // ── Security headers ─────────────────────────────────────────
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  });

  // ── CORS ─────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: (process.env.ALLOWED_ORIGINS || process.env.APP_URL || "http://localhost:3000")
      .split(",")
      .map((o) => o.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  // ── Cookies ──────────────────────────────────────────────────
  await app.register(fastifyCookie, {
    secret: process.env.JWT_SECRET!,
  });

  // ── JWT ──────────────────────────────────────────────────────
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    cookie: { cookieName: "accessToken", signed: false },
  });

  // ── Rate limiting ─────────────────────────────────────────────
  await app.register(fastifyRateLimit, {
    global: false,
    redis: getRedis(),
    keyGenerator: (req) => req.ip,
  });

  // ── Multipart (file uploads) ──────────────────────────────────
  await app.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  // ── Request logging ───────────────────────────────────────────
  app.addHook("onRequest", async (req) => {
    logger.info({ method: req.method, url: req.url, ip: req.ip }, "Incoming request");
  });

  app.addHook("onResponse", async (req, reply) => {
    logger.info(
      { method: req.method, url: req.url, statusCode: reply.statusCode, duration: reply.elapsedTime },
      "Request completed"
    );
  });

  // ── Error handler ─────────────────────────────────────────────
  app.setErrorHandler((error, req, reply) => {
    // Zod validation errors → 400 with field details (not a generic 500)
    if (error instanceof ZodError || (error as any)?.name === "ZodError") {
      const issues = ((error as ZodError).issues ?? []).map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return reply.status(400).send({
        error: "Validation failed",
        details: issues,
        statusCode: 400,
      });
    }

    logger.error({ err: error, url: req.url }, "Unhandled error");
    if (process.env.SENTRY_DSN) Sentry.captureException(error);

    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode ?? 500;
    reply.status(statusCode).send({
      error: statusCode < 500 ? err.message : "Internal server error",
      statusCode,
    });
  });

  // ── Health endpoint ───────────────────────────────────────────
  app.get("/health", async (_, reply) => {
    const [dbOk, redisOk] = await Promise.all([
      checkDatabaseConnection(),
      getRedis().ping().then(() => true).catch(() => false),
    ]);

    let queues: Record<string, { waiting: number; active: number }> = {};
    try {
      const queueInstances = getQueues();
      const queueStats = await Promise.all(
        Object.entries(queueInstances).map(async ([name, q]) => {
          const [waiting, active] = await Promise.all([q.getWaitingCount(), q.getActiveCount()]);
          return [name, { waiting, active }];
        })
      );
      queues = Object.fromEntries(queueStats);
    } catch {
      // Queue stats are non-critical
    }

    const status = dbOk && redisOk ? "ok" : "degraded";
    reply.status(dbOk && redisOk ? 200 : 503).send({
      status,
      db: dbOk ? "connected" : "disconnected",
      redis: redisOk ? "connected" : "disconnected",
      queues,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Routes ────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api/user" });
  await app.register(projectRoutes, { prefix: "/api/projects" });
  await app.register(campaignRoutes, { prefix: "/api/campaigns" });
  await app.register(urlRoutes, { prefix: "/api/urls" });
  await app.register(creditRoutes, { prefix: "/api/credits" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(publicRoutes, { prefix: "/" });
  await app.register(v1Routes, { prefix: "/api/v1" });

  return app;
}
