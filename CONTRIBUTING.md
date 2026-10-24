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
npm test
```

## Adding Providers

Start a public JSON GET provider with the minimal scaffold:

```bash
node scripts/create-provider.ts example "Example" https://api.example.com/data
```

The command creates `definition.ts`, `actions.ts`, and `executors.ts` and refuses to
replace an existing provider. It uses shared request/timeout/error helpers and
keeps execution lazy. Supply a real public endpoint, then replace `get_data` and
its generic output with the provider's documented action and schema. Add the
provider's authentication and credential validation when required. The scaffold
is a starting point; review it before publishing the provider.

Provider definitions should be source-of-truth files under `src/providers/<service>/definition.ts`.
Generated files are updated through:

```bash
npm run generate:catalog
```

Generated `src/providers/registry*.generated.ts`, `src/providers/action-contracts.generated.ts`, and
`catalog/apps/*.json` files are local runtime data and are ignored by git.

If you use an agent to add providers, the optional workflow in
[.codex/skills/add-provider/SKILL.md](.codex/skills/add-provider/SKILL.md) follows the same rules.

## Third-Party Rights

Do not contribute third-party logos, icons, screenshots, documentation excerpts, API schemas, or
brand assets unless you have the right to do so.

Provider names, app names, trademarks, logos, and brand assets belong to their respective owners.
This project uses such references only for identification and interoperability.

## Contribution License

By submitting a pull request, you agree that your contribution is provided under the Apache License,
Version 2.0, unless you clearly mark it otherwise in writing.
