import { serve } from "@hono/node-server";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadCatalog } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { ActionPolicyService, parseActionPolicyList } from "../core/action-policy.ts";
import { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthCredentialRefreshService } from "../oauth/oauth-credential-refresh-service.ts";
import { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { ActionRunner } from "./action-runner.ts";
import { ConnectServer } from "./connect-server.ts";
import { logger } from "./logger.ts";
import { RuntimeTokenService } from "./runtime-token-service.ts";
import { createSecretCodec } from "./secret-codec.ts";
import { SqliteRuntimeDatabase } from "./sqlite-runtime-store.ts";
import { TransitFileService } from "./transit-files.ts";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
const publicOrigin = process.env.OOMOL_CONNECT_ORIGIN ?? `http://localhost:${port}`;
const dataDir = process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data");
const transitFileTtlSeconds = Number(process.env.OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS ?? 86_400);
const transitFileMaxBytes = Number(process.env.OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES ?? 100 * 1024 * 1024);
const secretCodec = createSecretCodec(process.env.OOMOL_CONNECT_ENCRYPTION_KEY);
const adminToken = process.env.OOMOL_CONNECT_ADMIN_TOKEN;
const runtimeToken = process.env.OOMOL_CONNECT_RUNTIME_TOKEN;
const actionPolicy = new ActionPolicyService({
  allowedActions: parseActionPolicyList(process.env.OOMOL_CONNECT_ALLOWED_ACTIONS),
  blockedActions: parseActionPolicyList(process.env.OOMOL_CONNECT_BLOCKED_ACTIONS),
});
const sourceRoot = join(process.cwd(), "web");
const builtRoot = join(process.cwd(), "dist/web");
const staticRoot = await resolveStaticRoot(builtRoot, sourceRoot);
await mkdir(dataDir, { recursive: true });
const catalog = await loadCatalog();
const providerLoader = new ProviderLoader();
const runtimeDatabase = new SqliteRuntimeDatabase(join(dataDir, "connect.sqlite"), {
  secretCodec,
});
const runtimeTokens = new RuntimeTokenService(runtimeDatabase.runtimeTokenStore);
const hasStoredRuntimeTokens = async (): Promise<boolean> => (await runtimeTokens.listTokens()).length > 0;
const oauthClientConfigs = new OAuthClientConfigService({
  catalog,
  origin: publicOrigin,
  store: runtimeDatabase.oauthClientConfigStore,
});
const connections = new ConnectionService({
  catalog,
  oauthCredentials: new OAuthCredentialRefreshService(oauthClientConfigs),
  providerLoader,
  store: runtimeDatabase.connectionStore,
});
const actions = new ActionRunner({
  catalog,
  providerLoader,
  connections,
  runs: runtimeDatabase.runLogStore,
  actionPolicy,
});
const transitFiles = new TransitFileService({
  rootDir: join(dataDir, "files"),
  publicOrigin,
  ttlSeconds: transitFileTtlSeconds,
  maxBytes: transitFileMaxBytes,
});
await transitFiles.cleanupExpired();
const app = new ConnectServer({
  catalog,
  providerLoader,
  connections,
  oauthClientConfigs,
  oauthFlow: new OAuthFlowService({
    clientConfigs: oauthClientConfigs,
    connections,
    states: runtimeDatabase.oauthStateStore,
  }),
  actions,
  transitFiles,
  runtimeTokens,
  staticRoot,
  auth: {
    adminToken,
    runtimeToken,
    hasRuntimeTokens: hasStoredRuntimeTokens,
    verifyRuntimeToken: (token) => runtimeTokens.verifyToken(token),
  },
  actionPolicy,
  logger,
}).createApp();
const runtimeAuthConfigured = Boolean(runtimeToken) || (await hasStoredRuntimeTokens());

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
        "runtime API authentication is disabled; create a runtime token in the web console or set OOMOL_CONNECT_RUNTIME_TOKEN",
      );
    }
    if (!secretCodec.encrypted) {
      logger.warn(
        "local credential encryption is disabled; set OOMOL_CONNECT_ENCRYPTION_KEY to encrypt stored credentials",
      );
    }
  },
);

async function resolveStaticRoot(primary: string, fallback: string): Promise<string> {
  try {
    await access(join(primary, "index.html"));
    return primary;
  } catch {
    return fallback;
  }
}
