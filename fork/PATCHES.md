# Fork patch ledger

Every divergence from `upstream/main` that is not itself an upstream PR gets a
row here. This is the checklist for the quarterly rebase: each row must either
still apply cleanly or be recorded as dropped/upstreamed.

| Area                                                                        | Change                                                                                                       | Status | Upstream PR                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------- |
| `.github/workflows/publish-ghcr.yml`                                        | New fork-only workflow; amd64 image to `ghcr.io/cognifyi/open-connector`                                     | active | — (publishing infra)          |
| `fork/`                                                                     | This directory                                                                                               | active | —                             |
| `migrations/0023+0024` (both dialects)                                      | `tenant_id` on all row-scoped tables + `subject`/`status`/`visibility` on connections + tenant-scoped PKs    | active | — (upstream is single-tenant) |
| `src/tenant/`                                                               | Tenant-id/subject grammar and validation; `tenant-scope.ts` explicit scope predicates                        | active | —                             |
| `src/server/storage/`                                                       | All tenant-scoped queries carry a `TenantScope`; `forTenant`/`forInstance` views on `RuntimeDatabase`        | active | —                             |
| `src/server/api/auth.ts` + `connect-app.ts`                                 | `readTenantId`/`readSubject` request resolution; instance-wide token auth; `services.forTenant` scoped graph | active | —                             |
| `src/server/tenant-services.ts` + all request routes                        | Per-request `ScopedServices` bundle; every endpoint family resolved through `forTenant(readTenantId)`        | active | —                             |
| `src/server/api/tenant-isolation.test.ts` + storage `tenant-scope.cases.ts` | Cross-tenant isolation suite: endpoint-level negative/positive cases + per-backend store cases               | active | —                             |

Fork-planned work packages (land as rows when merged):

- OC-1 `src/tenant/` — tenant_id/subject/status/visibility across all stores
- OC-2 `src/grant/` — runtime token TTL/run_id/audience, default-deny, cascade revoke
- OC-3 runs audit columns + NDJSON export (upstreamable)
- OC-4 hardened defaults + tenant rate limiting + scope→policy mapping
