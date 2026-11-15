# Tenant model (OC-1)

In-repo multi-tenancy for the shared Pazity instance. Design source:
`labs/plan/4.功能设计/miles/2026-11-omni-brain-evolution/12-open-connector-development.md` §3.2.

## Grammar

- `tenant_id` — maps 1:1 to the Hub `org_id` (`src/tenant/tenant-id.ts`).
  Grammar `[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}`; `all` is reserved; `local` is the
  default tenant every pre-OC-1 row backfilled to and the only tenant a
  single-tenant dev instance ever sees.
- `subject` — connection ownership (`src/tenant/subject.ts`). Grammar
  `<kind>:<id>` with kinds `user` / `space` / `service`. Backfilled rows keep
  the legacy value `local-admin`, which is rejected as _new_ input.

## Schema (migration 0023, both dialects)

Tenant-scoped (got `tenant_id text not null default 'local'`):

| Table                                                                                                                                                 | Extra changes                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `connections`                                                                                                                                         | + `subject`, `status` (`active/expired/revoked/failed`), `visibility` (`private/service/shared`); PK → `(tenant_id, service, connection_name)` |
| `connection_retirements`                                                                                                                              | PK → `(tenant_id, service, connection_name)`                                                                                                   |
| `oauth_client_configs`                                                                                                                                | PK → `(tenant_id, service)` (org-level auth config)                                                                                            |
| `custom_mcp`                                                                                                                                          | PK → `(tenant_id, service)`; `name_key` stays globally unique                                                                                  |
| `provider_preferences`                                                                                                                                | PK → `(tenant_id, service)`                                                                                                                    |
| `idempotency_records`                                                                                                                                 | PK → `(tenant_id, key_hash)` (key_hash is caller-controlled; a global key would allow cross-tenant squatting/replay)                           |
| `trigger_source_applications`                                                                                                                         | PK → `(tenant_id, id)` in migration 0024 (`id` is a digest of caller input; a global PK would swallow another tenant's save)                   |
| `connection_requests`, `runtime_tokens`, `runs`, `trigger_subscriptions`, `oauth_states`, `oauth_authorization_codes`, `oauth_tokens`, `saas_cleanup` | column only                                                                                                                                    |     |

Instance-singleton (deliberately **not** tenant-scoped): `instance_identity`,
`managed_project`, `marketplace_config`, `runtime_policy`, `oauth_clients`,
`oauth_signing_keys`, `oauth_sources`.

## Storage scoping (OC-1b)

Scope is **explicit**, not ambient (`src/tenant/tenant-scope.ts`):

- `RuntimeDatabase.forTenant(tenantId)` returns a sibling view whose
  tenant-scoped stores are all bound to that tenant. `forInstance()` is the
  named escape hatch (`scope === null`) for cross-tenant maintenance —
  secret rotation, sweeps, `resetRuntimeData`, `SaasProjectStore` cleanup.
- The default view is bound to `local`, so pre-OC-1 single-tenant callers
  keep working unchanged; OC-1c binds request scope at the boundary instead.
- Stores compose predicates through `tenantPredicate` / `tenantWhere`
  (postgres: `tenantPredicatePg` / `tenantWherePg` with `$N` numbering) and
  stamp rows with `tenantForInsert`. A `null` scope degrades every predicate
  to `1 = 1` — there is no silent fallback to a tenant.
- Secret rotation (`rotateSecretCodec`) is instance-scoped and pairs every
  read row's `tenant_id` back into its `update` predicate, so same-named
  rows in different tenants are never overwritten by each other's value.

Cross-tenant coverage lives in `src/server/storage/tenant-scope.cases.ts`,
wired into all three backend suites: same-name connections, idempotency-key
reuse, OAuth state/code/token lookup, runtime tokens, run logs, client
configs, provider preferences, and the `forInstance()` escape hatch.

## Request boundary (OC-1c)

- `RuntimeTokenRecord`/`RuntimeGrant` carry `tenantId` read back from the
  `runtime_tokens.tenant_id` column, so a token authenticates **across**
  tenants (`forInstance()` hash lookup) and then binds the request to the
  tenant stamped at issuance (`src/server/storage/runtime-token-service.ts`).
- `readTenantId(context)` (`src/server/api/auth.ts`) resolves the request
  tenant: the bound grant's `tenantId` wins, admin bearer credentials (not console
  session cookies — cookie reads stay non-mutating) may select a tenant with `?tenant=` or `x-connect-tenant`, and everything else
  falls back to `local`. A grant that disagrees with an explicit selector
  gets `tenant_conflict` (403); a non-admin selector gets
  `tenant_forbidden`; invalid ids get `invalid_tenant_id` via
  `requireTenantId`. `TenantError` maps to `status`/`code` in
  `ConnectServer.onError`.
- Admin routes resolve scoped stores per request through
  `options.runtimeDatabase.forTenant(readTenantId(context))` —
  `/api/runtime-tokens` is the first consumer (`policy-routes.ts`); the
  `local` tenant keeps using the injected service so single-tenant wiring is
  unchanged.

## Invariants for later OC-1 tasks

- Every query against a tenant-scoped table filters `tenant_id`; every write
  stamps it. Runtime tokens carry their tenant from issuance, so token-bound
  calls cannot cross tenants even if the management plane is misused.
- `status`/`visibility` are write-path managed; `shared` + ACL is M6-09 scope
  — OC-1 uses `private` and `service` only.
- Three-backend parity (`sqlite`/`postgres`/`d1`) is enforced by
  `migration-equivalence.test.ts` and the store `.cases.ts` suites.
