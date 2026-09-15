import type { ConnectorRuntime, ConnectorTransitFileOptions } from "./connector-runtime.ts";
import type { ServerType } from "@hono/node-server";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { join } from "node:path";
import { defaultLazySchemaCacheFiles } from "../catalog-lazy-schemas.ts";
import { parseActionPolicyList } from "../core/action-policy.ts";
import { parseEgressTrustedHosts, parsePrivateNetworkAccessFlag } from "../core/request.ts";
import { isConsoleShellRequest } from "./api/console-paths.ts";
import { registerStaticRoutes } from "./api/static-routes.ts";
import { createConnectorRuntime } from "./connector-runtime.ts";
import { logger } from "./logger.ts";
import { resolveServerAssets } from "./server-assets.ts";
import { migratePostgresRuntimeDatabase, sqliteMigrationsNotice } from "./storage/node-runtime-database.ts";
import { DEFAULT_RUN_LIMIT } from "./storage/runtime-store.ts";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
// Strip trailing slashes once so every consumer (OAuth redirects, transit files, action guides) joins paths safely.
const publicOrigin = (process.env.OOMOL_CONNECT_ORIGIN ?? `http://localhost:${port}`).replace(/\/+$/, "");
const dataDir = process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data");
const transitFileTtlSeconds = readPositiveIntegerEnv("OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS", 86_400);
const transitFileMaxBytes = readPositiveIntegerEnv("OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES", 100 * 1024 * 1024);
const runLimit = readPositiveIntegerEnv("OOMOL_CONNECT_RUN_LIMIT", DEFAULT_RUN_LIMIT);
const databaseUrl = optionalEnv("OOMOL_CONNECT_DATABASE_URL");
const databasePoolMax = readPositiveIntegerEnv("OOMOL_CONNECT_DATABASE_POOL_MAX", 10);
const databaseConnectTimeoutMs = readPositiveIntegerEnv("OOMOL_CONNECT_DATABASE_CONNECT_TIMEOUT_MS", 10_000);

// The standalone binary embeds migrations/postgresql, but the PostgreSQL startup validator refuses to serve until
// they are applied and its error text points at `npm run runtime:migrate`, which a binary user does not have.
// `migrate` applies them from the same source the validator reads, so validation and execution cannot diverge.
const [command, ...rest] = process.argv.slice(2);

try {
  if (command === undefined) {
    // Resolves once `serve()` has requested the listener, before it is up; a bind failure and the server's lifetime
    // are deliberately not awaited here, see `main`.
    await main();
  } else if (command === "migrate" && rest.length === 0) {
    await runMigrateCommand();
  } else {
    console.error("Usage: open-connector [migrate]");
    process.exitCode = 1;
  }
} catch (error) {
  reportFailure(error);
}

/**
 * Start the server and resolve as soon as `serve()` returns, which only requests the listener: the bind completes
 * later, and a bind failure such as EADDRINUSE surfaces as the server's unhandled 'error' event, which ends the
 * process with exit code 1 without closing the runtime database, under Bun as under Node. Waiting for SIGINT/SIGTERM
 * and closing the runtime database afterwards belong to a promise chain that is deliberately not awaited, so this
 * entry module finishes evaluating while the server runs. A Bun single-file executable releases the executable's
 * module-graph pages (the bundle plus every embedded catalog file read during startup) with one
 * madvise(MADV_DONTNEED) once the entry module has evaluated; a top-level await spanning the server's lifetime keeps
 * about 85 MB of them resident on Linux, and under Bun also turns a listen error into a hang instead of an exit.
 */
async function main(): Promise<void> {
  const assets = await resolveServerAssets();
  const runtime = await createConnectorRuntime({
    dataDir,
    publicOrigin,
    assets,
    encryptionKey: process.env.OOMOL_CONNECT_ENCRYPTION_KEY,
    adminToken: process.env.OOMOL_CONNECT_ADMIN_TOKEN,
    runtimeToken: process.env.OOMOL_CONNECT_RUNTIME_TOKEN,
    jwt: {
      jwksUri: process.env.OOMOL_CONNECT_JWKS_URI,
      issuer: process.env.OOMOL_CONNECT_JWT_ISSUER,
      audience: process.env.OOMOL_CONNECT_JWT_AUDIENCE,
    },
    network: {
      allowPrivateNetwork: parsePrivateNetworkAccessFlag(process.env.OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK),
      trustedHosts: parseEgressTrustedHosts(process.env.OOMOL_CONNECT_EGRESS_TRUSTED_HOSTS),
    },
    actionPolicy: {
      allowedActions: parseActionPolicyList(process.env.OOMOL_CONNECT_ALLOWED_ACTIONS),
      blockedActions: parseActionPolicyList(process.env.OOMOL_CONNECT_BLOCKED_ACTIONS),
      allowedProxies: parseActionPolicyList(process.env.OOMOL_CONNECT_ALLOWED_PROXIES),
      blockedProxies: parseActionPolicyList(process.env.OOMOL_CONNECT_BLOCKED_PROXIES),
    },
    allowedCustomOAuth: parseActionPolicyList(process.env.OOMOL_CONNECT_ALLOWED_CUSTOM_OAUTH),
    postgres: databaseUrl
      ? {
          connectionString: databaseUrl,
          poolMax: databasePoolMax,
          connectionTimeoutMs: databaseConnectTimeoutMs,
        }
      : undefined,
    transitFiles: readTransitFileOptions(),
    runLimit,
    lazySchemas: parseBooleanEnv("OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS"),
    schemaCacheFiles: readPositiveIntegerEnv("OOMOL_CONNECT_CATALOG_SCHEMA_CACHE_FILES", defaultLazySchemaCacheFiles),
    apiReference: true,
    logger,
  });

  try {
    // The console is a host of the same request handler that embedded applications consume.
    const app = new Hono();
    app.use("*", async (context, next) => {
      const response = await runtime.fetch(context.req.raw);
      if (response.status === 404 && isConsoleShellRequest(context.req.path, context.req.method)) {
        await response.body?.cancel();
        await next();
      } else {
        context.res = response;
      }
    });
    registerStaticRoutes(app, { root: assets.staticRoot, embedded: assets.embedded });

    const server = serve(
      {
        fetch: app.fetch,
        port,
        hostname,
      },
      (info) => {
        logger.info({ url: `http://${hostname}:${info.port}` }, "connect server listening");
        logger.info({ dataDir }, "runtime data directory");
        logger.info({ backend: databaseUrl ? "postgresql" : "sqlite" }, "runtime database ready");
        if (!process.env.OOMOL_CONNECT_ADMIN_TOKEN) {
          logger.warn("local admin authentication is disabled; set OOMOL_CONNECT_ADMIN_TOKEN to require bearer tokens");
        }
        if (!runtime.runtimeAuthConfigured) {
          logger.warn(
            "runtime API authentication is disabled; create a runtime token in the web console, set OOMOL_CONNECT_RUNTIME_TOKEN, or configure JWT authentication",
          );
        }
        if (!process.env.OOMOL_CONNECT_ENCRYPTION_KEY) {
          logger.warn(
            "runtime data encryption is disabled; set OOMOL_CONNECT_ENCRYPTION_KEY to encrypt stored credentials, Marketplace API keys, OAuth client configuration, pending OAuth state, and completed idempotent action responses",
          );
        }
        if (!assets.staticRoot) {
          logger.warn("web console assets are not built; use http://localhost:5173 for local console development");
        }
      },
    );

    // A startup failure above closes the database in the catch. From here this chain owns it; a bind failure never
    // reaches it and ends the process through the server's unhandled 'error' event instead.
    waitForShutdown(server, runtime)
      .finally(() => runtime.close())
      .catch(reportFailure);
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

/** Log a startup, migrate, or shutdown failure; the process exits with code 1 once its handles are closed. */
function reportFailure(error: unknown): void {
  logger.error({ err: error }, command === "migrate" ? "migrate failed" : "connect server failed");
  process.exitCode = 1;
}

async function runMigrateCommand(): Promise<void> {
  if (!databaseUrl) {
    logger.info(sqliteMigrationsNotice);
    return;
  }

  const assets = await resolveServerAssets();
  await migratePostgresRuntimeDatabase({
    connectionString: databaseUrl,
    connectionTimeoutMs: databaseConnectTimeoutMs,
    logger,
    migrations: assets.migrations,
  });
}

function waitForShutdown(server: ServerType, runtime: ConnectorRuntime): Promise<void> {
  return new Promise((resolve, reject) => {
    let closing = false;
    const shutdown = (): void => {
      if (closing) {
        return;
      }
      closing = true;
      // Stop accepting requests and abort connector work together so an active provider call cannot hold shutdown open.
      const closed = new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())));
      void Promise.all([closed, runtime.close()]).then(
        () => finish(),
        (error) => finish(error),
      );
      function finish(error?: unknown): void {
        process.removeListener("SIGINT", shutdown);
        process.removeListener("SIGTERM", shutdown);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readTransitFileOptions(): ConnectorTransitFileOptions {
  const backend = process.env.OOMOL_CONNECT_TRANSIT_FILE_BACKEND ?? "local";
  const options: ConnectorTransitFileOptions = { ttlSeconds: transitFileTtlSeconds, maxBytes: transitFileMaxBytes };
  if (backend === "local") return options;
  if (backend !== "s3") throw new Error(`Unsupported OOMOL_CONNECT_TRANSIT_FILE_BACKEND: ${backend}`);
  const accessKeyId = optionalEnv("OOMOL_CONNECT_S3_ACCESS_KEY_ID");
  const secretAccessKey = optionalEnv("OOMOL_CONNECT_S3_SECRET_ACCESS_KEY");
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error(
      "OOMOL_CONNECT_S3_ACCESS_KEY_ID and OOMOL_CONNECT_S3_SECRET_ACCESS_KEY must be configured together.",
    );
  }
  options.s3 = {
    region: optionalEnv("OOMOL_CONNECT_S3_REGION") ?? "us-east-1",
    endpoint: optionalEnv("OOMOL_CONNECT_S3_ENDPOINT"),
    forcePathStyle: parseBooleanEnv("OOMOL_CONNECT_S3_FORCE_PATH_STYLE"),
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
            sessionToken: optionalEnv("OOMOL_CONNECT_S3_SESSION_TOKEN"),
          }
        : undefined,
    bucket: requiredEnv("OOMOL_CONNECT_S3_BUCKET"),
  };
  return options;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(`${name} is required when OOMOL_CONNECT_TRANSIT_FILE_BACKEND=s3.`);
  }
  return value;
}

function parseBooleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}
