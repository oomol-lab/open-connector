# Release notes

## Unreleased

### Changed

- The standalone server now defaults to lazy catalog schemas, matching the embedded
  runtime. Action metadata stays in memory while schemas are read from catalog files
  on demand. This reduces startup work and resident memory; the first access to an
  uncached provider schema performs a file read. API response content is unchanged.
  Set `OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS=false` for the previous eager-loading
  behavior, or pass `lazySchemas: false` when embedding the runtime. Keep the catalog
  files available throughout the runtime's lifetime.
