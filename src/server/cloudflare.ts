import type { CatalogStore } from "../catalog-store.ts";
import type { AssetsBinding, KVNamespaceBinding, R2BucketBinding } from "./cloudflare/cloudflare-bindings.ts";
import type { CloudflareEnv } from "./cloudflare/cloudflare-env.ts";
import type { ConnectApp } from "./connect-app.ts";
import type { Logger } from "./logger.ts";
import type { ISecretCodec } from "./secrets/secret-codec-core.ts";

import { ActionPolicyService, parseActionPolicyList } from "../core/action-policy.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { executableActionIds, executorModules } from "../providers/registry.cloudflare.generated.ts";
import { isConsoleShellPath } from "./api/console-paths.ts";
import { loadCatalogFromAssets } from "./cloudflare/catalog-assets.ts";
import { readPositiveInteger, resolvePublicOrigin } from "./cloudflare/cloudflare-env.ts";
import { createConnectApp } from "./connect-app.ts";
import { KVTransitFileService } from "./files/kv-transit-files.ts";
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
  const assets = env.ASSETS;
  if (!assets) {
    throw new Error("Cloudflare ASSETS binding is required to load the catalog");
  }
  const secretCodec = await createSecretCodec(env.OOMOL_CONNECT_ENCRYPTION_KEY);
  return await createConnectApp({
    catalog: await loadCatalogOnce(assets),
    providerLoader: new ProviderLoader(executorModules),
    runtimeDatabase: new D1RuntimeDatabase(env.DB, { secretCodec }),
    transitFiles: (() => {
      const transitFileOptions = {
        publicOrigin,
        ttlSeconds: readPositiveInteger(env.OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS, 86_400),
        maxBytes: readPositiveInteger(env.OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES, 100 * 1024 * 1024),
      };
      return env.TRANSIT_FILES_BACKEND === "kv"
        ? new KVTransitFileService({
            namespace: env.TRANSIT_FILES as KVNamespaceBinding,
            ...transitFileOptions,
          })
        : new R2TransitFileService({
            bucket: env.TRANSIT_FILES as R2BucketBinding,
            ...transitFileOptions,
          });
    })(),
    publicOrigin,
    secretCodec,
    adminToken: env.OOMOL_CONNECT_ADMIN_TOKEN,
    runtimeToken: env.OOMOL_CONNECT_RUNTIME_TOKEN,
    actionPolicy: new ActionPolicyService({
      allowedActions: parseActionPolicyList(env.OOMOL_CONNECT_ALLOWED_ACTIONS),
      blockedActions: parseActionPolicyList(env.OOMOL_CONNECT_BLOCKED_ACTIONS),
      allowedProxies: parseActionPolicyList(env.OOMOL_CONNECT_ALLOWED_PROXIES),
      blockedProxies: parseActionPolicyList(env.OOMOL_CONNECT_BLOCKED_PROXIES),
    }),
    logger: workerLogger,
    computeRuntimeAuthConfigured: false,
  });
}

const workerLogger = {
  error: writeWorkerLog("error"),
  info: writeWorkerLog("info"),
  warn: writeWorkerLog("warn"),
} as unknown as Logger;

function writeWorkerLog(level: "error" | "info" | "warn"): (fields: unknown, message?: string) => void {
  return (fields, message) => {
    const write = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    if (message) {
      write(message, fields);
      return;
    }

    write(fields);
  };
}

function loadCatalogOnce(assets: AssetsBinding): Promise<CatalogStore> {
  catalogPromise ??= loadCatalogFromAssets(assets, {
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
    allowedProxies: env.OOMOL_CONNECT_ALLOWED_PROXIES ?? "",
    blockedProxies: env.OOMOL_CONNECT_BLOCKED_PROXIES ?? "",
    transitFileTtlSeconds: env.OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS ?? "",
    transitFileMaxBytes: env.OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES ?? "",
  });
}

function shouldServeAsset(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return !pathname.startsWith("/catalog") && isConsoleShellPath(pathname);
}
