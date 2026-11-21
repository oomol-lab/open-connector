import type { ConnectionService } from "../../connection-service.ts";
import type { OAuthFlowService } from "../../oauth/oauth-flow-service.ts";
import type { TriggerMaintenance } from "../../triggers/maintenance.ts";
import type { ActionRunner } from "../actions/action-runner.ts";
import type { ITransitFileService } from "../files/transit-file-store.ts";
import type { RuntimeTokenService } from "../storage/runtime-token-service.ts";

import { Hono } from "hono";
import { isScope, scopeMessage } from "../../core/scope.ts";
import { scopeOwner } from "../storage/connection-request-store.ts";
import { jsonError } from "./http-utils.ts";

export interface ScopeRoutesOptions {
  connections: ConnectionService;
  oauthFlow: OAuthFlowService;
  actions: ActionRunner;
  transitFiles: ITransitFileService;
  runtimeTokens: RuntimeTokenService;
  triggerMaintenance?: TriggerMaintenance;
}

interface ScopeFailure {
  step: "runtime_tokens" | "connection_requests" | "trigger_subscriptions" | "connections" | "runs" | "transit_files";
  id?: string;
  message: string;
}

/**
 * Offboard one scope: revoke its tokens, cancel its pending authorizations and trigger subscriptions, delete its
 * connections, runs and files.
 */
export function createScopeRoutes(options: ScopeRoutesOptions): Hono {
  const app = new Hono();

  app.delete("/scopes/:scope", async (context) => {
    const scope = context.req.param("scope");
    if (!isScope(scope)) {
      return jsonError(context, 400, "invalid_input", scopeMessage);
    }

    const failures: ScopeFailure[] = [];
    const deleted = {
      runtimeTokens: 0,
      connectionRequests: 0,
      triggerSubscriptions: 0,
      connections: 0,
      runs: 0,
      transitFiles: 0,
    };
    const attempt = async (step: ScopeFailure["step"], id: string | undefined, run: () => Promise<void>) => {
      try {
        await run();
      } catch (error) {
        failures.push({ step, ...(id === undefined ? {} : { id }), message: describe(error) });
      }
    };

    // Tokens first, so the scope stops accepting work while it is being removed.
    await attempt("runtime_tokens", undefined, async () => {
      for (const token of await options.runtimeTokens.listTokens()) {
        if (token.scope !== scope) continue;
        await attempt("runtime_tokens", token.id, async () => {
          if (await options.runtimeTokens.revokeToken(token.id)) deleted.runtimeTokens += 1;
        });
      }
    });

    // A pending authorization would otherwise store its connection in the deleted scope when its callback arrives.
    await attempt("connection_requests", undefined, async () => {
      deleted.connectionRequests = await options.oauthFlow.cancelPendingRequests(scopeOwner(scope));
    });

    // A connection with live trigger subscriptions cannot be deleted, so cancel those before it.
    if (options.triggerMaintenance) {
      const triggers = options.triggerMaintenance;
      await attempt("trigger_subscriptions", undefined, async () => {
        for (const subscription of await triggers.list(scope)) {
          if (subscription.status === "deleted" || subscription.status === "abandoned") continue;
          await attempt("trigger_subscriptions", subscription.id, async () => {
            const status = await triggers.cancel(subscription.id, context.req.raw.signal);
            if (status === "deleted") {
              deleted.triggerSubscriptions += 1;
            } else {
              throw new Error(`Trigger subscription ${subscription.id} is still ${status}.`);
            }
          });
        }
      });
    }

    await attempt("connections", undefined, async () => {
      // Stored rows only: never a virtual default, and a connection whose provider left the catalog is still removed.
      for (const connection of await options.connections.listStoredConnections({ scope })) {
        await attempt("connections", connection.id, async () => {
          await options.connections.disconnect(connection.service, connection.connectionName, {
            revoke: true,
            within: { scope },
          });
          deleted.connections += 1;
        });
      }
    });

    await attempt("runs", undefined, async () => {
      deleted.runs = await options.actions.deleteRunsByScope(scope);
    });
    await attempt("transit_files", undefined, async () => {
      deleted.transitFiles = await options.transitFiles.deleteByScope(scope);
    });

    return context.json(
      { scope, complete: failures.length === 0, deleted, failures },
      failures.length === 0 ? 200 : 207,
    );
  });

  return app;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
