import type { ConnectionService, ConnectionSummary } from "../../connection-service.ts";
import type { ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { ConnectionError } from "../../connection-error.ts";
import { readRuntimeGrant } from "./auth.ts";
import {
  mapConnectionErrorStatus,
  serializeRuntimeConnectedApp,
  writeRuntimeFailure,
  writeRuntimeSuccess,
} from "./runtime-api.ts";
import { evaluateRuntimeConnection, runtimeGrantAllowsService } from "./runtime-connection-grant.ts";

function filterAllowedConnections(
  policy: ActionPolicySnapshot,
  connections: ConnectionSummary[],
  grant: ReturnType<typeof readRuntimeGrant>,
): ConnectionSummary[] {
  return connections.filter(
    (connection) =>
      runtimeGrantAllowsService(grant, connection.service) &&
      evaluateRuntimeConnection(grant, connection.service, connection.connectionName).allowed &&
      (connection.authType === "no_auth" || policy.evaluateConnection(connection.id).allowed),
  );
}

export interface RuntimeAppRoutesOptions {
  connections: ConnectionService;
  getPolicySnapshot: (context: Context) => Promise<ActionPolicySnapshot>;
}

/** Connected runtime apps discovery and permission evaluation routes. */
export function createRuntimeAppRoutes({ connections, getPolicySnapshot }: RuntimeAppRoutesOptions): Hono {
  const app = new Hono();

  app.get("/apps", async (context) => {
    let policy: ActionPolicySnapshot;
    try {
      policy = await getPolicySnapshot(context);
    } catch {
      return writeRuntimeFailure(context, {
        status: 500,
        errorCode: "internal_error",
        message: "Runtime policy is unavailable.",
      });
    }
    return writeRuntimeSuccess(
      context,
      filterAllowedConnections(policy, await connections.listConnections(), readRuntimeGrant(context)).map(
        serializeRuntimeConnectedApp,
      ),
    );
  });

  app.get("/apps/authenticated", async (context) => {
    const services = context.req.queries("service") ?? [];
    let policy: ActionPolicySnapshot;
    try {
      policy = await getPolicySnapshot(context);
    } catch {
      return writeRuntimeFailure(context, {
        status: 500,
        errorCode: "internal_error",
        message: "Runtime policy is unavailable.",
      });
    }
    const authenticated = new Set(
      filterAllowedConnections(policy, await connections.listConnections(), readRuntimeGrant(context))
        .filter((connection) => connection.configured && connection.authType !== "no_auth")
        .map((connection) => connection.service),
    );
    return writeRuntimeSuccess(
      context,
      services.filter((service) => authenticated.has(service)),
    );
  });

  app.get("/apps/services/:service", async (context) => {
    const service = context.req.param("service");
    let policy: ActionPolicySnapshot;
    try {
      policy = await getPolicySnapshot(context);
    } catch {
      return writeRuntimeFailure(context, {
        status: 500,
        errorCode: "internal_error",
        message: "Runtime policy is unavailable.",
        meta: { service },
      });
    }
    try {
      return writeRuntimeSuccess(
        context,
        filterAllowedConnections(
          policy,
          await connections.listConnectionsByService(service),
          readRuntimeGrant(context),
        ).map(serializeRuntimeConnectedApp),
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
  });

  return app;
}
