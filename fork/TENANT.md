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

| Table                                                                                                                                                                                | Extra changes                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `connections`                                                                                                                                                                        | + `subject`, `status` (`active/expired/revoked/failed`), `visibility` (`private/service/shared`); PK → `(tenant_id, service, connection_name)` |
| `connection_retirements`                                                                                                                                                             | PK → `(tenant_id, service, connection_name)`                                                                                                   |
| `oauth_client_configs`                                                                                                                                                               | PK → `(tenant_id, service)` (org-level auth config)                                                                                            |
| `custom_mcp`                                                                                                                                                                         | PK → `(tenant_id, service)`; `name_key` stays globally unique                                                                                  |
| `provider_preferences`                                                                                                                                                               | PK → `(tenant_id, service)`                                                                                                                    |
| `idempotency_records`                                                                                                                                                                | PK → `(tenant_id, key_hash)` (key_hash is caller-controlled; a global key would allow cross-tenant squatting/replay)                           |
| `connection_requests`, `runtime_tokens`, `runs`, `trigger_subscriptions`, `trigger_source_applications`, `oauth_states`, `oauth_authorization_codes`, `oauth_tokens`, `saas_cleanup` | column only                                                                                                                                    |     |

Instance-singleton (deliberately **not** tenant-scoped): `instance_identity`,
`managed_project`, `marketplace_config`, `runtime_policy`, `oauth_clients`,
`oauth_signing_keys`, `oauth_sources`.

## Invariants for later OC-1 tasks

- Every query against a tenant-scoped table filters `tenant_id`; every write
  stamps it. Runtime tokens carry their tenant from issuance, so token-bound
  calls cannot cross tenants even if the management plane is misused.
- `status`/`visibility` are write-path managed; `shared` + ACL is M6-09 scope
  — OC-1 uses `private` and `service` only.
- Three-backend parity (`sqlite`/`postgres`/`d1`) is enforced by
  `migration-equivalence.test.ts` and the store `.cases.ts` suites.
