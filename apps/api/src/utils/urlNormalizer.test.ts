import { describe, it, expect } from "vitest";
import { normalizeUrl, hashUrl, validateUrlFormat } from "./urlNormalizer.js";

describe("normalizeUrl", () => {
  it("lowercases the hostname", () => {
    expect(normalizeUrl("https://EXAMPLE.COM/path")).toBe("https://example.com/path");
  });

  it("strips trailing slash from non-root paths", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe("https://example.com/page");
  });

  it("keeps the root slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("sorts query parameters so order doesn't matter", () => {
    const a = normalizeUrl("https://example.com/p?b=2&a=1");
    const b = normalizeUrl("https://example.com/p?a=1&b=2");
    expect(a).toBe(b);
  });

  it("produces the same URL for equivalent inputs", () => {
    expect(normalizeUrl("https://EXAMPLE.COM/Page/?b=2&a=1")).toBe(
      normalizeUrl("https://example.com/Page/?a=1&b=2")
    );
  });

  it("handles malformed URLs gracefully", () => {
    const result = normalizeUrl("not-a-url");
    expect(typeof result).toBe("string");
  });
});

describe("hashUrl", () => {
  it("returns a 64-char hex SHA-256 hash", () => {
    const hash = hashUrl("https://example.com/page");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces identical hashes for identical inputs", () => {
    const url = "https://example.com/page";
    expect(hashUrl(url)).toBe(hashUrl(url));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashUrl("https://example.com/a")).not.toBe(hashUrl("https://example.com/b"));
  });

  it("does not re-normalize — caller must pass already-normalized URL", () => {
    // If hashUrl re-normalized, these would be equal. They must not be.
    const raw = "https://EXAMPLE.COM/page";
    const normalized = normalizeUrl(raw);
    expect(hashUrl(raw)).not.toBe(hashUrl(normalized));
  });
});

describe("validateUrlFormat", () => {
  it("accepts a valid https URL", () => {
    expect(validateUrlFormat("https://example.com/page").valid).toBe(true);
  });

  it("accepts a valid http URL", () => {
    expect(validateUrlFormat("http://example.com").valid).toBe(true);
  });

  it("rejects ftp:// protocol", () => {
    const r = validateUrlFormat("ftp://example.com");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/http/i);
  });

  it("rejects localhost", () => {
    const r = validateUrlFormat("https://localhost/admin");
    expect(r.valid).toBe(false);
  });

  it("rejects private 192.168.x.x addresses", () => {
    const r = validateUrlFormat("https://192.168.1.1/page");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/private/i);
  });

  it("rejects private 10.x.x.x addresses", () => {
    expect(validateUrlFormat("https://10.0.0.1/page").valid).toBe(false);
  });

  it("rejects private 172.16.x.x addresses", () => {
    expect(validateUrlFormat("https://172.16.0.1/page").valid).toBe(false);
  });

  it("rejects loopback 127.0.0.1", () => {
    expect(validateUrlFormat("https://127.0.0.1/page").valid).toBe(false);
  });

  it("rejects .local TLD", () => {
    expect(validateUrlFormat("https://myserver.local/page").valid).toBe(false);
  });

  it("rejects .internal TLD", () => {
    expect(validateUrlFormat("https://api.internal/page").valid).toBe(false);
  });

  it("rejects URLs over 2048 chars", () => {
    const long = "https://example.com/" + "a".repeat(2050);
    expect(validateUrlFormat(long).valid).toBe(false);
  });

  it("rejects URLs with null bytes", () => {
    expect(validateUrlFormat("https://example.com/\x00page").valid).toBe(false);
  });

  it("rejects bare hostnames with no TLD", () => {
    expect(validateUrlFormat("https://intranet/page").valid).toBe(false);
  });
});
