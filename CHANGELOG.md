# Release notes

## Unreleased

### Fixed

- OAuth clients registered through dynamic client registration or a CIMD document without an
  explicit scope now default to all supported scopes instead of only `mcp:access`. Clients such
  as ChatGPT that request `mcp:access offline_access` at the authorize endpoint no longer fail
  with `invalid_scope`.
- Runtime tokens minted on OAuth consent approval now carry no additional action restriction
  (an empty allowed-action policy governed by the deployment and runtime policy layers) instead
  of allowing all actions.

### Added

- Inbound OAuth 2.1 authorization server for MCP clients on Node deployments: protected resource
  metadata (RFC 9728), authorization-code flow with PKCE S256, dynamic client registration
  (RFC 7591), token revocation (RFC 7009), and ES256-signed JWT access tokens. Enable with
  `OOMOL_CONNECT_OAUTH_ENABLED=true`; see the `OOMOL_CONNECT_OAUTH_*` variables in
  [Configuration](docs/configuration.md).

### Changed

- OpenConnector is now licensed under the OpenConnector License, a modified Apache License 2.0.
  You may still use, modify, self-host, and embed it for any purpose, including commercial use,
  but providing it to third parties as a hosted connector service requires a commercial license
  from OOMOL. Contributors agree to the contributor terms in section 2 of the license. Releases
  up to and including v1.9.4 remain under the unmodified Apache License 2.0.
- The standalone server now defaults to lazy catalog schemas, matching the embedded
  runtime. Action metadata stays in memory while schemas are read from catalog files
  on demand. This reduces startup work and resident memory; the first access to an
  uncached provider schema performs a file read. API response content is unchanged.
  Set `OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS=false` for the previous eager-loading
  behavior, or pass `lazySchemas: false` when embedding the runtime. Keep the catalog
  files available throughout the runtime's lifetime.

### Security

- The egress guard now always blocks the Azure platform endpoint `168.63.129.16` and the
  IPv6 metadata endpoints of Google Cloud (`fd20:ce::254`) and Oracle Cloud
  (`fd00:c1::a9fe:a9fe`), including when `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK=true` and when
  the IPv4 address is embedded in a v4-mapped, NAT64, 6to4, or Teredo IPv6 address. Previously
  `168.63.129.16` passed as a public address and the two IPv6 endpoints were reachable once
  private networks were allowed.
