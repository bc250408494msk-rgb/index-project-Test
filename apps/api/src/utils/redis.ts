import Redis from "ioredis";
import { logger } from "./logger.js";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    redis.on("error", (err) => logger.error({ err }, "Redis error"));
    redis.on("connect", () => logger.info("Redis connected"));
  }
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const val = await getRedis().get(key);
  return val ? (JSON.parse(val) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  await getRedis().del(key);
}
