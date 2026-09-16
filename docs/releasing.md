# Releasing

A release is cut by running the **Release** workflow by hand on `main`
(Actions > Release > Run workflow). It publishes everything a version consists of:

| Artifact                                       | Where it goes            |
| ---------------------------------------------- | ------------------------ |
| Six single-file binaries + `SHA256SUMS`        | GitHub release assets    |
| `@oomol-lab/open-connector` (headless runtime) | npm                      |
| `ghcr.io/oomol-lab/open-connector` image       | `latest` + `vX.Y.Z` tags |
| GitHub release with generated notes            | tag `vX.Y.Z`             |

## Choosing the version

`package.json` stays at `0.0.0-development`; git tags are the only record of released
versions. The workflow takes two inputs:

- `expected_version`: an explicit `X.Y.Z`. Leave it empty to derive the version.
- `version_bump`: `patch` (default), `minor`, or `major`, applied to the latest `vX.Y.Z`
  tag when `expected_version` is empty.

## What the run does

1. Computes the version and creates a **draft** release for it, targeting the dispatched commit.
2. In parallel: builds and smoke-tests the binaries and attaches them to the draft; builds,
   verifies, and publishes the npm package; builds and pushes the multi-arch image.
3. Publishes the draft. GitHub creates the tag at that moment, so users never see a release
   without its assets and `releases/latest/download/...` never points at a partial one.

## Retrying a failed run

Every step is idempotent, so retry without cleaning anything up:

- **Re-run failed jobs** on the failed run keeps the computed version and repeats only what
  failed.
- Dispatching the workflow again on the same commit recomputes the same version: the existing
  draft is reused, an npm version that is already published is skipped, release assets are
  replaced in place, and image tags are re-pointed.

An explicit `expected_version` whose tag already points at another commit is refused; pick a
different version instead.

## One-time setup

- npm trusted publishing: the package settings of `@oomol-lab/open-connector` on npmjs.com
  trust GitHub Actions for `oomol-lab/open-connector` with workflow filename `release.yml` and
  `npm publish` allowed. npm matches the workflow that was dispatched, not the reusable
  workflow that runs the publish command. No npm token is stored in the repository, and npm
  records provenance automatically.
- The GHCR packages are created on first push and must be flipped to public once in the
  GitHub Packages UI.
