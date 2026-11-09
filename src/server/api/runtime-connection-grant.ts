import type { RuntimeGrant } from "../storage/runtime-token-service.ts";

export type RuntimeConnectionDecision =
  | { allowed: true; connectionName?: string }
  | { allowed: false; code: "connection_not_allowed"; message: string };

/**
 * Jenny leases use a service-to-alias map. Upstream runtime tokens use an
 * array of opaque connection IDs, which is evaluated by ActionPolicySnapshot.
 * This boundary keeps the alias grant semantics explicit and prevents a
 * connection-scoped lease from falling back to a different account.
 */
export function evaluateRuntimeConnection(
  grant: RuntimeGrant | undefined,
  service: string,
  requestedConnectionName: string | undefined,
): RuntimeConnectionDecision {
  const allowedConnections = grant?.allowedConnections;
  if (
    !grant ||
    !allowedConnections ||
    Array.isArray(allowedConnections) ||
    Object.keys(allowedConnections).length === 0
  ) {
    return { allowed: true, connectionName: requestedConnectionName };
  }
  if (!Object.prototype.hasOwnProperty.call(allowedConnections, service)) {
    return {
      allowed: false,
      code: "connection_not_allowed",
      message: `${service} is not included in the runtime token connection allowlist.`,
    };
  }
  const allowedConnection = allowedConnections[service];
  if (allowedConnection === null) return { allowed: true };
  if (requestedConnectionName && requestedConnectionName !== allowedConnection) {
    return {
      allowed: false,
      code: "connection_not_allowed",
      message: `${service} connection is not included in the runtime token connection allowlist.`,
    };
  }
  return { allowed: true, connectionName: allowedConnection };
}

export function runtimeGrantAllowsService(grant: RuntimeGrant | undefined, service: string): boolean {
  const allowedConnections = grant?.allowedConnections;
  return (
    !grant ||
    !allowedConnections ||
    Array.isArray(allowedConnections) ||
    Object.keys(allowedConnections).length === 0 ||
    Object.prototype.hasOwnProperty.call(allowedConnections, service)
  );
}

export function runtimeGrantAllowsProxy(grant: RuntimeGrant | undefined): boolean {
  const allowedConnections = grant?.allowedConnections;
  return (
    !grant || !allowedConnections || Array.isArray(allowedConnections) || Object.keys(allowedConnections).length === 0
  );
}
