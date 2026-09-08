# Metabase actions backed by native MCP

Metabase's native MCP is an execution transport for the `metabase` provider, not a separate
connector service. Use the same Metabase API-key connection and instance URL as the REST actions.

## Compatibility

The existing ten REST actions, their inputs and outputs, and the HTTP proxy remain available.
Connection validation continues to use the REST API, so older instances and instances with MCP
disabled can still connect and use those actions. Successful connection validation does **not**
prove that native MCP is enabled or that the API key can access it.

Native actions require a Metabase deployment with MCP enabled and API-key authentication accepted
at `/api/metabase-mcp`. Run `metabase.list_mcp_tools` to check that capability. An unavailable native
endpoint fails explicitly; the connector does not silently switch a native action to REST.

The initial implementation targets the non-Apps MCP contracts in Metabase v0.63.16. It does not claim
compatibility with every version. Existing REST `metabase.search` is unchanged; native search uses
`metabase.search_content`.

## Action contracts

Action guides and the generated catalog describe each operation's supported inputs and outputs.
For example, `metabase.execute_sql` accepts `{ "databaseId": 1, "sql": "SELECT 1" }` and returns
`status`, `columns`, `rows`, and available execution metadata. `metabase.construct_query` returns a
`queryHandle` that can be passed to `metabase.execute_query`. Native SQL handles are for saving
questions, not for executing MBQL; execute SQL with `metabase.execute_sql`.

Native capabilities include structured/native query construction, SQL and question execution,
entity resource reading, and creating or updating questions, metrics, dashboards and collections.
The MBQL query object intentionally remains extensible where the upstream contract does.

Native `isError` responses and failed query payloads are connector execution failures, not successful
actions that require callers to inspect a nested flag. Successful responses expose useful named
fields; raw data, where supplied, is supplementary. Multi-resource reads may have per-resource
errors rather than failing an otherwise useful batch.

`metabase.list_mcp_tools` exposes the deployed tools and their schemas for diagnostics and version
inspection. It does not grant access to execute arbitrary tool names. Each native operation has its
own registered action and is subject to normal connector action/connection policies. Do not grant
`metabase.*` to callers who should only read metadata: that wildcard also includes query and write
actions.

`metabase.list_mcp_resources` and `metabase.read_mcp_resource` expose MCP documentation such as
`metabase://docs/construct-query.md`. The protocol resource read is distinct from the entity-reading
tool.

## Query handles

Constructed queries return opaque handles for later native actions. In the inspected release,
Metabase resolves handles by authenticated user, including across MCP sessions. The executor closes
the transport after each action without sending session DELETE, which would remove the producing
session's handles. Upstream cleanup can invalidate handles; do not assume they live forever or share
them across identities. Mutating calls are not automatically retried.

## Network and authentication limits

The existing Metabase provider's public HTTPS URL and DNS-validation policy remains unchanged.
HTTP, localhost and private-network instances are not supported by this provider.

OAuth is not advertised by this implementation. Metabase OAuth agent scopes are not equivalent to
REST access; adding OAuth without action-specific authentication semantics would incorrectly suggest
that existing REST actions and proxy work with those credentials.

MCP Apps UI, visualization/drill-through resources, app-only credential refresh, and automatic OAuth
discovery/client registration are not implemented. These actions do not make the connector's MCP
frontend a transparent Metabase MCP proxy.

## Read-only discovery example

Create a `metabase` API-key connection and a runtime token permitted to execute
`metabase.list_mcp_tools`. Set `OOMOL_CONNECT_RUNTIME_TOKEN` and optionally `OOMOL_CONNECT_ORIGIN` (default
`http://localhost:3000`), then run:

```sh
node examples/local-http/metabase.ts
```

The example only discovers tools; it does not execute queries or modify content. With no token,
it prints a skip message. Live authentication and query/write workflows must still be verified
against the target deployment; fixture-based tests are not a live compatibility guarantee.

Sources: [Metabase MCP guide](https://www.metabase.com/docs/v0.63/ai/mcp),
[pinned native tool transforms](https://github.com/metabase/metabase/blob/v0.63.16/src/metabase/mcp/tools.clj),
[session implementation](https://github.com/metabase/metabase/blob/v0.63.16/src/metabase/mcp/session.clj).
