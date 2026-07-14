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

At runtime, catalog responses add execution status that is not stored in generated catalog JSON:

- `locallyExecutable`: the open-source runtime has a local executor for the action.
- `catalogOnly`: schemas and metadata are available, but no local executor is wired yet.
- `needsCredential`: the provider needs a configured local connection before execution.
- `noAuthRunnable`: the action belongs to a provider that can run without stored credentials.

Action definitions also declare provider-native `requiredScopes` and `providerPermissions`. The
runtime exposes those fields through HTTP and MCP discovery together with the current connection
profile, so agents can see both the capability they are about to use and the account it will run as.

OAuth provider definitions default to the browser-based `authorization_code` flow. Machine-to-machine
providers declare `flow: "client_credentials"`; those definitions require a token URL but do not
declare an authorization URL. Their client ID, client secret, and `clientConfigFields` are collected
when each named connection is created. Provider extensions such as a token `audience` or `tags`
parameter can map token request field names to `clientConfigFields` with
`tokenRequestFields.clientCredentials.configFields`.

For the full contribution workflow, see `.codex/skills/add-provider/SKILL.md`.
