import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

const baseUrl = process.env.DORIS_BASE_URL;
const username = process.env.DORIS_USERNAME;
const password = process.env.DORIS_PASSWORD;
const defaultDatabase = process.env.DORIS_DATABASE;
if (!baseUrl || !username || password === undefined) {
  console.log(
    "Skipping Doris example: set DORIS_BASE_URL, DORIS_USERNAME, and DORIS_PASSWORD. Optionally set DORIS_DATABASE and DORIS_TABLE.",
  );
  process.exit(0);
}

await fetchJson("http://localhost:3000/api/connections/doris", {
  method: "PUT",
  headers: adminHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ authType: "custom_credential", values: { baseUrl, username, password, defaultDatabase } }),
});

const actions = [
  { name: "execute_query", input: { query: "SELECT 1 AS ok", maxRows: 10 } },
  { name: "list_databases", input: { maxRows: 100 } },
];
for (const action of actions) {
  const result = await fetchJson(`http://localhost:3000/v1/actions/doris.${action.name}`, {
    method: "POST",
    headers: runtimeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ input: action.input }),
  });
  console.log(action.name, JSON.stringify(result, null, 2));
}

if (defaultDatabase) {
  console.log(
    "list_tables",
    JSON.stringify(
      await fetchJson("http://localhost:3000/v1/actions/doris.list_tables", {
        method: "POST",
        headers: runtimeHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ input: { maxRows: 100 } }),
      }),
      null,
      2,
    ),
  );
  if (process.env.DORIS_TABLE) {
    console.log(
      "get_table_schema",
      JSON.stringify(
        await fetchJson("http://localhost:3000/v1/actions/doris.get_table_schema", {
          method: "POST",
          headers: runtimeHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ input: { table: process.env.DORIS_TABLE } }),
        }),
        null,
        2,
      ),
    );
  }
}
