import type { ConnectionService } from "../../connection-service.ts";
import type { RuntimeLogger } from "../../core/types.ts";
import type { OAuthClientConfigInput, OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import type { OAuthFlowService } from "../../oauth/oauth-flow-service.ts";
import type { SaasProjectService } from "../../saas/saas-project-service.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { ConnectionError } from "../../connection-service.ts";
import {
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredRawString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { OAuthClientConfigError } from "../../oauth/oauth-client-config-service.ts";
import { OAuthCallbackError, OAuthFlowError } from "../../oauth/oauth-flow-service.ts";
import {
  HttpRequestError,
  jsonError,
  readConnectionName as defaultReadConnectionName,
  readJsonBody,
} from "./http-utils.ts";
import { renderOAuthCompletionPage } from "./oauth-completion-page.ts";

interface ConnectionLogContext extends Record<string, unknown> {
  operation: "connect" | "disconnect";
  path: string;
  service: string;
  authType?: string;
  connectionName?: string;
}

function readOAuthClientConfigInput(body: Record<string, unknown>): OAuthClientConfigInput | undefined {
  const keys = ["clientId", "clientSecret", "requestedScopes", "redirectUri", "extra", "secretExtra"];
  if (!keys.some((key) => key in body)) {
    return undefined;
  }

  return {
    clientId: optionalString(body.clientId) ?? "",
    clientSecret: optionalString(body.clientSecret) ?? "",
    requestedScopes: readOptionalStringArray(body, "requestedScopes"),
    redirectUri: readOptionalRawString(body, "redirectUri"),
    extra: optionalRecord(body.extra),
    secretExtra: optionalRecord(body.secretExtra),
  };
}

/** An absent field is undefined; a present one, null included, must be a string (blank is kept for the caller to read as unset). */
function readOptionalRawString(body: Record<string, unknown>, fieldName: string): string | undefined {
  if (!(fieldName in body)) return undefined;
  return requiredRawString(
    body[fieldName],
    fieldName,
    (message) => new HttpRequestError("invalid_input", `${message}.`),
  );
}

function readOptionalStringArray(body: Record<string, unknown>, fieldName: string): string[] | undefined {
  if (!(fieldName in body)) return undefined;
  return requiredStringArray(
    body[fieldName],
    fieldName,
    (message) => new HttpRequestError("invalid_input", `${message}.`),
  );
}

export interface ConsoleOAuthRoutesOptions {
  connections: ConnectionService;
  oauthFlow: OAuthFlowService;
  oauthClientConfigs: OAuthClientConfigService;
  saasProject?: SaasProjectService;
  logger?: RuntimeLogger;
  oauthCloseDelaySeconds?: number;
  readConnectionName?: (context: Context, body?: Record<string, unknown>) => string | undefined;
}

/** Console connection management and OAuth client configuration / authorization routes. */
export function createConsoleOAuthRoutes({
  connections,
  oauthFlow,
  oauthClientConfigs,
  saasProject,
  logger,
  oauthCloseDelaySeconds,
  readConnectionName = defaultReadConnectionName,
}: ConsoleOAuthRoutesOptions): Hono {
  const app = new Hono();

  const writeConnectionResult = async (
    context: Context,
    operation: Promise<unknown>,
    logContext?: ConnectionLogContext,
  ): Promise<Response> => {
    try {
      const result = await operation;
      if (logContext) {
        logger?.info(
          logContext,
          logContext.operation === "disconnect" ? "connection disconnect completed" : "connection completed",
        );
      }
      return context.json(result);
    } catch (error) {
      if (error instanceof ConnectionError) {
        if (logContext) {
          const cancelled = error.code === "connection_cancelled";
          logger?.[cancelled ? "info" : "warn"](
            {
              ...logContext,
              errorCode: error.code,
            },
            cancelled
              ? "connection cancelled"
              : logContext.operation === "disconnect"
                ? "connection disconnect failed"
                : "connection failed",
          );
        }
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }

      throw error;
    }
  };

  const writeOAuthResult = async (context: Context, operation: Promise<unknown>): Promise<Response> => {
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
  };

  app.get("/api/connections", async (context) => context.json(await connections.listConnections()));

  app.put("/api/connections/:service", async (context) => {
    const service = context.req.param("service");
    const body = await readJsonBody(context);
    const authType = optionalString(body.authType);
    if (!authType) {
      logger?.warn(
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
      logger?.info(logContext, "connection started");
      return writeConnectionResult(context, connections.connectWithoutAuth(service, { connectionName }), logContext);
    }
    if (authType === "api_key") {
      logger?.info(logContext, "connection started");
      return writeConnectionResult(
        context,
        connections.connectWithApiKey(service, {
          values,
          connectionName,
          signal: context.req.raw.signal,
        }),
        logContext,
      );
    }
    if (authType === "custom_credential") {
      logger?.info(logContext, "connection started");
      return writeConnectionResult(
        context,
        connections.connectWithCustomCredential(service, {
          values,
          connectionName,
          signal: context.req.raw.signal,
        }),
        logContext,
      );
    }

    logger?.warn(
      {
        ...logContext,
        errorCode: "unsupported_auth_type",
      },
      "connection rejected",
    );
    return jsonError(context, 400, "unsupported_auth_type", `${service} does not support ${authType}.`);
  });

  app.delete("/api/connections/:service", async (context) => {
    const service = context.req.param("service");
    const body = await readJsonBody(context);
    const connectionName = readConnectionName(context, body);
    const logContext: ConnectionLogContext = {
      operation: "disconnect",
      path: context.req.path,
      service,
      connectionName,
    };
    logger?.info(logContext, "connection disconnect started");
    return writeConnectionResult(
      context,
      connections.disconnect(service, connectionName, { revoke: optionalBoolean(body.revoke) }),
      logContext,
    );
  });

  app.get("/api/oauth/configs", async (context) => {
    const configs = await oauthClientConfigs.listConfigs();
    const sources = await saasProject?.listSources();
    return context.json(
      configs.map((config) => ({
        ...config,
        oauthSource: sources?.get(config.service) ?? { mode: "local" },
        customClientAvailable: sources?.has(config.service) ? false : config.customClientAvailable,
      })),
    );
  });

  app.put("/api/oauth/configs/:service", async (context) => {
    const service = context.req.param("service");
    const body = await readJsonBody(context);
    return writeOAuthResult(
      context,
      oauthClientConfigs.upsertConfig({
        service,
        clientId: optionalString(body.clientId) ?? "",
        clientSecret: optionalString(body.clientSecret) ?? "",
        requestedScopes: readOptionalStringArray(body, "requestedScopes"),
        redirectUri: readOptionalRawString(body, "redirectUri"),
        extra: optionalRecord(body.extra),
        secretExtra: optionalRecord(body.secretExtra),
      }),
    );
  });

  app.delete("/api/oauth/configs/:service", async (context) => {
    const service = context.req.param("service");
    return writeOAuthResult(context, oauthClientConfigs.deleteConfig(service));
  });

  app.post("/api/oauth/connection-requests", async (context) => {
    try {
      const { consoleOAuthConnectionInput } = await import("./connection-input.ts");
      const parsed = consoleOAuthConnectionInput.safeParse(await readJsonBody(context));
      if (!parsed.success) return jsonError(context, 400, "invalid_input", "Invalid OAuth connection request.");
      const { appId, ...input } = parsed.data;
      const target = appId ? await connections.getStoredConnection(appId) : undefined;
      if (target && (target.service !== input.service || target.connectionName !== input.connectionName))
        return jsonError(context, 400, "invalid_input", "The selected connection no longer matches.");
      return context.json(
        await oauthFlow.startConnectionRequest({
          ...input,
          target,
          owner: "local-admin",
          signal: context.req.raw.signal,
        }),
      );
    } catch (error) {
      if (
        error instanceof OAuthClientConfigError ||
        error instanceof OAuthFlowError ||
        error instanceof ConnectionError
      )
        return jsonError(
          context,
          error.code === "unknown_service" || error.code === "app_not_found" ? 404 : 400,
          error.code,
          error.message,
        );
      throw error;
    }
  });

  app.post("/api/oauth/authorizations", async (context) => {
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
      logger?.info(logContext, "oauth authorization started");

      const authorization = await oauthFlow.startAuthorization({
        service,
        connectionName,
        clientConfig: readOAuthClientConfigInput(body),
        authorizationOptionIds: readOptionalStringArray(body, "authorizationOptionIds"),
      });
      const authorizationUrl = new URL(authorization.authorizationUrl);
      logger?.info(
        {
          ...logContext,
          authorizationHost: authorizationUrl.host,
          redirectUri: authorizationUrl.searchParams.get("redirect_uri") ?? undefined,
        },
        "oauth authorization created",
      );
      return context.json(authorization);
    } catch (error) {
      if (
        error instanceof OAuthClientConfigError ||
        error instanceof OAuthFlowError ||
        error instanceof ConnectionError
      ) {
        logger?.warn(
          {
            errorCode: error.code,
            path: context.req.path,
            service: requestedService,
            connectionName,
          },
          "oauth authorization failed",
        );
        const status = error.code === "unknown_service" ? 404 : 400;
        return jsonError(context, status, error.code, error.message);
      }

      throw error;
    }
  });

  app.get("/oauth/callback", async (context) => {
    const state = context.req.query("state");
    const code = context.req.query("code");
    const logContext = {
      path: context.req.path,
      hasState: Boolean(state),
      hasCode: Boolean(code),
    };
    logger?.info(logContext, "oauth callback received");
    const providerError = context.req.query("error");
    if (providerError) {
      const returnUri = state
        ? await oauthFlow.rejectAuthorization(state, providerError === "access_denied")
        : undefined;
      if (returnUri) return context.redirect(returnUri);
      const providerErrorDescription = context.req.query("error_description");
      logger?.warn(
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
      if (state) await oauthFlow.rejectAuthorization(state, false);
      logger?.warn(
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
      const callbackUrl = new URL(context.req.url);
      const completed = await oauthFlow.completeAuthorization({
        state,
        code,
        callbackParameters: Object.fromEntries(callbackUrl.searchParams),
        callbackQuery: callbackUrl.search,
        signal: context.req.raw.signal,
      });
      service = completed.service;
      if (completed.returnUri) return context.redirect(completed.returnUri);
      logger?.info(
        {
          ...logContext,
          service,
        },
        "oauth callback completed",
      );
    } catch (error) {
      if (error instanceof OAuthCallbackError && error.returnUri) return context.redirect(error.returnUri);
      if (error instanceof OAuthFlowError || error instanceof ConnectionError) {
        const cancelled = error instanceof ConnectionError && error.code === "connection_cancelled";
        logger?.[cancelled ? "info" : "warn"](
          {
            ...logContext,
            errorCode: error.code,
          },
          cancelled ? "oauth callback cancelled" : "oauth callback failed",
        );
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }
      throw error;
    }

    return context.html(renderOAuthCompletionPage(service, oauthCloseDelaySeconds));
  });

  return app;
}
