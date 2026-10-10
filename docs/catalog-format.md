# Catalog Format

Provider definitions in `src/providers/<service>/definition.ts` are the source of truth.
`npm run generate:catalog` writes `catalog/apps/<service>.json` and the startup index
`catalog/apps-index.json` together; both are generated local runtime data used by the server at
startup, and neither must be hand-edited. Generated registry and catalog files are ignored by git.
`npm install`, `npm run dev`, and `npm start` create them when they are missing or stale.

Provider executors live in `src/providers/<service>/executors.ts` and are loaded only when an action is executed.

Do not hand-edit generated catalog files as source. Update provider definitions and run:

```bash
npm run generate:catalog
```

At runtime, catalog responses add execution status that is not stored in generated catalog JSON:

- `locallyExecutable`: the open-source runtime has a local executor for the action.
- `catalogOnly`: schemas and metadata are available, but no local executor is wired yet.
- `needsCredential`: the provider needs a configured local connection before execution.
- `noAuthRunnable`: the action belongs to a provider that can run without stored credentials.

Action definitions declare a required `operationType` of `read`, `write`, or `destructive`. This is
the provider-side state effect of the action's most powerful valid input, not a risk level or an
authorization rule. Definitions also declare provider-native `requiredScopes` and
`providerPermissions`. The runtime exposes these fields through HTTP and MCP discovery together
with the current connection profile, so agents can see both the capability they are about to use
and the account it will run as.

Actions may also declare a structured `effect` of `read`, `write`, or `destructive`. Clients use
that owner-authored field for safety policy; they must not infer an effect from an action id, name,
or description. An omitted effect means unknown, not read-only.

For the full contribution workflow, see `.codex/skills/add-provider/SKILL.md`.

## Trigger metadata

Providers with native Trigger implementations publish `triggers` snapshots and `triggerPermissions` in their generated catalog entries. Snapshots keep configuration ports, outputs, identity and definition version; permission guidance uses provider-native scopes. Execution modules export registered Trigger definitions and load through the existing lazy executor registry.

To update an Open Flow checkout without a private repository, install this repository's dependencies and run:

```bash
node scripts/export-flow-trigger-catalog.ts /path/to/open-flow/packages/open-flow/src/trigger/providers/catalog.generated.json
```

The export includes configuration-option support, listener intervals and event-source ownership, and checks that runtime snapshots match the public provider definitions. Open Flow's checked-in snapshot supports independent builds; regeneration requires only a public OpenConnector checkout.
