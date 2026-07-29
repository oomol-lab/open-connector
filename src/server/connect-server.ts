import type { CatalogStore, RuntimeActionDefinition } from "../catalog-store.ts";
import type { ConnectionService, Tenant } from "../connection-service.ts";
import type { ActionPolicySnapshot } from "../core/action-policy.ts";
import type { ActionSearchIndexProvider, ActionSearchResult } from "../core/action-search.ts";
import type { OAuthAuthorizationComplete } from "../oauth/oauth-flow-service.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { LocalAuthOptions } from "./api/auth.ts";
import type { RuntimeActionHttpResult } from "./api/runtime-api.ts";
import type { ITransitFileService } from "./files/transit-file-store.ts";
import type { Logger } from "./logger.ts";
import type { IIdempotencyStore } from "./storage/idempotency-store.ts";
import type { IRuntimePolicyStore } from "./storage/runtime-policy-store.ts";
import type { RunLogCaller, RunLogListInput } from "./storage/runtime-store.ts";
import type { RuntimeGrant, RuntimeTokenService } from "./storage/runtime-token-service.ts";
import type { Context } from "hono";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { ConnectionError, defaultConnectionName, defaultTenant } from "../connection-service.ts";
import { ActionPolicyService, emptyPolicyRules } from "../core/action-policy.ts";
import { DEFAULT_ACTION_SEARCH_LIMIT, createActionSearchIndexProvider, searchActions } from "../core/action-search.ts";
import { optionalRecord, optionalString, requiredString } from "../core/cast.ts";
import { createMcpServer, listMcpToolSummaries } from "../mcp.ts";
import { OAuthClientConfigError, OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthFlowError, OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import {
  ActionInputDepthError,
  createIdempotencyExpiry,
  hashActionRequest,
  hashIdempotencyKey,
  readIdempotencyKey,
} from "./actions/action-idempotency.ts";
import { ActionRunner } from "./actions/action-runner.ts";
import { renderActionMarkdown } from "./api/action-markdown.ts";
import { clearLocalAuthCookie, createLocalAuthMiddleware, readLocalAuthSession, readRuntimeGrant } from "./api/auth.ts";
import { getResponseCachePolicy } from "./api/cache-policy.ts";
import { connectSessionAllowsService, ConnectSessionService } from "./api/connect-session.ts";
import { HttpRequestError, internalError, jsonError, notFound, readJsonBody } from "./api/http-utils.ts";
import { renderOAuthCompletionPage } from "./api/oauth-completion-page.ts";
import { createOpenApiDocument } from "./api/openapi.ts";
import {
  policyRequestMaxBytes,
  readAllowedConnections,
  readRuntimePolicyRules,
  readTokenPolicy,
} from "./api/policy-input.ts";
import {
  mapConnectionErrorStatus,
  serializeRuntimeAction,
  serializeRuntimeActionResult,
  serializeRuntimeActionService,
  serializeRuntimeConnectedApp,
  serializeRuntimeFailure,
  serializeRuntimeProvider,
  writeRuntimeActionHttpResult,
  writeRuntimeFailure,
  writeRuntimeSuccess,
} from "./api/runtime-api.ts";
import { createTransitFileResponse, TransitFileError } from "./files/transit-file-store.ts";
import { ProxyRunner } from "./proxy/proxy-runner.ts";
import { decodeRunLogCursor } from "./storage/runtime-store.ts";

/**
 * Dependencies required to construct the local connector server.
 */
export interface IConnectServerOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  oauthClientConfigs: OAuthClientConfigService;
  oauthFlow: OAuthFlowService;
  runtimeTokens: RuntimeTokenService;
  actions: ActionRunner;
  idempotency: IIdempotencyStore;
  transitFiles: ITransitFileService;
  staticRoot?: string;
  auth?: LocalAuthOptions;
  actionPolicy?: ActionPolicyService;
  runtimePolicyStore: IRuntimePolicyStore;
  actionSearch?: ActionSearchIndexProvider;
  registerStaticRoutes?: (app: Hono) => void;
  logger?: Logger;
  compressApiResponses?: boolean;
  /** Expose GET /api/connections/:service/credential. Off unless explicitly enabled. */
  credentialReadEnabled?: boolean;
  /** Mints browser-facing connect sessions. Omitted disables /api/connect/sessions and /connect. */
  connectSessions?: ConnectSessionService;
  /** Public origin used to build the connect URL handed to a browser. */
  publicOrigin?: string;
  /**
   * When set, a successful OAuth callback redirects the browser here (with
   * service/connectionId/tenant/connectionName as query params) instead of rendering
   * the built-in completion page. Lets the embedding app serve its own same-origin
   * completion page — BroadcastChannel only delivers same-origin, so a caller whose
   * console runs on a different origin than this server needs this to receive the
   * completion message at all. Omitted keeps the existing inline page.
   */
  completionRedirectUrl?: string;
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
  private readonly policySnapshots = new WeakMap<Request, Promise<ActionPolicySnapshot>>();

  constructor(options: IConnectServerOptions) {
    this.options = options;
    this.actionSearch = options.actionSearch ?? createActionSearchIndexProvider(options.catalog.actions);
    this.actionPolicy = options.actionPolicy ?? new ActionPolicyService();
    this.proxyRunner = new ProxyRunner({
      catalog: options.catalog,
      providerLoader: options.providerLoader,
      connections: options.connections,
      actionPolicy: this.actionPolicy,
      logger: options.logger,
    });
  }

  createApp(): Hono {
    const app = new Hono();
    const auth = this.options.auth ?? {};

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
    app.get("/v1/health", (context) => writeRuntimeSuccess(context, { ok: true, runtime: "oomol-connect" }));
    app.get("/v1/providers", (context) => this.listRuntimeProviders(context));
    app.get("/v1/actions", (context) => this.listRuntimeActions(context));
    app.get("/v1/actions/search", (context) => this.searchRuntimeActions(context));
    app.get("/v1/actions/:actionId", (context) => this.getRuntimeAction(context, context.req.param("actionId")));
    app.post("/v1/actions/:actionId", (context) => this.createRuntimeActionRun(context, context.req.param("actionId")));
    app.get("/v1/apps", (context) => this.listRuntimeApps(context));
    app.get("/v1/apps/authenticated", (context) => this.listAuthenticatedRuntimeApps(context));
    app.get("/v1/apps/services/:service", (context) =>
      this.listRuntimeAppsByService(context, context.req.param("service")),
    );
    app.post("/v1/proxy/:service", (context) => this.createRuntimeProxyRequest(context, context.req.param("service")));

    app.get("/openapi.json", (context) =>
      context.json(
        createOpenApiDocument(this.options.catalog.providers, {
          actionId: optionalString(context.req.query("actionId")),
        }),
      ),
    );
    app.get(
      "/docs",
      Scalar({
        pageTitle: "OOMOL Connect API Reference",
        url: "/openapi.json",
        theme: "default",
        darkMode: false,
        forceDarkModeState: "light",
        customCss: `
          :root {
            --scalar-color-accent: rgb(59, 99, 251);
            --scalar-background-accent: rgba(59, 99, 251, 0.12);
          }
        `,
      }),
    );

    // Schema-free listing. The action detail view loads full schemas on demand
    // from /api/actions/:actionId. The catalog is immutable at runtime, so the
    // body and its ETag are precomputed and reused, and unchanged reloads get a
    // 304 instead of re-downloading the payload.
    app.get("/api/providers", (context) => this.listProviderSummaries(context));
    app.get("/api/providers/:service", (context) => this.getProvider(context, context.req.param("service")));

    app.get("/api/actions", (context) => context.json(this.options.catalog.actions));
    app.get("/api/actions/search", (context) => this.searchApiActions(context));
    app.get("/api/actions/:actionId/agent.md", (context) =>
      this.getActionMarkdown(context, context.req.param("actionId")),
    );
    app.get("/api/actions/:actionId", (context) => this.getAction(context, context.req.param("actionId")));
    app.get("/api/auth/session", async (context) => context.json(await readLocalAuthSession(context, auth)));
    app.post("/api/auth/logout", (context) => {
      clearLocalAuthCookie(context);
      return context.json({ ok: true });
    });

    app.get("/api/connections", (context) => this.listConnections(context));
    // Registered before /:service so "credential" can never be routed as a service name.
    app.get("/api/connections/:service/credential", (context) =>
      this.readConnectionCredential(context, context.req.param("service")),
    );
    app.put("/api/connections/:service", (context) => this.upsertConnection(context, context.req.param("service")));
    app.delete("/api/connections/:service", (context) => this.disconnect(context, context.req.param("service")));

    app.get("/api/runs", (context) => this.listRuns(context));
    app.get("/api/runs/:id", (context) => this.getRun(context, context.req.param("id")));
    app.post("/api/files", (context) => this.createTransitFile(context));
    app.get("/api/files/:fileId", (context) => this.getTransitFile(context, context.req.param("fileId")));
    app.delete("/api/files/:fileId", (context) => this.deleteTransitFile(context, context.req.param("fileId")));
    app.get("/api/runtime-tokens", (context) => this.listRuntimeTokens(context));
    app.post("/api/runtime-tokens", (context) => this.createRuntimeToken(context));
    app.put("/api/runtime-tokens/:id", (context) => this.updateRuntimeToken(context, context.req.param("id")));
    app.delete("/api/runtime-tokens/:id", (context) => this.revokeRuntimeToken(context, context.req.param("id")));
    app.get("/api/runtime-policy", (context) => this.getRuntimePolicy(context));
    app.put("/api/runtime-policy", (context) => this.updateRuntimePolicy(context));
    app.get("/api/oauth/configs", (context) => this.listOAuthConfigs(context));
    app.put("/api/oauth/configs/:service", (context) => this.upsertOAuthConfig(context, context.req.param("service")));
    app.delete("/api/oauth/configs/:service", (context) =>
      this.deleteOAuthConfig(context, context.req.param("service")),
    );
    app.post("/api/oauth/authorizations", (context) => this.createOAuthAuthorization(context));
    app.post("/api/connect/sessions", (context) => this.createConnectSession(context));
    // Public by design: this is the URL an end user's browser opens, and it authenticates
    // with the session token in the query string rather than an admin credential.
    app.get("/connect", (context) => this.startConnectSession(context));
    app.get("/oauth/callback", (context) => this.completeOAuth(context));
    app.post("/mcp", (context) => this.handleMcp(context));
    app.get("/mcp", (context) => this.rejectMcpMethod(context));
    app.delete("/mcp", (context) => this.rejectMcpMethod(context));
    app.get("/mcp/tools", (context) => context.json({ tools: listMcpToolSummaries() }));

    this.options.registerStaticRoutes?.(app);
    app.onError((error, context) => {
      if (error instanceof HttpRequestError) {
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
      return internalError(context, error);
    });

    return app;
  }

  private listProviderSummaries(context: Context): Response {
    const { providerSummariesJson, providerSummariesEtag } = this.options.catalog;
    context.header("ETag", providerSummariesEtag);
    if (requestMatchesEtag(context.req.header("If-None-Match"), providerSummariesEtag)) {
      return context.body(null, 304);
    }
    return context.body(providerSummariesJson, 200, { "Content-Type": "application/json" });
  }

  private getProvider(context: Context, service: string): Response {
    const provider = this.options.catalog.providers.find((provider) => provider.service === service);
    if (!provider) {
      return notFound(context);
    }

    return context.json(provider);
  }

  private async createTransitFile(context: Context): Promise<Response> {
    try {
      const form = await context.req.raw.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonError(context, 400, "invalid_input", "file is required.");
      }
      const upload = await this.options.transitFiles.create(file);
      return context.json(upload);
    } catch (error) {
      return this.handleTransitFileError(context, error);
    }
  }

  private async getTransitFile(context: Context, fileId: string): Promise<Response> {
    try {
      if (this.options.transitFiles.response) {
        return await this.options.transitFiles.response(fileId);
      }

      const file = await this.options.transitFiles.read(fileId);
      return createTransitFileResponse(file);
    } catch (error) {
      return this.handleTransitFileError(context, error);
    }
  }

  private async deleteTransitFile(context: Context, fileId: string): Promise<Response> {
    try {
      const deleted = await this.options.transitFiles.delete(fileId);
      return context.json({ fileId, deleted });
    } catch (error) {
      return this.handleTransitFileError(context, error);
    }
  }

  private handleTransitFileError(context: Context, error: unknown): Response {
    if (error instanceof TransitFileError) {
      return jsonError(context, error.status, error.code, error.message);
    }
    throw error;
  }

  private getAction(context: Context, actionId: string): Response {
    const action = this.options.catalog.actionsById.get(actionId);
    if (!action) {
      return notFound(context);
    }

    return context.json(action);
  }

  private async listRuns(context: Context): Promise<Response> {
    const query = readRunLogListInput(context);
    if (!query.ok) {
      return jsonError(context, 400, "invalid_input", query.message);
    }

    return context.json(await this.options.actions.listRuns(query.input));
  }

  private async getRun(context: Context, id: string): Promise<Response> {
    const run = await this.options.actions.getRun(id);
    return run ? context.json(run) : jsonError(context, 404, "run_not_found", `Run not found: ${id}.`);
  }

  private async searchApiActions(context: Context): Promise<Response> {
    const query = readSearchQuery(context);
    if (!query.ok) {
      return jsonError(context, 400, "invalid_input", query.message);
    }

    const index = await this.actionSearch.get();
    return context.json(
      await this.serializeSearchResults(
        readTenant(context),
        searchActions(index, query.q, {
          service: query.service,
          limit: query.limit,
        }),
      ),
    );
  }

  private async getActionMarkdown(context: Context, actionId: string): Promise<Response> {
    const action = this.options.catalog.actionsById.get(actionId);
    if (!action) {
      return notFound(context);
    }

    try {
      const policy = (await this.getPolicySnapshot(context)).evaluate(action);
      return context.text(
        renderActionMarkdown(action, {
          connection: await this.options.connections.getConnectionSummary(
            readTenant(context),
            action.service,
            readConnectionName(context),
          ),
          providerPermissions: action.providerPermissions,
          policy,
        }),
        200,
        {
          "content-type": "text/markdown; charset=utf-8",
        },
      );
    } catch (error) {
      if (error instanceof ConnectionError) {
        const status = mapConnectionErrorStatus(error);
        // agent.md uses the admin JSON error envelope; mapConnectionErrorStatus may
        // return 409 for OAuth refresh failures, which jsonError does not accept.
        if (status === 409) {
          return context.json({ error: { code: error.code, message: error.message } }, 409);
        }
        return jsonError(context, status, error.code, error.message);
      }
      throw error;
    }
  }

  private listRuntimeProviders(context: Context): Response {
    const services = context.req.queries("service") ?? [];
    const query = optionalString(context.req.query("q"))?.toLowerCase();
    const providers = this.options.catalog.providers.filter((provider) => {
      if (services.length > 0 && !services.includes(provider.service)) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [provider.service, provider.displayName, provider.categories.join(" "), provider.authTypes.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return writeRuntimeSuccess(context, providers.map(serializeRuntimeProvider));
  }

  private listRuntimeActions(context: Context): Response {
    const service = optionalString(context.req.query("service"));
    if (!service) {
      const services = [...new Set(this.options.catalog.actions.map((action) => action.service))];
      return writeRuntimeSuccess(context, services.map(serializeRuntimeActionService));
    }

    const actions = this.options.catalog.actions.filter((action) => action.service === service);
    return writeRuntimeSuccess(context, actions.map(serializeRuntimeAction));
  }

  private async searchRuntimeActions(context: Context): Promise<Response> {
    const query = readSearchQuery(context, 10);
    if (!query.ok) {
      return writeRuntimeFailure(context, {
        status: 400,
        errorCode: "invalid_input",
        message: query.message,
      });
    }

    const index = await this.actionSearch.get();
    const results = searchActions(index, query.q, {
      service: query.service,
      limit: query.limit,
    });
    return writeRuntimeSuccess(context, await this.serializeSearchResults(readTenant(context), results));
  }

  private async serializeSearchResults(
    tenant: Tenant,
    results: ActionSearchResult[],
  ): Promise<RuntimeActionSearchResult[]> {
    const authenticated = new Set(
      await this.options.connections.listAuthenticatedServices(tenant, [
        ...new Set(results.map((result) => result.service)),
      ]),
    );
    return results.flatMap((result) => {
      const action = this.options.catalog.actionsById.get(result.id);
      if (!action) {
        return [];
      }
      return [serializeActionSearchResult(result, action, authenticated.has(action.service))];
    });
  }

  private getRuntimeAction(context: Context, actionId: string): Response {
    const action = this.options.catalog.actionsById.get(actionId);
    if (!action) {
      return writeRuntimeFailure(context, {
        status: 404,
        errorCode: "invalid_input",
        message: `unknown action: ${actionId}`,
        meta: { actionId },
      });
    }

    return writeRuntimeSuccess(context, serializeRuntimeAction(action));
  }

  private async createRuntimeActionRun(context: Context, actionId: string): Promise<Response> {
    const action = this.options.catalog.actionsById.get(actionId);
    if (!action) {
      return writeRuntimeFailure(context, {
        status: 404,
        errorCode: "invalid_input",
        message: `unknown action: ${actionId}`,
        meta: { actionId },
      });
    }

    const body = await readJsonBody(context);
    const input = body.input ?? {};
    const tenant = readTenant(context, body);
    const connectionName = readConnectionName(context, body);
    const runtimeGrant = readRuntimeGrant(context);
    let policy: ActionPolicySnapshot;
    try {
      policy = await this.getPolicySnapshot(context);
    } catch {
      return writeRuntimeFailure(context, {
        status: 500,
        errorCode: "internal_error",
        message: "Runtime policy is unavailable.",
        meta: { actionId },
      });
    }
    if (!policy.evaluate(action).allowed) {
      return writeRuntimeActionHttpResult(
        context,
        await this.executeRuntimeAction(actionId, input, tenant, connectionName, policy, runtimeGrant),
      );
    }
    const idempotencyKey = readIdempotencyKey(context.req.header("idempotency-key"));
    if (!idempotencyKey.ok) {
      return writeRuntimeFailure(context, {
        status: 400,
        errorCode: "invalid_input",
        message: idempotencyKey.message,
        meta: { actionId },
      });
    }

    if (!idempotencyKey.key) {
      return writeRuntimeActionHttpResult(
        context,
        await this.executeRuntimeAction(actionId, input, tenant, connectionName, policy, runtimeGrant),
      );
    }

    const now = new Date();
    const keyHash = hashIdempotencyKey(idempotencyKey.key);
    let requestHash: string;
    try {
      requestHash = hashActionRequest({
        actionId,
        connectionName: connectionName ?? defaultConnectionName,
        input,
        runtimeTokenId: runtimeGrant?.tokenId,
      });
    } catch (error) {
      if (!(error instanceof ActionInputDepthError)) {
        throw error;
      }
      return writeRuntimeFailure(context, {
        status: 400,
        errorCode: "invalid_input",
        message: error.message,
        meta: { actionId },
      });
    }
    const claimId = crypto.randomUUID();
    const claim = await this.options.idempotency.claim({
      keyHash,
      requestHash,
      claimId,
      now: now.toISOString(),
      expiresAt: createIdempotencyExpiry(now),
    });

    if (claim.kind === "conflict") {
      return writeRuntimeFailure(context, {
        status: 409,
        errorCode: "idempotency_key_conflict",
        message: "Idempotency-Key has already been used with a different request.",
        meta: { actionId },
      });
    }
    if (claim.kind === "in_progress") {
      return writeRuntimeFailure(context, {
        status: 409,
        errorCode: "idempotency_request_in_progress",
        message: "A request with this Idempotency-Key is still in progress.",
        meta: { actionId },
      });
    }
    if (claim.kind === "completed") {
      return writeRuntimeActionHttpResult(context, claim.response);
    }

    const result = await this.executeRuntimeAction(actionId, input, tenant, connectionName, policy, runtimeGrant);
    const completed = await this.options.idempotency.complete({
      keyHash,
      requestHash,
      claimId,
      response: result,
      expiresAt: createIdempotencyExpiry(new Date()),
    });
    if (!completed) {
      throw new Error("Idempotency claim was replaced before completion.");
    }

    return writeRuntimeActionHttpResult(context, result);
  }

  private async executeRuntimeAction(
    actionId: string,
    input: unknown,
    tenant: Tenant,
    connectionName: string | undefined,
    policy: ActionPolicySnapshot,
    runtimeGrant: RuntimeGrant | undefined,
  ): Promise<RuntimeActionHttpResult> {
    try {
      const run = await this.options.actions.run({
        actionId,
        input,
        caller: "http",
        tenant,
        connectionName,
        policy,
        runtimeTokenId: runtimeGrant?.tokenId,
        allowedConnections: runtimeGrant?.allowedConnections,
      });
      if (!run) {
        return serializeRuntimeFailure({
          status: 404,
          errorCode: "invalid_input",
          message: `unknown action: ${actionId}`,
          meta: { actionId },
        });
      }

      return serializeRuntimeActionResult({
        actionId,
        executionId: run.executionId,
        auditPersisted: run.auditPersisted,
        result: run.result,
      });
    } catch (error) {
      if (error instanceof ConnectionError) {
        return serializeRuntimeFailure({
          status: mapConnectionErrorStatus(error),
          errorCode: error.code,
          message: error.message,
          meta: { actionId },
        });
      }

      throw error;
    }
  }

  private async createRuntimeProxyRequest(context: Context, service: string): Promise<Response> {
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(context);
    } catch (error) {
      if (error instanceof HttpRequestError) {
        return writeRuntimeFailure(context, {
          status: 400,
          errorCode: "invalid_input",
          message: error.message,
          meta: { service },
        });
      }

      throw error;
    }

    let policy: ActionPolicySnapshot;
    try {
      policy = await this.getPolicySnapshot(context);
    } catch {
      return writeRuntimeFailure(context, {
        status: 500,
        errorCode: "internal_error",
        message: "Runtime policy is unavailable.",
        meta: { service },
      });
    }
    const result = await this.proxyRunner.run({
      service,
      input: body,
      tenant: readTenant(context, body),
      connectionName: readConnectionName(context, body),
      policy,
    });
    if (result.ok) {
      return writeRuntimeSuccess(context, result.response);
    }

    return writeRuntimeFailure(context, {
      status: result.status,
      errorCode: result.errorCode,
      message: result.message,
      data: result.data,
      meta: result.meta,
    });
  }

  private async listRuntimeApps(context: Context): Promise<Response> {
    return writeRuntimeSuccess(
      context,
      (await this.options.connections.listConnections(readTenant(context))).map(serializeRuntimeConnectedApp),
    );
  }

  private async listRuntimeAppsByService(context: Context, service: string): Promise<Response> {
    try {
      return writeRuntimeSuccess(
        context,
        (await this.options.connections.listConnectionsByService(readTenant(context), service)).map(
          serializeRuntimeConnectedApp,
        ),
      );
    } catch (error) {
      if (error instanceof ConnectionError) {
        return writeRuntimeFailure(context, {
          status: mapConnectionErrorStatus(error),
          errorCode: error.code,
          message: error.message,
          meta: { service },
        });
      }

      throw error;
    }
  }

  private async listAuthenticatedRuntimeApps(context: Context): Promise<Response> {
    const services = context.req.queries("service") ?? [];
    return writeRuntimeSuccess(
      context,
      await this.options.connections.listAuthenticatedServices(readTenant(context), services),
    );
  }

  private async handleMcp(context: Context): Promise<Response> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createMcpServer({
      catalog: this.options.catalog,
      providerLoader: this.options.providerLoader,
      connections: this.options.connections,
      tenant: readTenant(context),
      actions: this.options.actions,
      actionPolicy: this.actionPolicy,
      actionSearch: this.actionSearch,
      getPolicySnapshot: () => this.getPolicySnapshot(context),
      runtimeGrant: readRuntimeGrant(context),
    });

    await server.connect(transport);
    try {
      return await transport.handleRequest(context.req.raw);
    } finally {
      await server.close();
    }
  }

  private rejectMcpMethod(context: Context): Response {
    return context.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      },
      405,
    );
  }

  private async listConnections(context: Context): Promise<Response> {
    return context.json(await this.options.connections.listConnections(readTenant(context)));
  }

  /**
   * Mint a short-lived token that lets an end user's browser start an OAuth flow.
   *
   * Admin-only: deciding which tenant and which services a session may authorize is a
   * trusted decision, and the resulting token is the thing that can safely be handed to
   * a browser. The response mirrors the field names an existing caller already reads, so
   * a client written against another connector needs no change.
   */
  private async createConnectSession(context: Context): Promise<Response> {
    if (!this.options.connectSessions) {
      return notFound(context);
    }

    const body = await readJsonBody(context);
    const tenant = readTenant(context, body);
    const connectionName = readConnectionName(context, body);
    const allowedServices = readAllowedServices(body);
    if (allowedServices.length === 0) {
      // An empty allowlist would mint a token that can authorize nothing; far more
      // likely it means the caller sent the wrong field name, so say so.
      return jsonError(
        context,
        400,
        "invalid_input",
        "allowedServices must list at least one service this session may connect.",
      );
    }

    for (const service of allowedServices) {
      try {
        this.options.connections.assertProviderAvailable(service);
      } catch (error) {
        if (error instanceof ConnectionError) {
          const status = mapConnectionErrorStatus(error);
          if (status === 409) {
            return context.json({ error: { code: error.code, message: error.message } }, 409);
          }
          return jsonError(context, status, error.code, error.message);
        }
        throw error;
      }
    }

    const { token, claims } = this.options.connectSessions.create({ tenant, allowedServices, connectionName });
    const connectUrl = new URL("/connect", this.options.publicOrigin ?? "http://localhost:3000");
    connectUrl.searchParams.set("token", token);
    if (allowedServices.length === 1) {
      connectUrl.searchParams.set("service", allowedServices[0]!);
    }

    this.options.logger?.info({ tenant, allowedServices }, "connect session created");
    return context.json({
      token,
      connectUrl: connectUrl.toString(),
      expiresAt: claims.expiresAt,
      // snake_case aliases so a caller reading either convention works unmodified.
      connect_link: connectUrl.toString(),
      expires_at: claims.expiresAt,
    });
  }

  /**
   * Begin authorization on behalf of a connect session and redirect to the provider.
   *
   * The tenant comes from the signed token, never from the query string, so a user who
   * edits the URL can only ever connect into the tenant the session was minted for.
   */
  private async startConnectSession(context: Context): Promise<Response> {
    if (!this.options.connectSessions) {
      return notFound(context);
    }

    const token = optionalString(context.req.query("token"));
    if (!token) {
      return jsonError(context, 400, "invalid_input", "token is required.");
    }

    const verified = this.options.connectSessions.verify(token);
    if (!verified.ok) {
      this.options.logger?.warn({ errorCode: verified.code }, "connect session rejected");
      return jsonError(context, 401, verified.code, "Connect session is invalid or has expired.");
    }

    const service = optionalString(context.req.query("service")) ?? verified.claims.allowedServices[0];
    if (!service || !connectSessionAllowsService(verified.claims, service)) {
      this.options.logger?.warn(
        { service, tenant: verified.claims.tenant },
        "connect session rejected: service not allowed",
      );
      // jsonError's status union has no 403; emit the envelope directly.
      return context.json(
        {
          error: { code: "service_not_allowed", message: "This connect session cannot connect that service." },
        },
        403,
      );
    }

    try {
      const authorization = await this.options.oauthFlow.startAuthorization({
        tenant: verified.claims.tenant,
        service,
        connectionName: verified.claims.connectionName,
      });
      return context.redirect(authorization.authorizationUrl, 302);
    } catch (error) {
      if (error instanceof OAuthFlowError || error instanceof ConnectionError) {
        this.options.logger?.warn({ service, errorCode: error.code }, "connect session start failed");
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }
      throw error;
    }
  }

  /**
   * Return a connection's decrypted credential.
   *
   * This is the one endpoint that hands a provider secret back to a caller, which is
   * exactly what the rest of this runtime is designed not to do. It exists only to let
   * an existing integration that already holds provider tokens migrate onto the gateway
   * incrementally, and is expected to be removed once callers execute Actions instead.
   *
   * Three independent conditions must all hold, so no single misconfiguration exposes it:
   *
   *   1. `credentialReadEnabled` — opt in explicitly; otherwise the route 404s and is
   *      indistinguishable from a build without it.
   *   2. An admin token must be configured. `createLocalAuthMiddleware` treats admin
   *      endpoints as open when no admin token is set (convenient for a local console,
   *      unacceptable here), so this refuses rather than inheriting that default.
   *   3. Admin scope. `/api/*` is never satisfied by a runtime token or JWT, so the
   *      credentials agents hold cannot reach this route.
   *
   * Every call is audited, including refusals — an attempt to read a credential is worth
   * seeing even when it failed.
   */
  private async readConnectionCredential(context: Context, service: string): Promise<Response> {
    if (!this.options.credentialReadEnabled) {
      return notFound(context);
    }

    const startedAt = new Date().toISOString();
    const tenant = readTenant(context);
    const connectionName = readConnectionName(context) ?? defaultConnectionName;

    const audit = async (ok: boolean, errorCode?: string): Promise<void> => {
      await this.options.actions.recordAuditEvent({
        id: crypto.randomUUID(),
        service,
        actionId: "connection.read_credential",
        caller: "http",
        startedAt,
        completedAt: new Date().toISOString(),
        ok,
        ...(errorCode ? { errorCode } : {}),
      });
    };

    if (!this.options.auth?.adminToken) {
      this.options.logger?.error(
        { service, tenant, path: context.req.path },
        "credential read refused: no admin token configured",
      );
      await audit(false, "admin_token_required");
      // jsonError's status union has no 403; the admin envelope is emitted directly, as
      // the agent.md handler already does for 409.
      return context.json(
        {
          error: {
            code: "admin_token_required",
            message: "Credential read requires OOMOL_CONNECT_ADMIN_TOKEN to be configured.",
          },
        },
        403,
      );
    }

    try {
      const credential = await this.options.connections.getCredential(tenant, service, connectionName);
      if (!credential || credential.authType === "no_auth") {
        await audit(false, "connection_not_found");
        return jsonError(context, 404, "connection_not_found", `${service} connection not found: ${connectionName}.`);
      }

      this.options.logger?.warn({ service, tenant, connectionName }, "credential read");
      await audit(true);
      return context.json({ service, tenant, connectionName, credential });
    } catch (error) {
      if (error instanceof ConnectionError) {
        await audit(false, error.code);
        const status = mapConnectionErrorStatus(error);
        if (status === 409) {
          return context.json({ error: { code: error.code, message: error.message } }, 409);
        }
        return jsonError(context, status, error.code, error.message);
      }

      await audit(false, "internal_error");
      throw error;
    }
  }

  private async upsertConnection(context: Context, service: string): Promise<Response> {
    const body = await readJsonBody(context);
    const authType = optionalString(body.authType);
    if (!authType) {
      this.options.logger?.warn(
        {
          errorCode: "invalid_input",
          path: context.req.path,
          service,
        },
        "connection rejected",
      );
      return jsonError(context, 400, "invalid_input", "authType is required.");
    }

    const values = body.values ?? body;
    const tenant = readTenant(context, body);
    const connectionName = readConnectionName(context, body);
    const logContext: ConnectionLogContext = {
      operation: "connect",
      path: context.req.path,
      service,
      authType,
      connectionName,
    };
    if (authType === "no_auth") {
      this.options.logger?.info(logContext, "connection started");
      return this.writeConnectionResult(
        context,
        this.options.connections.connectWithoutAuth(tenant, service, { connectionName }),
        logContext,
      );
    }
    if (authType === "api_key") {
      this.options.logger?.info(logContext, "connection started");
      return this.writeConnectionResult(
        context,
        this.options.connections.connectWithApiKey(tenant, service, { values, connectionName }),
        logContext,
      );
    }
    if (authType === "custom_credential") {
      this.options.logger?.info(logContext, "connection started");
      return this.writeConnectionResult(
        context,
        this.options.connections.connectWithCustomCredential(tenant, service, { values, connectionName }),
        logContext,
      );
    }

    this.options.logger?.warn(
      {
        ...logContext,
        errorCode: "unsupported_auth_type",
      },
      "connection rejected",
    );
    return jsonError(context, 400, "unsupported_auth_type", `${service} does not support ${authType}.`);
  }

  private async disconnect(context: Context, service: string): Promise<Response> {
    const body = context.req.header("content-type")?.includes("application/json") ? await readJsonBody(context) : {};
    const connectionName = readConnectionName(context, body);
    const logContext: ConnectionLogContext = {
      operation: "disconnect",
      path: context.req.path,
      service,
      connectionName,
    };
    this.options.logger?.info(logContext, "connection disconnect started");
    return this.writeConnectionResult(
      context,
      this.options.connections.disconnect(readTenant(context), service, connectionName),
      logContext,
    );
  }

  private async createOAuthAuthorization(context: Context): Promise<Response> {
    const body = await readJsonBody(context);
    const requestedService = optionalString(body.service);
    const connectionName = readConnectionName(context, body);
    try {
      const service = requiredString(
        body.service,
        "service",
        (message) => new OAuthFlowError("invalid_input", message),
      );
      const logContext = {
        path: context.req.path,
        service,
        connectionName,
      };
      this.options.logger?.info(logContext, "oauth authorization started");

      const authorization = await this.options.oauthFlow.startAuthorization({
        tenant: readTenant(context, body),
        service,
        connectionName,
      });
      const authorizationUrl = new URL(authorization.authorizationUrl);
      this.options.logger?.info(
        {
          ...logContext,
          authorizationHost: authorizationUrl.host,
          redirectUri: authorizationUrl.searchParams.get("redirect_uri") ?? undefined,
        },
        "oauth authorization created",
      );
      return context.json(authorization);
    } catch (error) {
      if (error instanceof OAuthFlowError || error instanceof ConnectionError) {
        this.options.logger?.warn(
          {
            errorCode: error.code,
            path: context.req.path,
            service: requestedService,
            connectionName,
          },
          "oauth authorization failed",
        );
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }

      throw error;
    }
  }

  private async listRuntimeTokens(context: Context): Promise<Response> {
    return context.json(await this.options.runtimeTokens.listTokens());
  }

  private async createRuntimeToken(context: Context): Promise<Response> {
    const body = await readJsonBody(context, policyRequestMaxBytes);
    const name = optionalString(body.name);
    if (!name) {
      return jsonError(context, 400, "invalid_input", "name is required.");
    }

    // Token creation is an admin operation, so the tenant is read from the request here —
    // this is the one place a tenant is chosen rather than derived. Everything the token
    // later does is pinned to whatever is recorded now.
    const created = await this.options.runtimeTokens.createToken(
      name,
      readTokenPolicy(body, true),
      readTenant(context, body),
      readAllowedConnections(body),
    );
    return context.json({
      token: created.token,
      record: {
        id: created.record.id,
        name: created.record.name,
        tenant: created.record.tenant,
        allowedConnections: created.record.allowedConnections,
        allowedActions: created.record.allowedActions,
        blockedActions: created.record.blockedActions,
        allowedProxies: created.record.allowedProxies,
        createdAt: created.record.createdAt,
      },
    });
  }

  private async updateRuntimeToken(context: Context, id: string): Promise<Response> {
    const body = await readJsonBody(context, policyRequestMaxBytes);
    const token = await this.options.runtimeTokens.updateTokenPolicy(id, readTokenPolicy(body));
    return token
      ? context.json(token)
      : jsonError(context, 404, "runtime_token_not_found", `Runtime token not found: ${id}.`);
  }

  private async revokeRuntimeToken(context: Context, id: string): Promise<Response> {
    if (!(await this.options.runtimeTokens.revokeToken(id))) {
      return jsonError(context, 404, "runtime_token_not_found", `Runtime token not found: ${id}.`);
    }

    return context.json({ id, revoked: true });
  }

  private async getRuntimePolicy(context: Context): Promise<Response> {
    return context.json((await this.getPolicySnapshot(context)).state);
  }

  private async updateRuntimePolicy(context: Context): Promise<Response> {
    const body = await readJsonBody(context, policyRequestMaxBytes);
    const rules = readRuntimePolicyRules(body);
    const updatedAt = new Date().toISOString();
    await this.options.runtimePolicyStore.set({ rules, updatedAt });
    return context.json({
      deployment: this.actionPolicy.rules,
      runtime: rules,
      updatedAt,
    });
  }

  private async listOAuthConfigs(context: Context): Promise<Response> {
    return context.json(await this.options.oauthClientConfigs.listConfigs());
  }

  private async upsertOAuthConfig(context: Context, service: string): Promise<Response> {
    const body = await readJsonBody(context);
    return this.writeOAuthResult(
      context,
      this.options.oauthClientConfigs.upsertConfig({
        service,
        clientId: optionalString(body.clientId) ?? "",
        clientSecret: optionalString(body.clientSecret) ?? "",
        extra: optionalRecord(body.extra),
        secretExtra: optionalRecord(body.secretExtra),
      }),
    );
  }

  private async deleteOAuthConfig(context: Context, service: string): Promise<Response> {
    return this.writeOAuthResult(context, this.options.oauthClientConfigs.deleteConfig(service));
  }

  private async completeOAuth(context: Context): Promise<Response> {
    const state = context.req.query("state");
    const code = context.req.query("code");
    const logContext = {
      path: context.req.path,
      hasState: Boolean(state),
      hasCode: Boolean(code),
    };
    this.options.logger?.info(logContext, "oauth callback received");
    const providerError = context.req.query("error");
    if (providerError) {
      const providerErrorDescription = context.req.query("error_description");
      this.options.logger?.warn(
        {
          ...logContext,
          errorCode: "oauth_provider_error",
          providerError,
          providerErrorDescription,
        },
        "oauth callback failed",
      );
      return jsonError(
        context,
        400,
        "oauth_provider_error",
        `OAuth provider returned error "${providerError}"${providerErrorDescription ? `: ${providerErrorDescription}` : "."}`,
      );
    }
    if (!state || !code) {
      this.options.logger?.warn(
        {
          ...logContext,
          errorCode: "invalid_oauth_callback",
        },
        "oauth callback failed",
      );
      return jsonError(context, 400, "invalid_oauth_callback", "OAuth callback requires state and code.");
    }

    let service: string;
    let completion: OAuthAuthorizationComplete;
    try {
      completion = await this.options.oauthFlow.completeAuthorization({ state, code });
      service = completion.service;
      this.options.logger?.info(
        {
          ...logContext,
          service,
          tenant: completion.tenant,
          connectionName: completion.connectionName,
        },
        "oauth callback completed",
      );
    } catch (error) {
      if (error instanceof OAuthFlowError || error instanceof ConnectionError) {
        this.options.logger?.warn(
          {
            ...logContext,
            errorCode: error.code,
          },
          "oauth callback failed",
        );
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }
      throw error;
    }

    if (this.options.completionRedirectUrl) {
      const redirectUrl = new URL(this.options.completionRedirectUrl);
      redirectUrl.searchParams.set("service", service);
      redirectUrl.searchParams.set("connectionId", completion.connectionId);
      redirectUrl.searchParams.set("tenant", completion.tenant);
      redirectUrl.searchParams.set("connectionName", completion.connectionName);
      return context.redirect(redirectUrl.toString());
    }

    return context.html(renderOAuthCompletionPage(service, completion));
  }

  private async writeConnectionResult(
    context: Context,
    operation: Promise<unknown>,
    logContext?: ConnectionLogContext,
  ): Promise<Response> {
    try {
      const result = await operation;
      if (logContext) {
        this.options.logger?.info(
          logContext,
          logContext.operation === "disconnect" ? "connection disconnect completed" : "connection completed",
        );
      }
      return context.json(result);
    } catch (error) {
      if (error instanceof ConnectionError) {
        if (logContext) {
          this.options.logger?.warn(
            {
              ...logContext,
              errorCode: error.code,
            },
            logContext.operation === "disconnect" ? "connection disconnect failed" : "connection failed",
          );
        }
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }

      throw error;
    }
  }

  private async writeOAuthResult(context: Context, operation: Promise<unknown>): Promise<Response> {
    try {
      return context.json(await operation);
    } catch (error) {
      if (error instanceof OAuthClientConfigError || error instanceof OAuthFlowError) {
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }
      if (error instanceof HttpRequestError) {
        return jsonError(context, 400, error.code, error.message);
      }

      throw error;
    }
  }

  private getPolicySnapshot(context: Context): Promise<ActionPolicySnapshot> {
    const request = context.req.raw;
    let snapshot = this.policySnapshots.get(request);
    if (!snapshot) {
      snapshot = this.loadPolicySnapshot(context);
      this.policySnapshots.set(request, snapshot);
    }
    return snapshot;
  }

  private async loadPolicySnapshot(context: Context): Promise<ActionPolicySnapshot> {
    try {
      const record = await this.options.runtimePolicyStore.get();
      return this.actionPolicy.createSnapshot(
        record?.rules ?? emptyPolicyRules(),
        readRuntimeGrant(context),
        record?.updatedAt,
      );
    } catch {
      this.options.logger?.error(
        {
          method: context.req.method,
          path: context.req.path,
        },
        "runtime policy load failed",
      );
      throw new Error("Runtime policy is unavailable.");
    }
  }
}

interface ConnectionLogContext {
  operation: "connect" | "disconnect";
  path: string;
  service: string;
  authType?: string;
  connectionName?: string;
}

/**
 * RFC 7232 `If-None-Match` check. Handles `*`, comma-separated lists, and the
 * weak-comparison prefix (`W/`) so a validator round-tripped through gzip (which
 * downgrades strong to weak) still matches.
 */
function requestMatchesEtag(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  if (ifNoneMatch.trim() === "*") {
    return true;
  }
  const target = stripWeakPrefix(etag);
  return ifNoneMatch.split(",").some((candidate) => stripWeakPrefix(candidate.trim()) === target);
}

function stripWeakPrefix(etag: string): string {
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

function readConnectionName(context: Context, body?: Record<string, unknown>): string | undefined {
  return (
    optionalString(body?.connectionName) ??
    optionalString(body?.alias) ??
    optionalString(context.req.header("x-oomol-connector-alias")) ??
    optionalString(context.req.header("x-oo-connector-alias")) ??
    optionalString(context.req.query("connectionName")) ??
    optionalString(context.req.query("alias"))
  );
}

/**
 * Resolve the tenant a request operates within.
 *
 * Note the asymmetry with `readConnectionName`: a connection name is a caller's free
 * choice among connections it already owns, but a tenant is an identity claim. Hence the
 * precedence:
 *
 *   1. The authenticated runtime grant. **Authoritative** — a token carries the tenant it
 *      was issued for, and request-supplied values are ignored entirely. This is what
 *      stops an agent from reaching another tenant by setting a header or passing a
 *      `connectionName` from somewhere else.
 *   2. An explicit header/query. Reachable only when there is no runtime grant, i.e. by
 *      admin callers, who are already trusted with every tenant's data.
 *   3. `defaultTenant`, which keeps single-tenant deployments working unchanged.
 *
 * The early return in step 1 is the security control; do not "fall through" to the header
 * when a grant is present, even if the header names the same tenant.
 */
function readTenant(context: Context, body?: Record<string, unknown>): Tenant {
  const grant = readRuntimeGrant(context);
  if (grant) {
    return grant.tenant;
  }

  return (
    optionalString(body?.tenant) ??
    optionalString(context.req.header("x-oo-connector-tenant")) ??
    optionalString(context.req.query("tenant")) ??
    defaultTenant
  );
}

/** Services a connect session may authorize. Accepts one name or a list. */
function readAllowedServices(body: Record<string, unknown>): string[] {
  const single = optionalString(body.service);
  if (single) {
    return [single];
  }

  const list = body.allowedServices ?? body.allowed_integrations;
  if (!Array.isArray(list)) {
    return [];
  }

  return list.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

type SearchQuery =
  | {
      ok: true;
      q: string;
      service?: string;
      limit: number;
    }
  | {
      ok: false;
      message: string;
    };

type RunLogListQuery =
  | {
      ok: true;
      input: RunLogListInput;
    }
  | {
      ok: false;
      message: string;
    };

interface RuntimeActionSearchResult {
  id: string;
  service: string;
  name: string;
  description: string;
  authenticated: boolean;
  inputSchema: RuntimeActionDefinition["inputSchema"];
  outputSchema: RuntimeActionDefinition["outputSchema"];
}

function serializeActionSearchResult(
  result: ActionSearchResult,
  action: RuntimeActionDefinition,
  authenticated: boolean,
): RuntimeActionSearchResult {
  return {
    id: result.id,
    service: result.service,
    name: result.name,
    description: result.description,
    authenticated,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
  };
}

function readRunLogListInput(context: Context): RunLogListQuery {
  const rawLimit = optionalString(context.req.query("limit"));
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, message: "limit must be an integer between 1 and 100." };
  }

  const cursor = optionalString(context.req.query("cursor"));
  if (cursor !== undefined) {
    try {
      decodeRunLogCursor(cursor);
    } catch {
      return { ok: false, message: "cursor is invalid." };
    }
  }

  const input: RunLogListInput = { limit };
  if (cursor !== undefined) {
    input.cursor = cursor;
  }
  const service = optionalString(context.req.query("service"));
  if (service !== undefined) {
    input.service = service;
  }
  const actionId = optionalString(context.req.query("actionId"));
  if (actionId !== undefined) {
    if (actionId.length > 256) {
      return { ok: false, message: "actionId must be at most 256 characters." };
    }
    input.actionId = actionId;
  }
  const caller = optionalString(context.req.query("caller"));
  if (caller !== undefined) {
    if (!isRunLogCaller(caller)) {
      return { ok: false, message: "caller must be one of http, mcp, or web." };
    }
    input.caller = caller;
  }
  const ok = optionalString(context.req.query("ok"));
  if (ok !== undefined) {
    if (ok !== "true" && ok !== "false") {
      return { ok: false, message: "ok must be true or false." };
    }
    input.ok = ok === "true";
  }

  return { ok: true, input };
}

function isRunLogCaller(value: string): value is RunLogCaller {
  return value === "http" || value === "mcp" || value === "web";
}

function readSearchQuery(context: Context, defaultLimit = DEFAULT_ACTION_SEARCH_LIMIT): SearchQuery {
  const q = optionalString(context.req.query("q") ?? context.req.query("query"));
  if (!q || q.length > 256) {
    return { ok: false, message: "q must be a non-empty string of at most 256 characters." };
  }

  const rawLimit = optionalString(context.req.query("limit"));
  if (!rawLimit) {
    return {
      ok: true,
      q,
      service: optionalString(context.req.query("service")),
      limit: defaultLimit,
    };
  }

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, message: "limit must be an integer between 1 and 50." };
  }

  return {
    ok: true,
    q,
    service: optionalString(context.req.query("service")),
    limit,
  };
}
