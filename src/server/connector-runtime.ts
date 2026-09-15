import type { ActionPolicyConfig } from "../core/action-policy.ts";
import type { RuntimeLogger } from "../core/types.ts";
import type { RuntimeJwtConfig } from "./api/runtime-jwt.ts";
import type { S3TransitClientOptions } from "./files/s3-transit-files.ts";
import type { IStagedTransitFileService } from "./files/transit-file-store.ts";

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../catalog-store.ts";
import { ActionPolicyService } from "../core/action-policy.ts";
import { setEgressTrustedHosts, setPrivateNetworkAccessAllowed } from "../core/request.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { executorModules } from "../providers/registry.generated.ts";
import { createRuntimeJwtVerifier } from "./api/runtime-jwt.ts";
import { createConnectApp } from "./connect-app.ts";
import { cleanupStagedTransitFiles, createNodeTransitFileUpload } from "./files/node-transit-file-upload.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { createSecretCodec } from "./secrets/secret-codec.ts";
import { createDirectoryMigrationSource } from "./storage/migration-source.ts";
import { createNodeRuntimeDatabase } from "./storage/node-runtime-database.ts";
import { DEFAULT_RUN_LIMIT } from "./storage/runtime-store.ts";

export interface ConnectorAssets {
  catalogDir: string;
  catalogIndexFile?: string;
  migrationDirectory: string;
}

export interface ConnectorPostgresOptions {
  connectionString: string;
  poolMax?: number;
  connectionTimeoutMs?: number;
}

export interface ConnectorNetworkOptions {
  allowPrivateNetwork?: boolean;
  trustedHosts?: readonly string[];
}

export interface ConnectorS3Options extends S3TransitClientOptions {
  bucket: string;
}

export interface ConnectorTransitFileOptions {
  ttlSeconds?: number;
  maxBytes?: number;
  /** Omit to store transit files under dataDir/files. */
  s3?: ConnectorS3Options;
}

/** Explicit configuration for one Node.js or Bun runtime. Environment variables are owned by the host. */
export interface ConnectorRuntimeOptions {
  dataDir: string;
  /** External HTTP(S) URL, optionally including a mount path such as /connector. */
  publicOrigin: string;
  encryptionKey?: string;
  adminToken?: string;
  runtimeToken?: string;
  jwt?: RuntimeJwtConfig;
  postgres?: ConnectorPostgresOptions;
  network?: ConnectorNetworkOptions;
  actionPolicy?: ActionPolicyConfig;
  allowedCustomOAuth?: string[];
  transitFiles?: ConnectorTransitFileOptions;
  runLimit?: number;
  lazySchemas?: boolean;
  schemaCacheFiles?: number;
  assets?: ConnectorAssets;
  logger?: RuntimeLogger;
  /** The standalone host opts into API-reference HTML. Authorization completion pages are always available. */
  apiReference?: boolean;
}

/** Standard web requests are the host boundary; credentials, databases and framework objects stay private. */
export interface ConnectorRuntime {
  readonly runtimeAuthConfigured: boolean;
  fetch(request: Request): Promise<Response>;
  /** Abort active requests, wait for their handlers, and close owned resources. Safe to call repeatedly. */
  close(): Promise<void>;
}

let runtimeActive = false;

/** Directory to include in a host's Bun compile.assets. Its basename keeps connector assets namespaced. */
export function getConnectorAssetDirectory(): string {
  const standalone = (globalThis as { Bun?: { isStandaloneExecutable?: boolean } }).Bun?.isStandaloneExecutable;
  return standalone
    ? join(import.meta.dirname, "open-connector")
    : fileURLToPath(new URL("../../assets/open-connector/", import.meta.url));
}

/** Create a headless runtime without opening a listener or installing process signal handlers. */
export async function createConnectorRuntime(options: ConnectorRuntimeOptions): Promise<ConnectorRuntime> {
  if (runtimeActive)
    throw new Error("Only one Open Connector runtime may be active per process. Close it before creating another.");
  runtimeActive = true;
  try {
    return await openRuntime(options);
  } catch (error) {
    releaseRuntime();
    throw error;
  }
}

async function openRuntime(options: ConnectorRuntimeOptions): Promise<ConnectorRuntime> {
  const publicUrl = new URL(options.publicOrigin);
  if (
    !["http:", "https:"].includes(publicUrl.protocol) ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.search ||
    publicUrl.hash
  )
    throw new Error("publicOrigin must be an HTTP(S) URL without credentials, query or fragment.");
  const mountPath = publicUrl.pathname.replace(/\/+$/, "");
  const publicOrigin = `${publicUrl.origin}${mountPath}`;
  if (!options.dataDir.trim()) throw new Error("dataDir must not be empty.");
  const dataDir = resolve(options.dataDir);
  const assetDirectory = getConnectorAssetDirectory();
  const assets = options.assets ?? {
    catalogDir: join(assetDirectory, "catalog/apps"),
    catalogIndexFile: join(assetDirectory, "catalog/apps-index.json"),
    migrationDirectory: join(assetDirectory, "migrations"),
  };
  setPrivateNetworkAccessAllowed(options.network?.allowPrivateNetwork ?? false);
  setEgressTrustedHosts(options.network?.trustedHosts ?? []);
  const secretCodec = createSecretCodec(options.encryptionKey);
  const verifyRuntimeJwt = await createRuntimeJwtVerifier(options.jwt ?? {});
  const lazySchemas = options.lazySchemas ?? true;
  if (lazySchemas && !assets.catalogIndexFile) {
    options.logger?.warn(
      { catalogDir: assets.catalogDir },
      "catalog index is missing; reading every provider file at startup. Run npm run generate:catalog to write catalog/apps-index.json",
    );
  }
  const catalog = await loadCatalog(assets.catalogDir, {
    executableServices: Object.keys(executorModules),
    lazySchemas,
    lazySchemaCacheFiles: options.schemaCacheFiles,
    lazySchemaIndexFile: assets.catalogIndexFile,
  });
  options.logger?.info(
    {
      providers: catalog.providers.length,
      actions: catalog.actions.length,
      catalogIndex: lazySchemas && assets.catalogIndexFile !== undefined,
    },
    "catalog loaded",
  );
  await mkdir(dataDir, { recursive: true });
  const common = {
    migrations: createDirectoryMigrationSource(assets.migrationDirectory),
    secretCodec,
    logger: options.logger,
    runLimit: options.runLimit ?? DEFAULT_RUN_LIMIT,
  };
  const database = await createNodeRuntimeDatabase(
    options.postgres
      ? { ...common, backend: "postgresql", ...options.postgres }
      : { ...common, backend: "sqlite", path: join(dataDir, "connect.sqlite") },
  );
  let closeFiles = (): void => {};
  try {
    const ttlSeconds = options.transitFiles?.ttlSeconds ?? 86400;
    const maxBytes = options.transitFiles?.maxBytes ?? 100 * 1024 * 1024;
    let transitFiles: IStagedTransitFileService;
    if (options.transitFiles?.s3) {
      const { createS3TransitClient, S3TransitFileService } = await import("./files/s3-transit-files.ts");
      const client = createS3TransitClient(options.transitFiles.s3);
      closeFiles = () => client.destroy();
      transitFiles = new S3TransitFileService({
        client,
        bucket: options.transitFiles.s3.bucket,
        publicOrigin,
        ttlSeconds,
        maxBytes,
      });
    } else {
      transitFiles = new TransitFileService({ rootDir: join(dataDir, "files"), publicOrigin, ttlSeconds, maxBytes });
    }
    const tempDir = join(dataDir, "tmp/transit-files");
    await transitFiles.cleanupExpired();
    await cleanupStagedTransitFiles(tempDir, ttlSeconds * 1000);
    const { app, runtimeAuthConfigured } = await createConnectApp({
      catalog,
      providerLoader: new ProviderLoader(executorModules),
      runtimeDatabase: database,
      transitFiles,
      uploadTransitFile: createNodeTransitFileUpload({ transitFiles, tempDir }),
      publicOrigin,
      secretCodec,
      adminToken: options.adminToken,
      runtimeToken: options.runtimeToken,
      verifyRuntimeJwt,
      actionPolicy: new ActionPolicyService(options.actionPolicy),
      allowedCustomOAuth: options.allowedCustomOAuth,
      logger: options.logger,
      serveDocumentation: options.apiReference ?? false,
    });
    const shutdown = new AbortController();
    const pending = new Set<Promise<Response>>();
    let closing: Promise<void> | undefined;
    return {
      runtimeAuthConfigured,
      fetch(request) {
        if (closing) return Promise.resolve(Response.json({ error: "runtime_closed" }, { status: 503 }));
        const url = new URL(request.url);
        if (mountPath && url.pathname !== mountPath && !url.pathname.startsWith(`${mountPath}/`))
          return Promise.resolve(new Response("Not found", { status: 404 }));
        url.pathname = url.pathname.slice(mountPath.length) || "/";
        const forwarded = new Request(
          url,
          new Request(request, { signal: AbortSignal.any([request.signal, shutdown.signal]) }),
        );
        const response = Promise.resolve().then(() => app.fetch(forwarded));
        pending.add(response);
        void response.then(
          () => pending.delete(response),
          () => pending.delete(response),
        );
        return response;
      },
      close() {
        if (!closing) {
          closing = Promise.resolve().then(async () => {
            shutdown.abort(new Error("Open Connector runtime is closing."));
            await Promise.allSettled([...pending]);
            try {
              await database.close();
            } finally {
              try {
                closeFiles();
              } finally {
                releaseRuntime();
              }
            }
          });
        }
        return closing;
      },
    };
  } catch (error) {
    try {
      await database.close();
    } finally {
      closeFiles();
    }
    throw error;
  }
}

function releaseRuntime(): void {
  setPrivateNetworkAccessAllowed(false);
  setEgressTrustedHosts([]);
  runtimeActive = false;
}
