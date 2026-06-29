import axios from "axios";
import { logger } from "../../utils/logger.js";

const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "";
// Optional override. When unset, the key file is assumed to live at the root of
// each submitted URL's own host: https://<host>/<key>.txt — which is what the
// IndexNow protocol requires (the key file must be on the same host as the URLs).
const INDEXNOW_KEY_URL = process.env.INDEXNOW_KEY_URL ?? "";

export async function indexNow(urls: string[]): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();

  if (!INDEXNOW_KEY || process.env.INDEXNOW_ENABLED === "false") {
    return { success: false, httpCode: 0, summary: "IndexNow not configured or disabled", durationMs: 0 };
  }

  // IndexNow requires every URL in a single request to share the same host, and
  // the key file must live on that host. Group the batch by host and submit one
  // request per host.
  const byHost = new Map<string, string[]>();
  for (const u of urls) {
    try {
      const host = new URL(u).hostname;
      (byHost.get(host) ?? byHost.set(host, []).get(host)!).push(u);
    } catch {
      // skip malformed URLs
    }
  }

  if (byHost.size === 0) {
    return { success: false, httpCode: 0, summary: "No valid URLs to submit", durationMs: Date.now() - start };
  }

  let anySuccess = false;
  let lastCode = 0;
  const parts: string[] = [];

  for (const [host, hostUrls] of byHost) {
    try {
      const keyLocation = INDEXNOW_KEY_URL || `https://${host}/${INDEXNOW_KEY}.txt`;
      const resp = await axios.post(
        "https://api.indexnow.org/indexnow",
        {
          host,
          key: INDEXNOW_KEY,
          keyLocation,
          urlList: hostUrls.slice(0, 10000), // Max 10k per call
        },
        {
          headers: { "Content-Type": "application/json; charset=utf-8" },
          timeout: 15000,
          validateStatus: () => true,
        }
      );

      lastCode = resp.status;
      const ok = [200, 202].includes(resp.status);
      if (ok) {
        anySuccess = true;
        parts.push(`${hostUrls.length} URL(s) on ${host}`);
      } else {
        parts.push(`${host}: HTTP ${resp.status}`);
        logger.warn({ status: resp.status, body: resp.data, host }, "IndexNow non-success");
      }
    } catch (err: any) {
      logger.error({ err, host }, "IndexNow error");
      parts.push(`${host}: ${err.message?.slice(0, 120) ?? "error"}`);
    }
  }

  const durationMs = Date.now() - start;
  const summary = anySuccess
    ? `Submitted to Bing via IndexNow — ${parts.join("; ")}`
    : `IndexNow failed — ${parts.join("; ")}`;

  return { success: anySuccess, httpCode: lastCode, summary, durationMs };
}
