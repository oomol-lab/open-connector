// Browser Use V4 API: https://docs.browser-use.com/openapi/v4.json
// Read-only: list existing browsers through a previously configured connection.

import { fetchJson, runtimeHeaders } from "./client.ts";

interface BrowserListEnvelope {
  data: {
    data: {
      items: { id: string; status: string }[];
      totalItems: number;
      pageNumber: number;
      pageSize: number;
    };
  };
}

const connectionName = process.env.BROWSER_USE_CONNECTION_NAME;
if (!process.env.OOMOL_CONNECT_RUNTIME_TOKEN || !connectionName) {
  console.log("Set OOMOL_CONNECT_RUNTIME_TOKEN and BROWSER_USE_CONNECTION_NAME (or default) to run this example.");
  process.exit(0);
}

const result = await fetchJson<BrowserListEnvelope>("http://localhost:3000/v1/proxy/browser_use", {
  method: "POST",
  headers: runtimeHeaders({ "content-type": "application/json", "x-oo-connector-alias": connectionName }),
  body: JSON.stringify({
    endpoint: "/api/v4/browsers",
    method: "GET",
    query: { pageSize: 10, pageNumber: 1 },
  }),
});

// OpenConnector's envelope wraps the provider response in data.data.
const page = result.data.data;
console.log(
  JSON.stringify(
    {
      items: page.items.map(({ id, status }) => ({ id, status })),
      totalItems: page.totalItems,
      pageNumber: page.pageNumber,
      pageSize: page.pageSize,
    },
    null,
    2,
  ),
);
