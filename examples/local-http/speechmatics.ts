// Speechmatics Management API docs: https://docs.speechmatics.com/api-ref/management/management-api
// Speechmatics Discovery API docs: https://docs.speechmatics.com/speech-to-text/features/feature-discovery

import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

const managementToken = process.env.SPEECHMATICS_MANAGEMENT_TOKEN;
if (!managementToken) {
  console.log("Set SPEECHMATICS_MANAGEMENT_TOKEN to run this example.");
  process.exit(0);
}

await fetchJson("http://localhost:3000/api/connections/speechmatics", {
  method: "PUT",
  headers: adminHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ authType: "api_key", values: { apiKey: managementToken } }),
});

const projects = await executeSpeechmaticsAction("list_projects", {});
const services = await executeSpeechmaticsAction("get_service_capabilities", { region: "eu1" });
const deployments = await executeSpeechmaticsAction("list_deployments", {});

console.log(JSON.stringify({ projects, services, deployments }, null, 2));

function executeSpeechmaticsAction(actionName: string, input: Record<string, unknown>): Promise<unknown> {
  return fetchJson(`http://localhost:3000/v1/actions/speechmatics.${actionName}`, {
    method: "POST",
    headers: runtimeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ input }),
  });
}
