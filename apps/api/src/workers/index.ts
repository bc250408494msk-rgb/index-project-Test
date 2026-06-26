import { retryQueue, refundQueue } from "../queues/index.js";
import { createHealthCheckWorker } from "./healthCheckWorker.js";
import { createIndexingSignalWorker } from "./indexingSignalWorker.js";
import { createVerificationWorker } from "./verificationWorker.js";
import { createRetryWorker } from "./retryWorker.js";
import { createRefundWorker } from "./refundWorker.js";
import { logger } from "../utils/logger.js";

export async function startWorkers() {
  const healthWorker = createHealthCheckWorker();
  const signalWorker = createIndexingSignalWorker();
  const verificationWorker = createVerificationWorker();
  const retryWorker = createRetryWorker();
  const refundWorker = createRefundWorker();

  // Schedule repeatable retry scan every 24 hours
  await retryQueue.add("scan", {}, {
    repeat: { every: 24 * 60 * 60 * 1000 },
    jobId: "retry-scan-daily",
  });

  // Schedule repeatable refund scan every 24 hours
  await refundQueue.add("scan", {}, {
    repeat: { every: 24 * 60 * 60 * 1000 },
    jobId: "refund-scan-daily",
  });

  const workers = [healthWorker, signalWorker, verificationWorker, retryWorker, refundWorker];

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, queue: job?.queueName, err }, "Job failed");
    });
    worker.on("completed", (job) => {
      logger.debug({ jobId: job.id, queue: job.queueName }, "Job completed");
    });
  }

  logger.info("All BullMQ workers started");
  return workers;
}
