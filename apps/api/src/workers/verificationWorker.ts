import { Worker } from "bullmq";
import { getRedis } from "../utils/redis.js";
import { prisma } from "../utils/prisma.js";
import { verifyUrl } from "../modules/verification/index.js";
import { emailService } from "../services/emailService.js";
import { verificationQueue } from "../queues/index.js";
import { logger } from "../utils/logger.js";
import type { VerificationJob } from "../queues/index.js";

const REFUND_WINDOW = parseInt(process.env.REFUND_WINDOW_DAYS ?? "10", 10);
const RETRY_WINDOW = parseInt(process.env.RETRY_WINDOW_DAYS ?? "7", 10);

export function createVerificationWorker() {
  return new Worker<VerificationJob>(
    "verification",
    async (job) => {
      const { urlId, url, submittedAt } = job.data;
      const submittedDate = new Date(submittedAt);
      const daysSinceSubmit = Math.floor((Date.now() - submittedDate.getTime()) / (1000 * 60 * 60 * 24));

      const urlRecord = await prisma.url.findUnique({
        where: { id: urlId },
        include: { user: { select: { id: true, email: true, notifyOnIndexed: true } } },
      });

      if (!urlRecord || urlRecord.status === "indexed" || urlRecord.status === "refunded") {
        logger.info({ urlId }, "Skipping verification — URL already resolved");
        return;
      }

      // Use DB checkCount as the authoritative value, not job.data.checkCount which
      // can be stale if multiple jobs were queued for the same URL.
      const checkCount = urlRecord.checkCount ?? 0;
      logger.info({ urlId, checkCount, daysSinceSubmit }, "Verification worker processing");

      const { isIndexed } = await verifyUrl(urlId, url);

      if (isIndexed) {
        logger.info({ urlId }, "URL confirmed indexed!");
        if (urlRecord.user.notifyOnIndexed) {
          await emailService.sendUrlIndexed(urlRecord.user.email, url);
          await prisma.notification.create({
            data: {
              userId: urlRecord.user.id,
              type: "indexed",
              title: "URL Indexed!",
              message: `Your URL has been indexed by Google: ${url}`,
              urlId,
            },
          });
        }
        return;
      }

      // Not indexed yet — schedule next check if within window
      if (daysSinceSubmit < REFUND_WINDOW) {
        await verificationQueue.add(
          "verify",
          { urlId, url, submittedAt },
          { delay: 24 * 60 * 60 * 1000 }
        );
        logger.info({ urlId, nextCheck: checkCount + 1 }, "Scheduled next verification check");
      }
    },
    {
      connection: getRedis() as any,
      concurrency: 50,
      lockDuration: 60000,
    }
  );
}
