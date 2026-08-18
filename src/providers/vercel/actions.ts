import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vercel";

export type VercelActionName =
  | "get_auth_user"
  | "list_teams"
  | "get_team"
  | "list_projects"
  | "get_project"
  | "create_project"
  | "update_project"
  | "list_deployments"
  | "get_deployment"
  | "get_deployment_events"
  | "get_runtime_logs"
  | "list_project_envs"
  | "create_project_env"
  | "update_project_env"
  | "delete_project_env"
  | "list_project_domains"
  | "get_project_domain"
  | "add_project_domain"
  | "verify_project_domain"
  | "get_domain_config"
  | "list_webhooks"
  | "get_webhook"
  | "create_webhook"
  | "delete_webhook";

interface VercelActionSource {
  name: VercelActionName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const looseObject = s.unknownObject("Raw object payload returned by Vercel.");
const pageSize = s.integer({ minimum: 1, maximum: 100, description: "Maximum number of results to return." });
const since = s.integer({ description: "Pagination cursor for results created after this timestamp." });
const until = s.integer({ description: "Pagination cursor for results created before this timestamp." });
const projectIdOrName = s.string({ minLength: 1, description: "Vercel project ID or project name." });
const deploymentIdOrUrl = s.string({ minLength: 1, description: "Vercel deployment ID or deployment URL." });
const gitBranch = s.string({ minLength: 1, description: "Git branch name." });
const customEnvironmentId = s.string({ minLength: 1, description: "Vercel custom environment ID." });
const pagination = s.looseObject(
  {
    count: s.number({ description: "Number of items returned in this page." }),
    next: s.nullable(
      s.number({ description: "Pagination cursor for the next page, or null when there is no next page." }),
    ),
    prev: s.nullable(
      s.number({ description: "Pagination cursor for the previous page, or null when there is no previous page." }),
    ),
  },
  { description: "Vercel pagination information." },
);

const team = s.looseObject(
  {
    id: s.string({ description: "Vercel team ID." }),
    slug: s.string({ description: "Vercel team slug." }),
    name: s.string({ description: "Vercel team display name." }),
    createdAt: s.number({ description: "Team creation timestamp in milliseconds." }),
    updatedAt: s.number({ description: "Last team update timestamp in milliseconds." }),
  },
  { description: "Vercel team." },
);

const user = s.object(
  {
    id: s.string({ description: "Vercel user ID." }),
    username: s.string({ description: "Vercel username." }),
    email: s.string({ description: "Vercel account email address." }),
    name: s.string({ description: "Vercel display name." }),
  },
  { description: "Vercel user." },
);

const deployment = s.looseObject(
  {
    id: s.string({ description: "Vercel deployment ID." }),
    name: s.string({ description: "Deployment name." }),
    url: s.string({ description: "Deployment URL." }),
    state: s.string({ description: "Deployment state reported by Vercel." }),
    readyState: s.string({ description: "Deployment readiness state reported by Vercel." }),
    target: s.string({ description: "Deployment target such as production or preview." }),
    createdAt: s.number({ description: "Deployment creation timestamp in milliseconds." }),
    ready: s.number({ description: "Deployment ready timestamp in milliseconds." }),
    projectId: s.string({ description: "Vercel project ID for the deployment." }),
    creator: looseObject,
    meta: looseObject,
    alias: s.array(s.string(), { description: "Aliases currently assigned to the deployment." }),
  },
  { description: "Vercel deployment summary." },
);

const project = s.object(
  {
    id: s.string({ description: "Vercel project ID." }),
    name: s.string({ description: "Vercel project name." }),
    accountId: s.string({ description: "Owning account ID for the project." }),
    framework: s.string({ description: "Detected framework for the project." }),
    nodeVersion: s.string({ description: "Configured Node.js version for the project." }),
    createdAt: s.number({ description: "Project creation timestamp in milliseconds." }),
    updatedAt: s.number({ description: "Last project update timestamp in milliseconds." }),
    link: looseObject,
    latestDeployments: s.array(deployment, { description: "Most recent deployments attached to the project." }),
  },
  { required: ["id", "name"], description: "Vercel project." },
);

const deploymentEvent = s.object(
  {
    created: s.number({ description: "Deployment event timestamp in milliseconds." }),
    type: s.string({ description: "Deployment event type." }),
    payload: looseObject,
  },
  { required: ["created", "type", "payload"], description: "Vercel deployment event." },
);

const runtimeLog = s.object(
  {
    timestampInMs: s.number({ description: "Runtime log timestamp in milliseconds." }),
    level: s.string({ description: "Runtime log level." }),
    message: s.string({ description: "Runtime log message." }),
    source: s.string({ description: "Runtime log source." }),
    requestMethod: s.string({ description: "HTTP method for the runtime log entry, when present." }),
    requestPath: s.string({ description: "HTTP request path for the runtime log entry, when present." }),
    responseStatusCode: s.number({ description: "HTTP response status code for the runtime log entry, when present." }),
  },
  { required: ["timestampInMs", "level", "message", "source"], description: "Vercel runtime log entry." },
);

const env = s.object(
  {
    id: s.string({ description: "Vercel environment variable ID." }),
    key: s.string({ description: "Environment variable name." }),
    type: s.string({ description: "Environment variable type." }),
    target: s.array(s.string(), { description: "Deployment targets that receive this environment variable." }),
    gitBranch: s.string({ description: "Git branch name scoped to this environment variable, when present." }),
    createdAt: s.number({ description: "Environment variable creation timestamp in milliseconds." }),
    updatedAt: s.number({ description: "Last environment variable update timestamp in milliseconds." }),
    comment: s.string({ description: "Comment attached to the environment variable, when present." }),
  },
  { required: ["id", "key", "type"], description: "Vercel environment variable." },
);

const domain = s.object(
  {
    name: s.string({ description: "Domain name." }),
    apexName: s.string({ description: "Apex domain name." }),
    verified: s.boolean({ description: "Whether the domain is verified in Vercel." }),
    verification: s.array(looseObject, { description: "Raw domain verification records returned by Vercel." }),
    redirect: s.nullable(
      s.string({ description: "Redirect target configured for the domain, or null when no redirect is set." }),
    ),
    gitBranch: s.string({ description: "Git branch associated with the domain, when present." }),
    customEnvironmentId: s.string({ description: "Custom environment ID associated with the domain, when present." }),
  },
  { required: ["name"], description: "Vercel project domain." },
);

const domainConfig = s.object(
  {
    configuredBy: s.string({ description: "Party that configured the domain." }),
    acceptedChallenges: s.array(s.string(), { description: "Domain verification challenge types accepted by Vercel." }),
    misconfigured: s.boolean({ description: "Whether Vercel considers the domain misconfigured." }),
    recommendedNameServers: s.array(s.string(), { description: "Name servers recommended by Vercel for the domain." }),
  },
  { description: "Vercel domain configuration." },
);

const webhook = s.object(
  {
    id: s.string({ description: "Vercel webhook ID." }),
    url: s.string({ description: "Webhook destination URL." }),
    events: s.array(s.string(), { description: "Webhook events configured on the webhook." }),
    projectIds: s.array(s.string(), {
      description: "Project IDs associated with the webhook, when scoped to specific projects.",
    }),
    teamId: s.string({ description: "Vercel team ID that owns the webhook, when present." }),
    createdAt: s.number({ description: "Webhook creation timestamp in milliseconds." }),
    updatedAt: s.number({ description: "Last webhook update timestamp in milliseconds." }),
  },
  { required: ["id", "url"], description: "Vercel webhook." },
);

const projectMutationFields = {
  framework: s.nonEmptyString("Framework to set on the project."),
  rootDirectory: s.nonEmptyString("Root directory for the project."),
  nodeVersion: s.nonEmptyString("Node.js version to use for the project."),
  buildCommand: s.nonEmptyString("Build command for the project."),
  devCommand: s.nonEmptyString("Development command for the project."),
  installCommand: s.nonEmptyString("Install command for the project."),
  outputDirectory: s.nonEmptyString("Output directory for the project build."),
  directoryListing: s.boolean({ description: "Whether directory listing is enabled for the project." }),
  publicSource: s.boolean({ description: "Whether the project source is public." }),
  gitForkProtection: s.boolean({ description: "Whether Git fork protection is enabled for the project." }),
};

const envWriteFields = {
  key: s.nonEmptyString("Environment variable name."),
  value: s.nonEmptyString("Environment variable value."),
  type: s.stringEnum(["plain", "secret", "system", "encrypted", "sensitive"], {
    description: "Environment variable type.",
  }),
  target: s.array(s.stringEnum(["production", "preview", "development"]), {
    minItems: 1,
    description: "Deployment targets that should receive this environment variable.",
  }),
  gitBranch: gitBranch,
  comment: s.nonEmptyString("Optional comment for the environment variable."),
  customEnvironmentIds: s.stringArray("Custom environment IDs that should receive this environment variable."),
};

const teamScopeFields = {
  teamId: s.nonEmptyString("The Team identifier to perform the request on behalf of."),
  slug: s.nonEmptyString("The Team slug to perform the request on behalf of."),
};

const unscopedInput = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema =>
  s.actionInput(properties, required, "Vercel action input.");

const emptyInput = unscopedInput({});
const input = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema =>
  unscopedInput({ ...teamScopeFields, ...properties }, required);

const actionSources: readonly VercelActionSource[] = [
  {
    name: "get_auth_user",
    description: "Get the authenticated Vercel user.",
    inputSchema: emptyInput,
    outputSchema: s.object({ user }, { required: ["user"] }),
  },
  {
    name: "list_teams",
    description: "List Vercel teams available to the authenticated user.",
    inputSchema: unscopedInput({ limit: pageSize, since }),
    outputSchema: s.object({
      teams: s.array(team, { description: "Vercel teams available to the authenticated user." }),
      pagination: pagination,
    }),
  },
  {
    name: "get_team",
    description: "Get a Vercel team by id or slug.",
    inputSchema: unscopedInput({ teamId: s.nonEmptyString("Vercel team ID or team slug.") }, ["teamId"]),
    outputSchema: s.object({ team }, { required: ["team"] }),
  },
  {
    name: "list_projects",
    description: "List Vercel projects.",
    inputSchema: input({ limit: pageSize, since, until, repoUrl: s.url("Repository URL used to filter projects.") }),
    outputSchema: s.object({
      projects: s.array(project, { description: "Vercel projects." }),
      pagination,
    }),
  },
  {
    name: "get_project",
    description: "Get a Vercel project.",
    inputSchema: input({ idOrName: projectIdOrName }, ["idOrName"]),
    outputSchema: s.object({ project }, { required: ["project"] }),
  },
  {
    name: "create_project",
    description: "Create a Vercel project.",
    inputSchema: input({ name: s.nonEmptyString("Vercel project name."), ...projectMutationFields }, ["name"]),
    outputSchema: s.object({ project }, { required: ["project"] }),
  },
  {
    name: "update_project",
    description: "Update a Vercel project.",
    inputSchema: input(
      { idOrName: projectIdOrName, name: s.nonEmptyString("Vercel project name."), ...projectMutationFields },
      ["idOrName"],
    ),
    outputSchema: s.object({ project }, { required: ["project"] }),
  },
  {
    name: "list_deployments",
    description: "List Vercel deployments.",
    inputSchema: input({
      projectId: s.nonEmptyString("Vercel project ID."),
      limit: pageSize,
      since,
      until,
      target: s.nonEmptyString("Deployment target such as production or preview."),
      state: s.nonEmptyString("Deployment state to filter by."),
    }),
    outputSchema: s.object({
      deployments: s.array(deployment, { description: "Vercel deployments." }),
      pagination,
    }),
  },
  {
    name: "get_deployment",
    description: "Get a Vercel deployment.",
    inputSchema: input(
      {
        idOrUrl: deploymentIdOrUrl,
        withGitRepoInfo: s.boolean({
          description: "When true, include Git repository metadata in the deployment response.",
        }),
      },
      ["idOrUrl"],
    ),
    outputSchema: s.object({ deployment }, { required: ["deployment"] }),
  },
  {
    name: "get_deployment_events",
    description: "Get Vercel deployment events.",
    inputSchema: input(
      {
        idOrUrl: deploymentIdOrUrl,
        limit: pageSize,
        since,
        until,
        direction: s.stringEnum(["forward", "backward"], {
          description: "Order in which to return deployment events.",
        }),
        builds: s.boolean({ description: "When true, include build events in the response." }),
      },
      ["idOrUrl"],
    ),
    outputSchema: s.object({
      events: s.array(deploymentEvent, { description: "Deployment events returned by Vercel." }),
    }),
  },
  {
    name: "get_runtime_logs",
    description: "Get runtime logs for a Vercel deployment.",
    inputSchema: input(
      {
        projectId: s.nonEmptyString("Vercel project ID."),
        deploymentId: s.nonEmptyString("Vercel deployment ID."),
      },
      ["projectId", "deploymentId"],
    ),
    outputSchema: s.object({ logs: s.array(runtimeLog, { description: "Runtime log entries returned by Vercel." }) }),
  },
  {
    name: "list_project_envs",
    description: "List environment variables for a Vercel project.",
    inputSchema: input({ idOrName: projectIdOrName, gitBranch, customEnvironmentId }, ["idOrName"]),
    outputSchema: s.object({ envs: s.array(env, { description: "Environment variables configured on the project." }) }),
  },
  {
    name: "create_project_env",
    description: "Create a Vercel project environment variable.",
    inputSchema: input({ idOrName: projectIdOrName, ...envWriteFields }, [
      "idOrName",
      "key",
      "value",
      "type",
      "target",
    ]),
    outputSchema: s.object({
      envs: s.array(env, { description: "Environment variables returned by Vercel after creation." }),
    }),
  },
  {
    name: "update_project_env",
    description: "Update a Vercel project environment variable.",
    inputSchema: input(
      { idOrName: projectIdOrName, id: s.nonEmptyString("Vercel environment variable ID."), ...envWriteFields },
      ["idOrName", "id", "key", "value", "type", "target"],
    ),
    outputSchema: s.object({ env }, { required: ["env"] }),
  },
  {
    name: "delete_project_env",
    description: "Delete a Vercel project environment variable.",
    inputSchema: input({ idOrName: projectIdOrName, id: s.nonEmptyString("Vercel environment variable ID.") }, [
      "idOrName",
      "id",
    ]),
    outputSchema: s.object({
      envs: s.array(env, { description: "Environment variables returned by Vercel after deletion." }),
    }),
  },
  {
    name: "list_project_domains",
    description: "List domains for a Vercel project.",
    inputSchema: input({ idOrName: projectIdOrName, limit: pageSize, since, until, gitBranch, customEnvironmentId }, [
      "idOrName",
    ]),
    outputSchema: s.object({
      domains: s.array(domain, { description: "Domains attached to the project." }),
      pagination,
    }),
  },
  {
    name: "get_project_domain",
    description: "Get a Vercel project domain.",
    inputSchema: input({ idOrName: projectIdOrName, domain: s.nonEmptyString("Domain name.") }, ["idOrName", "domain"]),
    outputSchema: s.object({ domain }, { required: ["domain"] }),
  },
  {
    name: "add_project_domain",
    description: "Add a domain to a Vercel project.",
    inputSchema: input(
      {
        idOrName: projectIdOrName,
        name: s.nonEmptyString("Domain name to add to the project."),
        redirect: s.nonEmptyString("Redirect target for the domain."),
        gitBranch,
        customEnvironmentId,
      },
      ["idOrName", "name"],
    ),
    outputSchema: s.object({ domain }, { required: ["domain"] }),
  },
  {
    name: "verify_project_domain",
    description: "Verify a Vercel project domain.",
    inputSchema: input({ idOrName: projectIdOrName, domain: s.nonEmptyString("Domain name.") }, ["idOrName", "domain"]),
    outputSchema: s.object({ domain }, { required: ["domain"] }),
  },
  {
    name: "get_domain_config",
    description: "Get domain configuration guidance from Vercel.",
    inputSchema: input({ domain: s.nonEmptyString("Domain name.") }, ["domain"]),
    outputSchema: domainConfig,
  },
  {
    name: "list_webhooks",
    description: "List Vercel webhooks.",
    inputSchema: input({}),
    outputSchema: s.object({ webhooks: s.array(webhook, { description: "Vercel webhooks." }) }),
  },
  {
    name: "get_webhook",
    description: "Get a Vercel webhook.",
    inputSchema: input({ id: s.nonEmptyString("Vercel webhook ID.") }, ["id"]),
    outputSchema: s.object({ webhook }, { required: ["webhook"] }),
  },
  {
    name: "create_webhook",
    description: "Create a Vercel webhook.",
    inputSchema: input(
      {
        url: s.url("Webhook destination URL."),
        events: s.stringArray("Webhook events that should trigger notifications.", { minItems: 1 }),
        projectIds: s.stringArray(
          "Project IDs that should trigger the webhook. Omit to receive events for all projects.",
        ),
      },
      ["url", "events"],
    ),
    outputSchema: s.object({ webhook }, { required: ["webhook"] }),
  },
  {
    name: "delete_webhook",
    description:
      "Delete a Vercel webhook. The returned acknowledgement is generated locally because Vercel responds with 204 No Content.",
    inputSchema: input({ id: s.nonEmptyString("Vercel webhook ID.") }, ["id"]),
    outputSchema: s.object(
      {
        deleted: s.boolean({
          description: "Whether Vercel accepted the deletion request. True when the API returns 204 No Content.",
        }),
      },
      { required: ["deleted"], description: "A normalized Vercel webhook deletion response." },
    ),
  },
];

export const vercelActions: ActionDefinition[] = actionSources.map((action) =>
  defineProviderAction(service, {
    ...action,
    requiredScopes: [],
    providerPermissions: [],
  }),
);
