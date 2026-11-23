# Examples

This directory contains runnable, end-to-end examples that demonstrate how to integrate with OpenConnector across distinct usage scenarios.

## Guidelines: Keep This Directory Focused

**Do not add files to `examples/` arbitrarily, and do not add a new example for every provider.**

This directory is meant to cover **representative usage patterns**—not to mirror the provider catalog or serve as a dumping ground for per-provider live checks or smoke tests.

- **Cover scenarios, not every provider.** One or two examples per pattern (for example, a no-auth action, an API-key connection, an OAuth flow, a proxy call, an MCP client, or an OpenAI tool-calling loop) is enough.
- **Do not leave provider verification scripts behind.** When adding or updating a provider—especially with AI-assisted development—avoid committing ad-hoc test or live-check scripts under `examples/`. Delete temporary verification scripts before committing, or add proper tests in the appropriate test suite when shared behavior needs coverage.
- **When to add a new example.** Only add a new file here if it demonstrates a genuinely new integration surface, authentication mechanism, or runtime workflow that existing examples do not already cover.

## Writing an Example

- Make the script directly runnable with `node examples/...` (do not add every example script to `package.json`).
- If an example requires external credentials or tokens, print a clear skip message when the required environment variables are missing instead of failing abruptly.

## Available Examples

- [`local-http/`](./local-http/README.md) — Calling the local HTTP runtime directly (no-auth actions, API key / credential connections, OAuth setup, and provider proxy).
- [`mcp-client/`](./mcp-client/README.md) — Listing MCP tools exposed by the local runtime.
- [`openai-tools/`](./openai-tools/README.md) — Converting the action catalog into OpenAI function tools and running a tool-call loop.
