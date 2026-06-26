import axios from "axios";
import { prisma } from "../../utils/prisma.js";
import { cacheDel } from "../../utils/redis.js";
import { logger } from "../../utils/logger.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function sitemapPing(urlId: string, url: string, userId: string): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();
  try {
    // Upsert sitemap entry
    await prisma.sitemapEntry.upsert({
      where: { urlId },
      update: {},
      create: { urlId, userId },
    });

    // Invalidate sitemap cache
    await cacheDel(`sitemap:${userId}`);

    const sitemapUrl = `${APP_URL}/sitemaps/${userId}/sitemap.xml`;
    const [googlePing, bingPing] = await Promise.allSettled([
      axios.get(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, { timeout: 10000, validateStatus: () => true }),
      axios.get(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, { timeout: 10000, validateStatus: () => true }),
    ]);

    const googleCode = googlePing.status === "fulfilled" ? googlePing.value.status : 0;
    const bingCode = bingPing.status === "fulfilled" ? bingPing.value.status : 0;

    const success = googleCode === 200 || bingCode === 200;
    const summary = `Google ping: ${googleCode}, Bing ping: ${bingCode}`;

    await prisma.sitemapEntry.update({
      where: { urlId },
      data: { lastPingedAt: new Date(), pingResponseCode: googleCode },
    });

    return { success, httpCode: googleCode, summary, durationMs: Date.now() - start };
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
