import { requireTenantId } from "./tenant-id.ts";

/**
 * Tenant binding of a store instance.
 * - `string`: every statement the store emits is filtered to that tenant.
 * - `null`: instance scope — statements are deliberately unfiltered for
 *   cross-tenant jobs (sweepers, migrations, secret rotation). Only
 *   `RuntimeDatabase.forInstance()` may produce it; it is never derived from
 *   request input.
 */
export type TenantScope = string | null;

/** A `RuntimeDatabase`-shaped facade whose stores are bound to one scope. */
export interface TenantScoped<T> {
  forTenant(tenantId: string): T;
  forInstance(): T;
}

/** Validate a tenant id from the request boundary before binding a scope. */
export function tenantScope(tenantId: string): TenantScope {
  return requireTenantId(tenantId);
}

export function instanceScope(): TenantScope {
  return null;
}

/** Bind-parameter shape shared by the runtime stores' statement dialect. */
export type SqlParam = string | number | null;

interface FilteredClause {
  sql: string;
  values: SqlParam[];
}

/**
 * Append the tenant predicate to a full `where` clause (the argument includes
 * the `where` keyword and may be empty). The tenant value is pushed last so
 * existing positional `?` placeholders keep their order.
 */
export function tenantWhere(scope: TenantScope, where: string, values: SqlParam[]): FilteredClause {
  if (scope === null) return { sql: where, values };
  return {
    sql: where ? `${where} and tenant_id = ?` : "where tenant_id = ?",
    values: [...values, scope],
  };
}

/** Bare `tenant_id = ?` predicate for embedding inside larger clause fragments. */
export function tenantPredicate(scope: TenantScope): FilteredClause {
  return scope === null ? { sql: "1 = 1", values: [] } : { sql: "tenant_id = ?", values: [scope] };
}

/** {@link tenantPredicate} with a numbered `$N` placeholder at `position` (postgres). */
export function tenantPredicatePg(scope: TenantScope, position: number): FilteredClause {
  return scope === null ? { sql: "1 = 1", values: [] } : { sql: `tenant_id = $${position}`, values: [scope] };
}

/** Tenant id written by an insert: the bound scope, or the default for instance scope. */
export function tenantForInsert(scope: TenantScope, fallback = "local"): string {
  return scope ?? fallback;
}
