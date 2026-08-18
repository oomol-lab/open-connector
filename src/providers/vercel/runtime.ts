import type { VercelActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject, queryFlag, queryParams } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const vercelApiBaseUrl = "https://api.vercel.com";

interface VercelUser {
  id: string;
  username?: string;
  email?: string;
  name?: string;
}

interface VercelTeam {
  id: string;
  slug?: string;
  name?: string;
  createdAt?: number;
  updatedAt?: number;
}

type VercelActionHandler = (input: VercelActionInput, context: VercelActionContext) => Promise<unknown>;

export interface VercelActionContext {
  apiKey: string;
  fetcher: typeof fetch;
}

type VercelActionInput = Record<string, unknown>;

export const vercelActionHandlers: Record<VercelActionName, VercelActionHandler> = {
  get_auth_user(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetAuthUser(input, context);
  },
  list_teams(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListTeams(input, context);
  },
  get_team(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetTeam(input, context);
  },
  list_projects(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListProjects(input, context);
  },
  get_project(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetProject(input, context);
  },
  create_project(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelCreateProject(input, context);
  },
  update_project(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelUpdateProject(input, context);
  },
  list_deployments(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListDeployments(input, context);
  },
  get_deployment(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetDeployment(input, context);
  },
  get_deployment_events(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetDeploymentEvents(input, context);
  },
  get_runtime_logs(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetRuntimeLogs(input, context);
  },
  list_project_envs(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListProjectEnvs(input, context);
  },
  create_project_env(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelCreateProjectEnv(input, context);
  },
  update_project_env(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelUpdateProjectEnv(input, context);
  },
  delete_project_env(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelDeleteProjectEnv(input, context);
  },
  list_project_domains(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListProjectDomains(input, context);
  },
  get_project_domain(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetProjectDomain(input, context);
  },
  add_project_domain(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelAddProjectDomain(input, context);
  },
  verify_project_domain(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelVerifyProjectDomain(input, context);
  },
  get_domain_config(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetDomainConfig(input, context);
  },
  list_webhooks(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListWebhooks(input, context);
  },
  get_webhook(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetWebhook(input, context);
  },
  create_webhook(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelCreateWebhook(input, context);
  },
  delete_webhook(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelDeleteWebhook(input, context);
  },
};

export async function validateVercelCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  // TODO(vercel-team-id): restore default team validation when Team ID support returns.
  const user = await requestVercelJson<VercelUserResponse>({
    path: "/v2/user",
    apiKey,
    fetcher,
    mode: "validate",
  }).then((payload) => normalizeVercelUser(payload));

  return {
    profile: {
      accountId: user.id,
      displayName: userLabel(user),
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/v2/user",
      userId: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
    }),
  };
}

export async function executeVercelAction(
  actionName: VercelActionName,
  input: VercelActionInput,
  context: VercelActionContext,
): Promise<unknown> {
  const handler = vercelActionHandlers[actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `unknown vercel action: ${actionName}`);
  }

  return handler(input, context);
}

async function vercelGetAuthUser(_input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<VercelUserResponse>({
    path: "/v2/user",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
  });

  return {
    user: normalizeVercelUser(payload),
  };
}

async function vercelListTeams(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<{
    teams?: unknown[];
    pagination?: unknown;
  }>({
    path: "/v2/teams",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: queryParams({
      limit: optionalNumber(input.limit),
      since: optionalNumber(input.since),
    }),
  });

  return compactObject({
    teams: normalizeArray(payload.teams).map((team) => normalizeVercelTeam(team as VercelTeamResponse)),
    pagination: optionalRecord(payload.pagination),
  });
}

async function vercelGetTeam(input: VercelActionInput, context: VercelActionContext) {
  const teamId = requireString(input.teamId, "teamId");
  const payload = await requestVercelJson<VercelTeamResponse>({
    path: `/v2/teams/${encodeURIComponent(teamId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    team: normalizeVercelTeam(payload),
  };
}

async function vercelListProjects(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<{
    projects?: unknown[];
    pagination?: unknown;
  }>({
    path: "/v10/projects",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: queryParams({
      limit: optionalNumber(input.limit),
      since: optionalNumber(input.since),
      until: optionalNumber(input.until),
      repoUrl: optionalString(input.repoUrl),
    }),
  });

  return compactObject({
    projects: normalizeArray(payload.projects).map((project) => mapProject(project)),
    pagination: optionalRecord(payload.pagination),
  });
}

async function vercelGetProject(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    project: mapProject(payload),
  };
}

async function vercelCreateProject(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: "/v11/projects",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: jsonObject({
      name: optionalString(input.name),
      framework: optionalString(input.framework),
      rootDirectory: optionalString(input.rootDirectory),
      nodeVersion: optionalString(input.nodeVersion),
      buildCommand: optionalString(input.buildCommand),
      devCommand: optionalString(input.devCommand),
      installCommand: optionalString(input.installCommand),
      outputDirectory: optionalString(input.outputDirectory),
      directoryListing: optionalBoolean(input.directoryListing),
      publicSource: optionalBoolean(input.publicSource),
      gitForkProtection: optionalBoolean(input.gitForkProtection),
    }),
  });

  return {
    project: mapProject(payload),
  };
}

async function vercelUpdateProject(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "PATCH",
    body: jsonObject({
      name: optionalString(input.name),
      framework: optionalString(input.framework),
      rootDirectory: optionalString(input.rootDirectory),
      nodeVersion: optionalString(input.nodeVersion),
      buildCommand: optionalString(input.buildCommand),
      devCommand: optionalString(input.devCommand),
      installCommand: optionalString(input.installCommand),
      outputDirectory: optionalString(input.outputDirectory),
      directoryListing: optionalBoolean(input.directoryListing),
      publicSource: optionalBoolean(input.publicSource),
      gitForkProtection: optionalBoolean(input.gitForkProtection),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    project: mapProject(payload),
  };
}

async function vercelListDeployments(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<{
    deployments?: unknown[];
    pagination?: unknown;
  }>({
    path: "/v6/deployments",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: queryParams({
      limit: optionalNumber(input.limit),
      projectId: optionalString(input.projectId),
      since: optionalNumber(input.since),
      until: optionalNumber(input.until),
      target: optionalString(input.target),
      state: optionalString(input.state),
    }),
  });

  return compactObject({
    deployments: normalizeArray(payload.deployments).map((deployment) => mapDeployment(deployment)),
    pagination: optionalRecord(payload.pagination),
  });
}

async function vercelGetDeployment(input: VercelActionInput, context: VercelActionContext) {
  const idOrUrl = requireString(input.idOrUrl, "idOrUrl");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v13/deployments/${encodeURIComponent(idOrUrl)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: queryParams({
      withGitRepoInfo: optionalBoolean(input.withGitRepoInfo),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    deployment: mapDeployment(payload),
  };
}

async function vercelGetDeploymentEvents(input: VercelActionInput, context: VercelActionContext) {
  const idOrUrl = requireString(input.idOrUrl, "idOrUrl");
  const payload = await requestVercelJson<unknown>({
    path: `/v3/deployments/${encodeURIComponent(idOrUrl)}/events`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: queryParams({
      builds: queryFlag(optionalBoolean(input.builds)),
      direction: optionalString(input.direction),
      limit: optionalNumber(input.limit),
      since: optionalNumber(input.since),
      until: optionalNumber(input.until),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    events: normalizeArrayPayload(payload, "events").map((event) => mapDeploymentEvent(event)),
  };
}

async function vercelGetRuntimeLogs(input: VercelActionInput, context: VercelActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  const payload = await requestVercelJson<unknown>({
    path: `/v1/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/runtime-logs`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    logs: normalizeArrayPayload(payload, "logs").map((log) => mapRuntimeLog(log)),
  };
}

async function vercelListProjectEnvs(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<{ envs?: unknown[] }>({
    path: `/v10/projects/${encodeURIComponent(idOrName)}/env`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: queryParams({
      customEnvironmentId: optionalString(input.customEnvironmentId),
      gitBranch: optionalString(input.gitBranch),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    envs: normalizeArrayPayload(payload, "envs").map((env) => mapEnv(env)),
  };
}

async function vercelCreateProjectEnv(input: VercelActionInput, context: VercelActionContext) {
  rejectSensitiveDevelopmentConflict(input);
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<unknown>({
    path: `/v10/projects/${encodeURIComponent(idOrName)}/env`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: jsonObject({
      key: optionalString(input.key),
      value: optionalString(input.value),
      type: optionalString(input.type),
      target: normalizeStringArray(input.target),
      gitBranch: optionalString(input.gitBranch),
      comment: optionalString(input.comment),
      customEnvironmentIds: normalizeStringArray(input.customEnvironmentIds),
    }),
  });

  return {
    envs: normalizeArrayPayload(payload, "envs").map((env) => mapEnv(env)),
  };
}

async function vercelUpdateProjectEnv(input: VercelActionInput, context: VercelActionContext) {
  rejectSensitiveDevelopmentConflict(input);
  const idOrName = requireString(input.idOrName, "idOrName");
  const id = requireString(input.id, "id");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/env/${encodeURIComponent(id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "PATCH",
    body: jsonObject({
      key: optionalString(input.key),
      value: optionalString(input.value),
      type: optionalString(input.type),
      target: normalizeStringArray(input.target),
      gitBranch: optionalString(input.gitBranch),
      comment: optionalString(input.comment),
      customEnvironmentIds: normalizeStringArray(input.customEnvironmentIds),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    env: mapEnv(payload),
  };
}

async function vercelDeleteProjectEnv(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const id = requireString(input.id, "id");
  const payload = await requestVercelJson<unknown>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/env/${encodeURIComponent(id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });

  return {
    envs: normalizeArrayPayload(payload, "envs").map((env) => mapEnv(env)),
  };
}

async function vercelListProjectDomains(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<{
    domains?: unknown[];
    pagination?: unknown;
  }>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/domains`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: queryParams({
      limit: optionalNumber(input.limit),
      since: optionalNumber(input.since),
      until: optionalNumber(input.until),
      gitBranch: optionalString(input.gitBranch),
      customEnvironmentId: optionalString(input.customEnvironmentId),
    }),
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    domains: normalizeArrayPayload(payload, "domains").map((domain) => mapDomain(domain)),
    pagination: optionalRecord(payload.pagination),
  });
}

async function vercelGetProjectDomain(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const domain = requireString(input.domain, "domain");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/domains/${encodeURIComponent(domain)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    domain: mapDomain(payload),
  };
}

async function vercelAddProjectDomain(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v10/projects/${encodeURIComponent(idOrName)}/domains`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: jsonObject({
      name: optionalString(input.name),
      redirect: optionalString(input.redirect),
      gitBranch: optionalString(input.gitBranch),
      customEnvironmentId: optionalString(input.customEnvironmentId),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    domain: mapDomain(payload),
  };
}

async function vercelVerifyProjectDomain(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const domain = requireString(input.domain, "domain");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/domains/${encodeURIComponent(domain)}/verify`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    notFoundAsInvalidInput: true,
  });

  return {
    domain: mapDomain(payload),
  };
}

async function vercelGetDomainConfig(input: VercelActionInput, context: VercelActionContext) {
  const domain = requireString(input.domain, "domain");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v6/domains/${encodeURIComponent(domain)}/config`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    configuredBy: optionalString(payload.configuredBy),
    acceptedChallenges: normalizeStringArray(payload.acceptedChallenges),
    misconfigured: optionalBoolean(payload.misconfigured),
    recommendedNameServers: normalizeStringArray(payload.recommendedNameServers),
  });
}

async function vercelListWebhooks(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<{ webhooks?: unknown[] }>({
    path: "/v1/webhooks",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
  });

  return {
    webhooks: normalizeArrayPayload(payload, "webhooks").map((webhook) => mapWebhook(webhook)),
  };
}

async function vercelGetWebhook(input: VercelActionInput, context: VercelActionContext) {
  const id = requireString(input.id, "id");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v1/webhooks/${encodeURIComponent(id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    webhook: mapWebhook(payload),
  };
}

async function vercelCreateWebhook(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: "/v1/webhooks",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: jsonObject({
      url: optionalString(input.url),
      events: normalizeStringArray(input.events),
      projectIds: normalizeStringArray(input.projectIds),
    }),
  });

  return {
    webhook: mapWebhook(payload),
  };
}

async function vercelDeleteWebhook(input: VercelActionInput, context: VercelActionContext) {
  const id = requireString(input.id, "id");
  await requestVercelNoContent({
    path: `/v1/webhooks/${encodeURIComponent(id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });

  return { deleted: true };
}

interface VercelRequestOptions {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}

interface VercelUserResponse {
  user?: {
    id?: unknown;
    username?: unknown;
    email?: unknown;
    name?: unknown;
  };
  id?: unknown;
  username?: unknown;
  email?: unknown;
  name?: unknown;
}

interface VercelTeamResponse {
  team?: {
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

async function requestVercelJson<T>(options: VercelRequestOptions): Promise<T> {
  const response = await requestVercel(options);

  if (!response.ok) {
    throw await mapVercelError(response, options.mode, options.notFoundAsInvalidInput ?? false);
  }

  if (response.status === 204) {
    throw new ProviderRequestError(502, "vercel returned 204 No Content for a JSON request");
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new ProviderRequestError(502, "vercel returned an empty response");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderRequestError(502, "vercel returned an invalid JSON response");
  }
}

async function requestVercelNoContent(options: VercelRequestOptions & { method: "DELETE" }): Promise<void> {
  const response = await requestVercel(options);

  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    throw await mapVercelError(response, options.mode, options.notFoundAsInvalidInput ?? false);
  }

  throw new ProviderRequestError(502, "vercel returned a response body for a no-content request");
}

async function requestVercel(options: VercelRequestOptions): Promise<Response> {
  const url = buildVercelUrl(options.path, options.query);

  try {
    return await options.fetcher(url, {
      method: options.method ?? "GET",
      headers: vercelHeaders(options.apiKey, options.body !== undefined),
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "vercel request failed");
  }
}

function buildVercelUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(path, vercelApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function vercelHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    ...(hasJsonBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function mapVercelError(
  response: Response,
  mode: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): Promise<ProviderRequestError> {
  const error = await readVercelError(response);

  if (response.status === 400 || response.status === 409) {
    return new ProviderRequestError(400, error.message, error);
  }
  if (response.status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, error.message, error);
  }
  if ((response.status === 404 || response.status === 410) && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, error.message, error);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, error.message, error);
  }
  if (response.status === 403 || response.status >= 500) {
    return new ProviderRequestError(response.status, error.message, error);
  }

  return new ProviderRequestError(response.status || 502, error.message, error);
}

async function readVercelError(response: Response): Promise<{
  code: string;
  message: string;
}> {
  try {
    const payload = (await response.json()) as {
      error?: {
        code?: unknown;
        message?: unknown;
      };
      message?: unknown;
      code?: unknown;
    };

    return {
      code:
        typeof payload.error?.code === "string"
          ? payload.error.code
          : typeof payload.code === "string"
            ? payload.code
            : "provider_error",
      message:
        typeof payload.error?.message === "string"
          ? payload.error.message
          : typeof payload.message === "string"
            ? payload.message
            : `vercel request failed with ${response.status}`,
    };
  } catch {
    const message = (await response.text().catch(() => "")) || `vercel request failed with ${response.status}`;
    return {
      code: "provider_error",
      message,
    };
  }
}

function normalizeVercelUser(payload: VercelUserResponse): VercelUser {
  const user = payload.user ?? payload;
  const id = optionalString(user.id);
  if (!id) {
    throw new ProviderRequestError(502, "vercel user response is missing id");
  }

  return {
    id,
    username: optionalString(user.username),
    email: optionalString(user.email),
    name: optionalString(user.name),
  };
}

function normalizeVercelTeam(payload: VercelTeamResponse): VercelTeam {
  const team = payload.team ?? payload;
  const id = optionalString(team.id);
  if (!id) {
    throw new ProviderRequestError(502, "vercel team response is missing id");
  }

  return {
    id,
    slug: optionalString(team.slug),
    name: optionalString(team.name),
    createdAt: optionalNumber(team.createdAt),
    updatedAt: optionalNumber(team.updatedAt),
  };
}

function userLabel(user: VercelUser): string {
  return user.name ?? user.username ?? user.id;
}

function mapProject(value: unknown): Record<string, unknown> {
  const project = requireObject(value, "project");
  return compactObject({
    id: requireString(project.id, "project.id"),
    name: requireString(project.name, "project.name"),
    accountId: optionalString(project.accountId),
    framework: optionalString(project.framework),
    nodeVersion: optionalString(project.nodeVersion),
    createdAt: optionalNumber(project.createdAt),
    updatedAt: optionalNumber(project.updatedAt),
    link: optionalRecord(project.link),
    latestDeployments: Array.isArray(project.latestDeployments)
      ? project.latestDeployments.map((deployment) => mapDeployment(deployment))
      : undefined,
  });
}

function mapDeployment(value: unknown): Record<string, unknown> {
  const deployment = requireObject(value, "deployment");
  return compactObject({
    id: requireString(deployment.id, "deployment.id"),
    name: optionalString(deployment.name),
    url: optionalString(deployment.url),
    state: optionalString(deployment.state),
    readyState: optionalString(deployment.readyState),
    target: optionalString(deployment.target),
    createdAt: optionalNumber(deployment.createdAt),
    ready: optionalNumber(deployment.ready),
    projectId: optionalString(deployment.projectId),
    creator: optionalRecord(deployment.creator),
    meta: optionalRecord(deployment.meta),
    alias: Array.isArray(deployment.alias)
      ? deployment.alias.filter((alias): alias is string => typeof alias === "string")
      : undefined,
  });
}

function mapDeploymentEvent(value: unknown): {
  created: number;
  type: string;
  payload: Record<string, unknown>;
} {
  const event = requireObject(value, "deployment event");
  return {
    created: requireNumber(event.created, "event.created"),
    type: requireString(event.type, "event.type"),
    payload: requireObject(event.payload, "event.payload"),
  };
}

function mapRuntimeLog(value: unknown): Record<string, unknown> {
  const log = requireObject(value, "runtime log");
  return compactObject({
    timestampInMs: requireNumber(log.timestampInMs, "log.timestampInMs"),
    level: requireString(log.level, "log.level"),
    message: requireString(log.message, "log.message"),
    source: requireString(log.source, "log.source"),
    requestMethod: optionalString(log.requestMethod),
    requestPath: optionalString(log.requestPath),
    responseStatusCode: optionalNumber(log.responseStatusCode),
  });
}

function mapEnv(value: unknown): Record<string, unknown> {
  const env = requireObject(value, "env");
  return compactObject({
    id: requireString(env.id, "env.id"),
    key: requireString(env.key, "env.key"),
    type: requireString(env.type, "env.type"),
    target: normalizeStringArray(env.target),
    gitBranch: optionalString(env.gitBranch),
    createdAt: optionalNumber(env.createdAt),
    updatedAt: optionalNumber(env.updatedAt),
    comment: optionalString(env.comment),
  });
}

function mapDomain(value: unknown): Record<string, unknown> {
  const domain = requireObject(value, "domain");
  return compactObject({
    name: requireString(domain.name, "domain.name"),
    apexName: optionalString(domain.apexName),
    verified: optionalBoolean(domain.verified),
    verification: Array.isArray(domain.verification)
      ? domain.verification
          .map((item) => optionalRecord(item))
          .filter((item): item is Record<string, unknown> => item !== undefined)
      : undefined,
    redirect: domain.redirect === null ? null : optionalString(domain.redirect),
    gitBranch: optionalString(domain.gitBranch),
    customEnvironmentId: optionalString(domain.customEnvironmentId),
  });
}

function mapWebhook(value: unknown): Record<string, unknown> {
  const webhook = requireObject(value, "webhook");
  return compactObject({
    id: requireString(webhook.id, "webhook.id"),
    url: requireString(webhook.url, "webhook.url"),
    events: normalizeStringArray(webhook.events),
    projectIds: normalizeStringArray(webhook.projectIds),
    teamId: optionalString(webhook.teamId),
    createdAt: optionalNumber(webhook.createdAt),
    updatedAt: optionalNumber(webhook.updatedAt),
  });
}

function normalizeArrayPayload(payload: unknown, key: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = optionalRecord(payload);
  const value = record?.[key];
  return normalizeArray(value);
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return object;
}

function requireString(value: unknown, label: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${label} must be a string`);
  }
  return stringValue;
}

function requireNumber(value: unknown, label: string): number {
  const numberValue = optionalNumber(value);
  if (numberValue === undefined) {
    throw new ProviderRequestError(502, `${label} must be a number`);
  }
  return numberValue;
}

function rejectSensitiveDevelopmentConflict(input: VercelActionInput): void {
  if (input.type === "sensitive" && Array.isArray(input.target) && input.target.includes("development")) {
    throw new ProviderRequestError(400, "sensitive env does not support development target");
  }
}
