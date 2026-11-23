# Contributing

Thanks for contributing to OOMOL Connect.

## Development Setup

```bash
npm install
npm test
```

## Before Opening a Pull Request

Run:

```bash
npm run fix-check
npm test -- <affected-file-or-directory>
```

Run relevant probes when changing database, native transport or subprocess
behavior. Adding a provider does not require running probes unless it changes
those shared paths. CI runs the full test suites.

## Test suites

Use `npm test -- <path>` to run the tests for a file or directory. Without a path,
`npm test` runs all `*.test.ts` files, including provider tests.

Use `npm run test:probe -- <path>` for `*.probe.ts` tests that need database
servers, native connections or child processes. Omit the path to run all probes.
Install OpenSSL before running TLS probes. Set `TEST_POSTGRES_URL` to include
PostgreSQL integration tests; PGlite tests start their own database.

Keep mocked behavior in ordinary tests and environment-dependent checks in probes.
CI runs both suites.

## Adding Providers

Start a public JSON GET provider with the minimal scaffold:

```bash
node scripts/create-provider.ts example "Example" https://api.example.com/data
```

The command creates a provider under `src/providers/<service>/` without replacing
existing files. Supply a real public endpoint, replace `get_data` and its output
with the provider's action and schema, and add authentication when required.

Provider definitions should be source-of-truth files under `src/providers/<service>/definition.ts`.
Generated files are updated through:

```bash
npm run generate:catalog
node scripts/check-action-examples.ts
```

Generated `src/providers/registry*.generated.ts`, `src/providers/action-contracts.generated.ts`, and
`catalog/apps/*.json` files are local runtime data and are ignored by git.

If you use an agent to add providers, the optional workflow in
[.codex/skills/add-provider/SKILL.md](.codex/skills/add-provider/SKILL.md) follows the same rules.

To let a chat channel's inbound events be verified through OpenConnector, follow
[Channel Event Verification](docs/channel-event-verification.md#adding-a-channel).

## Third-Party Rights

Do not contribute third-party logos, icons, screenshots, documentation excerpts, API schemas, or
brand assets unless you have the right to do so.

Provider names, app names, trademarks, logos, and brand assets belong to their respective owners.
This project uses such references only for identification and interoperability.

## Contribution License

OpenConnector is licensed under the OpenConnector License, a modified Apache License 2.0. See
[LICENSE.txt](LICENSE.txt). By submitting a pull request, you agree to the contributor terms in
section 2 of that license: OOMOL may adjust the license to be more strict or more relaxed, and your
contribution may be used for commercial purposes, including OOMOL's hosted services.
