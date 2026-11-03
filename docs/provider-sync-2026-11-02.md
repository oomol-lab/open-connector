# Provider synchronization, 2026-11-02

This batch adds OpenSEO MCP and updates Feishu, Feishu App Bot, OOMOL Console, Neon error handling, and OpenAlex MCP discovery validation.

OpenSEO uses API-key authentication, discovers the current tool catalog, and exposes a proxy restricted to the official `/mcp` endpoint. Authenticated requests do not follow redirects; query parameters and alternate API-key headers are rejected. Ambiguous 401/403 responses remain provider errors.

Feishu updates include complete pagination, calendar date and notification behavior, document block ranges, sheet selectors, wiki titles and asynchronous tasks, task field clearing, mail/minutes/OKR fixes, and published application-version discovery. Existing action operation types remain unchanged. Native schema helpers preserve required fields and provider-permission metadata.

OOMOL Console adds team skill-package listing and binding, personal skill-package search, current-team usage statistics, and the public `/v1/apps/by-id` query routes. Every request retains the caller's API key. Billing summaries combine team statistics with the authenticated account's balance; they do not impersonate a team creator or use internal balance endpoints.

Neon does not infer authorization failure from an ambiguous HTTP 401/403, including validation, action execution, and proxy requests. OpenAlex MCP rejects discovery loops and account responses without an author ID or email, rather than assigning every unidentified account the same service identity.

Public deployment, file-transit, credential, Worker, and network-policy behavior remains owned by this repository. Public tests are retained where equivalent coverage has not been established. Five temporary Feishu runtime probes passed 58 cases and were removed after comparison rather than committed as duplicate coverage.

Validation includes formatting/lint, full src/scripts/examples type checking, catalog generation, all action examples, provider/network/source/proxy tests, and the Feishu probes. The final focused run passed 100 tests in 19 files, and all 21,210 action examples passed. The complete repository test suite and live third-party credential tests were not run. No remote state or production configuration was changed.
