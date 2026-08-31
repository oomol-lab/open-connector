import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const northflankApiBaseUrl = "https://api.northflank.com";

type QueryValue = string | number | undefined;

interface NorthflankRequestInput {
  path: string;
  query?: Array<[string, QueryValue]>;
}

export const northflankActionHandlers: ProviderActionHandlers<
  "northflank",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_projects(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    return executeListProjects(input, context);
  },
  get_project(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    return executeGetProject(input, context);
  },
  list_services(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    return executeListServices(input, context);
  },
  get_service(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    return executeGetService(input, context);
  },
};

export async function validateNorthflankCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const token = requiredString(apiKey, "apiKey", providerInputError);
  const payload = await northflankRequest(
    {
      path: "/v1/projects",
      query: [["per_page", 1]],
    },
    {
      apiKey: token,
      fetcher,
      signal,
    },
  );

  const projects = objectArray(
    requiredRecord(payload.data, "data", providerResponseError).projects,
    "projects",
    providerResponseError,
  );

  return {
    profile: {
      accountId: "northflank",
      displayName: "Northflank API Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: northflankApiBaseUrl,
      validationEndpoint: "/v1/projects",
      projectCountSample: projects.length,
    },
  };
}

async function executeListProjects(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await northflankRequest(
    {
      path: "/v1/projects",
      query: readPaginationQuery(input),
    },
    context,
  );

  const data = requiredRecord(payload.data, "data", providerResponseError);
  return {
    projects: objectArray(data.projects, "data.projects", providerResponseError).map(normalizeProjectSummary),
    pagination: normalizePagination(payload.pagination),
  };
}

async function executeGetProject(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = requiredString(input.projectId, "projectId", providerInputError);
  const payload = await northflankRequest(
    {
      path: `/v1/projects/${encodePathSegment(projectId)}`,
    },
    context,
  );

  return {
    project: normalizeProjectDetail(requiredRecord(payload.data, "data", providerResponseError)),
  };
}

async function executeListServices(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = requiredString(input.projectId, "projectId", providerInputError);
  const payload = await northflankRequest(
    {
      path: `/v1/projects/${encodePathSegment(projectId)}/services`,
      query: readPaginationQuery(input),
    },
    context,
  );

  const data = requiredRecord(payload.data, "data", providerResponseError);
  return {
    services: objectArray(data.services, "data.services", providerResponseError).map(normalizeServiceSummary),
    pagination: normalizePagination(payload.pagination),
  };
}

async function executeGetService(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = requiredString(input.projectId, "projectId", providerInputError);
  const serviceId = requiredString(input.serviceId, "serviceId", providerInputError);
  const payload = await northflankRequest(
    {
      path: `/v1/projects/${encodePathSegment(projectId)}/services/${encodePathSegment(serviceId)}`,
    },
    context,
  );

  return {
    service: normalizeServiceDetail(requiredRecord(payload.data, "data", providerResponseError)),
  };
}

async function northflankRequest(
  input: NorthflankRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(buildNorthflankUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Northflank request failed: ${error.message}` : "Northflank request failed",
    );
  }

  if (!response.ok) {
    throw createNorthflankError(response.status, payload);
  }

  return requiredRecord(payload, "payload", providerResponseError);
}

function buildNorthflankUrl(input: NorthflankRequestInput): URL {
  const url = new URL(input.path, northflankApiBaseUrl);
  for (const [key, value] of input.query ?? []) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function createNorthflankError(status: number, payload: unknown): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Northflank request failed with ${status || 500}`;

  if (status === 400 || status === 401 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function readPaginationQuery(input: Record<string, unknown>): Array<[string, QueryValue]> {
  return [
    ["per_page", readOptionalInteger(input.per_page, "per_page")],
    ["page", readOptionalInteger(input.page, "page")],
    ["cursor", optionalString(input.cursor)],
  ];
}

function normalizeProjectSummary(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(value.id, "project.id", providerResponseError),
    name: requiredString(value.name, "project.name", providerResponseError),
    ...compactObject({
      description: optionalRawString(value.description),
    }),
  };
}

function normalizeServiceSummary(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(value.id, "service.id", providerResponseError),
    appId: requiredString(value.appId, "service.appId", providerResponseError),
    projectId: requiredString(value.projectId, "service.projectId", providerResponseError),
    name: requiredString(value.name, "service.name", providerResponseError),
    serviceType: readRequiredServiceType(value.serviceType, "service.serviceType"),
    disabledCI: readRequiredBoolean(value.disabledCI, "service.disabledCI"),
    disabledCD: readRequiredBoolean(value.disabledCD, "service.disabledCD"),
    ...compactObject({
      tags: Array.isArray(value.tags) ? value.tags.map((item) => String(item).trim()) : undefined,
      description: optionalRawString(value.description),
      status: normalizeStatus(value.status),
    }),
  };
}

function normalizePagination(value: unknown): Record<string, unknown> {
  const pagination = requiredRecord(value, "pagination", providerResponseError);
  return {
    hasNextPage: readRequiredBoolean(pagination.hasNextPage, "pagination.hasNextPage"),
    ...compactObject({
      cursor: optionalString(pagination.cursor),
    }),
    count: readRequiredNumber(pagination.count, "pagination.count"),
  };
}

function normalizeProjectDetail(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: requiredString(value.id, "project.id", providerResponseError),
    name: requiredString(value.name, "project.name", providerResponseError),
    ...compactObject({
      deployment: normalizeDeployment(value.deployment),
      services: Array.isArray(value.services)
        ? objectArray(value.services, "project.services", providerResponseError).map(normalizeProjectServiceSummary)
        : undefined,
      jobs: Array.isArray(value.jobs)
        ? objectArray(value.jobs, "project.jobs", providerResponseError).map(normalizeJobSummary)
        : undefined,
      addons: Array.isArray(value.addons)
        ? objectArray(value.addons, "project.addons", providerResponseError).map(normalizeAddonSummary)
        : undefined,
    }),
  };
}

function normalizeProjectServiceSummary(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: requiredString(value.id, "project.service.id", providerResponseError),
    appId: requiredString(value.appId, "project.service.appId", providerResponseError),
    name: requiredString(value.name, "project.service.name", providerResponseError),
  };
}

function normalizeJobSummary(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: requiredString(value.id, "project.job.id", providerResponseError),
    appId: requiredString(value.appId, "project.job.appId", providerResponseError),
    name: requiredString(value.name, "project.job.name", providerResponseError),
    jobType: requiredString(value.jobType, "project.job.jobType", providerResponseError),
  };
}

function normalizeAddonSummary(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: requiredString(value.id, "project.addon.id", providerResponseError),
    appId: requiredString(value.appId, "project.addon.appId", providerResponseError),
    name: requiredString(value.name, "project.addon.name", providerResponseError),
  };
}

function normalizeServiceDetail(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: requiredString(value.id, "service.id", providerResponseError),
    appId: requiredString(value.appId, "service.appId", providerResponseError),
    name: requiredString(value.name, "service.name", providerResponseError),
    projectId: requiredString(value.projectId, "service.projectId", providerResponseError),
    serviceType: readRequiredServiceType(value.serviceType, "service.serviceType"),
    ...compactObject({
      tags: Array.isArray(value.tags) ? value.tags.map((item) => String(item).trim()) : undefined,
      buildSource: optionalString(value.buildSource),
      status: normalizeStatus(value.status),
    }),
  };
}

function normalizeDeployment(value: unknown): Record<string, unknown> | undefined {
  const deployment = optionalRecord(value);
  if (!deployment) {
    return undefined;
  }
  return {
    ...deployment,
    ...compactObject({
      region: optionalString(deployment.region),
    }),
  };
}

function normalizeStatus(value: unknown): Record<string, unknown> | undefined {
  const status = optionalRecord(value);
  if (!status) {
    return undefined;
  }
  return {
    ...status,
    ...compactObject({
      build: normalizeStatusPhase(status.build),
      deployment: normalizeStatusPhase(status.deployment),
    }),
  };
}

function normalizeStatusPhase(value: unknown): Record<string, unknown> | undefined {
  const phase = optionalRecord(value);
  if (!phase) {
    return undefined;
  }
  return {
    ...phase,
    ...compactObject({
      status: optionalString(phase.status),
      reason: optionalString(phase.reason),
    }),
  };
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw providerInputError(`${fieldName} must be an integer`);
  }
  return parsed;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw providerResponseError(`Northflank response missing ${fieldName}`);
  }
  return value;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw providerResponseError(`Northflank response missing ${fieldName}`);
  }
  return value;
}

function readRequiredServiceType(value: unknown, fieldName: string): "combined" | "build" | "deployment" {
  if (value === "combined" || value === "build" || value === "deployment") {
    return value;
  }
  throw providerResponseError(`Northflank response missing ${fieldName}`);
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Northflank returned non-JSON response");
  }
}

function extractErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalRawString(record.message) ?? optionalRawString(record.error);
  if (message?.trim()) {
    return message;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const messages = errors
      .map((item) => {
        const itemMessage = typeof item === "string" ? item : optionalRawString(optionalRecord(item)?.message);
        return itemMessage?.trim() ? itemMessage : undefined;
      })
      .filter((item) => item !== undefined);

    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return undefined;
}
