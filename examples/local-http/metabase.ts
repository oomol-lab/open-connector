// Metabase MCP docs: https://www.metabase.com/docs/v0.63/ai/mcp

import { fetchJson, runtimeHeaders } from "./client.ts";

const origin = process.env.OOMOL_CONNECT_ORIGIN ?? "http://localhost:3000";
if (!process.env.OOMOL_CONNECT_RUNTIME_TOKEN) {
  console.log(
    "Skipped: set OOMOL_CONNECT_RUNTIME_TOKEN. Create a metabase API-key connection first and enable MCP on that instance.",
  );
} else {
  const result = await fetchJson(new URL("/v1/actions/metabase.list_mcp_tools", origin).href, {
    method: "POST",
    headers: runtimeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ input: {} }),
    signal: AbortSignal.timeout(90_000),
  });
  console.log(JSON.stringify(result, null, 2));
}
