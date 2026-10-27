# Release notes

## Unreleased

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
