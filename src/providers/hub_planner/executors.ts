import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "hub_planner";
const hubPlannerApiBaseUrl = "https://api.hubplanner.com/v1";
const hubPlannerValidationPath = "/project";
const hubPlannerMaxResponseBytes = 10 * 1024 * 1024;

type HubPlannerPhase = "validate" | "execute";
type HubPlannerExpectedPayload = "array" | "object";
type HubPlannerQueryValue = number | string | string[] | undefined;
type HubPlannerActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const hubPlannerActionHandlers: ProviderActionHandlers<"hub_planner", HubPlannerActionHandler> = {
  list_projects(input, context) {
    return listHubPlannerCollection("project", "projects", input, context);
  },
  get_project(input, context) {
    return getHubPlannerObject("project", "project", requiredInputString(input.projectId, "projectId"), context);
  },
  create_project(input, context) {
    return createHubPlannerObject("project", "project", buildProjectBody(input), context);
  },
  list_resources(input, context) {
    return listHubPlannerCollection("resource", "resources", input, context);
  },
  get_resource(input, context) {
    return getHubPlannerObject("resource", "resource", requiredInputString(input.resourceId, "resourceId"), context);
  },
  create_resource(input, context) {
    return createHubPlannerObject("resource", "resource", buildResourceBody(input), context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, hubPlannerActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: hubPlannerApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestHubPlannerJson({
      method: "GET",
      path: hubPlannerValidationPath,
      query: { limit: 1 },
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
      expected: "array",
    });

    return {
      profile: {
        displayName: "Resource Flow API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: hubPlannerApiBaseUrl,
        validationEndpoint: hubPlannerValidationPath,
      },
    };
  },
};

async function listHubPlannerCollection(
  path: "project" | "resource",
  outputKey: "projects" | "resources",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) {
  const items = await requestHubPlannerJson<Record<string, unknown>[]>({
    method: "GET",
    path: `/${path}`,
    query: buildListQuery(input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    expected: "array",
  });

  return { [outputKey]: items };
}

async function getHubPlannerObject(
  path: "project" | "resource",
  outputKey: "project" | "resource",
  id: string,
  context: ApiKeyProviderContext,
) {
  const item = await requestHubPlannerJson<Record<string, unknown>>({
    method: "GET",
    path: `/${path}/${encodeURIComponent(id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    expected: "object",
  });

  return { [outputKey]: item };
}

async function createHubPlannerObject(
  path: "project" | "resource",
  outputKey: "project" | "resource",
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
) {
  const item = await requestHubPlannerJson<Record<string, unknown>>({
    method: "POST",
    path: `/${path}`,
    body,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    expected: "object",
  });

  return { [outputKey]: item };
}

function buildListQuery(input: Record<string, unknown>) {
  return compactObject({
    page: typeof input.page === "number" ? input.page : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    sort: Array.isArray(input.sort) ? input.sort.map((value) => requiredInputString(value, "sort")) : undefined,
  });
}

function buildProjectBody(input: Record<string, unknown>) {
  validateProjectInput(input);
  return compactObject({
    name: requiredInputString(input.name, "name"),
    note: input.note,
    status: input.status,
    projectCode: optionalString(input.projectCode),
    metadata: input.metadata,
    backgroundColor: optionalString(input.backgroundColor),
    useStatusColor: input.useStatusColor,
    useProjectDuration: input.useProjectDuration,
    start: input.start,
    end: input.end,
    budgetHours: input.budgetHours,
    budgetCashAmount: input.budgetCashAmount,
    budgetCurrency: optionalString(input.budgetCurrency),
    timeEntryEnabled: input.timeEntryEnabled,
    timeEntryLocked: input.timeEntryLocked,
    timeEntryApproval: input.timeEntryApproval,
    timeEntryNoteRequired: input.timeEntryNoteRequired,
    resources: trimStringArray(input.resources, "resources"),
    projectManagers: trimStringArray(input.projectManagers, "projectManagers"),
  });
}

function buildResourceBody(input: Record<string, unknown>) {
  validateResourceInput(input);
  return compactObject({
    firstName: requiredInputString(input.firstName, "firstName"),
    lastName: input.lastName,
    email: input.email,
    note: input.note,
    role: input.role,
    status: input.status,
    metadata: input.metadata,
    sendInviteEmail: input.sendInviteEmail,
    useCustomAvailability: input.useCustomAvailability,
    calendarIds: trimStringArray(input.calendarIds, "calendarIds"),
  });
}

async function requestHubPlannerJson<T>(input: {
  method: "GET" | "POST";
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: HubPlannerPhase;
  expected: HubPlannerExpectedPayload;
  query?: Record<string, HubPlannerQueryValue>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<T> {
  const url = buildHubPlannerUrl(input.path, input.query);
  return runProviderRequest({ signal: input.signal, label: "Hub Planner" }, async (signal) => {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: input.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
    const payload = await readHubPlannerPayload(response, !response.ok);
    if (!response.ok) {
      throw buildHubPlannerError(response.status, payload, input.phase);
    }

    if (input.expected === "array" && !Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Hub Planner response body must be an array");
    }
    if (input.expected === "object" && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
      throw new ProviderRequestError(502, "Hub Planner response body must be an object");
    }

    return payload as T;
  });
}

function buildHubPlannerUrl(path: string, query: Record<string, HubPlannerQueryValue> = {}) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${hubPlannerApiBaseUrl}/`);
  for (const [name, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(name, item);
      }
      continue;
    }
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }
  return url;
}

async function readHubPlannerPayload(response: Response, allowNonJsonText: boolean) {
  const text = await readProviderTextBody(response, "Hub Planner response", hubPlannerMaxResponseBytes);
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (allowNonJsonText) {
      return text;
    }
    throw new ProviderRequestError(502, "Hub Planner returned invalid JSON");
  }
}

function buildHubPlannerError(status: number, payload: unknown, phase: HubPlannerPhase) {
  const message = extractHubPlannerErrorMessage(payload) ?? `Hub Planner request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function extractHubPlannerErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error;
  }
  const nestedError = optionalRecord(record.error);
  if (nestedError) {
    const nestedMessage = nestedError.message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage;
    }
  }
  return undefined;
}

function trimStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => requiredInputString(item, fieldName));
}

function validateProjectInput(input: Record<string, unknown>): void {
  const usesDuration = input.useProjectDuration === true;
  if (usesDuration && input.start === undefined) {
    throw new ProviderRequestError(400, "start is required when useProjectDuration is true");
  }
  if (usesDuration && input.end === undefined) {
    throw new ProviderRequestError(400, "end is required when useProjectDuration is true");
  }
  if ((input.start !== undefined || input.end !== undefined) && !usesDuration) {
    throw new ProviderRequestError(400, "useProjectDuration must be true when start or end is provided");
  }
}

function validateResourceInput(input: Record<string, unknown>): void {
  if (input.sendInviteEmail === true && input.email === undefined) {
    throw new ProviderRequestError(400, "email is required when sendInviteEmail is true");
  }
}
