import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidCodeChallenge, verifyPkceS256 } from "./pkce.ts";

// RFC 7636 appendix B test vector.
const rfcVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const rfcChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("verifyPkceS256", () => {
  it("accepts the RFC 7636 appendix B vector", () => {
    expect(verifyPkceS256(rfcChallenge, rfcVerifier)).toBe(true);
  });

  it("rejects a wrong verifier", () => {
    const other = createHash("sha256").update("different").digest("base64url");
    expect(verifyPkceS256(other, rfcVerifier)).toBe(false);
  });

  it("rejects the plain scheme by never matching a non-S256 challenge", () => {
    expect(verifyPkceS256(rfcVerifier, rfcVerifier)).toBe(false);
  });

  it("rejects verifiers outside the RFC length and alphabet", () => {
    expect(verifyPkceS256(rfcChallenge, "short")).toBe(false);
    expect(verifyPkceS256(rfcChallenge, `${"a".repeat(43)}&invalid`)).toBe(false);
    expect(verifyPkceS256(rfcChallenge, "")).toBe(false);
    expect(verifyPkceS256("", rfcVerifier)).toBe(false);
  });

  it("rejects a verifier at the 43-128 boundary violations", () => {
    const exact43 = "a".repeat(43);
    const challenge43 = createHash("sha256").update(exact43, "ascii").digest("base64url");
    expect(verifyPkceS256(challenge43, exact43)).toBe(true);
    const tooLong = "a".repeat(129);
    expect(verifyPkceS256(createHash("sha256").update(tooLong).digest("base64url"), tooLong)).toBe(false);
  });
});

describe("isValidCodeChallenge", () => {
  it("accepts base64url challenges of 43-128 characters", () => {
    expect(isValidCodeChallenge(rfcChallenge)).toBe(true);
    expect(isValidCodeChallenge("a".repeat(43))).toBe(true);
    expect(isValidCodeChallenge("a".repeat(42))).toBe(false);
    expect(isValidCodeChallenge(undefined)).toBe(false);
    expect(isValidCodeChallenge("has+plus")).toBe(false);
  });
});
