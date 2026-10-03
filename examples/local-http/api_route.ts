// API Route API access: https://github.com/DennyHo0917/api-route/blob/main/API.md
// Read-only: list models using an existing API Route connection, without billed inference.

import { fetchJson, runtimeHeaders } from "./client.ts";

const connectionName = process.env.API_ROUTE_CONNECTION_NAME;
if (!process.env.OOMOL_CONNECT_RUNTIME_TOKEN || !connectionName) {
  console.log("Set OOMOL_CONNECT_RUNTIME_TOKEN and API_ROUTE_CONNECTION_NAME (or default) to run this example.");
  process.exit(0);
}

const result = await fetchJson<unknown>("http://localhost:3000/v1/actions/api_route.list_models", {
  method: "POST",
  headers: runtimeHeaders({ "content-type": "application/json", "x-oo-connector-alias": connectionName }),
  body: JSON.stringify({ input: {} }),
});

console.log(JSON.stringify(result, null, 2));
