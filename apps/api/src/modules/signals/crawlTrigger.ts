import { prisma } from "../../utils/prisma.js";
import { cacheDel } from "../../utils/redis.js";

export async function crawlTrigger(_urlId: string, _url: string, _userId: string): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();
  try {
    // The discover pages are dynamically served from the DB — just invalidate their caches
    await Promise.all([
      cacheDel("discover:recent"),
      cacheDel("discover:fresh"),
    ]);

    return {
      success: true,
      httpCode: 200,
      summary: "URL added to discovery pages (discover/recent, discover/fresh, discover/u/:user_id)",
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return { success: false, httpCode: 0, summary: err.message ?? "Error", durationMs: Date.now() - start };
  }
}
