import { describe, expect, it } from "vitest";
import { safeRunLogError, summarizeForRunLog } from "./run-log-summary.ts";

describe("summarizeForRunLog", () => {
  it("redacts credentials by path, value pattern, and URL", () => {
    expect(
      summarizeForRunLog({
        cookies: [{ name: "session", value: "cookie-secret" }],
        headers: { authorization: "Basic dXNlcjpwYXNz" },
        accessKey: "access-secret",
        token: "abc.def.ghi",
        temporaryUrl: "https://user:pass@example.com/file?token=secret#fragment",
      }),
    ).toEqual({
      cookies: "[redacted]",
      headers: "[redacted]",
      accessKey: "[redacted]",
      token: "[redacted]",
      temporaryUrl: "[redacted-url]",
    });
  });

  it("redacts HTTP authorization schemes case-insensitively", () => {
    expect(
      summarizeForRunLog({
        lowerBearer: "bearer secret-token",
        mixedBasic: "bAsIc dXNlcjpwYXNz",
      }),
    ).toEqual({
      lowerBearer: "[redacted]",
      mixedBasic: "[redacted]",
    });
  });

  it("keeps only the origin of ordinary URLs", () => {
    expect(summarizeForRunLog({ homepageUrl: "https://user:pass@example.com/public/path?view=full#part" })).toEqual({
      homepageUrl: "https://example.com",
    });
  });

  it("redacts sensitive URL contexts and removes path credentials from generic URLs", () => {
    expect(
      summarizeForRunLog({
        url: "https://hooks.slack.com/services/T000/B000/SECRET",
        webhook: { url: "https://example.com/hooks/SECRET" },
        callbackUrl: "https://example.com/callback/SECRET",
        downloadUrl: "https://example.com/files/SECRET",
      }),
    ).toEqual({
      url: "https://hooks.slack.com",
      webhook: { url: "[redacted-url]" },
      callbackUrl: "[redacted-url]",
      downloadUrl: "[redacted-url]",
    });
  });

  it("does not invoke accessors and survives proxies", () => {
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        throw new Error("secret-in-getter");
      },
    });
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("secret-in-proxy");
        },
      },
    );

    expect(summarizeForRunLog(accessor)).toEqual({ value: "[unavailable]" });
    expect(summarizeForRunLog(proxy)).toBe("[unavailable]");
  });

  it("bounds wide summaries", () => {
    const summary = summarizeForRunLog(
      Object.fromEntries(Array.from({ length: 1_000 }, (_, index) => [`field${index}`, "x".repeat(1_000)])),
    );

    expect(new TextEncoder().encode(JSON.stringify(summary)).byteLength).toBeLessThanOrEqual(16 * 1024);
  });

  it("does not enumerate large typed arrays", () => {
    expect(summarizeForRunLog(new Uint8Array(1_000_000))).toBe("[unavailable]");
  });

  it("keeps summarizing the rest of the value when a URL-like string cannot be parsed", () => {
    expect(
      summarizeForRunLog({
        url: "https://",
        items: ["https://ok.example/x", "http://exa mple.com/y"],
      }),
    ).toEqual({
      url: "https://",
      items: ["https://ok.example", "http://exa mple.com/y"],
    });
  });

  it("redacts unparseable URL-like strings in sensitive contexts", () => {
    expect(
      summarizeForRunLog({
        webhook: { url: "https://hooks.slack.com/services/T000/B000/ SECRET" },
        downloadUrl: "https://",
      }),
    ).toEqual({
      webhook: { url: "[redacted-url]" },
      downloadUrl: "[redacted-url]",
    });
  });

  it("truncates long unparseable URL-like strings", () => {
    const long = `https://exa mple.com/${"a".repeat(300)}`;
    expect(summarizeForRunLog({ url: long })).toEqual({ url: `${long.slice(0, 256)}[truncated]` });
  });

  it("redacts unparseable URL-like strings with sensitive raw query keys", () => {
    expect(
      summarizeForRunLog({
        url: "https://exa mple.com/?token=abc",
        items: ["https://?api_key=SECRET", "https://exa mple.com/?safe=1"],
      }),
    ).toEqual({
      url: "[redacted-url]",
      items: ["[redacted-url]", "https://exa mple.com/?safe=1"],
    });
  });
});

describe("safeRunLogError", () => {
  it("does not retain provider error messages", () => {
    expect(
      safeRunLogError({ code: "provider_error", message: "provider returned secret-token", details: { raw: true } }),
    ).toEqual({ errorCode: "provider_error", errorMessage: "The provider request failed." });
  });
});
