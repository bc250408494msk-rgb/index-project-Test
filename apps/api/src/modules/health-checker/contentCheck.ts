export interface ContentCheckResult {
  status: "pass" | "warn" | "fail";
  sizeKb: number;
  hasHtml: boolean;
  hasContent: boolean;
  message: string;
}

export function contentCheck(content: string, contentType: string): ContentCheckResult {
  const sizeKb = Math.round(Buffer.byteLength(content, "utf8") / 1024);

  if (!contentType.includes("text/html")) {
    return { status: "fail", sizeKb, hasHtml: false, hasContent: false, message: `Non-HTML content type: ${contentType}` };
  }

  if (!content || content.trim().length === 0) {
    return { status: "fail", sizeKb: 0, hasHtml: false, hasContent: false, message: "Empty body — blank page" };
  }

  if (sizeKb > 15360) { // 15MB
    return { status: "fail", sizeKb, hasHtml: true, hasContent: true, message: "Page is too large (> 15MB) — Google may not fully index it" };
  }

  const hasHtml = /<html[\s>]/i.test(content);
  if (!hasHtml) {
    return { status: "warn", sizeKb, hasHtml: false, hasContent: true, message: "Page does not contain <html> tag" };
  }

  if (sizeKb < 1) {
    return { status: "warn", sizeKb, hasHtml: true, hasContent: false, message: "Page is very small (< 1KB) — likely a placeholder" };
  }

  return { status: "pass", sizeKb, hasHtml: true, hasContent: true, message: `${sizeKb}KB, valid HTML` };
}
