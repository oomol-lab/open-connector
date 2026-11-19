import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
import { cloudflareTokenAuthTypes } from "../authorization.ts";

const service = "cloudflare";
const accountId = s.string("The account ID. Defaults to the connection account, or the only accessible account.");
const projectName = s.nonEmptyString("The Pages project name.");
const deploymentId = s.nonEmptyString("The Pages deployment ID.");
const record = s.looseObject("The Cloudflare resource, including additional upstream fields.");
const page = s.integer("The result page number.", { minimum: 1 });
const perPage = s.integer("The number of results per page.", { minimum: 1 });
const domainName = s.nonEmptyString("The custom domain hostname.");
const queryFields = { page, perPage };

const listOutput = {
  items: s.array("The returned resources.", record),
  resultInfo: s.looseObject("Upstream pagination metadata, including cursors."),
};

const resultOutput = { result: record };

const deploymentOutput = {
  accountId: s.string("The deployment account ID."),
  projectName,
  deploymentId,
  state: s.string("The latest deployment stage status."),
  url: s.string("The deployment URL."),
  deployment: record,
};

export const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "list_pages_projects",
    description: "List Cloudflare Pages projects.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["Pages Read"],
    inputSchema: s.object(
      "The action parameters.",
      { accountId, ...queryFields },
      { optional: ["accountId", "page", "perPage"] },
    ),
    outputSchema: s.requiredObject("The action result.", listOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "create_pages_project",
    description:
      "Create a Pages project. Omit source for Direct Upload; use official project configuration fields for Git integration and Functions bindings.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["Pages Write"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        projectName,
        productionBranch: s.nonEmptyString("The production branch. Defaults to main."),
        configuration: s.looseObject(
          "Additional official Pages project fields, such as source, build_config, and deployment_configs. Name and production branch use the dedicated inputs.",
        ),
      },
      { optional: ["accountId", "productionBranch", "configuration"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "get_pages_project",
    description: "Read a Pages project and its deployment configuration.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["Pages Read"],
    inputSchema: s.object("The action parameters.", { accountId, projectName }, { optional: ["accountId"] }),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "update_pages_project",
    description:
      "Update Pages project configuration using official API fields, including deployment_configs for environment variables and bindings.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["Pages Write"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        projectName,
        configuration: s.looseObject(
          "Official Pages project update fields. Environment variables belong under deployment_configs.production.env_vars or deployment_configs.preview.env_vars.",
        ),
      },
      { optional: ["accountId"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "delete_pages_project",
    description: "Delete a Pages project.",
    operationType: "destructive",
    requiredScopes: [],
    providerPermissions: ["Pages Write"],
    inputSchema: s.object("The action parameters.", { accountId, projectName }, { optional: ["accountId"] }),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "list_pages_deployments",
    description: "List deployments for a Pages project.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["Pages Read"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        projectName,
        ...queryFields,
        environment: s.stringEnum(["production", "preview"], { description: "Filter deployments by environment." }),
      },
      { optional: ["accountId", "page", "perPage", "environment"] },
    ),
    outputSchema: s.requiredObject("The action result.", listOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "list_pages_domains",
    description: "List custom domains attached to a Pages project.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["Pages Read"],
    inputSchema: s.object(
      "The action parameters.",
      { accountId, projectName, ...queryFields },
      { optional: ["accountId", "page", "perPage"] },
    ),
    outputSchema: s.requiredObject("The action result.", listOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "create_pages_domain",
    description:
      "Attach a custom domain to a Pages project. Inspect its validation status and configure the required DNS records separately.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["Pages Write"],
    inputSchema: s.object(
      "The action parameters.",
      { accountId, projectName, domainName },
      { optional: ["accountId"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "get_pages_domain",
    description: "Read Pages custom domain validation and certificate status.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["Pages Read"],
    inputSchema: s.object(
      "The action parameters.",
      { accountId, projectName, domainName },
      { optional: ["accountId"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "delete_pages_domain",
    description: "Detach a Pages custom domain.",
    operationType: "destructive",
    requiredScopes: [],
    providerPermissions: ["Pages Write"],
    inputSchema: s.object(
      "The action parameters.",
      { accountId, projectName, domainName },
      { optional: ["accountId"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "delete_pages_deployment",
    description: "Delete a Pages deployment.",
    operationType: "destructive",
    requiredScopes: [],
    providerPermissions: ["Pages Write"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        projectName,
        deploymentId,
        force: s.boolean("Whether to force deletion of an aliased deployment."),
      },
      { optional: ["accountId", "force"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "rollback_pages_deployment",
    description: "Roll back a Pages project to a previous production deployment.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["Pages Write"],
    inputSchema: s.object(
      "The action parameters.",
      { accountId, projectName, deploymentId },
      { optional: ["accountId"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "deploy_pages_site",
    description:
      "Deploy a prebuilt Pages site from a public ZIP URL. The archive root is the site root. Uploads assets in batches and submits the deployment; use get_pages_deployment to wait for completion. Connector limits: 512 MiB compressed and expanded, 20,000 files, 25 MiB per file. Include compiled _worker.js or _worker.bundle for Pages Functions.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["Pages Write"],
    asyncLifecycle: {
      startActionId: "cloudflare.deploy_pages_site",
      statusActionId: "cloudflare.get_pages_deployment",
    },
    inputSchema: s.object(
      "The Pages deployment parameters.",
      {
        accountId,
        projectName,
        archiveUrl: s.url("The public URL of the prebuilt ZIP archive."),
        branch: s.string("The target branch. Defaults to the project's production branch."),
        commitHash: s.string("The associated commit hash."),
        commitMessage: s.string("The deployment commit message."),
        commitDirty: s.boolean("Whether the source has uncommitted changes."),
      },
      { optional: ["accountId", "branch", "commitHash", "commitMessage", "commitDirty"] },
    ),
    outputSchema: s.requiredObject("The submitted deployment.", deploymentOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "get_pages_deployment",
    description: "Get a Pages deployment and its current processing status.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["Pages Read"],
    asyncLifecycle: {
      startActionId: "cloudflare.deploy_pages_site",
      statusActionId: "cloudflare.get_pages_deployment",
    },
    inputSchema: s.object(
      "The deployment identifiers.",
      { accountId, projectName, deploymentId },
      { optional: ["accountId"] },
    ),
    outputSchema: s.requiredObject("The deployment status.", deploymentOutput),
  }),
];
