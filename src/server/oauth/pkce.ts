import { createHash, timingSafeEqual } from "node:crypto";

/**
 * PKCE (RFC 7636) support. Only `S256` is accepted: `plain` transmits the
 * verifier itself on the authorize URL, which defeats the point when the
 * authorization response crosses an intermediary the client does not control.
 */
export function verifyPkceS256(challenge: string, verifier: string): boolean {
  if (!challenge || !verifier) {
    return false;
  }
  // RFC 7636 section 4.1: the verifier is 43-128 characters from an unreserved
  // alphabet. Anything else cannot have been produced by a conforming client.
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) {
    return false;
  }
  const computed = createHash("sha256").update(verifier, "ascii").digest("base64url");
  const expected = Buffer.from(challenge);
  const actual = Buffer.from(computed);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isValidCodeChallenge(challenge: string | undefined): boolean {
  return typeof challenge === "string" && /^[A-Za-z0-9\-_]{43,128}$/.test(challenge);
}
