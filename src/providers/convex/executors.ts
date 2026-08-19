import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { isIP } from "node:net";
import {
  compactObject,
  integer,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { defineBearerProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "convex";
const apiBaseUrl = "https://api.convex.dev/v1";
const grantedScopes = [
  "convex.token.read",
  "convex.projects.read",
  "convex.projects.write",
  "convex.deployments.read",
  "convex.deployments.write",
  "convex.deploy_keys.read",
  "convex.deploy_keys.write",
  "convex.custom_domains.read",
  "convex.custom_domains.write",
  "convex.functions.execute",
  "convex.http.query",
  "convex.http.mutation",
  "convex.http.action",
  "convex.http.run",
];

interface ConvexContext {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ConvexActionHandler = (input: Record<string, unknown>, context: ConvexContext) => Promise<unknown>;

const actionHandlers: ProviderActionHandlers<"convex", ConvexActionHandler> = {
  get_token_details(_input, context) {
    return getTokenDetails(context);
  },
  list_projects(input, context) {
    return listProjects(input, context);
  },
  create_project(input, context) {
    return createProject(input, context);
  },
  get_project_by_id(input, context) {
    return getProjectById(input, context);
  },
  get_project_by_slug(input, context) {
    return getProjectBySlug(input, context);
  },
  delete_project(input, context) {
    return deleteProject(input, context);
  },
  list_deployments(input, context) {
    return listDeployments(input, context);
  },
  get_deployment(input, context) {
    return getDeployment(input, context);
  },
  create_deployment(input, context) {
    return createDeployment(input, context);
  },
  update_deployment(input, context) {
    return updateDeployment(input, context);
  },
  delete_deployment(input, context) {
    return deleteDeployment(input, context);
  },
  list_deployment_classes(input, context) {
    return listDeploymentClasses(input, context);
  },
  list_deployment_regions(input, context) {
    return listDeploymentRegions(input, context);
  },
  create_deploy_key(input, context) {
    return createDeployKey(input, context);
  },
  list_deploy_keys(input, context) {
    return listDeployKeys(input, context);
  },
  delete_deploy_key(input, context) {
    return deleteDeployKey(input, context);
  },
  list_custom_domains(input, context) {
    return listCustomDomains(input, context);
  },
  delete_custom_domain(input, context) {
    return deleteCustomDomain(input, context);
  },
  run_query(input, context) {
    return runFunctionByKind("query", input, context);
  },
  run_mutation(input, context) {
    return runFunctionByKind("mutation", input, context);
  },
  run_action(input, context) {
    return runFunctionByKind("action", input, context);
  },
  run_function(input, context) {
    return runFunctionByIdentifier(input, context);
  },
  execute_query_batch(input, context) {
    return executeQueryBatch(input, context);
  },
};

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, actionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateToken(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateToken(input.accessToken, fetcher, signal);
  },
};

async function validateToken(accessToken: string, fetcher: typeof fetch, signal?: AbortSignal) {
  const token = await requestConvex<Record<string, unknown>>({ accessToken, path: "/token_details", fetcher, signal });
  const type = optionalString(token.type) ?? "teamToken";
  const teamId = optionalInteger(token.teamId);
  const projectId = optionalInteger(token.projectId);
  return {
    profile: {
      accountId: type === "projectToken" && projectId != null ? `project:${projectId}` : `team:${teamId ?? "unknown"}`,
      displayName:
        optionalString(token.name) ??
        (type === "projectToken" && projectId != null
          ? `Convex Project ${projectId}`
          : `Convex Team ${teamId ?? "unknown"}`),
    },
    grantedScopes,
    metadata: {
      tokenType: type,
      teamId,
      projectId,
      tokenName: optionalString(token.name),
      createTime: optionalInteger(token.createTime),
    },
  };
}

async function getTokenDetails(context: ConvexContext): Promise<unknown> {
  return {
    token: await requestConvex({ ...context, path: "/token_details" }),
  };
}

async function listProjects(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const teamId = integer(input.team_id, "team_id", badInput);
  const projects = await requestConvex<Array<Record<string, unknown>>>({
    ...context,
    path: `/teams/${teamId}/list_projects`,
  });
  return { projects: projects ?? [] };
}

async function createProject(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const teamId = integer(input.team_id, "team_id", badInput);
  return requestConvex({
    ...context,
    method: "POST",
    path: `/teams/${teamId}/create_project`,
    body: compactObject({
      projectName: readString(input.projectName, "projectName"),
      deploymentType: optionalString(input.deploymentType),
      deploymentClass: optionalString(input.deploymentClass),
      deploymentRegion: optionalString(input.deploymentRegion),
    }),
  });
}

async function getProjectById(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const projectId = integer(input.project_id, "project_id", badInput);
  return { project: (await requestConvex({ ...context, path: `/projects/${projectId}` })) ?? {} };
}

async function getProjectBySlug(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const teamIdOrSlug = readString(input.team_id_or_slug, "team_id_or_slug");
  const projectSlug = readString(input.project_slug, "project_slug");
  return {
    project:
      (await requestConvex({
        ...context,
        path: `/teams/${encodeURIComponent(teamIdOrSlug)}/projects/${encodeURIComponent(projectSlug)}`,
      })) ?? {},
  };
}

async function deleteProject(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const projectId = integer(input.project_id, "project_id", badInput);
  await requestConvex({ ...context, method: "POST", path: `/projects/${projectId}/delete` });
  return { success: true };
}

async function listDeployments(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const projectId = integer(input.project_id, "project_id", badInput);
  const deployments = await requestConvex<Array<Record<string, unknown>>>({
    ...context,
    path: `/projects/${projectId}/list_deployments`,
    query: queryParams({
      includeLocal: optionalBoolean(input.includeLocal),
      isDefault: optionalBoolean(input.isDefault),
      deploymentType: optionalString(input.deploymentType),
    }),
  });
  return { deployments: deployments ?? [] };
}

async function getDeployment(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const deploymentName = readString(input.deployment_name, "deployment_name");
  return {
    deployment: (await requestConvex({ ...context, path: `/deployments/${encodeURIComponent(deploymentName)}` })) ?? {},
  };
}

async function createDeployment(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const projectId = integer(input.project_id, "project_id", badInput);
  const deployment = await requestConvex<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: `/projects/${projectId}/create_deployment`,
    body: compactObject({
      type: readString(input.type, "type"),
      class: optionalString(input.class),
      region: optionalString(input.region),
      reference: optionalString(input.reference),
      isDefault: optionalBoolean(input.isDefault),
      expiresAt: input.expiresAt === null ? null : optionalInteger(input.expiresAt),
    }),
  });
  return { deployment: deployment ?? {} };
}

async function updateDeployment(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  if (
    input.reference === undefined &&
    input.dashboard_edit_confirmation === undefined &&
    input.expiresAt === undefined
  ) {
    throw new ProviderRequestError(
      400,
      "at least one of reference, dashboard_edit_confirmation, or expiresAt is required",
    );
  }
  const deploymentName = readString(input.deployment_name, "deployment_name");
  await requestConvex({
    ...context,
    method: "PATCH",
    path: `/deployments/${encodeURIComponent(deploymentName)}`,
    body: compactObject({
      reference:
        input.reference === null
          ? null
          : input.reference === undefined
            ? undefined
            : readString(input.reference, "reference"),
      dashboardEditConfirmation:
        input.dashboard_edit_confirmation === null ? null : optionalBoolean(input.dashboard_edit_confirmation),
      expiresAt: input.expiresAt === null ? null : optionalInteger(input.expiresAt),
    }),
  });
  return { success: true };
}

async function deleteDeployment(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const deploymentName = readString(input.deployment_name, "deployment_name");
  await requestConvex({
    ...context,
    method: "POST",
    path: `/deployments/${encodeURIComponent(deploymentName)}/delete`,
  });
  return { success: true };
}

async function listDeploymentClasses(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const teamId = integer(input.team_id, "team_id", badInput);
  const items = await requestConvex<Array<Record<string, unknown>>>({
    ...context,
    path: `/teams/${teamId}/list_deployment_classes`,
  });
  return { items: items ?? [] };
}

async function listDeploymentRegions(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const teamId = integer(input.team_id, "team_id", badInput);
  const items = await requestConvex<Array<Record<string, unknown>>>({
    ...context,
    path: `/teams/${teamId}/list_deployment_regions`,
  });
  return { items: items ?? [] };
}

async function createDeployKey(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const deploymentName = readString(input.deployment_name, "deployment_name");
  return requestConvex({
    ...context,
    method: "POST",
    path: `/deployments/${encodeURIComponent(deploymentName)}/create_deploy_key`,
    body: {
      name: readString(input.name, "name"),
    },
  });
}

async function listDeployKeys(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const deploymentName = readString(input.deployment_name, "deployment_name");
  const deployKeys = await requestConvex<Array<Record<string, unknown>>>({
    ...context,
    path: `/deployments/${encodeURIComponent(deploymentName)}/list_deploy_keys`,
  });
  return { deployKeys: deployKeys ?? [] };
}

async function deleteDeployKey(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const deploymentName = readString(input.deployment_name, "deployment_name");
  await requestConvex({
    ...context,
    method: "POST",
    path: `/deployments/${encodeURIComponent(deploymentName)}/delete_deploy_key`,
    body: { id: readString(input.id, "id") },
  });
  return { success: true };
}

async function listCustomDomains(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const deploymentName = readString(input.deployment_name, "deployment_name");
  const response = await requestConvex<{ customDomains?: Array<Record<string, unknown>> }>({
    ...context,
    path: `/deployments/${encodeURIComponent(deploymentName)}/custom_domains`,
  });
  return { customDomains: response?.customDomains ?? [] };
}

async function deleteCustomDomain(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const deploymentName = readString(input.deployment_name, "deployment_name");
  await requestConvex({
    ...context,
    method: "POST",
    path: `/deployments/${encodeURIComponent(deploymentName)}/delete_custom_domain`,
    body: { domain: readString(input.domain, "domain") },
  });
  return { success: true };
}

async function runFunctionByKind(
  kind: "query" | "mutation" | "action",
  input: Record<string, unknown>,
  context: ConvexContext,
): Promise<unknown> {
  const result = await requestConvexFunction({
    deploymentUrl: resolveDeploymentUrl(input),
    path: `/api/${kind}`,
    body: {
      path: readString(input.path, "path"),
      args: optionalRecord(input.args) ?? {},
      format: optionalString(input.format) ?? "json",
    },
    context,
  });
  return { result };
}

async function runFunctionByIdentifier(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const result = await requestConvexFunction({
    deploymentUrl: resolveDeploymentUrl(input),
    path: `/api/run/${normalizeFunctionIdentifier(readString(input.functionIdentifier, "functionIdentifier"))}`,
    body: {
      args: optionalRecord(input.args) ?? {},
      format: optionalString(input.format) ?? "json",
    },
    context,
  });
  return { result };
}

async function executeQueryBatch(input: Record<string, unknown>, context: ConvexContext): Promise<unknown> {
  const queries = input.queries;
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new ProviderRequestError(400, "queries must be a non-empty array");
  }
  const deploymentUrl = resolveDeploymentUrl(input);
  const results: Array<Record<string, unknown>> = [];
  for (const queryValue of queries) {
    const query = optionalRecord(queryValue);
    if (!query) {
      throw new ProviderRequestError(400, "query must be an object");
    }
    results.push(
      await requestConvexFunction({
        deploymentUrl,
        path: "/api/query",
        body: {
          path: readString(query.path, "path"),
          args: optionalRecord(query.args) ?? {},
          format: optionalString(query.format) ?? "json",
        },
        context,
      }),
    );
  }
  return { results };
}

async function requestConvex<T>(input: {
  accessToken: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}): Promise<T> {
  const url = new URL(`${apiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await input.fetcher(url, {
    method: input.method ?? "GET",
    headers: compactObject({
      authorization: `Bearer ${input.accessToken}`,
      accept: "application/json",
      "content-type": input.body === undefined ? undefined : "application/json",
      "user-agent": providerUserAgent,
    }) as Record<string, string>,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal,
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw normalizeError(response, payload, `convex request failed for ${input.path}`);
  }
  return payload as T;
}

async function requestConvexFunction(input: {
  deploymentUrl: string;
  path: string;
  body: Record<string, unknown>;
  context: ConvexContext;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, ensureTrailingSlash(input.deploymentUrl)).toString();
  const response = await input.context.fetcher(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: JSON.stringify(input.body),
    signal: input.context.signal,
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw normalizeError(response, payload, `convex function request failed for ${input.path}`);
  }
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "convex function response is invalid", payload);
  }
  return record;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json() as Promise<unknown>;
}

function normalizeError(response: Response, payload: unknown, fallbackMessage: string): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.error) ??
    optionalString(body?.message) ??
    optionalString(body?.error_description) ??
    fallbackMessage;
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : 500, message, payload);
}

function resolveDeploymentUrl(input: Record<string, unknown>): string {
  const explicitUrl = optionalString(input.deployment_url);
  if (explicitUrl) {
    return normalizeDeploymentUrl(explicitUrl);
  }
  throw new ProviderRequestError(400, "convex deployment_url is required for this action");
}

function normalizeDeploymentUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "convex deployment URL is required");
  }
  const candidate = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}.convex.cloud`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ProviderRequestError(400, "convex deployment URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "convex deployment URL must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "convex deployment URL must not include credentials");
  }
  if (!isAllowedHostname(url.hostname)) {
    throw new ProviderRequestError(400, "convex deployment URL must target a hosted *.convex.cloud deployment");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeFunctionIdentifier(functionIdentifier: string): string {
  return functionIdentifier
    .split(":")
    .map((segment) => {
      if (!segment || segment === "." || segment === ".." || /[/?#%\\]/.test(segment)) {
        throw new ProviderRequestError(400, "functionIdentifier contains an invalid path segment");
      }
      return encodeURIComponent(segment);
    })
    .join("/");
}

function isAllowedHostname(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();
  if (!normalizedHostname || normalizedHostname === "localhost" || isIP(normalizedHostname) !== 0) {
    return false;
  }
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.convex\.cloud$/.test(normalizedHostname);
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function readString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
