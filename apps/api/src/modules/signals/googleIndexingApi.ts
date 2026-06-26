import axios from "axios";
import { getGoogleAccessToken } from "../../utils/googleAuth.js";
import { logger } from "../../utils/logger.js";

export async function googleIndexingApi(url: string): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();
  try {
    const token = await getGoogleAccessToken();
    const resp = await axios.post(
      "https://indexing.googleapis.com/v3/urlNotifications:publish",
      { url, type: "URL_UPDATED" },
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    const durationMs = Date.now() - start;
    const success = resp.status === 200;
    const summary = success
      ? "URL_UPDATED notification published"
      : (resp.data?.error?.message ?? `HTTP ${resp.status}`);

    if (!success) logger.warn({ url, status: resp.status, body: resp.data }, "Google Indexing API non-200");

    return { success, httpCode: resp.status, summary: summary.slice(0, 500), durationMs };
  } catch (err: any) {
    return { success: false, httpCode: 0, summary: err.message?.slice(0, 500) ?? "Unknown error", durationMs: Date.now() - start };
  }
}
