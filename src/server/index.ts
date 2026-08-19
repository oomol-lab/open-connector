import type { IStagedTransitFileService } from "./files/transit-file-store.ts";

import { S3Client } from "@aws-sdk/client-s3";
import { serve } from "@hono/node-server";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadCatalog } from "../catalog-store.ts";
import { ActionPolicyService, parseActionPolicyList } from "../core/action-policy.ts";
import {
  parseEgressTrustedHosts,
  parsePrivateNetworkAccessFlag,
  setEgressTrustedHosts,
  setPrivateNetworkAccessAllowed,
} from "../core/request.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { executableActionIds, executorModules } from "../providers/registry.generated.ts";
import { createRuntimeJwtVerifier } from "./api/runtime-jwt.ts";
import { registerStaticRoutes } from "./api/static-routes.ts";
import { createConnectApp } from "./connect-app.ts";
import { cleanupStagedTransitFiles, createNodeTransitFileUpload } from "./files/node-transit-file-upload.ts";
import { S3TransitFileService } from "./files/s3-transit-files.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { logger } from "./logger.ts";
import { createSecretCodec } from "./secrets/secret-codec.ts";
import { DEFAULT_RUN_LIMIT } from "./storage/runtime-store.ts";
import { SqliteRuntimeDatabase } from "./storage/sqlite-runtime-store.ts";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
const publicOrigin = process.env.OOMOL_CONNECT_ORIGIN ?? `http://localhost:${port}`;
const dataDir = process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data");
const transitFileTtlSeconds = readPositiveIntegerEnv("OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS", 86_400);
const transitFileMaxBytes = readPositiveIntegerEnv("OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES", 100 * 1024 * 1024);
const runLimit = readPositiveIntegerEnv("OOMOL_CONNECT_RUN_LIMIT", DEFAULT_RUN_LIMIT);
const secretCodec = createSecretCodec(process.env.OOMOL_CONNECT_ENCRYPTION_KEY);
const adminToken = process.env.OOMOL_CONNECT_ADMIN_TOKEN;
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
const allowedCustomOAuth = parseActionPolicyList(process.env.OOMOL_CONNECT_ALLOWED_CUSTOM_OAUTH);
setPrivateNetworkAccessAllowed(parsePrivateNetworkAccessFlag(process.env.OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK));
setEgressTrustedHosts(parseEgressTrustedHosts(process.env.OOMOL_CONNECT_EGRESS_TRUSTED_HOSTS));
const builtRoot = join(process.cwd(), "dist/web");
const staticRoot = await resolveStaticRoot(builtRoot);
await mkdir(dataDir, { recursive: true });
const catalog = await loadCatalog(undefined, {
  executableActionIds,
});
const providerLoader = new ProviderLoader(executorModules);
const runtimeDatabase = new SqliteRuntimeDatabase(join(dataDir, "connect.sqlite"), {
  logger,
  secretCodec,
  runLimit,
});
const transitFiles = createTransitFileService();
const transitFileTempDir = join(dataDir, "tmp", "transit-files");
await transitFiles.cleanupExpired();
await cleanupStagedTransitFiles(transitFileTempDir, transitFileTtlSeconds * 1000);
const { app, runtimeAuthConfigured } = await createConnectApp({
  catalog,
  providerLoader,
  runtimeDatabase,
  transitFiles,
  uploadTransitFile: createNodeTransitFileUpload({ transitFiles, tempDir: transitFileTempDir }),
  publicOrigin,
  secretCodec,
  adminToken,
  runtimeToken,
  verifyRuntimeJwt,
  actionPolicy,
  allowedCustomOAuth,
  registerStaticRoutes: (app) => registerStaticRoutes(app, staticRoot),
  logger,
});

process.once("SIGINT", () => {
  runtimeDatabase.close();
  process.exit(0);
});
process.once("SIGTERM", () => {
  runtimeDatabase.close();
  process.exit(0);
});

serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    logger.info({ url: `http://${hostname}:${info.port}` }, "connect server listening");
    logger.info({ dataDir }, "runtime data directory");
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
        "local data encryption is disabled; set OOMOL_CONNECT_ENCRYPTION_KEY to encrypt stored credentials, OAuth client configuration, pending OAuth state, and completed idempotent action responses",
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

function createTransitFileService(): IStagedTransitFileService {
  const backend = process.env.OOMOL_CONNECT_TRANSIT_FILE_BACKEND ?? "local";
  switch (backend) {
    case "local":
      return new TransitFileService({
        rootDir: join(dataDir, "files"),
        publicOrigin,
        ttlSeconds: transitFileTtlSeconds,
        maxBytes: transitFileMaxBytes,
      });
    case "s3": {
      const accessKeyId = optionalEnv("OOMOL_CONNECT_S3_ACCESS_KEY_ID");
      const secretAccessKey = optionalEnv("OOMOL_CONNECT_S3_SECRET_ACCESS_KEY");
      if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
        throw new Error(
          "OOMOL_CONNECT_S3_ACCESS_KEY_ID and OOMOL_CONNECT_S3_SECRET_ACCESS_KEY must be configured together.",
        );
      }

      const client = new S3Client({
        region: optionalEnv("OOMOL_CONNECT_S3_REGION") ?? "us-east-1",
        endpoint: optionalEnv("OOMOL_CONNECT_S3_ENDPOINT"),
        forcePathStyle: parseBooleanEnv("OOMOL_CONNECT_S3_FORCE_PATH_STYLE"),
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        credentials:
          accessKeyId && secretAccessKey
            ? {
                accessKeyId,
                secretAccessKey,
                sessionToken: optionalEnv("OOMOL_CONNECT_S3_SESSION_TOKEN"),
              }
            : undefined,
      });
      return new S3TransitFileService({
        client,
        bucket: requiredEnv("OOMOL_CONNECT_S3_BUCKET"),
        publicOrigin,
        ttlSeconds: transitFileTtlSeconds,
        maxBytes: transitFileMaxBytes,
      });
    }
    default:
      throw new Error(`Unsupported OOMOL_CONNECT_TRANSIT_FILE_BACKEND: ${backend}`);
  }
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
