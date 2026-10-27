# Release notes

## Unreleased

### Changed

- OpenConnector is now licensed under the Functional Source License, Version 1.1, ALv2 Future
  License (FSL-1.1-ALv2). You may use, modify, and self-host it for any purpose other than a
  Competing Use, and each release becomes available under the Apache License, Version 2.0, two
  years after it is published. Releases up to and including v1.9.4 remain under the Apache
  License, Version 2.0. Contributors now sign the Contributor License Agreement in `CLA.md`.
- The standalone server now defaults to lazy catalog schemas, matching the embedded
  runtime. Action metadata stays in memory while schemas are read from catalog files
  on demand. This reduces startup work and resident memory; the first access to an
  uncached provider schema performs a file read. API response content is unchanged.
  Set `OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS=false` for the previous eager-loading
  behavior, or pass `lazySchemas: false` when embedding the runtime. Keep the catalog
  files available throughout the runtime's lifetime.
