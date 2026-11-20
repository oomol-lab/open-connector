import type { ConnectionService } from "../../connection-service.ts";
import type { StoredConnection } from "../../connection-store.ts";
import type { ScopeFilter } from "../../core/scope.ts";
import type { OAuthFlowService } from "../../oauth/oauth-flow-service.ts";
import type { SaasOAuthService } from "../../saas/saas-oauth-service.ts";
import type { Context } from "hono";
import type { z } from "zod";

import { Hono } from "hono";
import { ConnectionError } from "../../connection-error.ts";
import { OAuthClientConfigError } from "../../oauth/oauth-client-config-service.ts";
import { OAuthFlowError } from "../../oauth/oauth-flow-service.ts";
import { SaasError } from "../../saas/saas-client.ts";
import { scopeOwner } from "../storage/connection-request-store.ts";
import { hasAdminBearer, readRuntimeGrant } from "./auth.ts";
import { readJsonBody, HttpRequestError } from "./http-utils.ts";
import {
  connectionManagementFailure,
  serializeManagedConnection,
  writeRuntimeSuccess,
  writeRuntimeFailure,
} from "./runtime-api.ts";

interface ConnectionRoutesOptions {
  connections: ConnectionService;
  oauthFlow: OAuthFlowService;
  saasOAuth?: SaasOAuthService;
}

/** Personal connection management. Authentication runs in the parent app. */
export function createConnectionRoutes({ connections, oauthFlow, saasOAuth }: ConnectionRoutesOptions): Hono {
  const app = new Hono();
  // The local runtime has one administrator principal, including its bearer and browser sessions.
  const owner = "local-admin";
  // A tenant token (scoped, created with `allowConnect`) is confined to its own scope: it cannot pass another scope or
  // read another scope's connection or request. The admin reads every request.
  const tenantOf = (context: Context): string | undefined => readRuntimeGrant(context)?.scope;
  const ownerOf = (scope: string | undefined): string => (scope === undefined ? owner : scopeOwner(scope));
  const withinOf = (context: Context): ScopeFilter | undefined => {
    const scope = tenantOf(context);
    return scope === undefined ? undefined : { scope };
  };
  const resolveScope = (context: Context, requested: string | undefined): string | undefined => {
    const scope = tenantOf(context);
    if (scope === undefined) return requested;
    if (requested !== undefined && requested !== scope) {
      throw new ConnectionError("invalid_input", "A tenant token cannot choose another scope.");
    }
    return scope;
  };
  /** A reconnect keeps the scope of its connection; naming any other scope is rejected rather than ignored. */
  const scopeFor = (context: Context, target: StoredConnection | undefined, requested: string | undefined) => {
    const scope = resolveScope(context, requested);
    if (!target) return scope;
    const kept = target.source === "saas" ? undefined : target.scope;
    if (scope !== undefined && scope !== kept)
      throw new ConnectionError("invalid_input", "A reconnect keeps the scope of its connection.");
    return kept;
  };
  app.onError((error, context) => {
    if (error instanceof SaasError) {
      if (error.retryAfter) context.header("Retry-After", error.retryAfter);
      return writeRuntimeFailure(context, {
        status: error.status,
        errorCode: error.code,
        message: error.message,
        data: error.connectionRequestId ? { connectionRequestId: error.connectionRequestId } : undefined,
      });
    }
    if (
      error instanceof ConnectionError ||
      error instanceof OAuthFlowError ||
      error instanceof OAuthClientConfigError
    ) {
      return writeRuntimeFailure(context, connectionManagementFailure(error));
    }
    throw error;
  });
  app.get("/connections", async (context) => {
    const { connectionStatusInput } = await import("./connection-input.ts");
    const status = parseBody(connectionStatusInput, context.req.query("status"));
    const apps = (await connections.listManagedConnections(withinOf(context))).map(serializeManagedConnection);
    return writeRuntimeSuccess(context, status ? apps.filter((app) => app.status === status) : apps);
  });
  app.get("/connections/by-id/:appId", async (context) => {
    const managed = await connections.getManagedConnection(context.req.param("appId"), withinOf(context));
    return writeRuntimeSuccess(context, serializeManagedConnection(managed));
  });
  app.get("/connection-requests/:connectionRequestId", async (context) => {
    const id = context.req.param("connectionRequestId");
    // Only a tenant token reaches this route without being the administrator (bearer or console cookie).
    const tenant = tenantOf(context);
    const request =
      tenant === undefined
        ? ((saasOAuth && hasAdminBearer(context)
            ? await saasOAuth.sync(id, owner, context.req.raw.signal)
            : undefined) ?? (await oauthFlow.getConnectionRequest(id)))
        : await oauthFlow.getConnectionRequest(id, scopeOwner(tenant));
    if (!request)
      return writeRuntimeFailure(context, {
        status: 404,
        errorCode: "connection_request_not_found",
        message: "Connection request not found.",
      });
    return writeRuntimeSuccess(context, request);
  });
  for (const reconnect of [false, true]) {
    const path = reconnect ? "/connections/by-id/:appId/connect" : "/connections/:service/connect";
    app.post(path, async (context) => {
      const { oauthConnectionInput } = await import("./connection-input.ts");
      const input = parseBody(oauthConnectionInput, await readJsonBody(context));
      const target = reconnect
        ? await connections.getStoredConnection(context.req.param("appId")!, withinOf(context))
        : undefined;
      const scope = scopeFor(context, target, input.scope);
      // The client configuration and the return address belong to the administrator: a tenant could otherwise point
      // the token exchange (and the client secret) at its own host, or turn the runtime into an open redirect.
      if (tenantOf(context) !== undefined && (input.returnUri || input.extra || input.secretExtra))
        throw new ConnectionError("invalid_input", "returnUri, extra and secretExtra are administrator-only.");
      return writeRuntimeSuccess(
        context,
        await oauthFlow.startConnectionRequest({
          ...input,
          service: target?.service ?? context.req.param("service")!,
          scope,
          // A scoped request is owned by its scope, so deleting the scope can cancel it whoever started it.
          owner: ownerOf(scope),
          signal: context.req.raw.signal,
          target,
        }),
      );
    });
    for (const authType of ["api-key", "custom-credential"]) {
      app.post(`${path}/${authType}`, async (context) => {
        const { apiKeyConnectionInput, customConnectionInput } = await import("./connection-input.ts");
        const body = await readJsonBody(context);
        const target = reconnect
          ? await connections.getStoredConnection(context.req.param("appId")!, withinOf(context))
          : undefined;
        if (
          target &&
          (target.source === "saas" ||
            target.credential.authType !== (authType === "api-key" ? "api_key" : "custom_credential"))
        ) {
          throw new ConnectionError("unsupported_auth_type", "The connection uses a different credential type.");
        }
        const service = target?.service ?? context.req.param("service")!;
        const options = {
          connectionName: target?.connectionName ?? crypto.randomUUID(),
          expectedConnection: target,
          signal: context.req.raw.signal,
        };
        let summary;
        if (authType === "api-key") {
          const input = parseBody(apiKeyConnectionInput, body);
          summary = await connections.connectWithApiKey(service, {
            ...options,
            values: { ...input.extra, apiKey: input.apiKey },
            comment: input.comment,
            scope: scopeFor(context, target, input.scope),
          });
        } else {
          const input = parseBody(customConnectionInput, body);
          summary = await connections.connectWithCustomCredential(service, {
            ...options,
            values: input.values,
            comment: input.comment,
            scope: scopeFor(context, target, input.scope),
          });
        }
        return writeRuntimeSuccess(
          context,
          serializeManagedConnection(await connections.getManagedConnection(summary.id)),
        );
      });
    }
  }
  return app;
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new HttpRequestError(
      "invalid_input",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  return parsed.data;
}
