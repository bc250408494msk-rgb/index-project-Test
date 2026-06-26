import axios from "axios";
import robotsParser from "robots-parser";
import { cacheGet, cacheSet } from "../../utils/redis.js";
import { logger } from "../../utils/logger.js";

export interface RobotsCheckResult {
  status: "pass" | "fail";
  blocked: boolean;
  directive: string | null;
  message: string;
}

export async function robotsCheck(url: string): Promise<RobotsCheckResult> {
  try {
    const u = new URL(url);
    const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
    const cacheKey = `robots:${u.host}`;

    let robotsTxt: string | null = await cacheGet<string>(cacheKey);

    if (robotsTxt === null) {
      try {
        const resp = await axios.get(robotsUrl, { timeout: 5000, validateStatus: () => true });
        robotsTxt = resp.status === 200 ? resp.data : "";
        await cacheSet(cacheKey, robotsTxt, 3600); // Cache 1 hour
      } catch {
        robotsTxt = "";
        await cacheSet(cacheKey, robotsTxt, 3600);
      }
    }

    if (!robotsTxt) {
      return { status: "pass", blocked: false, directive: null, message: "No robots.txt found — allowed" };
    }

    const robots = robotsParser(robotsUrl, robotsTxt);

    const isAllowedGooglebot = robots.isAllowed(url, "Googlebot");
    const isAllowedAll = robots.isAllowed(url, "*");

    if (isAllowedGooglebot === false || isAllowedAll === false) {
      return { status: "fail", blocked: true, directive: "Disallow rule found", message: "URL is blocked by robots.txt" };
    }

    return { status: "pass", blocked: false, directive: null, message: "Not blocked by robots.txt" };
  } catch (err) {
    logger.warn({ err, url }, "Robots check error");
    return { status: "pass", blocked: false, directive: null, message: "Could not fetch robots.txt — assuming allowed" };
  }
}
