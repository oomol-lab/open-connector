import type { CatalogStore, RuntimeActionDefinition } from "../catalog-store.ts";
import type { ConnectionService } from "../connection-service.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { ActionSearchIndexProvider, ActionSearchResult } from "../core/action-search.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { LocalAuthOptions } from "./api/auth.ts";
import type { ITransitFileService } from "./files/transit-file-store.ts";
import type { Logger } from "./logger.ts";
import type { RunLogListInput } from "./storage/runtime-store.ts";
import type { RuntimeTokenService } from "./storage/runtime-token-service.ts";
import type { Context } from "hono";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { ConnectionError } from "../connection-service.ts";
import { DEFAULT_ACTION_SEARCH_LIMIT, createActionSearchIndexProvider, searchActions } from "../core/action-search.ts";
import { optionalRecord, optionalString, requiredString } from "../core/cast.ts";
import { createMcpServer, listMcpToolSummaries } from "../mcp.ts";
import { OAuthClientConfigError, OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthFlowError, OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { ActionRunner } from "./actions/action-runner.ts";
import { renderActionMarkdown } from "./api/action-markdown.ts";
import { clearLocalAuthCookie, createLocalAuthMiddleware, readLocalAuthSession } from "./api/auth.ts";
import { escapeHtml, HttpRequestError, internalError, jsonError, notFound, readJsonBody } from "./api/http-utils.ts";
import { createOpenApiDocument } from "./api/openapi.ts";
import {
  mapConnectionErrorStatus,
  serializeRuntimeAction,
  serializeRuntimeActionService,
  serializeRuntimeConnectedApp,
  serializeRuntimeProvider,
  writeRuntimeActionResult,
  writeRuntimeFailure,
  writeRuntimeSuccess,
} from "./api/runtime-api.ts";
import { createTransitFileResponse, TransitFileError } from "./files/transit-file-store.ts";
import { ProxyRunner } from "./proxy/proxy-runner.ts";
import { decodeRunLogCursor } from "./storage/runtime-store.ts";

const oauthCompletionChannelName = "oomol-connect-oauth";
const oauthCompletedType = "oauth.completed";

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
  transitFiles: ITransitFileService;
  staticRoot?: string;
  auth?: LocalAuthOptions;
  actionPolicy?: ActionPolicyService;
  actionSearch?: ActionSearchIndexProvider;
  registerStaticRoutes?: (app: Hono) => void;
  logger?: Logger;
}

/**
 * Local single-user HTTP server for catalog browsing, credential management,
 * action execution, OpenAPI docs, and MCP tool metadata.
 */
export class ConnectServer {
  private readonly options: IConnectServerOptions;
  private readonly actionSearch: ActionSearchIndexProvider;
  private readonly proxyRunner: ProxyRunner;

  constructor(options: IConnectServerOptions) {
    this.options = options;
    this.actionSearch = options.actionSearch ?? createActionSearchIndexProvider(options.catalog.actions);
    this.proxyRunner = new ProxyRunner({
      catalog: options.catalog,
      providerLoader: options.providerLoader,
      connections: options.connections,
      logger: options.logger,
    });
  }

  createApp(): Hono {
    const app = new Hono();
    const auth = this.options.auth ?? {};

    app.get("/health", (context) => context.json({ ok: true }));
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

    app.get("/api/providers", (context) => context.json(this.options.catalog.providers));
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
    app.put("/api/connections/:service", (context) => this.upsertConnection(context, context.req.param("service")));
    app.delete("/api/connections/:service", (context) => this.disconnect(context, context.req.param("service")));

    app.get("/api/runs", (context) => this.listRuns(context));
    app.post("/api/files", (context) => this.createTransitFile(context));
    app.get("/api/files/:fileId", (context) => this.getTransitFile(context, context.req.param("fileId")));
    app.delete("/api/files/:fileId", (context) => this.deleteTransitFile(context, context.req.param("fileId")));
    app.get("/api/runtime-tokens", (context) => this.listRuntimeTokens(context));
    app.post("/api/runtime-tokens", (context) => this.createRuntimeToken(context));
    app.delete("/api/runtime-tokens/:id", (context) => this.revokeRuntimeToken(context, context.req.param("id")));
    app.get("/api/oauth/configs", (context) => this.listOAuthConfigs(context));
    app.put("/api/oauth/configs/:service", (context) => this.upsertOAuthConfig(context, context.req.param("service")));
    app.delete("/api/oauth/configs/:service", (context) =>
      this.deleteOAuthConfig(context, context.req.param("service")),
    );
    app.post("/api/oauth/authorizations", (context) => this.createOAuthAuthorization(context));
    app.get("/oauth/callback", (context) => this.completeOAuth(context));
    app.post("/mcp", (context) => this.handleMcp(context));
    app.get("/mcp", (context) => this.rejectMcpMethod(context));
    app.delete("/mcp", (context) => this.rejectMcpMethod(context));
    app.get("/mcp/tools", (context) => context.json({ tools: listMcpToolSummaries() }));

    this.options.registerStaticRoutes?.(app);
    app.onError((error, context) => {
      if (error instanceof HttpRequestError) {
        return jsonError(context, 400, error.code, error.message);
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

  private async searchApiActions(context: Context): Promise<Response> {
    const query = readSearchQuery(context);
    if (!query.ok) {
      return jsonError(context, 400, "invalid_input", query.message);
    }

    const index = await this.actionSearch.get();
    return context.json(
      await this.serializeSearchResults(
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

    return context.text(
      renderActionMarkdown(action, {
        connection: await this.options.connections.getConnectionSummary(action.service, readConnectionName(context)),
        providerPermissions: action.providerPermissions,
      }),
      200,
      {
        "content-type": "text/markdown; charset=utf-8",
      },
    );
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
    return writeRuntimeSuccess(context, await this.serializeSearchResults(results));
  }

  private async serializeSearchResults(results: ActionSearchResult[]): Promise<RuntimeActionSearchResult[]> {
    const authenticated = new Set(
      await this.options.connections.listAuthenticatedServices([...new Set(results.map((result) => result.service))]),
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
    if (!this.options.catalog.actionsById.has(actionId)) {
      return writeRuntimeFailure(context, {
        status: 404,
        errorCode: "invalid_input",
        message: `unknown action: ${actionId}`,
        meta: { actionId },
      });
    }

    const body = await readJsonBody(context);
    try {
      const run = await this.options.actions.run({
        actionId,
        input: body.input ?? {},
        caller: "http",
        connectionName: readConnectionName(context, body),
      });
      if (!run) {
        return writeRuntimeFailure(context, {
          status: 404,
          errorCode: "invalid_input",
          message: `unknown action: ${actionId}`,
          meta: { actionId },
        });
      }

      return writeRuntimeActionResult(context, { actionId, executionId: run.executionId, result: run.result });
    } catch (error) {
      if (error instanceof ConnectionError) {
        return writeRuntimeFailure(context, {
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

    const result = await this.proxyRunner.run({
      service,
      input: body,
      connectionName: readConnectionName(context, body),
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
      (await this.options.connections.listConnections()).map(serializeRuntimeConnectedApp),
    );
  }

  private async listRuntimeAppsByService(context: Context, service: string): Promise<Response> {
    try {
      return writeRuntimeSuccess(
        context,
        (await this.options.connections.listConnectionsByService(service)).map(serializeRuntimeConnectedApp),
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
    return writeRuntimeSuccess(context, await this.options.connections.listAuthenticatedServices(services));
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
      actions: this.options.actions,
      actionPolicy: this.options.actionPolicy,
      actionSearch: this.actionSearch,
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
    return context.json(await this.options.connections.listConnections());
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
        this.options.connections.connectWithoutAuth(service, { connectionName }),
        logContext,
      );
    }
    if (authType === "api_key") {
      this.options.logger?.info(logContext, "connection started");
      return this.writeConnectionResult(
        context,
        this.options.connections.connectWithApiKey(service, { values, connectionName }),
        logContext,
      );
    }
    if (authType === "custom_credential") {
      this.options.logger?.info(logContext, "connection started");
      return this.writeConnectionResult(
        context,
        this.options.connections.connectWithCustomCredential(service, { values, connectionName }),
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
      this.options.connections.disconnect(service, connectionName),
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

      const authorization = await this.options.oauthFlow.startAuthorization({ service, connectionName });
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
      if (error instanceof OAuthFlowError) {
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
    const body = await readJsonBody(context);
    const name = optionalString(body.name);
    if (!name) {
      return jsonError(context, 400, "invalid_input", "name is required.");
    }

    const created = await this.options.runtimeTokens.createToken(name);
    return context.json({
      token: created.token,
      record: {
        id: created.record.id,
        name: created.record.name,
        createdAt: created.record.createdAt,
      },
    });
  }

  private async revokeRuntimeToken(context: Context, id: string): Promise<Response> {
    if (!(await this.options.runtimeTokens.revokeToken(id))) {
      return jsonError(context, 404, "runtime_token_not_found", `Runtime token not found: ${id}.`);
    }

    return context.json({ id, revoked: true });
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
    try {
      service = (await this.options.oauthFlow.completeAuthorization({ state, code })).service;
      this.options.logger?.info(
        {
          ...logContext,
          service,
        },
        "oauth callback completed",
      );
    } catch (error) {
      if (error instanceof OAuthFlowError) {
        this.options.logger?.warn(
          {
            ...logContext,
            errorCode: error.code,
          },
          "oauth callback failed",
        );
        return jsonError(context, 400, error.code, error.message);
      }
      throw error;
    }

    return context.html(renderOAuthCompletionPage(service));
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
}

interface ConnectionLogContext {
  operation: "connect" | "disconnect";
  path: string;
  service: string;
  authType?: string;
  connectionName?: string;
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

function renderOAuthCompletionPage(service: string): string {
  const payload = scriptJson({
    type: oauthCompletedType,
    service,
  });
  const escapedService = escapeHtml(service);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connected ${escapedService}</title>
<style>
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(222.2 84% 4.9%);
  --card: hsl(0 0% 100%);
  --card-foreground: hsl(222.2 84% 4.9%);
  --muted: hsl(210 40% 96.1%);
  --muted-foreground: hsl(215.4 16.3% 46.9%);
  --border: hsl(214.3 31.8% 91.4%);
  --primary: hsl(222.2 47.4% 11.2%);
  --primary-foreground: hsl(210 40% 98%);
  --ring: hsl(222.2 84% 4.9%);
}
* {
  box-sizing: border-box;
}
body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.card {
  width: min(100%, 420px);
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
  color: var(--card-foreground);
  box-shadow: 0 1px 2px hsl(222.2 84% 4.9% / 0.04), 0 12px 32px hsl(222.2 84% 4.9% / 0.08);
}
.header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.badge {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 2px 10px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}
h1 {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
}
p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 14px;
  line-height: 22px;
}
code {
  border-radius: 6px;
  background: var(--muted);
  padding: 2px 6px;
  color: var(--foreground);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
}
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}
.button {
  appearance: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--foreground);
  padding: 8px 14px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
}
.button:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.button:hover {
  background: var(--muted);
}
.close-note {
  font-size: 12px;
  line-height: 18px;
}
</style>
</head>
<body>
<main class="card" role="status" aria-live="polite">
  <div class="header">
    <span class="badge">Connected</span>
    <h1>Connection ready</h1>
    <p>OAuth finished for <code>${escapedService}</code>. Return to OOMOL Connect to continue.</p>
  </div>
  <div class="actions">
    <button class="button" type="button" onclick="window.close()">Close window</button>
    <p class="close-note">Automatically closing in 5 seconds.</p>
  </div>
</main>
<script>(()=>{if("BroadcastChannel" in window){const channel=new BroadcastChannel(${scriptJson(oauthCompletionChannelName)});channel.postMessage(${payload});channel.close();}setTimeout(()=>window.close(),5000);})();</script>
</body>
</html>`;
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
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

  return { ok: true, input };
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
