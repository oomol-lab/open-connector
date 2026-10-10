# Provider icon snapshot

`provider-icons.snapshot.json` is the verified icon mapping bundled at build time.

Latest refresh on 2026-10-08:

- Source: `https://connector.oomol.com/public/v1/apps`
- Response SHA-256: `ed18e09c79e1dadff3c2a6916f44075ee13b243692a65080826f6fce6cfe8fd4`
- Captured mapping: 1589 service-to-icon URL entries.
- Existing entries are retained if absent from the upstream response.

Original production snapshot:

- Source: `https://connectors.openmeld.ai/assets/index-CoFp8Aci.js`
- Production Worker version at capture: `c22883ed-d793-4061-9cae-7243ffb1942f`
- Source asset SHA-256: `966fa7b14e109de5949296a3aa7cf0eceb22e8a3f1406b1c601ea061f34c60e4`
- Captured mapping: the `var Os={...}` literal, 1,562 service-to-icon URL entries.

The previous build fetched `https://oomol.com/en/apps/catalog.json`, which
returned HTTP 404 on 2026-09-29. The checked-in snapshot preserves the icon
mapping already served to production users and lets builds run without that
external endpoint. When refreshing it, record the exact source and compare the
result with the provider catalog before replacing this file.
