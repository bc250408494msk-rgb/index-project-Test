import { prisma } from "../../utils/prisma.js";
import { hashUrl, normalizeUrl } from "../../utils/urlNormalizer.js";

export interface SpamFilterResult {
  allowed: boolean;
  reason?: string;
  softBlock?: boolean;
}

export async function spamFilter(url: string, userId: string): Promise<SpamFilterResult> {
  // Check user is active
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, creditsBalance: true } });
  if (!user || !user.isActive) {
    return { allowed: false, reason: "Account is banned or inactive" };
  }

  // Check domain blocklist
  const domain = new URL(url).hostname.toLowerCase();
  const blocked = await prisma.blockedDomain.findFirst({ where: { domain } });
  if (blocked) {
    return { allowed: false, reason: `Domain ${domain} is on the blocked list` };
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since1h = new Date(Date.now() - 60 * 60 * 1000);

  // Check same URL submitted > 3 times in 24h by same user
  const urlHash = hashUrl(normalizeUrl(url));
  const sameUrlCount = await prisma.url.count({
    where: { urlHash, userId, createdAt: { gte: since24h } },
  });
  if (sameUrlCount >= 3) {
    return { allowed: false, reason: "Same URL submitted more than 3 times in 24 hours" };
  }

  // Soft block: same domain > 50 times in 1 hour
  const domainHourCount = await prisma.url.count({
    where: { userId, url: { startsWith: `https://${domain}` }, createdAt: { gte: since1h } },
  });
  if (domainHourCount > 50) {
    return { allowed: true, softBlock: true, reason: `High volume from domain ${domain} — flagged for review` };
  }

  // Soft block: > 1000 URLs from same user in 24h
  const userDayCount = await prisma.url.count({
    where: { userId, createdAt: { gte: since24h } },
  });
  if (userDayCount > 1000) {
    return { allowed: true, softBlock: true, reason: "High daily volume — flagged for review" };
  }

  return { allowed: true };
}

export async function checkDuplicate(url: string, userId: string): Promise<{ isDuplicate: boolean; existingId?: string }> {
  const urlHash = hashUrl(normalizeUrl(url));
  const existing = await prisma.url.findFirst({
    where: {
      urlHash,
      userId,
      status: { notIn: ["not_indexed", "refunded"] },
    },
    select: { id: true },
  });
  return existing ? { isDuplicate: true, existingId: existing.id } : { isDuplicate: false };
}
