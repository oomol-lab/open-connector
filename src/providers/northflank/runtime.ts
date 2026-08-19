import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

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
  const token = requiredString(apiKey, "apiKey", invalidInput);
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
    requiredRecord(payload.data, "data", providerResponse).projects,
    "projects",
    providerResponse,
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

  const data = requiredRecord(payload.data, "data", providerResponse);
  return {
    projects: objectArray(data.projects, "data.projects", providerResponse).map(normalizeProjectSummary),
    pagination: normalizePagination(payload.pagination),
  };
}

async function executeGetProject(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = requiredString(input.projectId, "projectId", invalidInput);
  const payload = await northflankRequest(
    {
      path: `/v1/projects/${encodePathSegment(projectId)}`,
    },
    context,
  );

  return {
    project: normalizeProjectDetail(requiredRecord(payload.data, "data", providerResponse)),
  };
}

async function executeListServices(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = requiredString(input.projectId, "projectId", invalidInput);
  const payload = await northflankRequest(
    {
      path: `/v1/projects/${encodePathSegment(projectId)}/services`,
      query: readPaginationQuery(input),
    },
    context,
  );

  const data = requiredRecord(payload.data, "data", providerResponse);
  return {
    services: objectArray(data.services, "data.services", providerResponse).map(normalizeServiceSummary),
    pagination: normalizePagination(payload.pagination),
  };
}

async function executeGetService(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = requiredString(input.projectId, "projectId", invalidInput);
  const serviceId = requiredString(input.serviceId, "serviceId", invalidInput);
  const payload = await northflankRequest(
    {
      path: `/v1/projects/${encodePathSegment(projectId)}/services/${encodePathSegment(serviceId)}`,
    },
    context,
  );

  return {
    service: normalizeServiceDetail(requiredRecord(payload.data, "data", providerResponse)),
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

  return requiredRecord(payload, "payload", providerResponse);
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
    id: requiredString(value.id, "project.id", providerResponse),
    name: requiredString(value.name, "project.name", providerResponse),
    ...compactObject({
      description: readOptionalRawString(value.description),
    }),
  };
}

function normalizeServiceSummary(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(value.id, "service.id", providerResponse),
    appId: requiredString(value.appId, "service.appId", providerResponse),
    projectId: requiredString(value.projectId, "service.projectId", providerResponse),
    name: requiredString(value.name, "service.name", providerResponse),
    serviceType: readRequiredServiceType(value.serviceType, "service.serviceType"),
    disabledCI: readRequiredBoolean(value.disabledCI, "service.disabledCI"),
    disabledCD: readRequiredBoolean(value.disabledCD, "service.disabledCD"),
    ...compactObject({
      tags: Array.isArray(value.tags) ? value.tags.map((item) => String(item).trim()) : undefined,
      description: readOptionalRawString(value.description),
      status: normalizeStatus(value.status),
    }),
  };
}

function normalizePagination(value: unknown): Record<string, unknown> {
  const pagination = requiredRecord(value, "pagination", providerResponse);
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
    id: requiredString(value.id, "project.id", providerResponse),
    name: requiredString(value.name, "project.name", providerResponse),
    ...compactObject({
      deployment: normalizeDeployment(value.deployment),
      services: Array.isArray(value.services)
        ? objectArray(value.services, "project.services", providerResponse).map(normalizeProjectServiceSummary)
        : undefined,
      jobs: Array.isArray(value.jobs)
        ? objectArray(value.jobs, "project.jobs", providerResponse).map(normalizeJobSummary)
        : undefined,
      addons: Array.isArray(value.addons)
        ? objectArray(value.addons, "project.addons", providerResponse).map(normalizeAddonSummary)
        : undefined,
    }),
  };
}

function normalizeProjectServiceSummary(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: requiredString(value.id, "project.service.id", providerResponse),
    appId: requiredString(value.appId, "project.service.appId", providerResponse),
    name: requiredString(value.name, "project.service.name", providerResponse),
  };
}

function normalizeJobSummary(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: requiredString(value.id, "project.job.id", providerResponse),
    appId: requiredString(value.appId, "project.job.appId", providerResponse),
    name: requiredString(value.name, "project.job.name", providerResponse),
    jobType: requiredString(value.jobType, "project.job.jobType", providerResponse),
  };
}

function normalizeAddonSummary(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: requiredString(value.id, "project.addon.id", providerResponse),
    appId: requiredString(value.appId, "project.addon.appId", providerResponse),
    name: requiredString(value.name, "project.addon.name", providerResponse),
  };
}

function normalizeServiceDetail(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: requiredString(value.id, "service.id", providerResponse),
    appId: requiredString(value.appId, "service.appId", providerResponse),
    name: requiredString(value.name, "service.name", providerResponse),
    projectId: requiredString(value.projectId, "service.projectId", providerResponse),
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
    throw invalidInput(`${fieldName} must be an integer`);
  }
  return parsed;
}

function readOptionalRawString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw providerResponse(`Northflank response missing ${fieldName}`);
  }
  return value;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw providerResponse(`Northflank response missing ${fieldName}`);
  }
  return value;
}

function readRequiredServiceType(value: unknown, fieldName: string): "combined" | "build" | "deployment" {
  if (value === "combined" || value === "build" || value === "deployment") {
    return value;
  }
  throw providerResponse(`Northflank response missing ${fieldName}`);
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

  const message = readOptionalRawString(record.message) ?? readOptionalRawString(record.error);
  if (message?.trim()) {
    return message;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const messages = errors
      .map((item) => {
        const itemMessage = typeof item === "string" ? item : readOptionalRawString(optionalRecord(item)?.message);
        return itemMessage?.trim() ? itemMessage : undefined;
      })
      .filter((item) => item !== undefined);

    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return undefined;
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponse(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
