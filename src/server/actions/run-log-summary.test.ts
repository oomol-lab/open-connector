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

  it("removes credentials and query data from ordinary URLs", () => {
    expect(summarizeForRunLog({ callbackUrl: "https://user:pass@example.com/callback?code=secret#part" })).toEqual({
      callbackUrl: "https://example.com/callback",
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
});

describe("safeRunLogError", () => {
  it("does not retain provider error messages", () => {
    expect(
      safeRunLogError({ code: "provider_error", message: "provider returned secret-token", details: { raw: true } }),
    ).toEqual({ errorCode: "provider_error", errorMessage: "The provider request failed." });
  });
});
