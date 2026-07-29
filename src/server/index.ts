import { serve } from "@hono/node-server";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadCatalog } from "../catalog-store.ts";
import { ActionPolicyService, parseActionPolicyList } from "../core/action-policy.ts";
import { parsePrivateNetworkAccessFlag, setPrivateNetworkAccessAllowed } from "../core/request.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { executableActionIds, executorModules } from "../providers/registry.generated.ts";
import { createRuntimeJwtVerifier } from "./api/runtime-jwt.ts";
import { registerStaticRoutes } from "./api/static-routes.ts";
import { createConnectApp } from "./connect-app.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { logger } from "./logger.ts";
import { createSecretCodec } from "./secrets/secret-codec.ts";
import { createConnectorPool, defaultSchema, PostgresRuntimeDatabase } from "./storage/postgres-runtime-store.ts";
import { DEFAULT_RUN_LIMIT } from "./storage/runtime-store.ts";
import { SqliteRuntimeDatabase } from "./storage/sqlite-runtime-store.ts";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
const publicOrigin = process.env.OOMOL_CONNECT_ORIGIN ?? `http://localhost:${port}`;
// Lets an embedding app's own same-origin page receive the BroadcastChannel completion
// message — see IConnectServerOptions.completionRedirectUrl. Omitted keeps the built-in
// completion page.
const completionRedirectUrl = process.env.OOMOL_CONNECT_COMPLETION_REDIRECT_URL;
const dataDir = process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data");
const databaseUrl = process.env.OOMOL_CONNECT_DATABASE_URL;
// Tables live in their own schema so the runtime can share a database with an application
// rather than requiring one of its own.
const databaseSchema = process.env.OOMOL_CONNECT_DATABASE_SCHEMA ?? defaultSchema;
const transitFileTtlSeconds = readPositiveIntegerEnv("OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS", 86_400);
const transitFileMaxBytes = readPositiveIntegerEnv("OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES", 100 * 1024 * 1024);
const runLimit = readPositiveIntegerEnv("OOMOL_CONNECT_RUN_LIMIT", DEFAULT_RUN_LIMIT);
const secretCodec = createSecretCodec(process.env.OOMOL_CONNECT_ENCRYPTION_KEY);
const adminToken = process.env.OOMOL_CONNECT_ADMIN_TOKEN;
// Hands provider secrets back to admin callers — the opposite of this runtime's usual
// contract, so it is opt-in and additionally refuses unless an admin token is set.
const credentialReadEnabled = process.env.OOMOL_CONNECT_ENABLE_CREDENTIAL_READ === "true";
// Both a URL and a secret are required: an unsigned webhook lets anyone who can reach the
// receiver forge a connection event, so there is no unsigned mode.
// Falls back to the encryption key so connect sessions work without a second secret to
// manage; a dedicated value is still preferred so rotating one does not invalidate the other.
const connectSessionSecret =
  process.env.OOMOL_CONNECT_SESSION_SECRET ?? process.env.OOMOL_CONNECT_ENCRYPTION_KEY ?? undefined;
const connectSessionTtlSeconds = readPositiveIntegerEnv("OOMOL_CONNECT_SESSION_TTL_SECONDS", 1800);
const webhookUrl = process.env.OOMOL_CONNECT_WEBHOOK_URL;
const webhookSecret = process.env.OOMOL_CONNECT_WEBHOOK_SECRET;
const webhook =
  webhookUrl && webhookSecret
    ? {
        url: webhookUrl,
        secret: webhookSecret,
        signatureHeader: process.env.OOMOL_CONNECT_WEBHOOK_SIGNATURE_HEADER,
      }
    : undefined;
if (webhookUrl && !webhookSecret) {
  logger.warn("OOMOL_CONNECT_WEBHOOK_URL is set without OOMOL_CONNECT_WEBHOOK_SECRET; webhooks are disabled");
}
const runtimeToken = process.env.OOMOL_CONNECT_RUNTIME_TOKEN;
const verifyRuntimeJwt = createRuntimeJwtVerifier({
  jwksUri: process.env.OOMOL_CONNECT_JWKS_URI,
  issuer: process.env.OOMOL_CONNECT_JWT_ISSUER,
  audience: process.env.OOMOL_CONNECT_JWT_AUDIENCE,
});
const actionPolicy = new ActionPolicyService({
  allowedActions: parseActionPolicyList(process.env.OOMOL_CONNECT_ALLOWED_ACTIONS),
  blockedActions: parseActionPolicyList(process.env.OOMOL_CONNECT_BLOCKED_ACTIONS),
  allowedProxies: parseActionPolicyList(process.env.OOMOL_CONNECT_ALLOWED_PROXIES),
  blockedProxies: parseActionPolicyList(process.env.OOMOL_CONNECT_BLOCKED_PROXIES),
});
setPrivateNetworkAccessAllowed(parsePrivateNetworkAccessFlag(process.env.OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK));
const builtRoot = join(process.cwd(), "dist/web");
const staticRoot = await resolveStaticRoot(builtRoot);
await mkdir(dataDir, { recursive: true });
const catalog = await loadCatalog(undefined, {
  executableActionIds: Object.values(executableActionIds).flat(),
});
const providerLoader = new ProviderLoader(executorModules);
// Postgres when a URL is configured, SQLite otherwise. Both satisfy `RuntimeDatabase`,
// so nothing downstream distinguishes them. Postgres exists for deployments with no
// durable local disk, or more than one runtime process sharing state — a SQLite file in
// an ephemeral container silently loses every credential on redeploy.
const runtimeDatabase = databaseUrl
  ? await PostgresRuntimeDatabase.create(
      createConnectorPool({ connectionString: databaseUrl, schema: databaseSchema }),
      {
        logger,
        secretCodec,
        runLimit,
        schema: databaseSchema,
      },
    )
  : new SqliteRuntimeDatabase(join(dataDir, "connect.sqlite"), {
      logger,
      secretCodec,
      runLimit,
    });
const transitFiles = new TransitFileService({
  rootDir: join(dataDir, "files"),
  publicOrigin,
  ttlSeconds: transitFileTtlSeconds,
  maxBytes: transitFileMaxBytes,
});
await transitFiles.cleanupExpired();
const { app, runtimeAuthConfigured } = await createConnectApp({
  catalog,
  providerLoader,
  runtimeDatabase,
  transitFiles,
  publicOrigin,
  secretCodec,
  adminToken,
  runtimeToken,
  verifyRuntimeJwt,
  actionPolicy,
  registerStaticRoutes: (app) => registerStaticRoutes(app, staticRoot),
  logger,
  credentialReadEnabled,
  webhook,
  connectSessionSecret,
  connectSessionTtlSeconds,
  completionRedirectUrl,
});

// SQLite closes synchronously; the Postgres pool returns a promise. Awaiting covers both,
// so a shutdown does not exit while connections are still draining.
const shutdown = async (): Promise<void> => {
  await runtimeDatabase.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    logger.info({ url: `http://${hostname}:${info.port}` }, "connect server listening");
    logger.info(
      { dataDir, store: databaseUrl ? "postgres" : "sqlite", ...(databaseUrl ? { schema: databaseSchema } : {}) },
      "runtime data directory",
    );
    if (!adminToken) {
      logger.warn("local admin authentication is disabled; set OOMOL_CONNECT_ADMIN_TOKEN to require bearer tokens");
    }
    if (!runtimeAuthConfigured) {
      logger.warn(
        "runtime API authentication is disabled; create a runtime token in the web console, set OOMOL_CONNECT_RUNTIME_TOKEN, or configure JWT authentication",
      );
    }
    if (!secretCodec.encrypted) {
      logger.warn(
        "local data encryption is disabled; set OOMOL_CONNECT_ENCRYPTION_KEY to encrypt stored credentials, OAuth client configuration, and completed idempotent action responses",
      );
    }
    if (!staticRoot) {
      logger.warn("web console assets are not built; use http://localhost:5173 for local console development");
    }
  },
);

async function resolveStaticRoot(root: string): Promise<string | undefined> {
  try {
    await access(join(root, "index.html"));
    return root;
  } catch {
    return undefined;
  }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
