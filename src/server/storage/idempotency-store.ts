import type { RuntimeActionHttpResult } from "../api/runtime-api.ts";

/** Values required to atomically claim one runtime-wide idempotency key. */
export interface IdempotencyClaimInput {
  keyHash: string;
  requestHash: string;
  claimId: string;
  now: string;
  expiresAt: string;
}

/** Outcome of claiming an idempotency key before action dispatch. */
export type IdempotencyClaimResult =
  | { kind: "acquired" }
  | { kind: "in_progress" }
  | { kind: "completed"; response: RuntimeActionHttpResult }
  | { kind: "conflict" };

/** Values required to persist the response owned by a successful claim. */
export interface CompleteIdempotencyInput {
  keyHash: string;
  requestHash: string;
  claimId: string;
  response: RuntimeActionHttpResult;
  expiresAt: string;
}

/** Persistent store for HTTP action deduplication and completed-result replay. */
export interface IIdempotencyStore {
  claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult>;
  complete(input: CompleteIdempotencyInput): Promise<boolean>;
}
