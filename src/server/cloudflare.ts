import type { CatalogStore } from "../catalog-store.ts";
import type { CloudflareEnv } from "./cloudflare/cloudflare-env.ts";
import type { ConnectApp } from "./connect-app.ts";
import type { ISecretCodec } from "./secrets/secret-codec-core.ts";

import { loadCatalog } from "../catalog-store.ts";
import { ActionPolicyService, parseActionPolicyList } from "../core/action-policy.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { executableActionIds } from "../providers/registry.generated.ts";
import { isConsoleShellPath } from "./api/console-paths.ts";
import { readPositiveInteger, resolvePublicOrigin } from "./cloudflare/cloudflare-env.ts";
import { createConnectApp } from "./connect-app.ts";
import { R2TransitFileService } from "./files/r2-transit-files.ts";
import { createWorkerSecretCodec } from "./secrets/worker-secret-codec.ts";
import { D1RuntimeDatabase } from "./storage/d1-runtime-store.ts";

interface CloudflareExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

let catalogPromise: Promise<CatalogStore> | undefined;
let cachedSecretCodec: { key: string; codec: Promise<ISecretCodec> } | undefined;
let cachedApp: { key: string; app: Promise<ConnectApp> } | undefined;

export default {
  async fetch(request: Request, env: CloudflareEnv, _ctx: CloudflareExecutionContext): Promise<Response> {
    const publicOrigin = resolvePublicOrigin(request, env);
    const cacheKey = createCacheKey(env, publicOrigin);
    if (!cachedApp || cachedApp.key !== cacheKey) {
      cachedApp = { key: cacheKey, app: createCloudflareApp(env, publicOrigin) };
    }

    const { app } = await cachedApp.app;
    const response = await app.fetch(request, env);
    if (response.status === 404 && env.ASSETS && shouldServeAsset(request)) {
      return env.ASSETS.fetch(request);
    }

    return response;
  },
};

async function createCloudflareApp(env: CloudflareEnv, publicOrigin: string): Promise<ConnectApp> {
  const secretCodec = await createSecretCodec(env.OOMOL_CONNECT_ENCRYPTION_KEY);
  return await createConnectApp({
    catalog: await loadCatalogOnce(),
    providerLoader: new ProviderLoader(),
    runtimeDatabase: new D1RuntimeDatabase(env.DB, { secretCodec }),
    transitFiles: new R2TransitFileService({
      bucket: env.TRANSIT_FILES,
      publicOrigin,
      ttlSeconds: readPositiveInteger(env.OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS, 86_400),
      maxBytes: readPositiveInteger(env.OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES, 100 * 1024 * 1024),
    }),
    publicOrigin,
    secretCodec,
    adminToken: env.OOMOL_CONNECT_ADMIN_TOKEN,
    runtimeToken: env.OOMOL_CONNECT_RUNTIME_TOKEN,
    actionPolicy: new ActionPolicyService({
      allowedActions: parseActionPolicyList(env.OOMOL_CONNECT_ALLOWED_ACTIONS),
      blockedActions: parseActionPolicyList(env.OOMOL_CONNECT_BLOCKED_ACTIONS),
    }),
    computeRuntimeAuthConfigured: false,
  });
}

function loadCatalogOnce(): Promise<CatalogStore> {
  catalogPromise ??= loadCatalog("/bundle/catalog/apps", {
    executableActionIds: Object.values(executableActionIds).flat(),
  });
  return catalogPromise;
}

function createSecretCodec(encryptionKey: string | undefined): Promise<ISecretCodec> {
  const key = encryptionKey ?? "";
  if (!cachedSecretCodec || cachedSecretCodec.key !== key) {
    cachedSecretCodec = { key, codec: createWorkerSecretCodec(encryptionKey) };
  }
  return cachedSecretCodec.codec;
}

function createCacheKey(env: CloudflareEnv, publicOrigin: string): string {
  return JSON.stringify({
    publicOrigin,
    adminToken: env.OOMOL_CONNECT_ADMIN_TOKEN ?? "",
    runtimeToken: env.OOMOL_CONNECT_RUNTIME_TOKEN ?? "",
    encryptionKey: env.OOMOL_CONNECT_ENCRYPTION_KEY ?? "",
    allowedActions: env.OOMOL_CONNECT_ALLOWED_ACTIONS ?? "",
    blockedActions: env.OOMOL_CONNECT_BLOCKED_ACTIONS ?? "",
    transitFileTtlSeconds: env.OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS ?? "",
    transitFileMaxBytes: env.OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES ?? "",
  });
}

function shouldServeAsset(request: Request): boolean {
  return isConsoleShellPath(new URL(request.url).pathname);
}
