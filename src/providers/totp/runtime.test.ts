import { describe, expect, it } from "vitest";
import { generateTotpCode, readTotpCredential } from "./runtime.ts";

describe("TOTP runtime", () => {
  it.each([
    [59_000, "287082"],
    [1_111_111_109_000, "081804"],
    [1_111_111_111_000, "050471"],
    [1_234_567_890_000, "005924"],
    [2_000_000_000_000, "279037"],
    [20_000_000_000_000, "353130"],
  ])("generates the RFC 6238 SHA-1 code at %i milliseconds", async (timestampMs, expectedCode) => {
    const result = await generateTotpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", timestampMs);

    expect(result.code).toBe(expectedCode);
  });

  it("returns the code expiry and remaining lifetime", async () => {
    await expect(generateTotpCode("JBSW Y3DP-EHPK3PXP", 31_250)).resolves.toEqual({
      code: "996554",
      expiresAt: "1970-01-01T00:01:00.000Z",
      remainingSeconds: 29,
    });
  });

  it("validates the website, username, and secret without exposing the secret in errors", () => {
    expect(() =>
      readTotpCredential({ website: "https://example.com/login", username: "alice", secret: "not-a-secret!" }),
    ).toThrow("secret must be a valid Base32-encoded TOTP secret");
    expect(() =>
      readTotpCredential({ website: "javascript:alert(1)", username: "alice", secret: "JBSWY3DPEHPK3PXP" }),
    ).toThrow("website must be a valid HTTP or HTTPS URL");
  });

  it("rejects website URLs containing userinfo credentials", () => {
    expect(() =>
      readTotpCredential({
        website: "https://user:password@example.com/login",
        username: "alice",
        secret: "JBSWY3DPEHPK3PXP",
      }),
    ).toThrow(
      expect.objectContaining({
        status: 400,
        message: "website must be a valid HTTP or HTTPS URL",
      }),
    );
  });
});
