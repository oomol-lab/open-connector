import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

/** Maximum UTF-8 byte length accepted for an HTTP idempotency key. */
export const idempotencyKeyMaxBytes = 255;

/** Fixed retention window for action idempotency claims and responses. */
export const idempotencyRetentionHours = 24;
const retentionMs = idempotencyRetentionHours * 60 * 60 * 1000;

export type IdempotencyKeyResult = { ok: true; key: string | undefined } | { ok: false; message: string };

/** Action request semantics covered by one idempotency-key fingerprint. */
export interface ActionRequestFingerprintInput {
  actionId: string;
  connectionName: string;
  input: unknown;
}

/**
 * Read the optional HTTP idempotency key using the runtime's fixed public limit.
 */
export function readIdempotencyKey(value: string | undefined): IdempotencyKeyResult {
  if (value === undefined) {
    return { ok: true, key: undefined };
  }

  const key = value.trim();
  if (!key) {
    return { ok: false, message: "Idempotency-Key must not be empty." };
  }
  if (Buffer.byteLength(key, "utf8") > idempotencyKeyMaxBytes) {
    return { ok: false, message: `Idempotency-Key must not exceed ${idempotencyKeyMaxBytes} bytes.` };
  }

  return { ok: true, key };
}

/**
 * Hash an idempotency key before it crosses the runtime storage boundary.
 */
export function hashIdempotencyKey(key: string): string {
  return sha256(key);
}

/**
 * Hash the action semantics that must remain identical when a key is reused.
 */
export function hashActionRequest(input: ActionRequestFingerprintInput): string {
  return sha256(
    JSON.stringify(
      canonicalize({
        actionId: input.actionId,
        connectionName: input.connectionName,
        input: input.input,
      }),
    ),
  );
}

/**
 * Return the fixed expiry used by the first version of HTTP action idempotency.
 */
export function createIdempotencyExpiry(now: Date): string {
  return new Date(now.getTime() + retentionMs).toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
