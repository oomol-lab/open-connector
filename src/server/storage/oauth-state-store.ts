import type { IOAuthStateStore, OAuthAuthorizationState } from "../../oauth/oauth-flow-service.ts";
import type { TenantScope } from "../../tenant/tenant-scope.ts";
import type { ISecretCodec } from "../secrets/secret-codec-core.ts";
import type { RequestTransaction } from "./connection-request-store.ts";

import { normalizeConnectionName } from "../../connection-service.ts";
import { tenantForInsert, tenantPredicate } from "../../tenant/tenant-scope.ts";
import { initializeRetirement, lockRetirement, retirementMatches } from "./connection-retirement.ts";

/** Pending OAuth state shares the same durable fence and transaction as credential retirement. */
export class SqlOAuthStateStore implements IOAuthStateStore {
  private readonly transaction: RequestTransaction;
  private readonly codec: ISecretCodec;
  private readonly scope: TenantScope;

  constructor(transaction: RequestTransaction, codec: ISecretCodec, scope: TenantScope) {
    this.transaction = transaction;
    this.codec = codec;
    this.scope = scope;
  }

  async deleteCreatedBefore(cutoff: string): Promise<void> {
    const t = tenantPredicate(this.scope);
    await this.transaction([
      { sql: `delete from oauth_states where created_at < ? and ${t.sql}`, values: [cutoff, ...t.values] },
    ]);
  }

  async set(state: OAuthAuthorizationState): Promise<void> {
    const connectionName = normalizeConnectionName(state.connectionName);
    const value = await this.codec.encode(JSON.stringify(state));
    const fence = retirementMatches(this.scope, state.service, connectionName, state.retirementGeneration);
    await this.transaction([
      initializeRetirement(this.scope, state.service, connectionName, state.retirementGeneration),
      lockRetirement(this.scope, state.service, connectionName, state.retirementGeneration),
      {
        sql: `insert into oauth_states (state, value, created_at, service, connection_name, tenant_id)
        select ?, ?, ?, ?, ?, ? where ${fence.sql}
        on conflict(state) do update set value = excluded.value, created_at = excluded.created_at,
          service = excluded.service, connection_name = excluded.connection_name
          where oauth_states.tenant_id = excluded.tenant_id`,
        values: [
          state.state,
          value,
          state.createdAt,
          state.service,
          connectionName,
          tenantForInsert(this.scope),
          ...fence.values,
        ],
      },
    ]);
  }

  async take(state: string): Promise<OAuthAuthorizationState | undefined> {
    const t = tenantPredicate(this.scope);
    const [[row]] = await this.transaction([
      { sql: `delete from oauth_states where state = ? and ${t.sql} returning value`, values: [state, ...t.values] },
    ]);
    return row ? (JSON.parse(await this.codec.decode(row.value as string)) as OAuthAuthorizationState) : undefined;
  }
}
