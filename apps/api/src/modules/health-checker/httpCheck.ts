import axios from "axios";
import { logger } from "../../utils/logger.js";

const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export interface HttpCheckResult {
  status: "pass" | "warn" | "fail";
  httpStatus: number | null;
  responseTimeMs: number | null;
  isRedirect: boolean;
  redirectChain: Array<{ url: string; status: number }>;
  finalUrl: string | null;
  message: string;
}

export async function httpCheck(url: string, timeoutMs = 10000): Promise<HttpCheckResult> {
  const start = Date.now();
  const redirectChain: Array<{ url: string; status: number }> = [];

  try {
    const response = await axios.get(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      headers: { "User-Agent": GOOGLEBOT_UA },
      validateStatus: () => true,
      beforeRedirect: (options, { headers, status }: any) => {
        redirectChain.push({ url: options.href, status });
      },
    });

    const responseTimeMs = Date.now() - start;
    const httpStatus = response.status;
    const isRedirect = redirectChain.length > 0;
    const finalUrl = response.request?.res?.responseUrl ?? url;

    if (httpStatus === 200) {
      const redirectStatus = redirectChain.length > 3
        ? "fail"
        : redirectChain.length > 0
        ? "warn"
        : "pass";

      return {
        status: redirectStatus as "pass" | "warn" | "fail",
        httpStatus,
        responseTimeMs,
        isRedirect,
        redirectChain,
        finalUrl,
        message: redirectChain.length > 3
          ? `Too many redirects (${redirectChain.length} hops)`
          : redirectChain.length > 0
          ? `Page redirects to ${finalUrl}`
          : "Page is reachable",
      };
    }

    if ([301, 302, 307, 308].includes(httpStatus)) {
      return { status: "warn", httpStatus, responseTimeMs, isRedirect: true, redirectChain, finalUrl, message: `Redirect detected (${httpStatus})` };
    }

    const failMessages: Record<number, string> = {
      403: "Googlebot is blocked (403 Forbidden)",
      404: "Page not found (404)",
      410: "Page permanently deleted (410 Gone)",
      500: "Server error (500)",
      503: "Service unavailable (503)",
    };

    return {
      status: "fail",
      httpStatus,
      responseTimeMs,
      isRedirect,
      redirectChain,
      finalUrl,
      message: failMessages[httpStatus] ?? `HTTP ${httpStatus} — not indexable`,
    };
  } catch (err: any) {
    const responseTimeMs = Date.now() - start;
    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      return { status: "fail", httpStatus: null, responseTimeMs, isRedirect: false, redirectChain, finalUrl: null, message: "Request timed out — server too slow" };
    }
    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
      return { status: "fail", httpStatus: null, responseTimeMs, isRedirect: false, redirectChain, finalUrl: null, message: "DNS resolution failed — domain does not exist" };
    }
    logger.warn({ err: err.message, url }, "HTTP check error");
    return { status: "fail", httpStatus: null, responseTimeMs, isRedirect: false, redirectChain, finalUrl: null, message: `Connection error: ${err.message}` };
  }
}
