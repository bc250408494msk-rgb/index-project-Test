import { Worker } from "bullmq";
import { getRedis } from "../utils/redis.js";
import { prisma } from "../utils/prisma.js";
import { refundCredit } from "../modules/credits/creditService.js";
import { verifyUrl } from "../modules/verification/index.js";
import { emailService } from "../services/emailService.js";
import { logger } from "../utils/logger.js";

const REFUND_WINDOW = parseInt(process.env.REFUND_WINDOW_DAYS ?? "10", 10);

export function createRefundWorker() {
  return new Worker(
    "refund",
    async () => {
      logger.info("Refund worker: scanning for day-10 unindexed URLs");

      const cutoff = new Date(Date.now() - REFUND_WINDOW * 24 * 60 * 60 * 1000);
      const urls = await prisma.url.findMany({
        where: {
          status: { in: ["submitted", "retry_queued"] },
          signalsFiredAt: { lte: cutoff },
          creditCharged: true,
          creditRefunded: false,
        },
        include: { user: { select: { id: true, email: true, notifyOnRefund: true } } },
        take: 100,
      });

      logger.info({ count: urls.length }, "Refund worker: found URLs to check");

      for (const urlRecord of urls) {
        try {
          // Final verification before refunding
          const { isIndexed } = await verifyUrl(urlRecord.id, urlRecord.url);

          if (isIndexed) {
            logger.info({ urlId: urlRecord.id }, "URL indexed on final check — no refund needed");
            continue;
          }

          // Still not indexed — process auto-refund
          await refundCredit(urlRecord.user.id, urlRecord.id);

          await prisma.url.update({
            where: { id: urlRecord.id },
            data: { status: "not_indexed" },
          });

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

          logger.info({ urlId: urlRecord.id }, "10-day auto-refund processed");
        } catch (err) {
          logger.error({ err, urlId: urlRecord.id }, "Refund worker error for URL");
        }
      }
    },
    {
      connection: getRedis() as any,
      concurrency: 5,
      lockDuration: 300000,
    }
  );
}
