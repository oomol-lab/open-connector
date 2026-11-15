import type { CatalogStore } from "../catalog-store.ts";
import type { ConnectionService } from "../connection-service.ts";
import type { ActionSearchIndexProvider } from "../core/action-search.ts";
import type { ProviderHttpDispatchOptions } from "../core/provider-http-dispatch.ts";
import type { ProviderNetworkPolicy } from "../core/provider-network-policy.ts";
import type { RuntimeLogger, TransitFileUpload } from "../core/types.ts";
import type { CustomMcpService } from "../custom-mcp/service.ts";
import type { MarketplaceService } from "../marketplace/marketplace-service.ts";
import type { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import type { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { SaasExecutionService } from "../saas/saas-execution-service.ts";
import type { SaasOAuthService } from "../saas/saas-oauth-service.ts";
import type { SaasProjectService } from "../saas/saas-project-service.ts";
import type { TriggerMaintenance } from "../triggers/maintenance.ts";
import type { TriggerRunner } from "../triggers/trigger-runner.ts";
import type { LocalAuthOptions } from "./api/auth.ts";
import type { PolicySnapshotProvider } from "./api/policy-snapshot.ts";
import type { RuntimeStatus } from "./api/runtime-api.ts";
import type { ITransitFileService } from "./files/transit-file-store.ts";
import type { McpOutputMode } from "./mcp-settings.ts";
import type { OAuthServerSettings } from "./oauth/settings.ts";
import type { IIdempotencyStore } from "./storage/idempotency-store.ts";
import type {
  IOAuthClientStore,
  IOAuthCodeStore,
  IOAuthTokenStore,
  IOAuthSigningKeyStore,
} from "./storage/oauth-as-stores.ts";
import type { RuntimeDatabase } from "./storage/runtime-database.ts";
import type { IRuntimePolicyStore } from "./storage/runtime-policy-store.ts";
import type { RuntimeTokenService, IRuntimeTokenStore } from "./storage/runtime-token-service.ts";
import type { ScopedServices } from "./tenant-services.ts";

import { Hono } from "hono";
import { compress } from "hono/compress";
import { ActionPolicyService } from "../core/action-policy.ts";
import { optionalRecord } from "../core/cast.ts";
import { ExecutionError } from "../core/execution-error.ts";
import { getExecutionTimings, withExecutionTimings } from "../core/execution-timing.ts";
import { withRuntimeExecution } from "../core/runtime-execution.ts";
import { ProviderDispatchRequestError, toProviderExecutionError } from "../providers/provider-runtime.ts";
import { SaasError } from "../saas/saas-client.ts";
import { TenantError } from "../tenant/tenant-error.ts";
import { ActionRunner } from "./actions/action-runner.ts";
import { clearLocalAuthCookie, createLocalAuthMiddleware, readLocalAuthSession, readTenantId } from "./api/auth.ts";
import { getResponseCachePolicy } from "./api/cache-policy.ts";
import { createConnectionRoutes } from "./api/connection-routes.ts";
import { createConsoleCatalogRoutes } from "./api/console-catalog-routes.ts";
import { createConsoleOAuthRoutes } from "./api/console-oauth-routes.ts";
import { createCustomMcpRoutes } from "./api/custom-mcp-routes.ts";
import { createDocsRoutes, loadDocsHandler } from "./api/docs-routes.ts";
import { createEventVerificationRoutes } from "./api/event-verification-routes.ts";
import { HttpRequestError, internalError, jsonError, notFound } from "./api/http-utils.ts";
import { createMarketplaceRoutes } from "./api/marketplace-routes.ts";
import { createMcpRoutes, loadMcpModule } from "./api/mcp-routes.ts";
import { createOAuthClientRoutes } from "./api/oauth-client-routes.ts";
import { createPolicyRoutes } from "./api/policy-routes.ts";
import { createPolicySnapshotProvider } from "./api/policy-snapshot.ts";
import { createRunLogRoutes } from "./api/run-log-routes.ts";
import { executionFailureStatus } from "./api/runtime-api.ts";
import { writeRuntimeFailure, writeRuntimeSuccess } from "./api/runtime-api.ts";
import { createRuntimeAppRoutes } from "./api/runtime-app-routes.ts";
import { createRuntimeCatalogRoutes } from "./api/runtime-catalog-routes.ts";
import { createRuntimeExecutionRoutes } from "./api/runtime-execution-routes.ts";
import { createSaasOAuthRoutes } from "./api/saas-oauth-routes.ts";
import { createSaasProjectRoutes } from "./api/saas-project-routes.ts";
import { createTransitFileRoutes } from "./api/transit-file-routes.ts";
import { createTriggerRoutes } from "./api/trigger-routes.ts";
import { CimdClient } from "./oauth/cimd-client.ts";
import { resolveOAuthServerConfig } from "./oauth/config.ts";
import { createOAuthRoutes } from "./oauth/routes.ts";

/**
 * Import and evaluate the modules the /mcp and /docs routes defer to their first request. The Node server never
 * calls this, so its startup graph stays small; Cloudflare Workers call it at app creation so an isolate keeps
 * paying module evaluation up front rather than on its first MCP or docs request.
 */
export async function preloadOptionalServerModules(): Promise<void> {
  await Promise.all([loadMcpModule(), loadDocsHandler()]);
}

/**
 * Dependencies required to construct the local connector server.
 */
export interface IConnectServerOptions {
  customMcp?: CustomMcpService;
  network?: ProviderNetworkPolicy;
  providerHttpDispatch?: ProviderHttpDispatchOptions;
  catalog: CatalogStore;
  /** Public origin of this runtime, used for the HTTP request examples in Action guides. */
  publicOrigin: string;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  oauthClientConfigs: OAuthClientConfigService;
  oauthFlow: OAuthFlowService;
  runtimeTokens: RuntimeTokenService;
  actions: ActionRunner;
  triggers?: TriggerRunner;
  triggerMaintenance?: TriggerMaintenance;
  idempotency: IIdempotencyStore;
  transitFiles: ITransitFileService;
  uploadTransitFile?: (request: Request) => Promise<TransitFileUpload>;
  auth?: LocalAuthOptions;
  /** Inbound OAuth 2.1 authorization server settings; absent/`enabled: false` mounts nothing. */
  oauth?: OAuthServerSettings;
  /**
   * Trust reverse-proxy forwarding headers (`x-forwarded-for`, `x-real-ip`,
   * `cf-connecting-ip`) when keying the OAuth endpoints' rate-limit buckets.
   * Default `false`: keys come from the socket peer address only. Enable only
   * behind a proxy that overwrites these headers.
   */
  trustProxyHeaders?: boolean;
  oauthClients: IOAuthClientStore;
  oauthCodes: IOAuthCodeStore;
  oauthTokens: IOAuthTokenStore;
  oauthKeys: IOAuthSigningKeyStore;
  runtimeTokenStore: IRuntimeTokenStore;
  /** Scoped-view factory; request handlers resolve tenant-bound stores through `forTenant`. */
  runtimeDatabase: RuntimeDatabase;
  /** Root (`local`) service bundle; `services.forTenant(tenantId)` yields the tenant-bound sibling graph. */
  services: ScopedServices;
  /** Dedicated token for inbound provider event verification. */
  eventVerifyToken?: string;
  actionPolicy?: ActionPolicyService;
  runtimePolicyStore: IRuntimePolicyStore;
  actionSearch?: ActionSearchIndexProvider;
  registerStaticRoutes?: (app: Hono) => void;
  logger?: RuntimeLogger;
  compressApiResponses?: boolean;
  serveDocumentation?: boolean;
  mcpOutputMode?: McpOutputMode;
  /** Seconds the OAuth completion page waits before closing its window. `0` closes it as soon as it loads. */
  oauthCloseDelaySeconds?: number;
  /** Origins a provider-refusal page may post its result to (`OOMOL_CONNECT_OAUTH_RESULT_ORIGINS`). */
  oauthResultOrigins?: readonly string[];
  marketplace?: MarketplaceService;
  saasProject?: SaasProjectService;
  saas?: SaasExecutionService;
  saasOAuth?: SaasOAuthService;
}

/**
 * Local single-user HTTP server for catalog browsing, credential management,
 * action execution, OpenAPI docs, and MCP tool metadata.
 */
export class ConnectServer {
  private readonly options: IConnectServerOptions;
  private readonly actionPolicy: ActionPolicyService;
  private readonly getPolicySnapshot: PolicySnapshotProvider;

  constructor(options: IConnectServerOptions) {
    this.options = options;
    this.actionPolicy = options.actionPolicy ?? new ActionPolicyService();
    this.getPolicySnapshot = createPolicySnapshotProvider({
      actionPolicy: this.actionPolicy,
      runtimePolicyStore: options.runtimePolicyStore,
      logger: options.logger,
    });
  }

  createApp(): Hono {
    const app = new Hono();
    const auth = this.options.auth ?? {};

    app.use("*", async (context, next) => {
      const run = () => withRuntimeExecution(this.options, { operation: "runtime" }, next);
      const logger = this.options.logger;
      if (!logger) return run();
      await withExecutionTimings(async () => {
        try {
          await run();
        } finally {
          logger.info(
            {
              method: context.req.method,
              path: loggableRequestPath(context.req.path),
              status: context.res.status,
              cancelled: context.req.raw.signal.aborted,
              timings: getExecutionTimings(),
            },
            "runtime request completed",
          );
        }
      });
    });

    app.use("*", async (context, next) => {
      await next();
      const cachePolicy = getResponseCachePolicy(
        context.req.method,
        context.req.path,
        context.res.status,
        context.req.query("locale") !== undefined,
        this.options.customMcp !== undefined,
      );
      if (cachePolicy) {
        context.header("Cache-Control", cachePolicy.cacheControl);
        if (cachePolicy.cloudflareCdnCacheControl) {
          context.header("Cloudflare-CDN-Cache-Control", cachePolicy.cloudflareCdnCacheControl);
        }
        if (cachePolicy.vary) {
          context.header("Vary", cachePolicy.vary);
        }
      }
    });

    app.get("/health", (context) => context.json({ ok: true }));
    if (this.options.compressApiResponses !== false) {
      // Compress dashboard JSON responses. Scoped to /api/* so the streaming
      // /mcp transport and /v1/proxy pass-through are never buffered/re-encoded.
      // The middleware's content-type filter already skips non-text bodies
      // (e.g. transit file downloads).
      app.use("/api/*", compress());
    }
    app.use("*", createLocalAuthMiddleware(auth));
    if (this.options.customMcp) {
      // Each view's catalog holds its own snapshot: resolve the request's
      // tenant first so custom MCP writes always hit the scoped overlay.
      app.use("*", async (context, next) => {
        const scoped = await this.options.services.forTenant(readTenantId(context));
        return scoped.catalog.withSnapshot(next);
      });
      app.route(
        "/api/custom-mcp",
        createCustomMcpRoutes({
          services: this.options.services,
          publicOrigin: this.options.publicOrigin,
        }),
      );
    }

    app.route(
      "/v1",
      createEventVerificationRoutes({
        services: this.options.services,
        eventVerifyToken: this.options.eventVerifyToken,
      }),
    );

    // Health and runtime discovery / execution endpoints
    app.get("/v1/health", (context) => writeRuntimeSuccess(context, { ok: true, runtime: "oomol-connect" }));

    app.route("/v1", createRuntimeCatalogRoutes({ services: this.options.services }));
    app.route(
      "/v1",
      createRuntimeAppRoutes({
        services: this.options.services,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );
    app.route(
      "/v1",
      createRuntimeExecutionRoutes({
        services: this.options.services,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );
    app.route("/v1", createConnectionRoutes({ services: this.options.services }));

    // Triggers and protocols
    app.route(
      "/",
      createTriggerRoutes({
        services: this.options.services,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );
    app.route(
      "/",
      createMcpRoutes({
        services: this.options.services,
        outputMode: this.options.mcpOutputMode,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );

    // API documentation (OpenAPI and Scalar reference)
    app.route(
      "/",
      createDocsRoutes({
        services: this.options.services,
        publicOrigin: this.options.publicOrigin,
        serveDocumentation: this.options.serveDocumentation,
      }),
    );

    // Console API routes
    app.route(
      "/api",
      createConsoleCatalogRoutes({
        services: this.options.services,
        publicOrigin: this.options.publicOrigin,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );
    app.get("/api/auth/session", async (context) => context.json(await readLocalAuthSession(context, auth)));
    app.post("/api/auth/logout", (context) => {
      clearLocalAuthCookie(context);
      return context.json({ ok: true });
    });

    if (this.options.marketplace) {
      app.route("/api", createMarketplaceRoutes({ services: this.options.services }));
    }
    app.route("/api", createRunLogRoutes({ services: this.options.services }));
    app.route("/api", createTransitFileRoutes(this.options));
    app.route(
      "/api",
      createPolicyRoutes({
        runtimeTokens: this.options.runtimeTokens,
        runtimeDatabase: this.options.runtimeDatabase,
        logger: this.options.logger,
        runtimePolicyStore: this.options.runtimePolicyStore,
        deploymentPolicyRules: this.actionPolicy.rules,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );

    const saas = this.options.saasProject;
    if (saas) {
      app.route("/api", createSaasProjectRoutes({ saasProject: saas }));
    }
    if (saas && this.options.saasOAuth) {
      app.route(
        "/",
        createSaasOAuthRoutes({
          services: this.options.services,
          saasProject: saas,
        }),
      );
    }
    app.route(
      "/",
      createConsoleOAuthRoutes({
        services: this.options.services,
        oauthStates: this.options.runtimeDatabase.forInstance().oauthStateStore,
        saasProject: this.options.saasProject,
        logger: this.options.logger,
        oauthCloseDelaySeconds: this.options.oauthCloseDelaySeconds,
        oauthResultOrigins: this.options.oauthResultOrigins,
      }),
    );

    // Inbound OAuth 2.1 authorization server (MCP clients) + its admin client
    // management API. The admin API is always mounted so registered clients
    // can be inspected and revoked even while the server itself is disabled.
    app.route(
      "/api",
      createOAuthClientRoutes({
        clients: this.options.oauthClients,
        codes: this.options.runtimeDatabase.forInstance().oauthCodeStore,
        tokens: this.options.runtimeDatabase.forInstance().oauthTokenStore,
        runtimeDatabase: this.options.runtimeDatabase,
      }),
    );
    if (this.options.oauth?.enabled) {
      const config = resolveOAuthServerConfig({
        issuer: this.options.oauth.issuer ?? this.options.publicOrigin,
        accessTokenTtlSeconds: this.options.oauth.accessTokenTtlSeconds,
        refreshTokenTtlSeconds: this.options.oauth.refreshTokenTtlSeconds,
        authorizationCodeTtlSeconds: this.options.oauth.authorizationCodeTtlSeconds,
        allowDynamicRegistration: this.options.oauth.allowDynamicRegistration,
        allowClientIdMetadataDocuments: this.options.oauth.allowClientIdMetadataDocuments,
        logger: this.options.logger,
      });
      app.route(
        "/",
        createOAuthRoutes({
          config,
          adminToken: auth.adminToken,
          clients: this.options.oauthClients,
          codes: this.options.runtimeDatabase.forInstance().oauthCodeStore,
          tokens: this.options.runtimeDatabase.forInstance().oauthTokenStore,
          keys: this.options.oauthKeys,
          runtimeTokenStore: this.options.runtimeDatabase.forInstance().runtimeTokenStore,
          runtimeDatabase: this.options.runtimeDatabase,
          trustProxyHeaders: this.options.trustProxyHeaders,
          cimd: new CimdClient({ logger: this.options.logger }),
        }),
      );
    }

    // Without a console the API owns every unknown path; a console host layers its fallback over these 404s.
    if (this.options.registerStaticRoutes) this.options.registerStaticRoutes(app);
    else app.notFound(notFound);

    app.onError((error, context) => {
      if (error instanceof ProviderDispatchRequestError) {
        if (context.req.path.startsWith("/v1/"))
          return writeRuntimeFailure(context, {
            status: 429,
            errorCode: "rate_limited",
            message: error.message,
            data: toProviderExecutionError(error, error.message).error?.details,
          });
        const seconds = optionalRecord(error.details)?.retryAfterSeconds;
        if (typeof seconds === "number") context.header("Retry-After", String(seconds));
        return jsonError(context, 429, "rate_limited", error.message);
      }
      if (error instanceof SaasError) {
        this.options.logger?.warn(
          {
            method: context.req.method,
            path: loggableRequestPath(context.req.path),
            code: error.code,
            status: error.status,
            reason: error.message,
          },
          "SaaS request failed",
        );
        if (error.retryAfter) context.header("Retry-After", error.retryAfter);
        if (context.req.path.startsWith("/v1/"))
          return writeRuntimeFailure(context, {
            status: error.status,
            errorCode: error.code,
            message: error.message,
          });
        return context.json(
          {
            error: {
              code: error.code,
              message: error.message,
              reason: error.reason,
            },
          },
          error.status,
        );
      }
      if (error instanceof TenantError) {
        return jsonError(context, error.status as RuntimeStatus, error.code, error.message);
      }
      if (error instanceof HttpRequestError || error instanceof ExecutionError) {
        const status = error instanceof ExecutionError ? executionFailureStatus(error.kind) : error.status;
        if (context.req.path.startsWith("/v1/")) {
          return writeRuntimeFailure(context, {
            status,
            errorCode: error.code,
            message: error.message,
          });
        }
        return jsonError(context, status, error.code, error.message);
      }
      this.options.logger?.error(
        {
          err: error,
          method: context.req.method,
          path: loggableRequestPath(context.req.path),
        },
        "request failed",
      );
      if (context.req.path.startsWith("/v1/")) {
        return writeRuntimeFailure(context, {
          status: 500,
          errorCode: "internal_error",
          message: "Internal server error.",
        });
      }
      return internalError(context, error);
    });

    return app;
  }
}

function loggableRequestPath(path: string): string {
  return path.startsWith("/api/files/") ? "/api/files/:fileId" : path;
}
