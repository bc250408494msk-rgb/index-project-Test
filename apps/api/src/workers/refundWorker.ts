import { Worker } from "bullmq";
import * as Sentry from "@sentry/node";
import { getRedis } from "../utils/redis.js";
import { prisma } from "../utils/prisma.js";
import { refundCredit } from "../modules/credits/creditService.js";
import { verifyUrl } from "../modules/verification/index.js";
import { emailService } from "../services/emailService.js";
import { logger } from "../utils/logger.js";

const REFUND_WINDOW = parseInt(process.env.REFUND_WINDOW_DAYS ?? "10", 10);
const BATCH_SIZE = 500;

export function createRefundWorker() {
  return new Worker(
    "refund",
    async () => {
      logger.info("Refund worker: scanning for day-10 unindexed URLs");

      const cutoff = new Date(Date.now() - REFUND_WINDOW * 24 * 60 * 60 * 1000);
      let processed = 0;
      let cursor: string | undefined;

      // Loop in batches so a large backlog (e.g. after bulk import) is fully processed
      // in one worker execution rather than spilling into the next 24h cycle.
      while (true) {
        const urls = await prisma.url.findMany({
          where: {
            status: { in: ["submitted", "retry_queued"] },
            signalsFiredAt: { lte: cutoff },
            creditCharged: true,
            creditRefunded: false,
          },
          include: { user: { select: { id: true, email: true, notifyOnRefund: true } } },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });

        if (!urls.length) break;
        logger.info({ count: urls.length }, "Refund worker: processing batch");

        for (const urlRecord of urls) {
          try {
            const { isIndexed } = await verifyUrl(urlRecord.id, urlRecord.url);

            if (isIndexed) {
              logger.info({ urlId: urlRecord.id }, "URL indexed on final check — no refund needed");
              continue;
            }

            // refundCredit() sets status = "refunded" inside its transaction
            await refundCredit(urlRecord.user.id, urlRecord.id);

            if (urlRecord.user.notifyOnRefund) {
              await emailService.sendAutoRefund(urlRecord.user.email, urlRecord.url);
              await prisma.notification.create({
                data: {
                  userId: urlRecord.user.id,
                  type: "refunded",
                  title: "Credit Auto-Refunded",
                  message: `Your URL was not indexed after 10 days. 1 credit has been refunded: ${urlRecord.url}`,
                  urlId: urlRecord.id,
                },
              });
            }

            processed++;
            logger.info({ urlId: urlRecord.id }, "10-day auto-refund processed");
          } catch (err) {
            logger.error({ err, urlId: urlRecord.id }, "Refund worker error for URL");
            // Alert on individual refund failures so they don't silently stay stuck
            if (process.env.SENTRY_DSN) Sentry.captureException(err, { extra: { urlId: urlRecord.id } });
          }
        }

        if (urls.length < BATCH_SIZE) break;
        cursor = urls[urls.length - 1].id;
      }

      logger.info({ processed }, "Refund worker: run complete");
    },
    {
      connection: getRedis() as any,
      concurrency: 5,
      lockDuration: 300000,
    }
  );
}
