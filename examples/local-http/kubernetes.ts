import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

const baseUrl = process.env.KUBERNETES_BASE_URL;
const token = process.env.KUBERNETES_TOKEN;
const certificateAuthorityData = process.env.KUBERNETES_CA_DATA;
if (!baseUrl || !token) {
  console.log(
    "Skipping Kubernetes example: set KUBERNETES_BASE_URL and KUBERNETES_TOKEN. Set KUBERNETES_CA_DATA when the API server uses a private certificate authority.",
  );
  process.exit(0);
}

await fetchJson("http://localhost:3000/api/connections/kubernetes", {
  method: "PUT",
  headers: adminHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ authType: "api_key", values: { apiKey: token, baseUrl, certificateAuthorityData } }),
});

const actions = [
  { name: "list_namespaces", input: { limit: 10 } },
  { name: "list_pods", input: { limit: 10 } },
  { name: "list_events", input: { limit: 10, fieldSelector: "type=Warning" } },
];
for (const action of actions) {
  const result = await fetchJson(`http://localhost:3000/v1/actions/kubernetes.${action.name}`, {
    method: "POST",
    headers: runtimeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ input: action.input }),
  });
  console.log(action.name, JSON.stringify(result, null, 2));
}
