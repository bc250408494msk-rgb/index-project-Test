import * as cheerio from "cheerio";

export interface CanonicalCheckResult {
  status: "pass" | "warn" | "fail";
  canonicalUrl: string | null;
  mismatch: boolean;
  message: string;
}

function normalizeForComparison(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function canonicalCheck(submittedUrl: string, htmlContent: string): CanonicalCheckResult {
  const $ = cheerio.load(htmlContent);
  const canonicalEl = $('link[rel="canonical"]');

  if (!canonicalEl.length) {
    return { status: "pass", canonicalUrl: null, mismatch: false, message: "No canonical tag found — page is self-canonical" };
  }

  const canonicalUrl = canonicalEl.first().attr("href") ?? null;
  if (!canonicalUrl) {
    return { status: "pass", canonicalUrl: null, mismatch: false, message: "Canonical tag found but href is empty" };
  }

  // Resolve relative canonicals
  let resolvedCanonical = canonicalUrl;
  try {
    resolvedCanonical = new URL(canonicalUrl, submittedUrl).toString();
  } catch {
    // Keep as-is
  }

  const normalizedSubmitted = normalizeForComparison(submittedUrl);
  const normalizedCanonical = normalizeForComparison(resolvedCanonical);

  if (normalizedSubmitted === normalizedCanonical) {
    return { status: "pass", canonicalUrl: resolvedCanonical, mismatch: false, message: "Canonical matches submitted URL" };
  }

  // Check if same URL just minor diff (trailing slash, etc.)
  const submittedHost = new URL(submittedUrl).hostname;
  try {
    const canonicalHost = new URL(resolvedCanonical).hostname;
    if (submittedHost !== canonicalHost) {
      return { status: "fail", canonicalUrl: resolvedCanonical, mismatch: true, message: `Canonical points to a different domain: ${canonicalHost}` };
    }
  } catch {
    return { status: "warn", canonicalUrl: resolvedCanonical, mismatch: true, message: `Canonical URL could not be parsed: ${canonicalUrl}` };
  }

  return { status: "warn", canonicalUrl: resolvedCanonical, mismatch: true, message: `Canonical points to a different URL: ${resolvedCanonical}` };
}
