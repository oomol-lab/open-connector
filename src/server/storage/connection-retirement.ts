import type { TenantScope } from "../../tenant/tenant-scope.ts";
import type { RequestStatement } from "./connection-request-store.ts";

import { tenantWhere, tenantForInsert } from "../../tenant/tenant-scope.ts";

/** SQL predicate for the one durable retirement fence shared by OAuth publication paths. */
export function retirementMatches(
  scope: TenantScope,
  service: string,
  connectionName: string,
  generation: string,
): RequestStatement {
  const filter = tenantWhere(scope, "where service = ? and connection_name = ? and generation = ?", [
    service,
    connectionName,
    generation,
  ]);
  return {
    sql: `exists (select 1 from connection_retirements ${filter.sql})`,
    values: filter.values,
  };
}

/** Keeps retirement and publication in the same lock order, including on PostgreSQL. */
export function lockRetirement(
  scope: TenantScope,
  service: string,
  connectionName: string,
  generation: string,
): RequestStatement {
  const filter = tenantWhere(scope, "where service = ? and connection_name = ? and generation = ?", [
    service,
    connectionName,
    generation,
  ]);
  return {
    sql: `update connection_retirements set generation = generation ${filter.sql} returning generation`,
    values: filter.values,
  };
}

/** A retired name's row is never removed, including when no credential was ever published. */
export function initializeRetirement(
  scope: TenantScope,
  service: string,
  connectionName: string,
  generation: string,
): RequestStatement {
  return {
    sql: "insert into connection_retirements (tenant_id, service, connection_name, generation) values (?, ?, ?, ?) on conflict do nothing",
    values: [tenantForInsert(scope), service, connectionName, generation],
  };
}
