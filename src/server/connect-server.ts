import type { CatalogStore } from "../catalog-store.ts";
import type { ConnectionService } from "../connection-service.ts";
import type { ActionSearchIndexProvider } from "../core/action-search.ts";
import type { ProviderHttpDispatchOptions } from "../core/provider-http-dispatch.ts";
import type { RuntimeLogger, TransitFileUpload } from "../core/types.ts";
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
import type { ITransitFileService } from "./files/transit-file-store.ts";
import type { IIdempotencyStore } from "./storage/idempotency-store.ts";
import type { IRuntimePolicyStore } from "./storage/runtime-policy-store.ts";
import type { RuntimeTokenService } from "./storage/runtime-token-service.ts";

import { Hono } from "hono";
import { compress } from "hono/compress";
import { ActionPolicyService } from "../core/action-policy.ts";
import { createActionSearchIndexProvider } from "../core/action-search.ts";
import { optionalRecord } from "../core/cast.ts";
import { withProviderHttpDispatch } from "../core/provider-http-dispatch.ts";
import { ProviderDispatchRequestError, toProviderExecutionError } from "../providers/provider-runtime.ts";
import { SaasError } from "../saas/saas-client.ts";
import { ActionRunner } from "./actions/action-runner.ts";
import { clearLocalAuthCookie, createLocalAuthMiddleware, readLocalAuthSession } from "./api/auth.ts";
import { getResponseCachePolicy } from "./api/cache-policy.ts";
import { createConnectionRoutes } from "./api/connection-routes.ts";
import { createConsoleCatalogRoutes } from "./api/console-catalog-routes.ts";
import { createConsoleOAuthRoutes } from "./api/console-oauth-routes.ts";
import { createDocsRoutes, loadDocsHandler } from "./api/docs-routes.ts";
import { HttpRequestError, internalError, jsonError, notFound } from "./api/http-utils.ts";
import { createMarketplaceRoutes } from "./api/marketplace-routes.ts";
import { createMcpRoutes, loadMcpModule } from "./api/mcp-routes.ts";
import { createPolicyRoutes } from "./api/policy-routes.ts";
import { createPolicySnapshotProvider } from "./api/policy-snapshot.ts";
import { createRunLogRoutes } from "./api/run-log-routes.ts";
import { writeRuntimeFailure, writeRuntimeSuccess } from "./api/runtime-api.ts";
import { createRuntimeAppRoutes } from "./api/runtime-app-routes.ts";
import { createRuntimeCatalogRoutes } from "./api/runtime-catalog-routes.ts";
import { createRuntimeExecutionRoutes } from "./api/runtime-execution-routes.ts";
import { createSaasOAuthRoutes } from "./api/saas-oauth-routes.ts";
import { createSaasProjectRoutes } from "./api/saas-project-routes.ts";
import { createTransitFileRoutes } from "./api/transit-file-routes.ts";
import { createTriggerRoutes } from "./api/trigger-routes.ts";
import { ProxyRunner } from "./proxy/proxy-runner.ts";

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
  actionPolicy?: ActionPolicyService;
  runtimePolicyStore: IRuntimePolicyStore;
  actionSearch?: ActionSearchIndexProvider;
  registerStaticRoutes?: (app: Hono) => void;
  logger?: RuntimeLogger;
  compressApiResponses?: boolean;
  serveDocumentation?: boolean;
  /** Seconds the OAuth completion page waits before closing its window. `0` closes it as soon as it loads. */
  oauthCloseDelaySeconds?: number;
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
  private readonly actionSearch: ActionSearchIndexProvider;
  private readonly actionPolicy: ActionPolicyService;
  private readonly proxyRunner: ProxyRunner;
  private readonly getPolicySnapshot: PolicySnapshotProvider;

  constructor(options: IConnectServerOptions) {
    this.options = options;
    this.actionSearch = options.actionSearch ?? createActionSearchIndexProvider(options.catalog.actions);
    this.actionPolicy = options.actionPolicy ?? new ActionPolicyService();
    this.proxyRunner = new ProxyRunner({
      providerHttpDispatch: options.providerHttpDispatch,
      catalog: options.catalog,
      providerLoader: options.providerLoader,
      connections: options.connections,
      logger: options.logger,
      saas: options.saas,
    });
    this.getPolicySnapshot = createPolicySnapshotProvider({
      actionPolicy: this.actionPolicy,
      runtimePolicyStore: options.runtimePolicyStore,
      logger: options.logger,
    });
  }

  createApp(): Hono {
    const app = new Hono();
    const auth = this.options.auth ?? {};

    app.use("*", async (_context, next) => {
      await withProviderHttpDispatch({ operation: "runtime" }, next, this.options.providerHttpDispatch);
    });

    app.use("*", async (context, next) => {
      await next();
      const cachePolicy = getResponseCachePolicy(context.req.method, context.req.path, context.res.status);
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

    // Health and runtime discovery / execution endpoints
    app.get("/v1/health", (context) => writeRuntimeSuccess(context, { ok: true, runtime: "oomol-connect" }));

    app.route(
      "/v1",
      createRuntimeCatalogRoutes({
        catalog: this.options.catalog,
        connections: this.options.connections,
        actionSearch: this.actionSearch,
        oauthClientConfigs: this.options.oauthClientConfigs,
        saasProject: this.options.saasProject,
      }),
    );
    app.route(
      "/v1",
      createRuntimeAppRoutes({
        connections: this.options.connections,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );
    app.route(
      "/v1",
      createRuntimeExecutionRoutes({
        catalog: this.options.catalog,
        actions: this.options.actions,
        idempotency: this.options.idempotency,
        proxyRunner: this.proxyRunner,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );
    app.route("/v1", createConnectionRoutes(this.options));

    // Triggers and protocols
    app.route(
      "/",
      createTriggerRoutes({
        catalog: this.options.catalog,
        triggers: this.options.triggers,
        triggerMaintenance: this.options.triggerMaintenance,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );
    app.route(
      "/",
      createMcpRoutes({
        catalog: this.options.catalog,
        connections: this.options.connections,
        actions: this.options.actions,
        actionSearch: this.actionSearch,
        getPolicySnapshot: this.getPolicySnapshot,
      }),
    );

    // API documentation (OpenAPI and Scalar reference)
    app.route(
      "/",
      createDocsRoutes({
        providers: this.options.catalog.providers,
        publicOrigin: this.options.publicOrigin,
        serveDocumentation: this.options.serveDocumentation,
      }),
    );

    // Console API routes
    app.route(
      "/api",
      createConsoleCatalogRoutes({
        catalog: this.options.catalog,
        connections: this.options.connections,
        actionSearch: this.actionSearch,
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
      app.route("/api", createMarketplaceRoutes({ marketplace: this.options.marketplace }));
    }
    app.route("/api", createRunLogRoutes({ actions: this.options.actions }));
    app.route("/api", createTransitFileRoutes(this.options));
    app.route(
      "/api",
      createPolicyRoutes({
        runtimeTokens: this.options.runtimeTokens,
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
      app.route("/", createSaasOAuthRoutes({ saasProject: saas, saasOAuth: this.options.saasOAuth }));
    }
    app.route(
      "/",
      createConsoleOAuthRoutes({
        connections: this.options.connections,
        oauthFlow: this.options.oauthFlow,
        oauthClientConfigs: this.options.oauthClientConfigs,
        saasProject: this.options.saasProject,
        logger: this.options.logger,
        oauthCloseDelaySeconds: this.options.oauthCloseDelaySeconds,
      }),
    );

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
            path: context.req.path,
            code: error.code,
            status: error.status,
            reason: error.message,
          },
          "SaaS request failed",
        );
        if (error.retryAfter) context.header("Retry-After", error.retryAfter);
        if (context.req.path.startsWith("/v1/"))
          return writeRuntimeFailure(context, { status: error.status, errorCode: error.code, message: error.message });
        return context.json(
          { error: { code: error.code, message: error.message, reason: error.reason } },
          error.status,
        );
      }
      if (error instanceof HttpRequestError) {
        if (context.req.path.startsWith("/v1/")) {
          return writeRuntimeFailure(context, {
            status: error.status,
            errorCode: error.code,
            message: error.message,
          });
        }
        return jsonError(context, error.status, error.code, error.message);
      }
      this.options.logger?.error(
        {
          err: error,
          method: context.req.method,
          path: context.req.path,
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
