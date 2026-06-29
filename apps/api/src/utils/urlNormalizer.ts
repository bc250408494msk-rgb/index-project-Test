import { createHash } from "crypto";

export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    u.hostname = u.hostname.toLowerCase();
    // Remove trailing slash from pathname (except root)
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    // Sort query params so ?b=2&a=1 and ?a=1&b=2 produce the same hash
    u.searchParams.sort();
    return u.toString();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function hashUrl(normalizedUrl: string): string {
  return createHash("sha256").update(normalizedUrl).digest("hex");
}

const PRIVATE_IP_RANGES = [
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,        // link-local / APIPA — AWS/GCP/Azure metadata (169.254.169.254)
  /^100\.6[4-9]\.\d+\.\d+$/,     // carrier-grade NAT RFC 6598 (100.64.0.0/10)
  /^100\.[7-9]\d\.\d+\.\d+$/,
  /^100\.1[01]\d\.\d+\.\d+$/,
  /^100\.12[0-7]\.\d+\.\d+$/,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^::ffff:169\.254\./i,          // IPv4-mapped IPv6 form of link-local
  /^::ffff:a9fe:/i,               // same in hex
];

const RESERVED_HOSTS = ["localhost", "0.0.0.0", "255.255.255.255"];
const RESERVED_TLDS = [".local", ".internal", ".test", ".localhost", ".invalid", ".example", ".corp"];

export function validateUrlFormat(rawUrl: string): { valid: boolean; reason?: string } {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: "Not a valid URL format" };
  }

  if (!["http:", "https:"].includes(u.protocol)) {
    return { valid: false, reason: "URL must use http:// or https://" };
  }

  if (rawUrl.length > 2048) {
    return { valid: false, reason: "URL exceeds 2048 characters" };
  }

  // Null bytes or control chars
  if (/[\x00-\x1F\x7F]/.test(rawUrl)) {
    return { valid: false, reason: "URL contains invalid control characters" };
  }

  const host = u.hostname.toLowerCase();

  if (RESERVED_HOSTS.includes(host)) {
    return { valid: false, reason: "URL points to a reserved/local host" };
  }

  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(host)) {
      return { valid: false, reason: "URL points to a private IP address" };
    }
  }

  for (const tld of RESERVED_TLDS) {
    if (host.endsWith(tld)) {
      return { valid: false, reason: `URL uses reserved TLD (${tld})` };
    }
  }

  // Must have a TLD (at least one dot after the first char)
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) {
    return { valid: false, reason: "Domain has no valid TLD" };
  }

  return { valid: true };
}
