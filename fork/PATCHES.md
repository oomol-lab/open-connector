# Fork patch ledger

Every divergence from `upstream/main` that is not itself an upstream PR gets a
row here. This is the checklist for the quarterly rebase: each row must either
still apply cleanly or be recorded as dropped/upstreamed.

| Area | Change | Status | Upstream PR |
|---|---|---|---|
| `.github/workflows/publish-ghcr.yml` | New fork-only workflow; amd64 image to `ghcr.io/cognifyi/open-connector` | active | — (publishing infra) |
| `fork/` | This directory | active | — |

Fork-planned work packages (land as rows when merged):

- OC-1 `src/tenant/` — tenant_id/subject/status/visibility across all stores
- OC-2 `src/grant/` — runtime token TTL/run_id/audience, default-deny, cascade revoke
- OC-3 runs audit columns + NDJSON export (upstreamable)
- OC-4 hardened defaults + tenant rate limiting + scope→policy mapping
