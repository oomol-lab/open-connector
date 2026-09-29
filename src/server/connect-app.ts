import type { CatalogStore } from "../catalog-store.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { RuntimeLogger, TransitFileUpload } from "../core/types.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { RuntimeJwtVerifier } from "./api/runtime-jwt.ts";
import type { ITransitFileService } from "./files/transit-file-store.ts";
import type { ISecretCodec } from "./secrets/secret-codec-core.ts";
import type { RuntimeDatabase } from "./storage/runtime-database.ts";
import type { Hono } from "hono";

import { ConnectionService } from "../connection-service.ts";
import { MarketplaceService } from "../marketplace/marketplace-service.ts";
import { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthCredentialRefreshService } from "../oauth/oauth-credential-refresh-service.ts";
import { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { SaasCleanupService } from "../saas/saas-cleanup-service.ts";
import { SaasClient } from "../saas/saas-client.ts";
import { SaasExecutionService } from "../saas/saas-execution-service.ts";
import { SaasOAuthService } from "../saas/saas-oauth-service.ts";
import { SaasProjectService } from "../saas/saas-project-service.ts";
import { ActionRunner } from "./actions/action-runner.ts";
import { ConnectServer } from "./connect-server.ts";
import { RuntimeTokenService } from "./storage/runtime-token-service.ts";

export interface ConnectAppOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  runtimeDatabase: RuntimeDatabase;
  transitFiles: ITransitFileService;
  uploadTransitFile?: (request: Request) => Promise<TransitFileUpload>;
  publicOrigin: string;
  configuredOrigin?: string;
  secretCodec: ISecretCodec;
  adminToken?: string;
  runtimeToken?: string;
  allowedCustomOAuth?: string[];
  verifyRuntimeJwt?: RuntimeJwtVerifier;
  actionPolicy?: ActionPolicyService;
  registerStaticRoutes?: (app: Hono) => void;
  logger?: RuntimeLogger;
  computeRuntimeAuthConfigured?: boolean;
  compressApiResponses?: boolean;
  serveDocumentation?: boolean;
}

export interface ConnectApp {
  saasCleanup: SaasCleanupService;
  app: Hono;
  runtimeAuthConfigured: boolean;
}

export async function createConnectApp(options: ConnectAppOptions): Promise<ConnectApp> {
  const saasClient = new SaasClient();
  const saasProject = new SaasProjectService({
    catalog: options.catalog,
    store: options.runtimeDatabase.saasProjectStore,
    secretCodec: options.secretCodec,
    configuredOrigin: options.configuredOrigin,
    client: saasClient,
  });
  const saasOAuth = new SaasOAuthService({
    projects: saasProject,
    requests: options.runtimeDatabase.connectionRequestStore,
    client: saasClient,
  });
  const saas = new SaasExecutionService({ projects: saasProject, client: saasClient });
  const marketplace = new MarketplaceService({
    catalog: options.catalog,
    store: options.runtimeDatabase.marketplaceStore,
    secretCodec: options.secretCodec,
  });
  await marketplace.initialize();
  const runtimeTokens = new RuntimeTokenService(options.runtimeDatabase.runtimeTokenStore, options.logger);
  const hasStoredRuntimeTokens = async (): Promise<boolean> => (await runtimeTokens.listTokens()).length > 0;
  const allowedCustomOAuth = new Set(options.allowedCustomOAuth);
  const isCustomClientConfigAllowed = (service: string): boolean =>
    allowedCustomOAuth.has("*") || allowedCustomOAuth.has(service);
  const oauthClientConfigs = new OAuthClientConfigService({
    catalog: options.catalog,
    origin: options.publicOrigin,
    store: options.runtimeDatabase.oauthClientConfigStore,
    isCustomClientConfigAvailable: (service) => options.secretCodec.encrypted && isCustomClientConfigAllowed(service),
  });
  const connections = new ConnectionService({
    catalog: options.catalog,
    oauthCredentials: new OAuthCredentialRefreshService(oauthClientConfigs, options.providerLoader),
    providerLoader: options.providerLoader,
    store: options.runtimeDatabase.connectionStore,
    logger: options.logger,
    marketplace,
  });
  const actions = new ActionRunner({
    catalog: options.catalog,
    providerLoader: options.providerLoader,
    connections,
    runs: options.runtimeDatabase.runLogStore,
    saas,
    transitFiles: options.transitFiles,
    logger: options.logger,
    marketplace,
  });

  return {
    saasCleanup: new SaasCleanupService({
      store: options.runtimeDatabase.saasProjectStore,
      requests: options.runtimeDatabase.connectionRequestStore,
      client: saasClient,
      logger: options.logger,
    }),
    app: new ConnectServer({
      catalog: options.catalog,
      publicOrigin: options.publicOrigin,
      providerLoader: options.providerLoader,
      connections,
      oauthClientConfigs,
      oauthFlow: new OAuthFlowService({
        clientConfigs: oauthClientConfigs,
        connections,
        providerLoader: options.providerLoader,
        states: options.runtimeDatabase.oauthStateStore,
        requests: options.runtimeDatabase.connectionRequestStore,
        secretCodec: options.secretCodec,
        isCustomClientConfigAllowed,
        saasOAuth,
      }),
      actions,
      idempotency: options.runtimeDatabase.idempotencyStore,
      transitFiles: options.transitFiles,
      uploadTransitFile: options.uploadTransitFile,
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
      marketplace,
      saas,
      saasProject,
      saasOAuth,
      compressApiResponses: options.compressApiResponses,
      serveDocumentation: options.serveDocumentation,
    }).createApp(),
    runtimeAuthConfigured:
      Boolean(options.runtimeToken) ||
      Boolean(options.verifyRuntimeJwt) ||
      (options.computeRuntimeAuthConfigured === false ? false : await hasStoredRuntimeTokens()),
  };
}
