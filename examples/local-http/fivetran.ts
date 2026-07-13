// Fivetran REST API docs: https://fivetran.com/docs/rest-api/getting-started
// Fivetran OpenAPI definition: https://fivetran.com/docs/rest-api/api-reference/open-api-definition

import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

const apiKey = process.env.FIVETRAN_API_KEY;
const apiSecret = process.env.FIVETRAN_API_SECRET;
if (!apiKey || !apiSecret) {
  console.log("Set FIVETRAN_API_KEY and FIVETRAN_API_SECRET to run this example.");
  process.exit(0);
}

await fetchJson("http://localhost:3000/api/connections/fivetran", {
  method: "PUT",
  headers: adminHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({
    authType: "custom_credential",
    values: { apiKey, apiSecret },
  }),
});

const actionNames = ["list_transformation_projects", "list_log_services", "list_hybrid_deployment_agents"] as const;

const results = await Promise.all(
  actionNames.map(async (actionName) => [
    actionName,
    await fetchJson(`http://localhost:3000/v1/actions/fivetran.${actionName}`, {
      method: "POST",
      headers: runtimeHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ input: { limit: 5 } }),
    }),
  ]),
);

console.log(JSON.stringify(Object.fromEntries(results), null, 2));
