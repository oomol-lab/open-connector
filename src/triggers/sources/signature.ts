export async function verifySourceHmac(
  bytes: Uint8Array,
  signature: string,
  secret: string,
  hash: "SHA-1" | "SHA-256" = "SHA-256",
): Promise<boolean> {
  const length = hash === "SHA-1" ? 40 : 64;
  if (signature.length !== length || !/^[0-9a-f]+$/.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash }, false, [
    "verify",
  ]);
  const supplied = Uint8Array.from(signature.match(/../g)!, (value) => Number.parseInt(value, 16));
  return crypto.subtle.verify("HMAC", key, supplied, bytes.slice());
}
