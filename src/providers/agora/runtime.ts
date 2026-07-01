import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { AgoraActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const agoraApiBaseUrl = "https://api.agora.io";
const agoraConsoleUrl = "https://console.agora.io/v2";

type AgoraRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;

interface AgoraActionContext {
  customerId: string;
  customerSecret: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface AgoraRequestOptions {
  customerId: string;
  customerSecret: string;
  path: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  phase: AgoraRequestPhase;
}

type AgoraActionHandler = (input: Record<string, unknown>, context: AgoraActionContext) => Promise<unknown>;

export const agoraActionHandlers: Record<AgoraActionName, AgoraActionHandler> = {
  list_projects(_input, context) {
    return listProjects(context);
  },
  get_project(input, context) {
    return getProject(input, context);
  },
  create_project(input, context) {
    return createProject(input, context);
  },
  update_project_status(input, context) {
    return updateProjectStatus(input, context);
  },
  set_primary_certificate(input, context) {
    return setPrimaryCertificate(input, context);
  },
  reset_primary_certificate(input, context) {
    return resetPrimaryCertificate(input, context);
  },
  get_project_usage(input, context) {
    return getProjectUsage(input, context);
  },
};

export async function validateAgoraCredential(
  input: { customerId: string | undefined; customerSecret: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = {
    customerId: readAgoraCustomerId(input),
    customerSecret: input.customerSecret,
    fetcher,
    signal,
  };
  const payload = await requestAgoraJson({
    ...context,
    path: "/dev/v1/projects",
    phase: "validate",
  });
  const projects = normalizeProjectListPayload(payload);
  const firstProject = projects[0];

  return {
    profile: {
      accountId: context.customerId,
      displayName: `Agora ${context.customerId}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      customerId: context.customerId,
      apiBaseUrl: agoraApiBaseUrl,
      validationEndpoint: "/dev/v1/projects",
      credentialHelpUrl: agoraConsoleUrl,
      sampleProjectId: firstProject?.id,
      sampleProjectName: firstProject?.name ?? undefined,
    }),
  };
}

export function readAgoraCustomerId(input: Record<string, unknown>): string {
  const customerId = optionalString(input.customerId);
  if (!customerId) {
    throw new ProviderRequestError(400, "customerId is required");
  }
  return customerId;
}

async function listProjects(context: AgoraActionContext): Promise<unknown> {
  const payload = await requestWithCredential(context, {
    path: "/dev/v1/projects",
  });
  return { projects: normalizeProjectListPayload(payload) };
}

async function getProject(input: Record<string, unknown>, context: AgoraActionContext): Promise<unknown> {
  const payload = await requestWithCredential(context, {
    path: "/dev/v1/project",
    query: {
      id: requiredString(input.projectId, "projectId"),
      name: requiredString(input.name, "name"),
    },
  });
  return { project: normalizeFirstProject(payload, "Agora project response") };
}

async function createProject(input: Record<string, unknown>, context: AgoraActionContext): Promise<unknown> {
  const payload = await requestWithCredential(context, {
    path: "/dev/v1/project",
    method: "POST",
    body: compactObject({
      name: requiredString(input.name, "name"),
      enable_sign_key: typeof input.enableCertificate === "boolean" ? input.enableCertificate : undefined,
    }),
  });
  return { project: normalizeProjectPayload(payload) };
}

async function updateProjectStatus(input: Record<string, unknown>, context: AgoraActionContext): Promise<unknown> {
  const payload = await requestWithCredential(context, {
    path: "/dev/v1/project_status",
    method: "POST",
    body: {
      id: requiredString(input.projectId, "projectId"),
      status: requiredInteger(input.status, "status"),
    },
  });
  return { project: normalizeProjectPayload(payload) };
}

async function setPrimaryCertificate(input: Record<string, unknown>, context: AgoraActionContext): Promise<unknown> {
  const payload = await requestWithCredential(context, {
    path: "/dev/v1/signkey",
    method: "POST",
    body: {
      id: requiredString(input.projectId, "projectId"),
      enable: requiredBoolean(input.enable, "enable"),
    },
  });
  return normalizeCertificateProjectPayload(payload);
}

async function resetPrimaryCertificate(input: Record<string, unknown>, context: AgoraActionContext): Promise<unknown> {
  const payload = await requestWithCredential(context, {
    path: "/dev/v1/reset_signkey",
    method: "POST",
    body: {
      id: requiredString(input.projectId, "projectId"),
    },
  });
  return normalizeCertificateProjectPayload(payload);
}

async function getProjectUsage(input: Record<string, unknown>, context: AgoraActionContext): Promise<unknown> {
  const payload = await requestWithCredential(context, {
    path: "/dev/v3/usage",
    query: {
      project_id: requiredString(input.projectId, "projectId"),
      from_date: requiredString(input.fromDate, "fromDate"),
      to_date: requiredString(input.toDate, "toDate"),
      business: requiredString(input.business, "business"),
    },
  });
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.usages)) {
    throw new ProviderRequestError(502, "Agora usage response is missing usages");
  }

  return {
    meta: optionalRecord(record.meta) ?? {},
    usages: record.usages.map(normalizeUsageRecord),
  };
}

function requestWithCredential(
  context: AgoraActionContext,
  request: {
    path: string;
    method?: string;
    query?: Record<string, QueryValue>;
    body?: Record<string, unknown>;
  },
): Promise<unknown> {
  return requestAgoraJson({
    customerId: context.customerId,
    customerSecret: context.customerSecret,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    ...request,
  });
}

async function requestAgoraJson(input: AgoraRequestOptions): Promise<unknown> {
  const url = new URL(input.path, agoraApiBaseUrl);
  appendQuery(url, input.query);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildBasicAuthHeader(input.customerId, input.customerSecret),
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Agora request failed: ${error.message}` : "Agora request failed",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(
      input.phase === "validate" ? 400 : response.status,
      input.phase === "validate" ? "Agora rejected the Customer ID or Customer Secret" : "Agora authentication failed",
    );
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status,
      (await readAgoraErrorMessage(response)) ?? `Agora request failed with HTTP ${response.status}`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "Agora returned invalid JSON");
  }
}

function buildBasicAuthHeader(customerId: string, customerSecret: string): string {
  return `Basic ${Buffer.from(`${customerId}:${customerSecret}`).toString("base64")}`;
}

function appendQuery(url: URL, query: Record<string, QueryValue> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
}

async function readAgoraErrorMessage(response: Response): Promise<string | undefined> {
  const payload = await response
    .clone()
    .json()
    .catch(() => null);
  const message = optionalString(optionalRecord(payload)?.message);
  return message ? `Agora request failed: ${message}` : undefined;
}

function normalizeProjectPayload(value: unknown): Record<string, unknown> {
  const project = optionalRecord(optionalRecord(value)?.project);
  if (!project) {
    throw new ProviderRequestError(502, "Agora project response is missing project");
  }
  return normalizeProject(project);
}

function normalizeCertificateProjectPayload(value: unknown): Record<string, unknown> {
  const project = optionalRecord(optionalRecord(value)?.project);
  if (!project) {
    throw new ProviderRequestError(502, "Agora project response is missing project");
  }
  return {
    project: normalizeProject(project),
    certificate: optionalString(project.sign_key) ?? null,
  };
}

function normalizeFirstProject(value: unknown, label: string): Record<string, unknown> {
  const project = normalizeProjectListPayload(value)[0];
  if (!project) {
    throw new ProviderRequestError(502, `${label} did not include a project`);
  }
  return project;
}

function normalizeProjectListPayload(value: unknown): Array<Record<string, unknown>> {
  const projects = optionalRecord(value)?.projects;
  if (!Array.isArray(projects)) {
    throw new ProviderRequestError(502, "Agora projects response is missing projects");
  }
  return projects.map(normalizeProject);
}

function normalizeProject(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Agora project item is invalid");
  }
  const id = optionalString(record.id);
  if (!id) {
    throw new ProviderRequestError(502, "Agora project response is missing id");
  }
  return {
    id,
    name: optionalString(record.name) ?? null,
    appId: optionalString(record.vendor_key) ?? null,
    recordingServer: optionalString(record.recording_server) ?? null,
    status: optionalInteger(record.status) ?? null,
    created: optionalInteger(record.created) ?? null,
  };
}

function normalizeUsageRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Agora usage record is invalid");
  }
  const usage = optionalRecord(record.usage);
  if (!usage) {
    throw new ProviderRequestError(502, "Agora usage record is missing usage");
  }
  const date = optionalString(record.date) ?? optionalInteger(record.date);
  if (date === undefined) {
    throw new ProviderRequestError(502, "Agora usage record is missing date");
  }
  return {
    date,
    usage,
    raw: record,
  };
}

function requiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function requiredInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return integer;
}

function requiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}
