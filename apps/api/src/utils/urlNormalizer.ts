import { createHash } from "crypto";

export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    u.hostname = u.hostname.toLowerCase();
    // Remove trailing slash from pathname (except root)
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    // Decode encoded chars and re-encode consistently
    u.search = u.search;
    return u.toString();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function hashUrl(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

const PRIVATE_IP_RANGES = [
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
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
