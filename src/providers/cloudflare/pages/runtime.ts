import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareContext } from "../shared/context.ts";

import { optionalRecord, optionalString, optionalBoolean } from "../../../core/cast.ts";
import { withCloudflareClient } from "../shared/action-client.ts";
import { projectPath, normalizeDeployment } from "./deployment.ts";
import { deployPagesSite } from "./upload.ts";

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = {
  list_pages_projects: withCloudflareClient((client) =>
    client.list({
      path: `${client.accountPath()}/pages/projects`,
      query: client.paginationQuery(),
    }),
  ),
  create_pages_project: withCloudflareClient((client) =>
    client.resource({
      path: `${client.accountPath()}/pages/projects`,
      method: "POST",
      body: {
        ...optionalRecord(client.input.configuration),
        name: client.input.projectName,
        production_branch: client.input.productionBranch ?? "main",
      },
    }),
  ),
  get_pages_project: withCloudflareClient((client) => client.resource({ path: projectPath(client) })),
  update_pages_project: withCloudflareClient((client) =>
    client.resource({
      path: projectPath(client),
      method: "PATCH",
      body: optionalRecord(client.input.configuration),
    }),
  ),
  delete_pages_project: withCloudflareClient((client) =>
    client.resource({ path: projectPath(client), method: "DELETE" }),
  ),
  list_pages_deployments: withCloudflareClient((client) =>
    client.list({
      path: `${projectPath(client)}/deployments`,
      query: { ...client.paginationQuery(), env: optionalString(client.input.environment) },
    }),
  ),
  get_pages_deployment: withCloudflareClient(async (client) => {
    const envelope = await client.request({
      path: `${projectPath(client)}/deployments/${client.id("deploymentId")}`,
    });
    return normalizeDeployment(envelope.result, client.input);
  }),
  delete_pages_deployment: withCloudflareClient((client) =>
    client.resource({
      path: `${projectPath(client)}/deployments/${client.id("deploymentId")}`,
      method: "DELETE",
      query: { force: optionalBoolean(client.input.force) },
    }),
  ),
  rollback_pages_deployment: withCloudflareClient((client) =>
    client.resource({
      path: `${projectPath(client)}/deployments/${client.id("deploymentId")}/rollback`,
      method: "POST",
    }),
  ),
  list_pages_domains: withCloudflareClient((client) =>
    client.list({ path: `${projectPath(client)}/domains`, query: client.paginationQuery() }),
  ),
  create_pages_domain: withCloudflareClient((client) =>
    client.resource({
      path: `${projectPath(client)}/domains`,
      method: "POST",
      body: { name: client.input.domainName },
    }),
  ),
  get_pages_domain: withCloudflareClient((client) =>
    client.resource({ path: `${projectPath(client)}/domains/${client.id("domainName")}` }),
  ),
  delete_pages_domain: withCloudflareClient((client) =>
    client.resource({
      path: `${projectPath(client)}/domains/${client.id("domainName")}`,
      method: "DELETE",
    }),
  ),
  deploy_pages_site: withCloudflareClient(deployPagesSite, 600_000),
};
