import { inspectUrlIndex } from "./gscInspectApi.js";
import { logger } from "../../utils/logger.js";

export async function gscUrlInspect(url: string): Promise<{ success: boolean; httpCode: number; summary: string; durationMs: number }> {
  const start = Date.now();
  try {
    const { status, data, siteUrl } = await inspectUrlIndex(url);

    const durationMs = Date.now() - start;
    const success = status === 200;
    const verdict = data?.inspectionResult?.indexStatusResult?.verdict ?? "UNKNOWN";
    const summary = success ? `GSC inspection (${siteUrl}): ${verdict}` : (data?.error?.message ?? `HTTP ${status}`);

    if (!success) logger.warn({ url, status, siteUrl }, "GSC URL Inspect non-200");

    return { success, httpCode: status, summary: summary.slice(0, 500), durationMs };
  } catch (err: any) {
    return { success: false, httpCode: 0, summary: err.message?.slice(0, 500) ?? "Unknown error", durationMs: Date.now() - start };
  }
}
