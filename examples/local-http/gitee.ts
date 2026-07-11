// Gitee OAuth docs: https://gitee.com/api/v5/oauth_doc
// Gitee API V5 docs: https://gitee.com/api/v5/swagger
// OAuth redirect URI for this local runtime: http://localhost:3000/oauth/callback

import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

const runtimeOrigin = "http://localhost:3000";
const token = process.env.GITEE_TOKEN;
const clientId = process.env.GITEE_CLIENT_ID;
const clientSecret = process.env.GITEE_CLIENT_SECRET;

if (token) {
  await fetchJson(`${runtimeOrigin}/api/connections/gitee`, {
    method: "PUT",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ authType: "api_key", values: { apiKey: token } }),
  });

  const currentUser = await runGiteeAction("get_current_user", {});
  const repositories = await runGiteeAction("list_my_repositories", { perPage: 10 });
  console.log(JSON.stringify({ currentUser, repositories }, null, 2));

  const repository = process.env.GITEE_REPOSITORY;
  const separator = repository?.indexOf("/") ?? -1;
  if (repository && separator > 0 && separator < repository.length - 1) {
    const details = await runGiteeAction("get_repository", {
      owner: repository.slice(0, separator),
      repo: repository.slice(separator + 1),
    });
    console.log(JSON.stringify(details, null, 2));
  }
} else if (clientId && clientSecret) {
  await fetchJson(`${runtimeOrigin}/api/oauth/configs/gitee`, {
    method: "PUT",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ clientId, clientSecret }),
  });

  const started = await fetchJson<{ authorizationUrl?: string }>(`${runtimeOrigin}/api/oauth/authorizations`, {
    method: "POST",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ service: "gitee" }),
  });

  console.log("Open this URL in a browser, finish consent, then call Gitee actions:");
  console.log(started.authorizationUrl);
} else {
  console.log("Set GITEE_TOKEN or GITEE_CLIENT_ID and GITEE_CLIENT_SECRET to run this example.");
}

function runGiteeAction(action: string, input: Record<string, unknown>): Promise<unknown> {
  return fetchJson(`${runtimeOrigin}/v1/actions/gitee.${action}`, {
    method: "POST",
    headers: runtimeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ input }),
  });
}
