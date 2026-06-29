import { prisma } from "../../utils/prisma.js";
import { googleCseCheck } from "./googleCse.js";
import { isIndexedApiCheck } from "./isIndexedApi.js";
import { gscInspectCheck } from "./gscInspect.js";
import { logger } from "../../utils/logger.js";

const DOUBLE_VERIFY = process.env.DOUBLE_VERIFY_INDEXED !== "false";
const VERIFICATION_METHOD = process.env.VERIFICATION_METHOD ?? "isindexed";

export async function verifyUrl(urlId: string, url: string): Promise<{ isIndexed: boolean; method: string }> {
  let isIndexed = false;
  let method = VERIFICATION_METHOD;
  let rawResponse: any = {};

  try {
    if (VERIFICATION_METHOD === "gsc") {
      // Google Search Console URL Inspection — authoritative index status.
      // Stored under the "manual" method enum (rawResponse marks via=gsc_inspect)
      // to avoid a DB enum migration.
      const result = await gscInspectCheck(url);
      isIndexed = result.isIndexed;
      rawResponse = result.rawResponse;
      method = "manual";
    } else if (VERIFICATION_METHOD === "google_cse") {
      const result = await googleCseCheck(url);
      isIndexed = result.isIndexed;
      rawResponse = result.rawResponse;
      method = "google_cse";
    } else {
      const result = await isIndexedApiCheck(url);
      isIndexed = result.isIndexed;
      rawResponse = result.rawResponse;
      method = "isindexed_api";
    }
  } catch (err) {
    logger.error({ err, urlId }, "Verification check failed");
  }

  await prisma.verificationCheck.create({
    data: {
      urlId,
      method: method as any,
      isIndexed,
      rawResponse,
    },
  });

  // Double-verify: need 2 consecutive positives
  if (isIndexed && DOUBLE_VERIFY) {
    const recentChecks = await prisma.verificationCheck.findMany({
      where: { urlId },
      orderBy: { checkedAt: "desc" },
      take: 2,
    });

    const consecutivePositives = recentChecks.length >= 2 && recentChecks.every((c) => c.isIndexed);
    if (!consecutivePositives) {
      logger.info({ urlId }, "First positive verification — waiting for confirmation");
      return { isIndexed: false, method }; // Don't mark as indexed yet
    }
  }

  await prisma.url.update({
    where: { id: urlId },
    data: {
      checkCount: { increment: 1 },
      lastCheckAt: new Date(),
      ...(isIndexed ? { status: "indexed", indexedAt: new Date() } : {}),
    },
  });

  return { isIndexed, method };
}
