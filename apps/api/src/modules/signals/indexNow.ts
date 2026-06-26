import axios from "axios";
import { logger } from "../../utils/logger.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "";
const INDEXNOW_KEY_URL = process.env.INDEXNOW_KEY_URL ?? `${APP_URL}/${INDEXNOW_KEY}.txt`;

export async function indexNow(urls: string[]): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();

  if (!INDEXNOW_KEY || process.env.INDEXNOW_ENABLED === "false") {
    return { success: false, httpCode: 0, summary: "IndexNow not configured or disabled", durationMs: 0 };
  }

  try {
    const appHost = new URL(APP_URL).hostname;
    const resp = await axios.post(
      "https://api.indexnow.org/indexnow",
      {
        host: appHost,
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_URL,
        urlList: urls.slice(0, 10000), // Max 10k per call
      },
      {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    const durationMs = Date.now() - start;
    const success = [200, 202].includes(resp.status);
    const summary = success ? `${urls.length} URL(s) submitted to Bing via IndexNow` : `IndexNow rejected: HTTP ${resp.status}`;

    if (!success) logger.warn({ status: resp.status, body: resp.data }, "IndexNow non-success");

    return { success, httpCode: resp.status, summary, durationMs };
  } catch (err: any) {
    logger.error({ err }, "IndexNow error");
    return { success: false, httpCode: 0, summary: err.message?.slice(0, 500) ?? "Error", durationMs: Date.now() - start };
  }
}
