import { cacheDel } from "../../utils/redis.js";

export async function crawlTrigger(_urlId: string, _url: string, userId: string): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();
  try {
    // Invalidate the per-user sitemap and RSS caches so crawlers see fresh content
    await Promise.all([
      cacheDel(`sitemap:${userId}`),
      cacheDel(`rss:${userId}`),
    ]);

    return {
      success: true,
      httpCode: 200,
      summary: "Per-user sitemap and RSS caches invalidated",
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return { success: false, httpCode: 0, summary: err.message ?? "Error", durationMs: Date.now() - start };
  }
}
