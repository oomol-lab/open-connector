import type { AssetsBinding, D1DatabaseBinding, KVNamespaceBinding, R2BucketBinding } from "./cloudflare-bindings.ts";

export interface CloudflareEnv {
  DB: D1DatabaseBinding;
  TRANSIT_FILES: R2BucketBinding | KVNamespaceBinding;
  TRANSIT_FILES_BACKEND?: "r2" | "kv"; // New: used to distinguish backend type at runtime
  ASSETS?: AssetsBinding;
  OOMOL_CONNECT_ORIGIN?: string;
  OOMOL_CONNECT_ADMIN_TOKEN?: string;
  OOMOL_CONNECT_RUNTIME_TOKEN?: string;
  OOMOL_CONNECT_ENCRYPTION_KEY?: string;
  OOMOL_CONNECT_ALLOWED_ACTIONS?: string;
  OOMOL_CONNECT_BLOCKED_ACTIONS?: string;
  OOMOL_CONNECT_ALLOWED_PROXIES?: string;
  OOMOL_CONNECT_BLOCKED_PROXIES?: string;
  OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK?: string;
  OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS?: string;
  OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES?: string;
  OOMOL_CONNECT_RUN_LIMIT?: string;
}

export function resolvePublicOrigin(request: Request, env: CloudflareEnv): string {
  return (env.OOMOL_CONNECT_ORIGIN ?? new URL(request.url).origin).replace(/\/+$/, "");
}

export function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
