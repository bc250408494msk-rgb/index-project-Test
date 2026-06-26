import axios from "axios";
import * as cheerio from "cheerio";
import { prisma } from "../../utils/prisma.js";
import { cacheDel } from "../../utils/redis.js";
import { logger } from "../../utils/logger.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const WEBSUB_HUBS = [
  "https://pubsubhubbub.appspot.com/",
  "https://hub.w3.org/",
  "https://pubsubhubbub.superfeedr.com/",
];

async function fetchPageMeta(url: string): Promise<{ title: string; description: string }> {
  try {
    const resp = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      validateStatus: () => true,
    });
    const $ = cheerio.load(resp.data);
    const title = $("title").first().text().trim() || url;
    const description =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "";
    return { title: title.slice(0, 255), description: description.slice(0, 500) };
  } catch {
    return { title: url, description: "" };
  }
}

async function pingWebSubHub(hub: string, feedUrl: string): Promise<{ hub: string; status: number }> {
  try {
    const params = new URLSearchParams({ "hub.mode": "publish", "hub.url": feedUrl });
    const resp = await axios.post(hub, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 8000,
      validateStatus: () => true,
    });
    return { hub, status: resp.status };
  } catch {
    return { hub, status: 0 };
  }
}

export async function rssFeedPublisher(urlId: string, url: string, userId: string): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();
  try {
    const meta = await fetchPageMeta(url);

    await prisma.rssEntry.upsert({
      where: { urlId },
      update: { pageTitle: meta.title, pageDescription: meta.description },
      create: { urlId, userId, pageTitle: meta.title, pageDescription: meta.description },
    });

    await cacheDel(`rss:${userId}`);

    const feedUrl = `${APP_URL}/feeds/${userId}/feed.xml`;
    const hubResults = await Promise.all(WEBSUB_HUBS.map((hub) => pingWebSubHub(hub, feedUrl)));

    await prisma.rssEntry.update({
      where: { urlId },
      data: { hubPingResults: hubResults },
    });

    const anySuccess = hubResults.some((r) => r.status === 200 || r.status === 204);
    const summary = `Published to RSS. Hub pings: ${hubResults.map((r) => `${r.hub}=${r.status}`).join(", ")}`;

    return { success: anySuccess, httpCode: hubResults[0]?.status ?? 0, summary: summary.slice(0, 500), durationMs: Date.now() - start };
  } catch (err: any) {
    logger.error({ err, url }, "RSS feed publisher error");
    return { success: false, httpCode: 0, summary: err.message?.slice(0, 500) ?? "Error", durationMs: Date.now() - start };
  }
}
