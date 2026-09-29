import type { ActionPolicyConfig } from "../core/action-policy.ts";
import type { RuntimeLogger } from "../core/types.ts";
import type { RuntimeJwtConfig } from "./api/runtime-jwt.ts";
import type { S3TransitClientOptions } from "./files/s3-transit-files.ts";
import type { IStagedTransitFileService } from "./files/transit-file-store.ts";

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadCatalog } from "../catalog-store.ts";
import { ActionPolicyService } from "../core/action-policy.ts";
import { setEgressTrustedHosts, setPrivateNetworkAccessAllowed } from "../core/request.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { executorModules } from "../providers/registry.generated.ts";
import { createRuntimeJwtVerifier } from "./api/runtime-jwt.ts";
import { createConnectApp } from "./connect-app.ts";
import { getConnectorAssetDirectory } from "./connector-assets.ts";
import { cleanupStagedTransitFiles, createNodeTransitFileUpload } from "./files/node-transit-file-upload.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { createSecretCodec } from "./secrets/secret-codec.ts";
import { createDirectoryMigrationSource } from "./storage/migration-source.ts";
import { createNodeRuntimeDatabase } from "./storage/node-runtime-database.ts";
import { DEFAULT_RUN_LIMIT } from "./storage/runtime-store.ts";

/** Where the runtime reads its catalog and migrations from. The package default is its bundled assets directory. */
export interface ConnectorAssets {
  /** Directory of generated provider catalog JSON files. */
  catalogDir: string;
  /** Schema-free startup index of `catalogDir`, or undefined when the generator did not write one. */
  catalogIndexFile?: string;
  /** Directory of SQL migrations: `*.sql` for SQLite and `postgresql/*.sql` for PostgreSQL. */
  migrationDirectory: string;
}

/** Use PostgreSQL instead of the SQLite database under `dataDir`. */
export interface ConnectorPostgresOptions {
  connectionString: string;
  /** Connection pool size. */
  poolMax?: number;
  /** Time allowed to establish one connection. */
  connectionTimeoutMs?: number;
}

/** Provider egress policy. It is process-wide, which is why one runtime may be active per process. */
export interface ConnectorNetworkOptions {
  /** Let self-hosted providers reach instance hosts on private networks; loopback, link-local and cloud metadata stay blocked. */
  allowPrivateNetwork?: boolean;
  /** Hosts exempt from resolved-address validation, for domains a corporate VPN resolves to placeholder addresses. */
  trustedHosts?: readonly string[];
}

export interface ConnectorS3Options extends S3TransitClientOptions {
  bucket: string;
}

/** Retention and size limit of the files exchanged with providers. */
export interface ConnectorTransitFileOptions {
  /** Lifetime of a transit file before cleanup. Defaults to one day. */
  ttlSeconds?: number;
  /** Maximum upload size. Defaults to 100 MiB. */
  maxBytes?: number;
  /** Omit to store transit files under dataDir/files. */
  s3?: ConnectorS3Options;
}

/** Explicit configuration for one Node.js or Bun runtime. Environment variables are owned by the host. */
export interface ConnectorRuntimeOptions {
  /** Writable directory for the SQLite database, local transit files and upload staging. */
  dataDir: string;
  /** External HTTP(S) URL, optionally including a mount path such as /connector. */
  publicOrigin: string;
  /** False when the host supplied a development fallback instead of an explicit public origin. */
  publicOriginConfigured?: boolean;
  /** Encrypts stored credentials, OAuth client configuration, pending OAuth state and replayed action responses. Omit to store them in plain text. */
  encryptionKey?: string;
  /** Bearer token required for management requests such as connections, OAuth clients and policies. Omit to leave them open. */
  adminToken?: string;
  /** Static bearer token for the /v1 and /mcp execution API. JWT verification and console-issued tokens are the alternatives. */
  runtimeToken?: string;
  /** Verify /v1 bearer tokens as JWTs against a JWKS endpoint. */
  jwt?: RuntimeJwtConfig;
  postgres?: ConnectorPostgresOptions;
  network?: ConnectorNetworkOptions;
  /** Allow or block actions and proxies by name. */
  actionPolicy?: ActionPolicyConfig;
  /** Services, or `*`, whose connections may carry their own OAuth client instead of the configured one. */
  allowedCustomOAuth?: string[];
  transitFiles?: ConnectorTransitFileOptions;
  /** Maximum number of recent action run records to retain. */
  runLimit?: number;
  /** Read action JSON schemas from the catalog files on demand instead of holding them in memory. Defaults to true. */
  lazySchemas?: boolean;
  /** Provider files whose action schemas stay cached while `lazySchemas` is on. */
  schemaCacheFiles?: number;
  /** Override the bundled catalog and migrations. */
  assets?: ConnectorAssets;
  /** Receives startup and request diagnostics. Omit for silence. */
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

export { getConnectorAssetDirectory } from "./connector-assets.ts";

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
  const ttlSeconds = options.transitFiles?.ttlSeconds ?? 86400;
  const maxBytes = options.transitFiles?.maxBytes ?? 100 * 1024 * 1024;
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0)
    throw new Error("transitFiles.ttlSeconds must be a positive number of seconds.");
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("transitFiles.maxBytes must be a positive number.");
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
    const { app, runtimeAuthConfigured, saasCleanup } = await createConnectApp({
      catalog,
      providerLoader: new ProviderLoader(executorModules),
      runtimeDatabase: database,
      transitFiles,
      uploadTransitFile: createNodeTransitFileUpload({ transitFiles, tempDir }),
      publicOrigin,
      configuredOrigin: options.publicOriginConfigured === false ? undefined : publicOrigin,
      secretCodec,
      adminToken: options.adminToken,
      runtimeToken: options.runtimeToken,
      verifyRuntimeJwt,
      actionPolicy: new ActionPolicyService(options.actionPolicy),
      allowedCustomOAuth: options.allowedCustomOAuth,
      logger: options.logger,
      serveDocumentation: options.apiReference ?? false,
    });
    saasCleanup.start();
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
            await Promise.allSettled([...pending, saasCleanup.close()]);
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

export type { RuntimeProviderSetup } from "./api/runtime-api.ts";
