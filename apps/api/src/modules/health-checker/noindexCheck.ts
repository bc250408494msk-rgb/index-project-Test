import * as cheerio from "cheerio";
import axios from "axios";
import { logger } from "../../utils/logger.js";

export interface NoindexCheckResult {
  status: "pass" | "fail";
  hasNoindex: boolean;
  source: "meta_tag" | "http_header" | null;
  message: string;
}

export async function noindexCheck(url: string, htmlContent?: string, responseHeaders?: Record<string, string>): Promise<NoindexCheckResult> {
  try {
    // Check HTTP header X-Robots-Tag
    if (responseHeaders) {
      const xRobots = responseHeaders["x-robots-tag"] ?? responseHeaders["X-Robots-Tag"];
      if (xRobots) {
        const val = xRobots.toLowerCase();
        if (val.includes("noindex") || val.includes("none")) {
          return { status: "fail", hasNoindex: true, source: "http_header", message: "X-Robots-Tag: noindex found in HTTP headers" };
        }
      }
    }

    // Fetch if no HTML provided
    if (!htmlContent) {
      try {
        const resp = await axios.get(url, {
          timeout: 10000,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
          validateStatus: () => true,
        });

        // Also check headers
        const xRobots = resp.headers["x-robots-tag"];
        if (xRobots) {
          const val = xRobots.toLowerCase();
          if (val.includes("noindex") || val.includes("none")) {
            return { status: "fail", hasNoindex: true, source: "http_header", message: "X-Robots-Tag: noindex found in HTTP headers" };
          }
        }

        htmlContent = resp.data;
      } catch {
        return { status: "pass", hasNoindex: false, source: null, message: "Could not check noindex — assuming allowed" };
      }
    }

    const $ = cheerio.load(htmlContent ?? "");

    // Check meta robots
    const metaRobots = $('meta[name="robots"], meta[name="googlebot"]')
      .map((_, el) => $(el).attr("content")?.toLowerCase() ?? "")
      .get();

    for (const content of metaRobots) {
      if (content.includes("noindex") || content === "none") {
        return { status: "fail", hasNoindex: true, source: "meta_tag", message: `<meta name="robots" content="${content}"> found` };
      }
    }

    return { status: "pass", hasNoindex: false, source: null, message: "No noindex directives found" };
  } catch (err) {
    logger.warn({ err, url }, "Noindex check error");
    return { status: "pass", hasNoindex: false, source: null, message: "Noindex check inconclusive — assuming allowed" };
  }
}
