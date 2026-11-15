import type { ScopedServices } from "../tenant-services.ts";
import type { Context } from "hono";
import type { z } from "zod";

import { Hono } from "hono";
import { ConnectionError } from "../../connection-error.ts";
import { OAuthClientConfigError } from "../../oauth/oauth-client-config-service.ts";
import { OAuthFlowError } from "../../oauth/oauth-flow-service.ts";
import { SaasError } from "../../saas/saas-client.ts";
import { hasAdminBearer, readSubject, readTenantId } from "./auth.ts";
import { readJsonBody, HttpRequestError } from "./http-utils.ts";
import {
  connectionManagementFailure,
  serializeManagedConnection,
  writeRuntimeSuccess,
  writeRuntimeFailure,
} from "./runtime-api.ts";

interface ConnectionRoutesOptions {
  services: ScopedServices;
}

/** Personal connection management. Authentication runs in the parent app. */
export function createConnectionRoutes({ services }: ConnectionRoutesOptions): Hono {
  const app = new Hono();
  // Every handler resolves the request's tenant + subject, then runs against
  // the service graph bound to that tenant.
  const scoped = (context: Context) => services.forTenant(readTenantId(context));
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
    const { connections } = await scoped(context);
    const { connectionStatusInput } = await import("./connection-input.ts");
    const status = parseBody(connectionStatusInput, context.req.query("status"));
    const apps = (await connections.listManagedConnections()).map(serializeManagedConnection);
    return writeRuntimeSuccess(context, status ? apps.filter((app) => app.status === status) : apps);
  });
  app.get("/connections/by-id/:appId", async (context) => {
    const { connections } = await scoped(context);
    return writeRuntimeSuccess(
      context,
      serializeManagedConnection(await connections.getManagedConnection(context.req.param("appId"))),
    );
  });
  app.get("/connection-requests/:connectionRequestId", async (context) => {
    const { oauthFlow, saasOAuth } = await scoped(context);
    const id = context.req.param("connectionRequestId");
    const owner = readSubject(context);
    const request =
      saasOAuth && hasAdminBearer(context)
        ? await saasOAuth.sync(id, owner, context.req.raw.signal)
        : await oauthFlow.getConnectionRequest(id, owner);
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
      const { connections, oauthFlow } = await scoped(context);
      const { oauthConnectionInput } = await import("./connection-input.ts");
      const input = parseBody(oauthConnectionInput, await readJsonBody(context));
      const target = reconnect ? await connections.getStoredConnection(context.req.param("appId")!) : undefined;
      return writeRuntimeSuccess(
        context,
        await oauthFlow.startConnectionRequest({
          ...input,
          service: target?.service ?? context.req.param("service")!,
          owner: readSubject(context),
          signal: context.req.raw.signal,
          target,
        }),
      );
    });
    for (const authType of ["api-key", "custom-credential"]) {
      app.post(`${path}/${authType}`, async (context) => {
        const { connections } = await scoped(context);
        const { apiKeyConnectionInput, customConnectionInput } = await import("./connection-input.ts");
        const body = await readJsonBody(context);
        const target = reconnect ? await connections.getStoredConnection(context.req.param("appId")!) : undefined;
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
          });
        } else {
          const input = parseBody(customConnectionInput, body);
          summary = await connections.connectWithCustomCredential(service, {
            ...options,
            values: input.values,
            comment: input.comment,
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
