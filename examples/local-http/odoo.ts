// Start the local runtime before running: node examples/local-http/odoo.ts
// Uses Odoo's legacy JSON-RPC API (Odoo 14–19), not the JSON-2 API.

import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

const baseUrl = process.env.ODOO_BASE_URL;
const database = process.env.ODOO_DATABASE;
const username = process.env.ODOO_USERNAME;
const password = process.env.ODOO_PASSWORD;
if (!baseUrl || !database || !username || !password) {
  console.log(
    "Skip Odoo example: set ODOO_BASE_URL, ODOO_DATABASE, ODOO_USERNAME, and ODOO_PASSWORD (password or API key).",
  );
  process.exit(0);
}

await fetchJson("http://localhost:3000/api/connections/odoo", {
  method: "PUT",
  headers: adminHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ authType: "custom_credential", values: { baseUrl, database, username, password } }),
});

const result = await fetchJson("http://localhost:3000/v1/actions/odoo.search_read", {
  method: "POST",
  headers: runtimeHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({
    input: {
      model: "res.partner",
      domain: [["is_company", "=", true]],
      fields: ["id", "name"],
      limit: 5,
      order: "id asc",
    },
  }),
});

console.log(JSON.stringify(result, null, 2));
