import axios from "axios";
import { cacheGet, cacheSet } from "../../utils/redis.js";
import { hashUrl } from "../../utils/urlNormalizer.js";
import { logger } from "../../utils/logger.js";

export async function isIndexedApiCheck(url: string, force = false): Promise<{ isIndexed: boolean; rawResponse: any }> {
  const cacheKey = `verify:isindexed:${hashUrl(url)}`;
  if (!force) {
    const cached = await cacheGet<{ isIndexed: boolean; rawResponse: any }>(cacheKey);
    if (cached !== null) return cached;
  }

  try {
    const resp = await axios.get("https://api.isindexed.com/v1/check", {
      params: { url, apikey: process.env.ISINDEXED_API_KEY },
      timeout: 10000,
      validateStatus: () => true,
    });

    const isIndexed = resp.data?.indexed === true;
    const result = { isIndexed, rawResponse: resp.data };

    await cacheSet(cacheKey, result, 20 * 3600); // 20h cache
    return result;
  } catch (err) {
    logger.warn({ err, url }, "isindexed.com check failed");
    return { isIndexed: false, rawResponse: { error: "API call failed" } };
  }
}
