import type { CatalogStore } from "../catalog-store.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { RuntimeJwtVerifier } from "./api/runtime-jwt.ts";
import type { ITransitFileService } from "./files/transit-file-store.ts";
import type { Logger } from "./logger.ts";
import type { ISecretCodec } from "./secrets/secret-codec-core.ts";
import type { RuntimeDatabase } from "./storage/runtime-database.ts";
import type { Hono } from "hono";

import { ConnectionService } from "../connection-service.ts";
import { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthCredentialRefreshService } from "../oauth/oauth-credential-refresh-service.ts";
import { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { ActionRunner } from "./actions/action-runner.ts";
import { ConnectSessionService } from "./api/connect-session.ts";
import { ConnectServer } from "./connect-server.ts";
import { RuntimeTokenService } from "./storage/runtime-token-service.ts";
import { ConnectionWebhookNotifier } from "./webhooks/connection-webhook.ts";

export interface ConnectAppOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  runtimeDatabase: RuntimeDatabase;
  transitFiles: ITransitFileService;
  publicOrigin: string;
  secretCodec: ISecretCodec;
  adminToken?: string;
  runtimeToken?: string;
  verifyRuntimeJwt?: RuntimeJwtVerifier;
  actionPolicy?: ActionPolicyService;
  registerStaticRoutes?: (app: Hono) => void;
  logger?: Logger;
  computeRuntimeAuthConfigured?: boolean;
  compressApiResponses?: boolean;
  credentialReadEnabled?: boolean;
  /** Deliver `connection.created` to this endpoint. Omitted means no webhooks. */
  webhook?: { url: string; secret: string; signatureHeader?: string };
  /** Signs browser-facing connect sessions. Omitted disables them entirely. */
  connectSessionSecret?: string;
  connectSessionTtlSeconds?: number;
}

export interface ConnectApp {
  app: Hono;
  runtimeAuthConfigured: boolean;
}

export async function createConnectApp(options: ConnectAppOptions): Promise<ConnectApp> {
  const runtimeTokens = new RuntimeTokenService(options.runtimeDatabase.runtimeTokenStore, options.logger);
  const hasStoredRuntimeTokens = async (): Promise<boolean> => (await runtimeTokens.listTokens()).length > 0;
  const oauthClientConfigs = new OAuthClientConfigService({
    catalog: options.catalog,
    origin: options.publicOrigin,
    store: options.runtimeDatabase.oauthClientConfigStore,
  });
  const connectionWebhook = options.webhook
    ? new ConnectionWebhookNotifier({ ...options.webhook, logger: options.logger })
    : undefined;
  const connections = new ConnectionService({
    catalog: options.catalog,
    oauthCredentials: new OAuthCredentialRefreshService(oauthClientConfigs),
    providerLoader: options.providerLoader,
    store: options.runtimeDatabase.connectionStore,
    logger: options.logger,
    onConnectionCreated: connectionWebhook ? (event) => connectionWebhook.notify(event) : undefined,
  });
  const actions = new ActionRunner({
    catalog: options.catalog,
    providerLoader: options.providerLoader,
    connections,
    runs: options.runtimeDatabase.runLogStore,
    transitFiles: options.transitFiles,
    actionPolicy: options.actionPolicy,
    logger: options.logger,
  });

  return {
    app: new ConnectServer({
      catalog: options.catalog,
      providerLoader: options.providerLoader,
      connections,
      oauthClientConfigs,
      oauthFlow: new OAuthFlowService({
        clientConfigs: oauthClientConfigs,
        connections,
        states: options.runtimeDatabase.oauthStateStore,
      }),
      actions,
      idempotency: options.runtimeDatabase.idempotencyStore,
      transitFiles: options.transitFiles,
      runtimeTokens,
      runtimePolicyStore: options.runtimeDatabase.runtimePolicyStore,
      registerStaticRoutes: options.registerStaticRoutes,
      auth: {
        adminToken: options.adminToken,
        runtimeToken: options.runtimeToken,
        hasRuntimeTokens: hasStoredRuntimeTokens,
        resolveRuntimeToken: (token) => runtimeTokens.resolveToken(token),
        verifyRuntimeJwt: options.verifyRuntimeJwt,
      },
      actionPolicy: options.actionPolicy,
      logger: options.logger,
      compressApiResponses: options.compressApiResponses,
      credentialReadEnabled: options.credentialReadEnabled,
      connectSessions: options.connectSessionSecret
        ? new ConnectSessionService(options.connectSessionSecret, options.connectSessionTtlSeconds)
        : undefined,
      publicOrigin: options.publicOrigin,
    }).createApp(),
    runtimeAuthConfigured:
      Boolean(options.runtimeToken) ||
      Boolean(options.verifyRuntimeJwt) ||
      (options.computeRuntimeAuthConfigured === false ? false : await hasStoredRuntimeTokens()),
  };
}
