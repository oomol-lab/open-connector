// Tailscale API docs: https://tailscale.com/api

import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

const clientId = process.env.TAILSCALE_CLIENT_ID;
const clientSecret = process.env.TAILSCALE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.log("Set TAILSCALE_CLIENT_ID and TAILSCALE_CLIENT_SECRET to run this example.");
  process.exit(0);
}

await fetchJson("http://localhost:3000/api/connections/tailscale", {
  method: "PUT",
  headers: adminHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({
    authType: "oauth2",
    values: { clientId, clientSecret },
  }),
});

const result = await fetchJson("http://localhost:3000/v1/actions/tailscale.list_devices", {
  method: "POST",
  headers: runtimeHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ input: {} }),
});

console.log(JSON.stringify(result, null, 2));
