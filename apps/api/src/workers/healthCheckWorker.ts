import { Worker } from "bullmq";
import { getRedis } from "../utils/redis.js";
import { prisma } from "../utils/prisma.js";
import { runHealthCheck } from "../modules/health-checker/index.js";
import { logger } from "../utils/logger.js";
import type { HealthCheckJob } from "../queues/index.js";

export function createHealthCheckWorker() {
  return new Worker<HealthCheckJob>(
    "health-check",
    async (job) => {
      const { urlId, url, userId } = job.data;
      logger.info({ urlId, url }, "Health check worker processing");

      await prisma.url.update({ where: { id: urlId }, data: { status: "health_checking" } });

      const result = await runHealthCheck(url);

      const healthData = {
        urlId,
        httpStatus: result.checks.httpStatus.value,
        responseTimeMs: result.responseTimeMs,
        isRedirect: result.checks.redirect.isRedirect,
        redirectChain: result.checks.redirect.hops,
        finalUrl: null,
        hasNoindex: result.checks.noindex.hasNoindex,
        noindexSource: result.checks.noindex.source,
        robotsBlocked: result.checks.robotsTxt.blocked,
        canonicalUrl: result.checks.canonical.canonicalUrl,
        canonicalMismatch: result.checks.canonical.mismatch,
        sslValid: result.checks.ssl.valid,
        sslExpiryDays: result.checks.ssl.expiryDays,
        pageSizeKb: result.checks.content.sizeKb,
        hasContent: result.checks.content.hasHtml,
        isIndexable: result.isIndexable,
        failReasons: result.failReasons,
        warnings: result.warnings,
      };

      await prisma.urlHealthCheck.create({ data: healthData });

      if (!result.isIndexable) {
        await prisma.url.update({
          where: { id: urlId },
          data: { status: "health_failed", isIndexable: false, healthFailReasons: result.failReasons },
        });
        logger.info({ urlId, reasons: result.failReasons }, "URL health check failed — no credit charged");
      } else {
        await prisma.url.update({
          where: { id: urlId },
          data: { isIndexable: true, httpStatus: result.checks.httpStatus.value ?? undefined },
        });
        logger.info({ urlId }, "URL health check passed");
      }
    },
    {
      connection: { connection: getRedis() },
      concurrency: 20,
      lockDuration: 15000,
    }
  );
}
