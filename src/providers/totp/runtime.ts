import { requiredString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const totpDigits = 6;
export const totpPeriodSeconds = 30;

export interface TotpCredential {
  secret: string;
  username: string;
  website: string;
  websiteUrl: URL;
}

export interface TotpCode {
  code: string;
  expiresAt: string;
  remainingSeconds: number;
}

/**
 * Validate and normalize the three fields stored for a TOTP connection.
 */
export function readTotpCredential(values: Record<string, string>): TotpCredential {
  const createError = (message: string): ProviderRequestError => new ProviderRequestError(400, message);
  const website = requiredString(values.website, "website", createError);
  const username = requiredString(values.username, "username", createError);
  const secret = requiredString(values.secret, "secret", createError);
  const websiteUrl = parseWebsiteUrl(website);
  decodeBase32Secret(secret);
  return { website, username, secret, websiteUrl };
}

/**
 * Generate an RFC 6238 SHA-1 TOTP value for a Unix timestamp in milliseconds.
 */
export async function generateTotpCode(secret: string, timestampMs: number = Date.now()): Promise<TotpCode> {
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    throw new ProviderRequestError(400, "timestamp must be a non-negative finite number");
  }

  const counter = Math.floor(timestampMs / 1000 / totpPeriodSeconds);
  const counterBytes = new ArrayBuffer(8);
  new DataView(counterBytes).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey("raw", decodeBase32Secret(secret), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = digest[digest.length - 1]! & 0x0f;
  const binaryCode =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  const code = String(binaryCode % 10 ** totpDigits).padStart(totpDigits, "0");
  const expiresAtMs = (counter + 1) * totpPeriodSeconds * 1000;

  return {
    code,
    expiresAt: new Date(expiresAtMs).toISOString(),
    remainingSeconds: Math.max(1, Math.ceil((expiresAtMs - timestampMs) / 1000)),
  };
}

function decodeBase32Secret(input: string): ArrayBuffer {
  const normalized = input.toUpperCase().replace(/[\s-]+/gu, "");
  if (!/^[A-Z2-7]+=*$/u.test(normalized)) {
    throw invalidSecretError();
  }

  const unpadded = normalized.replace(/=+$/u, "");
  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (const character of unpadded) {
    bitBuffer = (bitBuffer << 5) | base32Alphabet.indexOf(character);
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bitBuffer >>> bitCount) & 0xff);
      bitBuffer &= (1 << bitCount) - 1;
    }
  }

  if (bytes.length === 0 || (bitCount > 0 && (bitBuffer & ((1 << bitCount) - 1)) !== 0)) {
    throw invalidSecretError();
  }
  const decoded = new Uint8Array(bytes.length);
  decoded.set(bytes);
  return decoded.buffer;
}

function parseWebsiteUrl(website: string): URL {
  try {
    const url = new URL(website);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname) {
      return url;
    }
  } catch {
    // Use the stable validation error below.
  }
  throw new ProviderRequestError(400, "website must be a valid HTTP or HTTPS URL");
}

function invalidSecretError(): ProviderRequestError {
  return new ProviderRequestError(400, "secret must be a valid Base32-encoded TOTP secret");
}
