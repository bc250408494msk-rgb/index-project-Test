import axios from "axios";
import { getGoogleAccessToken } from "../../utils/googleAuth.js";
import { logger } from "../../utils/logger.js";

export async function gscUrlInspect(url: string): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();
  try {
    const siteUrl = new URL(url).origin + "/";
    const token = await getGoogleAccessToken();

    const resp = await axios.post(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      { inspectionUrl: url, siteUrl },
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    const durationMs = Date.now() - start;
    const success = resp.status === 200;
    const inspectionResult = resp.data?.inspectionResult?.indexStatusResult?.verdict ?? "UNKNOWN";
    const summary = success ? `GSC inspection result: ${inspectionResult}` : (resp.data?.error?.message ?? `HTTP ${resp.status}`);

    if (!success) logger.warn({ url, status: resp.status }, "GSC URL Inspect non-200");

    return { success, httpCode: resp.status, summary: summary.slice(0, 500), durationMs };
  } catch (err: any) {
    return { success: false, httpCode: 0, summary: err.message?.slice(0, 500) ?? "Unknown error", durationMs: Date.now() - start };
  }
}
