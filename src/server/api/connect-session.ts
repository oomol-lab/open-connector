import type { Tenant } from "../../connection-service.ts";

import { createHmac, timingSafeEqual } from "node:crypto";

/** Prefix identifying a connect-session token. */
const connectSessionPrefix = "ocs";

export const defaultConnectSessionTtlSeconds = 1800;

export interface ConnectSessionClaims {
  tenant: Tenant;
  /** Services this session may authorize. Empty means none — never "all". */
  allowedServices: string[];
  connectionName?: string;
  expiresAt: string;
}

export type ConnectSessionVerification =
  | { ok: true; claims: ConnectSessionClaims }
  | { ok: false; code: "invalid_session_token" | "session_token_expired" };

/**
 * Mints and verifies short-lived tokens that let an end user's browser start an OAuth
 * flow without holding an admin credential.
 *
 * Deliberately stateless and signed rather than a stored row: the token is short-lived
 * and narrow — it can only start an authorization for a fixed tenant and an explicit list
 * of services, which is the action the user was about to take anyway. Statelessness
 * avoids a schema change and keeps the browser-facing path from touching the database
 * before the caller is even authenticated.
 *
 * The tradeoff is that a minted token cannot be revoked before it expires, so TTL is kept
 * short. If single-use semantics are ever needed, back it with a stored nonce.
 */
export class ConnectSessionService {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(secret: string, ttlSeconds: number = defaultConnectSessionTtlSeconds) {
    this.secret = secret;
    this.ttlSeconds = ttlSeconds;
  }

  create(input: { tenant: Tenant; allowedServices: string[]; connectionName?: string; now?: Date }): {
    token: string;
    claims: ConnectSessionClaims;
  } {
    const now = input.now ?? new Date();
    const claims: ConnectSessionClaims = {
      tenant: input.tenant,
      allowedServices: input.allowedServices,
      ...(input.connectionName ? { connectionName: input.connectionName } : {}),
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000).toISOString(),
    };
    const body = encodeBase64Url(JSON.stringify(claims));
    return { token: `${connectSessionPrefix}_${body}.${this.sign(body)}`, claims };
  }

  verify(token: string, now: Date = new Date()): ConnectSessionVerification {
    if (!token.startsWith(`${connectSessionPrefix}_`)) {
      return { ok: false, code: "invalid_session_token" };
    }

    const [body, signature] = token.slice(connectSessionPrefix.length + 1).split(".");
    if (!body || !signature || !this.matches(body, signature)) {
      return { ok: false, code: "invalid_session_token" };
    }

    let claims: ConnectSessionClaims;
    try {
      claims = JSON.parse(decodeBase64Url(body)) as ConnectSessionClaims;
    } catch {
      return { ok: false, code: "invalid_session_token" };
    }

    // Shape is validated after the signature check, so a malformed payload can only come
    // from something we signed — but a stale token from an older format must still be
    // rejected rather than trusted.
    if (typeof claims.tenant !== "string" || !Array.isArray(claims.allowedServices)) {
      return { ok: false, code: "invalid_session_token" };
    }

    const expiresAt = Date.parse(claims.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      return { ok: false, code: "session_token_expired" };
    }

    return { ok: true, claims };
  }

  private sign(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("base64url");
  }

  private matches(body: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(body));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

/** Whether a session may authorize `service`. An empty allowlist permits nothing. */
export function connectSessionAllowsService(claims: ConnectSessionClaims, service: string): boolean {
  return claims.allowedServices.includes(service);
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
