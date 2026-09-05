// App Store Connect API docs: https://developer.apple.com/documentation/appstoreconnectapi
// Create a key under Users and Access > Integrations > App Store Connect API, or generate an
// Individual API Key from your user profile and leave APP_STORE_CONNECT_ISSUER_ID unset.

import { readFileSync } from "node:fs";
import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

interface ActionResult<T> {
  data: T;
}

const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
const privateKeyPath = process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH;

if (!keyId) {
  console.log("Set APP_STORE_CONNECT_KEY_ID to run this example.");
  process.exit(0);
}

const privateKey = privateKeyPath ? readFileSync(privateKeyPath, "utf8") : process.env.APP_STORE_CONNECT_PRIVATE_KEY;
if (!privateKey) {
  console.log("Set APP_STORE_CONNECT_PRIVATE_KEY or APP_STORE_CONNECT_PRIVATE_KEY_PATH to run this example.");
  process.exit(0);
}

await fetchJson("http://localhost:3000/api/connections/app_store_connect", {
  method: "PUT",
  headers: adminHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ authType: "custom_credential", values: { keyId, issuerId, privateKey } }),
});

const apps = await fetchJson<ActionResult<{ apps: Array<{ id: string; name: string | null }> }>>(
  "http://localhost:3000/v1/actions/app_store_connect.list_apps",
  {
    method: "POST",
    headers: runtimeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ input: { limit: 5 } }),
  },
);

console.log(JSON.stringify(apps, null, 2));

const firstApp = apps.data.apps[0];
if (!firstApp) {
  console.log("The key can see no apps, so there are no builds to list.");
  process.exit(0);
}

console.log(`Listing builds for ${firstApp.name ?? firstApp.id}:`);
const builds = await fetchJson("http://localhost:3000/v1/actions/app_store_connect.list_builds", {
  method: "POST",
  headers: runtimeHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ input: { appId: firstApp.id, limit: 5, sort: "-uploadedDate" } }),
});

console.log(JSON.stringify(builds, null, 2));
