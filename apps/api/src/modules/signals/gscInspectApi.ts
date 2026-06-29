import axios from "axios";
import { getGoogleAccessToken } from "../../utils/googleAuth.js";

/**
 * Build the candidate `siteUrl` values to try against the Search Console
 * URL Inspection API. A property can be registered as either:
 *   - URL-prefix:  https://example.com/
 *   - Domain:      sc-domain:example.com
 * We don't know which the user created, so we try both (plus the registrable
 * domain for subdomains) and use whichever the account actually owns.
 */
export function siteUrlCandidates(url: string): string[] {
  const u = new URL(url);
  const origin = u.origin + "/";
  const host = u.hostname;
  const labels = host.split(".");
  const candidates = [origin, `sc-domain:${host}`];
  if (labels.length > 2) {
    candidates.push(`sc-domain:${labels.slice(-2).join(".")}`);
  }
  return [...new Set(candidates)];
}

export interface InspectResult {
  status: number;
  data: any;
  siteUrl: string;
}

/**
 * Calls the GSC URL Inspection API, trying each candidate property format and
 * returning the first 200 response (or the last non-200 if none succeed).
 */
export async function inspectUrlIndex(url: string): Promise<InspectResult> {
  const token = await getGoogleAccessToken();
  const candidates = siteUrlCandidates(url);

  let last: InspectResult = { status: 0, data: null, siteUrl: candidates[0] };
  for (const siteUrl of candidates) {
    const resp = await axios.post(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      { inspectionUrl: url, siteUrl },
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    last = { status: resp.status, data: resp.data, siteUrl };
    if (resp.status === 200) return last;
  }
  return last;
}
