import { TenantError } from "./tenant-error.ts";

/**
 * The tenant every row backfilled to during the OC-1 migration and the only
 * tenant single-tenant dev instances ever see. Maps to the Hub org id in
 * production (tenant_id = org_id); 'local' is deliberately reserved.
 */
export const DEFAULT_TENANT_ID = "local";

const TENANT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;

// Reserved so `?tenant=` can never be tricked into meaning "every tenant".
const RESERVED_TENANT_IDS = new Set(["all"]);

export function isTenantId(value: string): boolean {
  return TENANT_ID_PATTERN.test(value) && !RESERVED_TENANT_IDS.has(value.toLowerCase());
}

/**
 * Validate a caller-supplied tenant id. Tenant ids travel in query params and
 * tokens, so they are always attacker-controlled input: reject anything that
 * could double as a wildcard, a path segment, or a second scope.
 */
export function requireTenantId(value: string): string {
  if (!isTenantId(value)) {
    throw new TenantError("invalid_tenant_id", `invalid tenant id: ${JSON.stringify(value)}`);
  }
  return value;
}
