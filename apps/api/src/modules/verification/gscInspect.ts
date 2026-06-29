import axios from "axios";
import { getGoogleAccessToken } from "../../utils/googleAuth.js";
import { cacheGet, cacheSet } from "../../utils/redis.js";
import { hashUrl } from "../../utils/urlNormalizer.js";
import { logger } from "../../utils/logger.js";

/**
 * Verify whether a URL is indexed using the Google Search Console
 * URL Inspection API. This is the authoritative source — it reads Google's
 * real index status. Requires:
 *   - GOOGLE_SERVICE_ACCOUNT_JSON to be set
 *   - the URL's domain to be a verified property in Search Console, with the
 *     service-account email added as an owner.
 */
export async function gscInspectCheck(url: string): Promise<{ isIndexed: boolean; rawResponse: any }> {
  const cacheKey = `verify:gsc:${hashUrl(url)}`;
  const cached = await cacheGet<{ isIndexed: boolean; rawResponse: any }>(cacheKey);
  if (cached !== null) return cached;

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

    if (resp.status !== 200) {
      logger.warn({ url, status: resp.status, body: resp.data }, "GSC inspect (verify) non-200");
      return {
        isIndexed: false,
        rawResponse: { via: "gsc_inspect", error: resp.data?.error?.message ?? `HTTP ${resp.status}`, status: resp.status },
      };
    }

    const indexStatus = resp.data?.inspectionResult?.indexStatusResult ?? {};
    const verdict = indexStatus.verdict ?? "VERDICT_UNSPECIFIED";
    const coverageState = indexStatus.coverageState ?? "unknown";

    // verdict === "PASS" is Google's authoritative "this URL is indexed" signal.
    const isIndexed = verdict === "PASS";

    const result = { isIndexed, rawResponse: { via: "gsc_inspect", verdict, coverageState } };
    await cacheSet(cacheKey, result, 20 * 3600); // 20h cache
    return result;
  } catch (err: any) {
    logger.warn({ err, url }, "GSC inspect (verify) failed");
    return { isIndexed: false, rawResponse: { via: "gsc_inspect", error: err.message ?? "API call failed" } };
  }
}
