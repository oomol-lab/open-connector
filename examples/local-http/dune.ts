// Dune API docs: https://docs.dune.com/api-reference

import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

const apiKey = process.env.DUNE_API_KEY;
if (!apiKey) {
  console.log("Set DUNE_API_KEY to run this example.");
  process.exit(0);
}

await fetchJson("http://localhost:3000/api/connections/dune", {
  method: "PUT",
  headers: adminHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ authType: "api_key", values: { apiKey } }),
});

const action = process.env.DUNE_EXECUTION_ID ? "dune.get_execution_status" : "dune.list_queries";
const input = process.env.DUNE_EXECUTION_ID ? { executionId: process.env.DUNE_EXECUTION_ID } : { limit: 5, offset: 0 };

const result = await fetchJson(`http://localhost:3000/v1/actions/${action}`, {
  method: "POST",
  headers: runtimeHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ input }),
});

console.log(JSON.stringify(result, null, 2));
