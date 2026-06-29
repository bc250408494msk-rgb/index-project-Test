import axios from "axios";
import { prisma } from "../../utils/prisma.js";
import { cacheDel } from "../../utils/redis.js";
import { logger } from "../../utils/logger.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function sitemapPing(urlId: string, url: string, userId: string): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();
  try {
    // Add the URL to the user's sitemap. This is the real, durable value of
    // this signal: the URL now lives in a publicly crawlable sitemap that
    // Google/Bing fetch on their own schedule.
    await prisma.sitemapEntry.upsert({
      where: { urlId },
      update: {},
      create: { urlId, userId },
    });

    // Invalidate sitemap cache so the new entry is served immediately
    await cacheDel(`sitemap:${userId}`);

    // Best-effort legacy pings. NOTE: Google deprecated its sitemap-ping
    // endpoint in 2023 (returns 404) and Bing followed; we still attempt them
    // for any engine that honours them, but success no longer depends on them.
    const sitemapUrl = `${APP_URL}/sitemaps/${userId}/sitemap.xml`;
    const [googlePing, bingPing] = await Promise.allSettled([
      axios.get(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, { timeout: 8000, validateStatus: () => true }),
      axios.get(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, { timeout: 8000, validateStatus: () => true }),
    ]);

    const googleCode = googlePing.status === "fulfilled" ? googlePing.value.status : 0;
    const bingCode = bingPing.status === "fulfilled" ? bingPing.value.status : 0;

    // Success = the URL was added to the crawlable sitemap (the upsert above).
    const success = true;
    const summary = `Added to sitemap ${sitemapUrl} (legacy pings — Google: ${googleCode}, Bing: ${bingCode})`;

    await prisma.sitemapEntry.update({
      where: { urlId },
      data: { lastPingedAt: new Date(), pingResponseCode: googleCode },
    });

    return { success, httpCode: googleCode || 200, summary: summary.slice(0, 500), durationMs: Date.now() - start };
  } catch (err: any) {
    logger.error({ err, url }, "Sitemap ping error");
    return { success: false, httpCode: 0, summary: err.message?.slice(0, 500) ?? "Error", durationMs: Date.now() - start };
  }
}

export async function generateSitemapXml(userId: string): Promise<string> {
  const entries = await prisma.sitemapEntry.findMany({
    where: { userId },
    include: { url: { select: { url: true, updatedAt: true } } },
    orderBy: { url: { createdAt: "desc" } },
  });

  const items = entries
    .map((e) => `  <url>
    <loc>${escapeXml(e.url.url)}</loc>
    <lastmod>${e.url.updatedAt.toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
