---
name: add-provider
description: Add or extend an open-source OOMOL Connect provider under src/providers/<service>, including provider definition, action schemas, local executors, credential validation, examples, and generated catalog updates.
---

# Add Provider

Use this skill when adding or updating a provider in this repository. The goal is to produce provider code that looks native to this project, is locally runnable when execution is supported, and keeps the public catalog accurate for agents and users.

This is the agent-oriented workflow for [CONTRIBUTING.md](../../../CONTRIBUTING.md#adding-providers). Follow [AGENTS.md](../../../AGENTS.md) for repository-wide style and verification rules.

## Public Boundary

Keep the repository focused on open-source local execution:

- Do not describe non-public products, non-public migration sources, unreleased SDK behavior, deployment operations, or organization-specific workflows in provider code, docs, examples, or skill text.
- Do not expose compatibility fields, storage placeholders, or implementation details that have no clear public source and consumer.
- Do not add provider-local generated schema modules such as `generated.ts` from OpenAPI/tool output. If the upstream surface is large, choose a small runnable subset and maintain schemas as source.
- Do not copy third-party logos, screenshots, API specs, documentation excerpts, generated schemas, or brand assets unless the project has the right to distribute them.
- Prefer official public URLs for `homepageUrl`, API documentation references in comments when truly needed, and credential help text.
- If you use a reference implementation, treat it only as behavioral evidence. Re-express the provider in this repository's architecture and remove non-public assumptions before finishing.

## Required Context

Before editing, read:

- `AGENTS.md`.
- `CONTRIBUTING.md`.
- `docs/catalog-format.md`.
- Existing providers with similar auth and runtime shape under `src/providers`.
- Shared provider helpers in `src/core/json-schema.ts`, `src/core/cast.ts`, `src/core/request.ts`, `src/core/types.ts`, and `src/providers/provider-runtime.ts`.

When the provider has official API documentation, use it as the source of truth for endpoints, auth, pagination, request bodies, response envelopes, limits, and error behavior. If you also have a reference implementation, compare it against the official docs instead of copying it blindly.

## Pattern Picker

Before writing code, pick the closest current provider and follow its current imports and file shape:

- `src/providers/hackernews` or `src/providers/nasa`: no-auth public APIs.
- `src/providers/avoma` or `src/providers/attention`: API key provider with `executors.ts` as credential wiring and provider logic in `runtime.ts`.
- `src/providers/github`: provider supporting both OAuth and API key through one bearer-token runtime context.
- `src/providers/gmail`: OAuth-only provider with credential validation and resource-specific runtime helpers.
- `src/providers/benchmark_email`, `src/providers/clickhouse`, or `src/providers/dataforseo`: custom credentials or user-configured API base URLs.
- `src/providers/baselinker`, `src/providers/iqair_airvisual`, or `src/providers/autotask`: provider proxy support and endpoint guards.
- `src/providers/http-json-runtime.ts`: shared helper for simple JSON HTTP providers when the provider does not need a richer local protocol.

Do not copy these examples mechanically. Use them to discover the current helper APIs and module boundaries, then keep only the pieces that match the provider being added.

## Target Shape

Provider code normally lives under:

```text
src/providers/<service>/
  definition.ts
  actions.ts       # Optional, but preferred once the provider has several actions.
  executors.ts
  scopes.ts        # Only for non-trivial provider-native scopes or permissions.
  runtime-*.ts     # Only for real API-family or resource boundaries.
```

Rules:

- Do not create `index.ts` or barrel files.
- Do not hand-edit generated registry or catalog files. Run generation.
- Keep definitions importable without network, credentials, or executor code.
- Keep executor modules lazy. `definition.ts` must not import `executors.ts`, and executor modules should not import `definition.ts` just to reuse catalog metadata.
- Keep provider-local helpers for provider-specific URLs, signing, pagination, envelopes, error extraction, and response normalization. Put generic casts, reads, query building, request helpers, and credential wiring in shared helpers when they are useful across providers.
- When sibling providers in one product family share product-specific runtime or schema code, keep that code under one owning provider and import it from the siblings. Do not place product-family modules directly under `src/providers/`; reserve that root for genuinely cross-provider infrastructure.

## Provider Definition

Create or update `definition.ts` as catalog source code:

- Export `provider: ProviderDefinition`.
- Use a stable lowercase service id, usually the product slug.
- Declare `displayName`, `categories`, `authTypes`, `auth`, optional `homepageUrl` or `iconUrl`, and `actions`.
- Use `defineProviderAction(service, action)` from `src/core/provider-definition.ts` so action ids stay stable as `<service>.<name>`.
- Use provider-native `requiredScopes` and `providerPermissions`; do not invent private aliases.
- Keep action descriptions and schema descriptions useful for agents. They should describe the business operation and field meaning, not the implementation.

Build `inputSchema` and `outputSchema` with `s` from `src/core/json-schema.ts`:

- Prefer existing `s` helpers; read `src/core/json-schema.ts` for the current helper names instead of inventing provider-local schema wrappers.
- Drop to plain JSON Schema only for a provider-specific edge case that the shared helper cannot express clearly.
- Preserve meaningful required fields, enums, formats, min/max values, defaults, pagination cursors, follow-up actions, and async lifecycle metadata.
- Do not copy generated catalog JSON into source.
- Do not preserve generated safe-integer limits or converter artifacts unless they represent a real provider constraint.
- Do not hide stable top-level outputs behind `unknown` or overly loose objects when the provider returns a documented shape.

## Auth

Map provider auth to this repository's public credential types:

- `no_auth`: use `authTypes: ["no_auth"]` and `auth: [{ type: "no_auth" }]`.
- `api_key`: provide a user-facing label, placeholder, and useful description.
- `custom_credential`: define explicit fields with labels and descriptions.
- `oauth2`: configure public authorization URL, token URL, scopes, redirect path behavior if required by current types, token auth method, and static authorization params.

Open-source users bring their own credentials and OAuth applications. Provider code should validate and use those credentials through the shared runtime interfaces instead of assuming an external credential service.

Add `credentialValidators` in `executors.ts` when the provider can cheaply verify credentials and return a useful `CredentialProfile`. Use a stable account id and readable display name when the provider exposes them.

## Executors

Create or update `executors.ts` with `ProviderExecutors`:

- Use `defineProviderExecutors` from `src/providers/provider-runtime.ts`.
- Prefer `defineApiKeyProviderExecutors`, `defineOAuthProviderExecutors`, or `defineBearerProviderExecutors` when their context shape fits.
- Resolve credentials through `ExecutionContext` or the shared credential helpers.
- Keep action handlers keyed by provider action names.
- Preserve provider request semantics: endpoint paths, methods, auth headers, request bodies, query params, pagination, status handling, error mapping, and output normalization.
- Use `ProviderRequestError` for provider API failures that should become stable execution errors.
- Use `context.fetcher` / `providerFetch`; add `skipDnsValidation: true` only when every egress host is a hardcoded code-controlled literal.
- Use shared request helpers such as `setSearchParams`, `readProviderJson`, and `readProviderText` when they fit existing patterns.
- Pass `context.signal` and transit file support through provider contexts when the provider needs cancellation or file output.

Provider-local runtime files are appropriate when a provider has multiple API areas or a meaningful shared protocol. Do not add local mini-frameworks, schema facades, or action adapter layers just to reduce edit size.

## Historical Failure Modes

Previous provider batches needed cleanup for these issues. Check them explicitly:

- Do not add catalog-only placeholders or empty `executors`. Add a provider when it has a runnable local executor.
- Do not commit generated action schema modules. Hand-maintained provider source should own action schemas.
- If a credential field contains a user-configured base URL, host, workspace URL, or region-derived URL, normalize and validate it with the current public URL helper from `src/core/request.ts` before any fetch or proxy call. Reject credentials in URLs and unsafe network targets according to that helper.
- If runtime downloads or uploads files, use existing transit-file and bounded-response helpers. Avoid unbounded `arrayBuffer()` or `text()` reads for file-sized responses.
- If the upstream API supports streaming, multipart uploads, or very large local files but this runtime only supports JSON-friendly calls, expose the JSON-friendly shape and reject unsupported flags deliberately.
- Do not add tests that only prove schema validation already rejects malformed fields. Add tests only when provider or shared runtime behavior would otherwise be unprotected.

## Examples And Tests

Examples should be concrete scripts users can run with `node examples/...`. If credentials are required, read them from environment variables and print a clear skip message when missing. Do not add package scripts for every provider example.

Provider tests are not required for simple request/response mapping already covered by centralized provider loader tests. Add targeted tests only when the change introduces non-trivial local logic, shared helper behavior, proxy endpoint guards, credential validation branches, pagination normalization, or a confirmed regression risk.

Do not add tests that only mirror static declarations such as provider labels, auth type arrays, action names, icon URLs, or generated catalog shape.

## Implementation Flow

1. Identify the provider id and the smallest useful runnable action set. Prefer a runnable provider over a catalog-only placeholder.
2. Read official docs and one or two nearby providers from the pattern picker.
3. Add or update `definition.ts`, `actions.ts`, `executors.ts`, and provider-local runtime files.
4. Move genuinely generic helper behavior to shared helper modules only after checking existing APIs and downstream call sites.
5. Run `npm run generate:catalog`.
6. Run `npm run fix-check`.
7. Run `npm run check:conformance` when action lists, executor wiring, or shared provider runtime changed.
8. Run targeted tests when you changed shared helpers or added provider logic that is not covered by existing loader tests.
9. Run `npm run build` when you need CI-parity no-fix typechecking or when the task asks for it.
10. Review diffs for generated noise, non-public wording, copied assets, placeholder fields, and non-lazy imports.

## Quality Gate

Before finishing, inspect the result against these checks:

- The provider reads like native open-source code for this repository.
- Definitions are pure catalog data and executor code is lazy-loaded.
- Runtime fields have a clear public source and consumer.
- Auth is locally configurable by users.
- Schemas are useful public contracts for agents, not loose reflections of unknown JSON.
- Generic helper code has a single owner.
- Provider-local helper code has provider-specific meaning.
- No generated files were hand-edited.
- `npm run check:conformance` passes when action ids or executor modules changed.
- No third-party rights issue was introduced.
- No non-public product behavior is mentioned.

## Final Handoff

State:

- Which provider and actions were added or updated.
- Whether each action is locally executable or catalog-only.
- Main files changed.
- Any shared helpers changed and why the behavior belongs there.
- Tests intentionally omitted or added, with the reason.
- Exact validation commands run and their result.
- Whether full tests were not run.
