# Repository Guidelines

## Architecture

- Keep one clear owner for each fact. Do not repeat provider metadata such as `displayName` in executors when it already belongs to `definition.ts`; pass or inject it from the caller that has the definition/catalog.
- Provider definitions are catalog source code. Build schemas with `src/core/json-schema.ts` helpers, usually imported as `s`, instead of copying generated catalog JSON.
- Keep runtime lazy: catalog generation may import provider definitions, but executor modules should load only when an action or credential validator is actually used.
- Do not create barrel files such as `index.ts`. Import from the concrete module that owns the API.

## Code Style

- Prefer VS Code-style coherent modules: split files by responsibility or abstraction boundary, not by loose categories.
- Prefer `interface` for object-shaped contracts. Keep unions and mapped/utility compositions as `type`.
- Prefer named options/input interfaces over inline object types when a function signature spans multiple lines or crosses module boundaries.
- Avoid temporary ad hoc objects passed through many layers. Prefer explicit interfaces, classes, or top-level functions that match module boundaries.
- Put generic low-level casting/reading helpers in `src/core/cast.ts`; avoid provider-specific wrappers for generic reads.
- Avoid trivial pass-through helpers and conditional object spreads that only hide `undefined` JSON fields.
- Do not manually wrap code to 80 columns. Let `oxfmt` decide formatting.

## Runtime API

- Keep `/v1` response shaping in `src/server/runtime-api.ts`; route handlers should dispatch and validate, not assemble compatibility objects field by field.
- Public runtime fields should have a clear source and consumer. Do not expose local implementation concepts or placeholder fields just because they are easy to add.
- Match existing runtime wire shapes deliberately: catalog index endpoints, action metadata, connection aliases, envelopes, and error codes should stay stable for SDK/CLI clients.
- If an upstream-compatible field has no local source yet, prefer omitting it or returning a documented empty value from the serializer rather than scattering optional fields in routes.

## Providers

- Provider code normally lives in `src/providers/<service>/definition.ts`, `actions.ts`, `executors.ts`, and provider-local runtime helper files when needed.
- Prefer provider-local constants for official scopes, permissions, URLs, and API versions. Action `requiredScopes` should use provider-native scopes/capabilities, not private internal aliases.
- Avoid repeated action-name wiring. Define action handlers once and derive executor maps through shared provider runtime helpers.
- Do not import provider definitions from executor modules just to reuse metadata; inject catalog metadata from the server/loader side when needed.

## Provider Network Egress (SSRF)

- All provider egress must go through the shared SSRF-guarded fetch, never the global `fetch`. Use `context.fetcher` (injected by `defineProviderExecutors`/`defineApiKeyProviderExecutors`/etc.) or, in a hand-written proxy, the exported `providerFetch` / `createProviderFetch`. The guard validates the request URL and every redirect `Location` with `assertPublicHttpUrl`, follows redirects manually, and (by default) validates DNS-resolved addresses.
- DNS resolved-address validation is ON by default and runs once per request for hostname targets. Add `skipDnsValidation: true` (on `defineProviderExecutors`/`defineProviderProxy`/`createProviderFetch`) ONLY when the egress host is a hardcoded literal fully controlled by the code. NEVER add it when the host comes from credential/user input, when the base URL is a resolver, or when the provider fetches a user-supplied URL — there the DNS check is the SSRF defense, not redundant overhead.
- Self-hosted providers whose instance host is user/credential-configured and may live on a private network pass `allowPrivateNetwork: isPrivateNetworkAccessAllowed` into their executors/proxy AND thread the same flag into their base-URL `assertPublicHttpUrl` call (see Dokploy for the reference pattern). It is deployment-gated by `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK`; reserved, loopback, link-local, and cloud-metadata targets stay blocked even when it is enabled.
- User-supplied content/download URLs (e.g. `fileUrl`, `sourceUrl`, `imageUrl`) must ALWAYS be validated public-only — call `assertPublicHttpUrl` without `allowPrivateNetwork` and download them with the public-only `providerFetch`, never a private-aware `context.fetcher`. The private-network opt-in covers only the trusted instance host.
- Prefer the shared `assertPublicHttpUrl` / `isBlockedIpAddress` over a bespoke per-provider hostname guard; bespoke guards have missed the cloud-metadata blocklist and bracketed-IPv6 forms.
- Gotcha: a provider that branches on `fetcher === fetch` (e.g. to gate rate limiting to production) must compare against `providerFetch`, since that is the fetcher the runtime now injects — not the global `fetch`.

## TypeScript And Tooling

- Use native Node.js TypeScript execution. Do not add `tsx` or `--experimental-strip-types`.
- `src/`, `scripts/`, and `examples/` each have their own `tsconfig.json`; project checks focus on `src`.
- Exported top-level functions and public types should have explicit return types and useful JSDoc when it explains business meaning.
- Use `oxfmt` and `oxlint`; do not add Prettier.

## Examples And Web

- Examples should be concrete scripts users can run directly with `node examples/...`; do not add every example to `package.json`.
- If an example depends on external credentials, print a clear skip message when environment variables are missing.
- Do not put web UI code under `src/`. The future console should live as a separate Vite package under `web/`.
- Public docs should describe normal OSS usage and may include official SaaS, hosted, or team product paths when they are part of the public product strategy. Do not mention internal compatibility projects or unreleased SDK behavior.

## Verification

- Before finishing code changes, run `npm run fix-check`. It runs lint fixes, formatting fixes, and the `src` typecheck.
- Run `npm run build` only when you need a separate no-fix typecheck, for example after generated files changed or for CI parity.
- Run `npm run generate:catalog` when provider definitions or actions change.
- Run provider examples manually when the task changes user-facing example behavior.
