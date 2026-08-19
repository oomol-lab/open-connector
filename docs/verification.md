# Verification

Catalog coverage, local execution, and external API verification are separate states.

When documenting a provider, distinguish:

- Catalog-only actions: schemas and metadata are available for discovery.
- Locally executable actions: the open source runtime has an executor for the action.
- Verified coverage: maintainers have current evidence that the action or provider works against the real upstream API.

This repository requires every catalog action to have a matching local executor. `npm run check:conformance`
enforces that on Node, rejects `skipDnsValidation` unless every egress host is a
code-controlled literal, and ratchets `allowPrivateNetwork` providers that still lack
`assertPublicHttpUrl` or `assertGuardedEgressUrl` (Dokploy is the reference). Cloudflare omits
`nodeOnly` providers, so those actions appear catalog-only on Workers.

Do not imply that every catalog action is end-to-end verified unless that evidence is available in
public project artifacts. Prefer verification notes that users can reproduce from this repository,
such as example scripts, smoke tests, or public status pages.
