import type { ActionPolicyDecision } from "./action-policy.ts";

import { ConnectionError } from "../connection-error.ts";

/** Failure categories independent of HTTP response encoding. */
export type ExecutionFailureKind =
  | "invalid_input"
  | "unauthorized"
  | "payment_required"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_large"
  | "rate_limited"
  | "internal"
  | "unsupported"
  | "upstream"
  | "unavailable"
  | "timeout";

export class ExecutionError extends Error {
  readonly code: string;
  readonly kind: ExecutionFailureKind;

  constructor(code: string, message: string, kind: ExecutionFailureKind = "invalid_input") {
    super(message);
    this.code = code;
    this.kind = kind;
  }
}

/** Preserve the policy evidence used by action auditing. */
export class ExecutionPolicyError extends ExecutionError {
  readonly decision: Extract<ActionPolicyDecision, { allowed: false }>;

  constructor(decision: Extract<ActionPolicyDecision, { allowed: false }>) {
    super(decision.code, decision.message, "forbidden");
    this.decision = decision;
  }
}

export function connectionExecutionError(error: ConnectionError): ExecutionError {
  const kind =
    error.code === "unknown_service" || error.code === "connection_not_found"
      ? "not_found"
      : [
            "oauth_token_expired",
            "oauth_reauth_required",
            "oauth_refresh_unavailable",
            "oauth_token_refresh_failed",
          ].includes(error.code)
        ? "conflict"
        : "invalid_input";
  return new ExecutionError(error.code, error.message, kind);
}
