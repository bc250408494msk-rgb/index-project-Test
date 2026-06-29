import { Worker } from "bullmq";
import { getRedis } from "../utils/redis.js";
import { prisma } from "../utils/prisma.js";
import { googleIndexingApi } from "../modules/signals/googleIndexingApi.js";
import { gscUrlInspect } from "../modules/signals/gscUrlInspect.js";
import { sitemapPing } from "../modules/signals/sitemapEngine.js";
import { rssFeedPublisher } from "../modules/signals/rssFeedPublisher.js";
import { indexNow } from "../modules/signals/indexNow.js";
import { crawlTrigger } from "../modules/signals/crawlTrigger.js";
import { verificationQueue } from "../queues/index.js";
import { logger } from "../utils/logger.js";
import type { IndexingSignalJob } from "../queues/index.js";

type SignalFn = () => Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }>;

const SIGNAL_HANDLERS: Record<string, (urlId: string, url: string, userId: string) => SignalFn> = {
  google_indexing_api: (_, url) => () => googleIndexingApi(url),
  gsc_url_inspect: (_, url) => () => gscUrlInspect(url),
  sitemap_ping: (urlId, url, userId) => () => sitemapPing(urlId, url, userId),
  rss_webSub: (urlId, url, userId) => () => rssFeedPublisher(urlId, url, userId),
  indexnow: (_, url) => () => indexNow([url]),
  crawl_trigger: (urlId, url, userId) => () => crawlTrigger(urlId, url, userId),
};

export function createIndexingSignalWorker() {
  return new Worker<IndexingSignalJob>(
    "indexing-signal",
    async (job) => {
      const { urlId, url, userId, signalType, isRetry } = job.data;
      logger.info({ urlId, signalType, isRetry }, "Indexing signal worker processing");

      const handler = SIGNAL_HANDLERS[signalType];
      if (!handler) {
        logger.warn({ signalType }, "Unknown signal type");
        return;
      }

      const signalRecord = await prisma.indexingSignal.create({
        data: { urlId, signalType: signalType as any, isRetry, status: "pending" },
      });

      try {
        const result = await handler(urlId, url, userId)();

        await prisma.indexingSignal.update({
          where: { id: signalRecord.id },
          data: {
            status: result.success ? "success" : "failed",
            httpResponseCode: result.httpCode,
            responseSummary: result.summary,
            durationMs: result.durationMs,
          },
        });

        // Check if ALL 6 signals for this URL are done
        const allSignals = await prisma.indexingSignal.findMany({ where: { urlId, isRetry } });
        const allDone = allSignals.length === 6 && allSignals.every((s) => s.status !== "pending");

        if (allDone) {
          await prisma.url.update({
            where: { id: urlId },
            data: { status: "submitted", signalsFiredAt: new Date(), firstCheckAt: new Date() },
          });

          // Schedule first verification check in 24h
          await verificationQueue.add(
            "verify",
            { urlId, url, checkCount: 1, submittedAt: new Date().toISOString() },
            { delay: 24 * 60 * 60 * 1000 }
          );

          logger.info({ urlId }, "All signals done — scheduled first verification in 24h");
        }
      } catch (err: any) {
        await prisma.indexingSignal.update({
          where: { id: signalRecord.id },
          data: { status: "error", errorMessage: err.message?.slice(0, 500) },
        });
        throw err; // BullMQ will retry
      }
    },
    {
      connection: getRedis() as any,
      concurrency: 10,
      lockDuration: 30000,
    }
  );
}
