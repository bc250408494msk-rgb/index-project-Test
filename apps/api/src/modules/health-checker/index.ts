import axios from "axios";
import { httpCheck } from "./httpCheck.js";
import { sslCheck } from "./sslCheck.js";
import { robotsCheck } from "./robotsCheck.js";
import { noindexCheck } from "./noindexCheck.js";
import { canonicalCheck } from "./canonicalCheck.js";
import { contentCheck } from "./contentCheck.js";
import { cacheGet, cacheSet } from "../../utils/redis.js";
import { hashUrl } from "../../utils/urlNormalizer.js";
import { logger } from "../../utils/logger.js";

export interface HealthCheckResult {
  url: string;
  isIndexable: boolean;
  overallStatus: "pass" | "warn" | "fail";
  checks: {
    httpStatus: { status: string; value: number | null; message: string };
    ssl: { status: string; valid: boolean; expiryDays: number | null };
    robotsTxt: { status: string; blocked: boolean; message: string };
    noindex: { status: string; hasNoindex: boolean; source: string | null };
    canonical: { status: string; canonicalUrl: string | null; mismatch: boolean; message: string };
    redirect: { status: string; isRedirect: boolean; hops: Array<{ url: string; status: number }>; message: string };
    content: { status: string; sizeKb: number; hasHtml: boolean };
  };
  failReasons: string[];
  warnings: string[];
  checkedAt: string;
  responseTimeMs: number | null;
}

export async function runHealthCheck(url: string, timeoutMs = 10000): Promise<HealthCheckResult> {
  const cacheKey = `health:${hashUrl(url)}`;
  const cached = await cacheGet<HealthCheckResult>(cacheKey);
  if (cached) return cached;

  logger.debug({ url }, "Running health check");

  // Fetch page once, share across checks
  let htmlContent = "";
  let contentType = "text/html";
  let responseHeaders: Record<string, string> = {};

  const [httpResult, sslResult] = await Promise.all([
    httpCheck(url, timeoutMs),
    sslCheck(url),
  ]);

  if (httpResult.status !== "fail") {
    try {
      const resp = await axios.get(httpResult.finalUrl ?? url, {
        timeout: timeoutMs,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
        validateStatus: () => true,
        maxRedirects: 5,
      });
      htmlContent = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
      contentType = resp.headers["content-type"] ?? "text/html";
      responseHeaders = resp.headers as Record<string, string>;
    } catch {
      // Already have HTTP result — non-fatal
    }
  }

  const [robotsResult, noindexResult] = await Promise.all([
    robotsCheck(url),
    noindexCheck(url, htmlContent, responseHeaders),
  ]);

  const canonicalResult = htmlContent ? canonicalCheck(url, htmlContent) : { status: "pass" as const, canonicalUrl: null, mismatch: false, message: "Could not check canonical" };
  const contentResult = htmlContent ? contentCheck(htmlContent, contentType) : { status: "fail" as const, sizeKb: 0, hasHtml: false, hasContent: false, message: "No content retrieved" };

  const failReasons: string[] = [];
  const warnings: string[] = [];

  if (httpResult.status === "fail") failReasons.push(httpResult.message);
  if (sslResult.status === "fail") failReasons.push(sslResult.message);
  if (robotsResult.status === "fail") failReasons.push(robotsResult.message);
  if (noindexResult.status === "fail") failReasons.push(noindexResult.message);
  if (canonicalResult.status === "fail") failReasons.push(canonicalResult.message);
  if (contentResult.status === "fail") failReasons.push(contentResult.message);
  if (httpResult.redirectChain.length > 3) failReasons.push(`Too many redirects: ${httpResult.redirectChain.length} hops`);

  if (httpResult.status === "warn") warnings.push(httpResult.message);
  if (sslResult.status === "warn") warnings.push(sslResult.message);
  if (canonicalResult.status === "warn") warnings.push(canonicalResult.message);
  if (contentResult.status === "warn") warnings.push(contentResult.message);

  const isIndexable = failReasons.length === 0;
  const overallStatus = failReasons.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";

  const result: HealthCheckResult = {
    url,
    isIndexable,
    overallStatus,
    checks: {
      httpStatus: { status: httpResult.status, value: httpResult.httpStatus, message: httpResult.message },
      ssl: { status: sslResult.status, valid: sslResult.valid, expiryDays: sslResult.expiryDays },
      robotsTxt: { status: robotsResult.status, blocked: robotsResult.blocked, message: robotsResult.message },
      noindex: { status: noindexResult.status, hasNoindex: noindexResult.hasNoindex, source: noindexResult.source },
      canonical: { status: canonicalResult.status, canonicalUrl: canonicalResult.canonicalUrl, mismatch: canonicalResult.mismatch, message: canonicalResult.message },
      redirect: { status: httpResult.status, isRedirect: httpResult.isRedirect, hops: httpResult.redirectChain, message: httpResult.message },
      content: { status: contentResult.status, sizeKb: contentResult.sizeKb, hasHtml: contentResult.hasHtml },
    },
    failReasons,
    warnings,
    checkedAt: new Date().toISOString(),
    responseTimeMs: httpResult.responseTimeMs,
  };

  await cacheSet(cacheKey, result, 3600); // Cache 60 minutes
  return result;
}
