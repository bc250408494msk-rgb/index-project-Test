import { Queue } from "bullmq";
import { getRedis } from "../utils/redis.js";

const connection = { connection: getRedis() as any };

// ── Queue definitions ──────────────────────────────────────────

export const healthCheckQueue = new Queue("health-check", {
  ...connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const indexingSignalQueue = new Queue("indexing-signal", {
  ...connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

export const verificationQueue = new Queue("verification", {
  ...connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 60000 },
    removeOnComplete: 500,
    removeOnFail: 500,
  },
});

export const retryQueue = new Queue("retry", {
  ...connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 60000 },
    removeOnComplete: 200,
    removeOnFail: 200,
  },
});

export const refundQueue = new Queue("refund", {
  ...connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 60000 },
    removeOnComplete: 200,
    removeOnFail: 200,
  },
});

export function getQueues() {
  return {
    "health-check": healthCheckQueue,
    "indexing-signal": indexingSignalQueue,
    "verification": verificationQueue,
    "retry": retryQueue,
    "refund": refundQueue,
  };
}

// ── Job type interfaces ────────────────────────────────────────

export interface HealthCheckJob {
  urlId: string;
  url: string;
  userId: string;
}

export interface IndexingSignalJob {
  urlId: string;
  url: string;
  userId: string;
  signalType: string;
  isRetry: boolean;
}

export interface VerificationJob {
  urlId: string;
  url: string;
  submittedAt: string;
  /** @deprecated checkCount is now read from the DB — kept for backward compat with already-queued jobs */
  checkCount?: number;
}

export interface RetryJob {
  urlId: string;
  url: string;
  userId: string;
}

export interface RefundJob {
  urlId: string;
  url: string;
  userId: string;
}
