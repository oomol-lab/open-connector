# Fork conventions — cognifyi/open-connector

This repository is a fork of [`oomol-lab/open-connector`](https://github.com/oomol-lab/open-connector)
for the Pazity platform. It adds in-repo multi-tenancy, grant envelope, audit, and
hardened defaults required by the Omni Connection Hub (see
`labs/plan/4.功能设计/miles/2026-11-omni-brain-evolution/12-open-connector-development.md`).

Everything in the upstream `AGENTS.md` still applies — including the
clone-baseline ratchet, three-backend migration equivalence, and provider
ownership rules. Fork additions do not get an exemption.

## Remotes

```bash
origin    = git@github.com:cognifyi/open-connector.git     # this fork
upstream  = https://github.com/oomol-lab/open-connector    # read-only reference
```

## What lives in the fork vs upstream

- **Upstream-first**: generic improvements (token TTL, run/trace columns,
  rate limiting, cascade revoke, `REQUIRE_EXPLICIT_POLICY`) should be proposed
  to `oomol-lab/open-connector` as PRs first. Only what upstream rejects or
  what is Pazity-specific stays here.
- **Fork-only** (tracked in `fork/PATCHES.md`):
  - Multi-tenancy: `tenant_id`/`subject` columns and scoped queries.
  - New modules under `src/tenant/` and `src/grant/` — keep fork surface in
    new directories instead of scattering conditionals through upstream files.
  - C16 `audience`/scope semantics and OAuth scope→policy mapping.
  - Hardened defaults (encryption fail-fast, default-deny policies).
  - This `fork/` directory and `.github/workflows/publish-ghcr.yml`.
- Rebase/sync with `upstream/main` quarterly, or sooner when an upstream PR we
  depend on lands. Keep `fork/PATCHES.md` current so the rebase diff surface
  is auditable.

## CI / workflows

Enabled on the fork:

- `ci.yml` — unchanged upstream gate (lint, typecheck, format, tests).
- `publish-ghcr.yml` — fork-only; builds `docker/Dockerfile` for
  `linux/amd64` and pushes `ghcr.io/cognifyi/open-connector:{tip,<sha>}`.

Disabled via repository Actions settings (files kept verbatim for clean
rebases): `publish-docker.yml` (needs Blacksmith runners the fork does not
have), `build-binary.yml`, `release.yml`, `publish-github-release.yml`,
`publish-helm.yml`, `publish-npm.yml`, `star-history.yml`,
`pr-maintainer-edits.yml`.

## Deployment

Cluster deployment code lives in `cog-deploy` (`services/open-connector/`),
never here — the fork ships only the image and the upstream Helm chart under
`deploy/helm/`, which cog-deploy overlays.
