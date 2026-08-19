# Catalog Format

Provider definitions in `src/providers/<service>/definition.ts` are the source of truth.
Catalog JSON in `catalog/apps` is generated local runtime data and used by the server at startup.
Generated registry and catalog files are ignored by git. `npm install`, `npm run dev`, and
`npm start` create them when they are missing or stale.

Provider executors live in `src/providers/<service>/executors.ts` and are loaded only when an action is executed.

Do not hand-edit generated catalog files as source. Update provider definitions and run:

```bash
npm run generate:catalog
```

At runtime, catalog responses add execution status that is not stored in generated catalog JSON.
The Node and Cloudflare servers pass `executableActionIds` from the generated executor registry:

- `locallyExecutable`: the action id is in that generated list, so the open-source runtime has a local executor.
- `catalogOnly`: schemas and metadata are available, but the action id is not in the generated executor list.
- `needsCredential`: the provider needs a configured local connection before execution.
- `noAuthRunnable`: the action belongs to a provider that can run without stored credentials.

This repository requires every catalog action to have a matching executor key. `npm run check:conformance`
compares those sets, scans provider sources for unguarded `fetch` / `WebSocket` usage, rejects
`skipDnsValidation` unless every egress host is a code-controlled literal, and ratchets
`allowPrivateNetwork` providers that still lack `assertPublicHttpUrl` / `assertGuardedEgressUrl`.

Action definitions also declare provider-native `requiredScopes` and `providerPermissions`. The
runtime exposes those fields through HTTP and MCP discovery together with the current connection
profile, so agents can see both the capability they are about to use and the account it will run as.

For the full contribution workflow, see `.codex/skills/add-provider/SKILL.md`.
