import { FastifyInstance } from "fastify";
import { createHash } from "crypto";
import { prisma } from "../../utils/prisma.js";
import { cacheGet, cacheSet } from "../../utils/redis.js";
import { generateSitemapXml } from "../../modules/signals/sitemapEngine.js";

async function validateFeedKey(apiKey: string | undefined, userId: string): Promise<boolean> {
  if (!apiKey) return false;
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const record = await prisma.apiKey.findFirst({ where: { keyHash, userId, isActive: true } });
  return !!record;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rfcDate(d: Date): string {
  return d.toUTCString();
}

export default async function publicRoutes(app: FastifyInstance) {
  // ── Sitemaps ──────────────────────────────────────────────────

  // GET /sitemaps/:userId/sitemap.xml
  app.get("/sitemaps/:userId/sitemap.xml", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { key } = req.query as { key?: string };
    if (!await validateFeedKey(key, userId)) return reply.status(401).send({ error: "Valid API key required. Add ?key=<your-api-key>" });

    const cacheKey = `sitemap:${userId}`;
    let xml = await cacheGet<string>(cacheKey);

    if (!xml) {
      xml = await generateSitemapXml(userId);
      await cacheSet(cacheKey, xml, 300);
    }

    reply.header("Content-Type", "application/xml; charset=utf-8");
    return reply.send(xml);
  });

  // GET /sitemaps/:userId/sitemap-index.xml
  app.get("/sitemaps/:userId/sitemap-index.xml", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { key } = req.query as { key?: string };
    if (!await validateFeedKey(key, userId)) return reply.status(401).send({ error: "Valid API key required. Add ?key=<your-api-key>" });

    const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
    const count = await prisma.sitemapEntry.count({ where: { userId } });
    const pages = Math.ceil(count / 1000) || 1;
    const items = Array.from({ length: pages }, (_, i) =>
      `  <sitemap><loc>${APP_URL}/sitemaps/${userId}/sitemap-${i + 1}.xml</loc></sitemap>`
    ).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`;
    reply.header("Content-Type", "application/xml; charset=utf-8");
    return reply.send(xml);
  });

  // ── RSS Feeds ─────────────────────────────────────────────────

  async function generateRssFeed(entries: any[], feedUrl: string): Promise<string> {
    const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
    const items = entries.slice(0, 50).map((e) => `    <item>
      <title>${escapeXml(e.pageTitle ?? e.url.url)}</title>
      <link>${escapeXml(e.url.url)}</link>
      <guid isPermaLink="true">${escapeXml(e.url.url)}</guid>
      <pubDate>${rfcDate(e.publishedAt)}</pubDate>
      <description>${escapeXml(e.pageDescription ?? "")}</description>
    </item>`).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>IndexMeNow — Fresh Indexed Pages</title>
    <link>${APP_URL}</link>
    <description>Recently submitted pages for Google indexing</description>
    <lastBuildDate>${rfcDate(new Date())}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <atom:link href="https://pubsubhubbub.appspot.com/" rel="hub"/>
${items}
  </channel>
</rss>`;
  }

  app.get("/feeds/:userId/feed.xml", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { key } = req.query as { key?: string };
    if (!await validateFeedKey(key, userId)) return reply.status(401).send({ error: "Valid API key required. Add ?key=<your-api-key>" });

    const cacheKey = `rss:${userId}`;
    let xml = await cacheGet<string>(cacheKey);

    if (!xml) {
      const entries = await prisma.rssEntry.findMany({
        where: { userId },
        orderBy: { publishedAt: "desc" },
        take: 50,
        include: { url: { select: { url: true } } },
      });
      const feedUrl = `${process.env.APP_URL}/feeds/${userId}/feed.xml`;
      xml = await generateRssFeed(entries, feedUrl);
      await cacheSet(cacheKey, xml, 300);
    }

    reply.header("Content-Type", "application/rss+xml; charset=utf-8");
    return reply.send(xml);
  });

  app.get("/feeds/global/recent.xml", async (_req, reply) => {
    const entries = await prisma.rssEntry.findMany({
      orderBy: { publishedAt: "desc" },
      take: 100,
      include: { url: { select: { url: true } } },
    });
    const feedUrl = `${process.env.APP_URL}/feeds/global/recent.xml`;
    const xml = await generateRssFeed(entries, feedUrl);
    reply.header("Content-Type", "application/rss+xml; charset=utf-8");
    return reply.send(xml);
  });

  app.get("/feeds/:userId/projects/:projectId/feed.xml", async (req, reply) => {
    const { userId, projectId } = req.params as { userId: string; projectId: string };
    const { key } = req.query as { key?: string };
    if (!await validateFeedKey(key, userId)) return reply.status(401).send({ error: "Valid API key required. Add ?key=<your-api-key>" });

    const entries = await prisma.rssEntry.findMany({
      where: { userId, url: { projectId } },
      orderBy: { publishedAt: "desc" },
      take: 50,
      include: { url: { select: { url: true } } },
    });
    const feedUrl = `${process.env.APP_URL}/feeds/${userId}/projects/${projectId}/feed.xml`;
    const xml = await generateRssFeed(entries, feedUrl);
    reply.header("Content-Type", "application/rss+xml; charset=utf-8");
    return reply.send(xml);
  });

  app.get("/feeds/:userId/campaigns/:campaignId/feed.xml", async (req, reply) => {
    const { userId, campaignId } = req.params as { userId: string; campaignId: string };
    const { key } = req.query as { key?: string };
    if (!await validateFeedKey(key, userId)) return reply.status(401).send({ error: "Valid API key required. Add ?key=<your-api-key>" });

    const entries = await prisma.rssEntry.findMany({
      where: { userId, url: { campaignId } },
      orderBy: { publishedAt: "desc" },
      take: 50,
      include: { url: { select: { url: true } } },
    });
    const feedUrl = `${process.env.APP_URL}/feeds/${userId}/campaigns/${campaignId}/feed.xml`;
    const xml = await generateRssFeed(entries, feedUrl);
    reply.header("Content-Type", "application/rss+xml; charset=utf-8");
    return reply.send(xml);
  });

  // ── Discovery Pages ───────────────────────────────────────────

  async function discoverHtml(title: string, urls: string[]): Promise<string> {
    const links = urls.map((u) => `<li><a href="${escapeXml(u)}" rel="noopener">${escapeXml(u)}</a></li>`).join("\n");
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title} — IndexMeNow</title></head>
<body>
<h1>${title}</h1>
<p>Recently submitted URLs:</p>
<ul>${links}</ul>
<p>Powered by <a href="${process.env.APP_URL}">IndexMeNow</a></p>
</body>
</html>`;
  }

  app.get("/discover/recent", async (_req, reply) => {
    const cacheKey = "discover:recent";
    let html = await cacheGet<string>(cacheKey);
    if (!html) {
      const urls = await prisma.url.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { url: true } });
      html = await discoverHtml("Recent Submissions", urls.map((u) => u.url));
      await cacheSet(cacheKey, html, 60);
    }
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(html);
  });

  app.get("/discover/fresh", async (_req, reply) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const urls = await prisma.url.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 500, select: { url: true } });
    const html = await discoverHtml("Fresh Today", urls.map((u) => u.url));
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(html);
  });

  app.get("/discover/u/:userId", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { key } = req.query as { key?: string };
    if (!await validateFeedKey(key, userId)) return reply.status(401).send({ error: "Valid API key required. Add ?key=<your-api-key>" });

    const urls = await prisma.url.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, select: { url: true } });
    const html = await discoverHtml("User Submissions", urls.map((u) => u.url));
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(html);
  });

  // IndexNow key verification file
  const indexNowKey = process.env.INDEXNOW_KEY;
  if (indexNowKey) {
    app.get(`/${indexNowKey}.txt`, async (_req, reply) => {
      reply.header("Content-Type", "text/plain");
      return reply.send(indexNowKey);
    });
  }
}
