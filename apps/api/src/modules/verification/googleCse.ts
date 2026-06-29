import axios from "axios";
import { cacheGet, cacheSet } from "../../utils/redis.js";
import { hashUrl } from "../../utils/urlNormalizer.js";
import { logger } from "../../utils/logger.js";

export async function googleCseCheck(url: string, force = false): Promise<{ isIndexed: boolean; rawResponse: any }> {
  const cacheKey = `verify:cse:${hashUrl(url)}`;
  if (!force) {
    const cached = await cacheGet<{ isIndexed: boolean; rawResponse: any }>(cacheKey);
    if (cached !== null) return cached;
  }

  try {
    const resp = await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: {
        key: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
        cx: process.env.GOOGLE_CUSTOM_SEARCH_CX,
        q: `site:${url}`,
        num: 1,
      },
      timeout: 10000,
      validateStatus: () => true,
    });

    const totalResults = parseInt(resp.data?.searchInformation?.totalResults ?? "0", 10);
    const isIndexed = totalResults > 0;
    const result = { isIndexed, rawResponse: { totalResults, status: resp.status } };

    await cacheSet(cacheKey, result, 20 * 3600); // 20h cache
    return result;
  } catch (err) {
    logger.warn({ err, url }, "Google CSE check failed");
    return { isIndexed: false, rawResponse: { error: "API call failed" } };
  }
}
