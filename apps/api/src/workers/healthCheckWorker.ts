import { Worker } from "bullmq";
import { getRedis } from "../utils/redis.js";
import { prisma } from "../utils/prisma.js";
import { runHealthCheck, healthCheckToRecord } from "../modules/health-checker/index.js";
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

      await prisma.urlHealthCheck.create({ data: healthCheckToRecord(urlId, result) });

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
      connection: getRedis() as any,
      concurrency: 20,
      lockDuration: 15000,
    }
  );
}
