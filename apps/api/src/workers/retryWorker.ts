import { Worker } from "bullmq";
import { getRedis } from "../utils/redis.js";
import { prisma } from "../utils/prisma.js";
import { runHealthCheck } from "../modules/health-checker/index.js";
import { indexingSignalQueue } from "../queues/index.js";
import { emailService } from "../services/emailService.js";
import { logger } from "../utils/logger.js";

const RETRY_WINDOW = parseInt(process.env.RETRY_WINDOW_DAYS ?? "7", 10);
const SIGNALS = ["google_indexing_api", "gsc_url_inspect", "sitemap_ping", "rss_webSub", "indexnow", "crawl_trigger"];

export function createRetryWorker() {
  // This worker runs on a repeatable schedule — finds day-7 URLs and processes them
  return new Worker(
    "retry",
    async () => {
      logger.info("Retry worker: scanning for day-7 unindexed URLs");

      const cutoff = new Date(Date.now() - RETRY_WINDOW * 24 * 60 * 60 * 1000);
      const urls = await prisma.url.findMany({
        where: {
          status: "submitted",
          signalsFiredAt: { lte: cutoff },
          retryCount: 0,
        },
        include: { user: { select: { id: true, email: true, notifyOnRetry: true, notifyOnHealthFail: true } } },
        take: 100,
      });

      logger.info({ count: urls.length }, "Retry worker: found URLs to retry");

      for (const urlRecord of urls) {
        try {
          // Smart retry: re-run health check first
          const health = await runHealthCheck(urlRecord.url);

          if (!health.isIndexable) {
            // Health issues found — notify user, do NOT re-fire signals
            await prisma.url.update({
              where: { id: urlRecord.id },
              data: { status: "health_failed", healthFailReasons: health.failReasons },
            });

            if (urlRecord.user.notifyOnHealthFail) {
              await emailService.sendHealthFailed(urlRecord.user.email, urlRecord.url, health.failReasons);
              await prisma.notification.create({
                data: {
                  userId: urlRecord.user.id,
                  type: "health_failed",
                  title: "URL has new indexing issues",
                  message: `At 7-day retry, we found new issues preventing indexing: ${health.failReasons.join(", ")}`,
                  urlId: urlRecord.id,
                },
              });
            }
            continue;
          }

          // Health still good — re-fire all 6 signals
          await prisma.url.update({
            where: { id: urlRecord.id },
            data: { retryCount: { increment: 1 }, retryFiredAt: new Date(), status: "submitted" },
          });

          for (const signalType of SIGNALS) {
            await indexingSignalQueue.add("signal", {
              urlId: urlRecord.id,
              url: urlRecord.url,
              userId: urlRecord.user.id,
              signalType,
              isRetry: true,
            });
          }

          if (urlRecord.user.notifyOnRetry) {
            await emailService.sendRetryTriggered(urlRecord.user.email, urlRecord.url);
            await prisma.notification.create({
              data: {
                userId: urlRecord.user.id,
                type: "retry_triggered",
                title: "URL Re-submitted",
                message: `We re-submitted your URL for indexing after 7 days: ${urlRecord.url}`,
                urlId: urlRecord.id,
              },
            });
          }

          logger.info({ urlId: urlRecord.id }, "7-day retry fired");
        } catch (err) {
          logger.error({ err, urlId: urlRecord.id }, "Retry worker error for URL");
        }
      }
    },
    {
      connection: { connection: getRedis() },
      concurrency: 5,
      lockDuration: 300000, // 5 min
    }
  );
}
