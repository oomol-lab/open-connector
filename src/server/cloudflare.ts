import type { CatalogStore } from "../catalog-store.ts";
import type { AssetsBinding, KVNamespaceBinding, R2BucketBinding } from "./cloudflare/cloudflare-bindings.ts";
import type { CloudflareEnv } from "./cloudflare/cloudflare-env.ts";
import type { ConnectApp } from "./connect-app.ts";
import type { Logger } from "./logger.ts";
import type { ISecretCodec } from "./secrets/secret-codec-core.ts";

import { ActionPolicyService, parseActionPolicyList } from "../core/action-policy.ts";
import { PromiseCache } from "../core/promise-cache.ts";
import {
  parseEgressTrustedHosts,
  parsePrivateNetworkAccessFlag,
  setEgressTrustedHosts,
  setPrivateNetworkAccessAllowed,
} from "../core/request.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { executorModules } from "../providers/registry.cloudflare.generated.ts";
import { isConsoleShellPath } from "./api/console-paths.ts";
import { loadCatalogFromAssets } from "./cloudflare/catalog-assets.ts";
import { readPositiveInteger, resolvePublicOrigin } from "./cloudflare/cloudflare-env.ts";
import { createConnectApp } from "./connect-app.ts";
import { preloadOptionalServerModules } from "./connect-server.ts";
import { KVTransitFileService } from "./files/kv-transit-files.ts";
import { R2TransitFileService } from "./files/r2-transit-files.ts";
import { createWorkerSecretCodec } from "./secrets/worker-secret-codec.ts";
import { D1RuntimeDatabase } from "./storage/d1-runtime-store.ts";
import { DEFAULT_RUN_LIMIT } from "./storage/runtime-store.ts";

interface CloudflareExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const catalogCache = new PromiseCache<CatalogStore>();
const secretCodecCache = new PromiseCache<ISecretCodec>();
const appCache = new PromiseCache<ConnectApp>();

export default {
  async fetch(request: Request, env: CloudflareEnv, _ctx: CloudflareExecutionContext): Promise<Response> {
    setPrivateNetworkAccessAllowed(parsePrivateNetworkAccessFlag(env.OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK));
    setEgressTrustedHosts(parseEgressTrustedHosts(env.OOMOL_CONNECT_EGRESS_TRUSTED_HOSTS));
    const publicOrigin = resolvePublicOrigin(request, env);
    const { app } = await appCache.get(createCacheKey(env, publicOrigin), () => createCloudflareApp(env, publicOrigin));
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
  // The Node server defers the MCP and docs modules to their first request so its startup graph stays small.
  // Workers keep paying their evaluation here, at app creation, so the first /mcp or /docs request of an isolate
  // is served the same way as every later one.
  await preloadOptionalServerModules();
  const secretCodec = await createSecretCodec(env.OOMOL_CONNECT_ENCRYPTION_KEY);
  return await createConnectApp({
    catalog: await loadCatalogOnce(assets),
    providerLoader: new ProviderLoader(executorModules),
    runtimeDatabase: new D1RuntimeDatabase(env.DB, {
      secretCodec,
      runLimit: readPositiveInteger(env.OOMOL_CONNECT_RUN_LIMIT, DEFAULT_RUN_LIMIT),
    }),
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
    allowedCustomOAuth: parseActionPolicyList(env.OOMOL_CONNECT_ALLOWED_CUSTOM_OAUTH),
    logger: workerLogger,
    computeRuntimeAuthConfigured: false,
    // Cloudflare compresses on egress itself: Response defaults to
    // `encodeBody: "automatic"`, so the runtime re-encodes a body that Hono's
    // compress() already gzipped. Depending on what the client negotiates, the
    // wire then carries gzip-in-gzip or gzip bytes with no Content-Encoding at
    // all, and dashboard JSON stops parsing either way. Hono's middleware
    // rebuilds the Response from the previous one and cannot pass
    // `encodeBody: "manual"`, so application-level compression stays off here.
    // https://developers.cloudflare.com/workers/runtime-apis/response/
    compressApiResponses: false,
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
  // The catalog depends only on the assets binding, which is fixed for the isolate, so one slot
  // under a constant key covers every request.
  return catalogCache.get("", () =>
    loadCatalogFromAssets(assets, {
      executableServices: Object.keys(executorModules),
    }),
  );
}

function createSecretCodec(encryptionKey: string | undefined): Promise<ISecretCodec> {
  return secretCodecCache.get(encryptionKey ?? "", () => createWorkerSecretCodec(encryptionKey));
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
    allowedCustomOAuth: env.OOMOL_CONNECT_ALLOWED_CUSTOM_OAUTH ?? "",
    transitFileTtlSeconds: env.OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS ?? "",
    transitFileMaxBytes: env.OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES ?? "",
    runLimit: env.OOMOL_CONNECT_RUN_LIMIT ?? "",
  });
}

function shouldServeAsset(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return !pathname.startsWith("/catalog") && isConsoleShellPath(pathname);
}
