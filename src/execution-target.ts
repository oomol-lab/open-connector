import type { ConnectionService, ConnectionSummary, ManagedConnectionSummary } from "./connection-service.ts";
import type { SaasConnectionReference } from "./connection-store.ts";
import type { ActionPolicySnapshot } from "./core/action-policy.ts";
import type { ExecutionContext } from "./core/types.ts";
import type { MarketplaceService } from "./marketplace/marketplace-service.ts";

import { ConnectionError } from "./connection-error.ts";
import { connectionExecutionError, ExecutionError, ExecutionPolicyError } from "./core/execution-error.ts";

export type ExecutionTarget =
  | { kind: "local"; summary?: ConnectionSummary; getCredential: ExecutionContext["getCredential"] }
  | { kind: "saas"; summary: ManagedConnectionSummary; reference: SaasConnectionReference }
  | { kind: "marketplace"; summary: ConnectionSummary };

interface ResolveExecutionTargetInput {
  connections: Pick<ConnectionService, "getConnectionSummary" | "resolveConnection">;
  service: string;
  connectionName?: string;
  connectionId?: string;
  operation: "action" | "proxy" | "trigger";
  actionId?: string;
  marketplace?: MarketplaceService;
  policy?: ActionPolicySnapshot;
  signal?: AbortSignal;
}

/** Authorize before credential refresh and recheck the resolved identity before dispatch. */
export function resolveExecutionTarget(
  input: ResolveExecutionTargetInput & { operation: "trigger" },
): Promise<Extract<ExecutionTarget, { kind: "local" }>>;
export function resolveExecutionTarget(
  input: ResolveExecutionTargetInput & { operation: "proxy" },
): Promise<Exclude<ExecutionTarget, { kind: "marketplace" }>>;
export function resolveExecutionTarget(input: ResolveExecutionTargetInput): Promise<ExecutionTarget>;
export async function resolveExecutionTarget(input: ResolveExecutionTargetInput): Promise<ExecutionTarget> {
  const authorize = (summary: ConnectionSummary | undefined): void => {
    if (input.operation !== "trigger" && summary?.authType === "no_auth") return;
    const decision = input.policy?.evaluateConnection(summary?.id);
    if (decision && !decision.allowed) throw new ExecutionPolicyError(decision);
  };
  try {
    input.signal?.throwIfAborted();
    const summary = await input.connections.getConnectionSummary(
      input.service,
      input.connectionName,
      input.connectionId,
    );
    input.signal?.throwIfAborted();
    authorize(summary);
    const connection = await input.connections.resolveConnection(
      input.service,
      input.connectionName,
      input.connectionId,
    );
    input.signal?.throwIfAborted();
    authorize(connection.summary);
    if (input.operation === "trigger" && connection.source !== "local") {
      throw new ExecutionError(
        "trigger_source_not_supported",
        "Triggers require a local connection; this connection source is not supported.",
        "unsupported",
      );
    }
    switch (connection.source) {
      case "local":
        return {
          kind: "local",
          summary: connection.summary,
          getCredential: async (service) => (service === input.service ? connection.credential : undefined),
        };
      case "saas":
        return { kind: "saas", summary: connection.summary, reference: connection.reference };
      case "marketplace":
        if (input.operation === "proxy")
          throw new ExecutionError(
            "proxy_not_supported",
            "Marketplace connections do not support proxy execution.",
            "unsupported",
          );
        if (!input.actionId || !input.marketplace?.supportsAction(input.actionId)) {
          throw new ExecutionError(
            "connection_not_found",
            "The selected Marketplace connection does not support this action.",
            "not_found",
          );
        }
        return { kind: "marketplace", summary: connection.summary };
    }
  } catch (error) {
    if (error instanceof ConnectionError) {
      if (error.code === "connection_not_found") authorize(undefined);
      throw connectionExecutionError(error);
    }
    throw error;
  }
}
