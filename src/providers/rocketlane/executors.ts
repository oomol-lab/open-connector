import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "rocketlane";
const rocketlaneApiBaseUrl = "https://api.rocketlane.com/api";
const rocketlaneValidationPath = "/1.0/users";

type RocketlanePhase = "validate" | "execute";
type RocketlaneQueryValue = string | number | boolean | readonly string[];
type RocketlaneActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface RocketlaneListEnvelope {
  data: Record<string, unknown>[];
  pagination: Record<string, unknown>;
}

export const rocketlaneActionHandlers: ProviderActionHandlers<"rocketlane", RocketlaneActionHandler> = {
  list_projects(input, context) {
    return listProjects(input, context);
  },
  get_project(input, context) {
    return getProject(input, context);
  },
  list_tasks(input, context) {
    return listTasks(input, context);
  },
  get_task(input, context) {
    return getTask(input, context);
  },
  list_users(input, context) {
    return listUsers(input, context);
  },
  get_user(input, context) {
    return getUser(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, rocketlaneActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const payload = await requestRocketlaneJson({
      path: rocketlaneValidationPath,
      apiKey,
      fetcher,
      signal,
      query: { pageSize: 1 },
      phase: "validate",
    });
    const { data, pagination } = normalizeListEnvelope(payload, "Rocketlane users");
    const firstUser = data[0];
    const accountId = readRocketlaneProviderAccountId(firstUser);
    const firstUserId = readOptionalPositiveInteger(firstUser?.userId, "userId");
    const firstUserEmail = optionalString(firstUser?.email);

    return {
      profile: {
        accountId: accountId ?? "rocketlane-api-key",
        displayName: buildAccountLabel(firstUser),
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: rocketlaneApiBaseUrl,
        validationEndpoint: rocketlaneValidationPath,
        firstUserId,
        firstUserEmail,
        totalRecordCount: readOptionalNonNegativeInteger(pagination.totalRecordCount, "totalRecordCount"),
      }),
    };
  },
};

async function listProjects(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestRocketlaneJson({
    path: "/1.0/projects",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      pageSize: readOptionalPositiveInteger(input.pageSize, "pageSize"),
      pageToken: optionalString(input.pageToken),
      includeFields: readOptionalStringArray(input.includeFields, "includeFields"),
      includeAllFields: optionalBoolean(input.includeAllFields),
      sortBy: optionalString(input.sortBy),
      sortOrder: optionalString(input.sortOrder),
      match: optionalString(input.match),
      "projectName.eq": optionalString(input.projectNameEq),
      "projectName.cn": optionalString(input.projectNameContains),
      "status.eq": optionalString(input.statusEq),
      "status.oneOf": readOptionalStringArray(input.statusOneOf, "statusOneOf"),
      "startDate.gt": optionalString(input.startDateGt),
      "startDate.ge": optionalString(input.startDateGe),
      "dueDate.lt": optionalString(input.dueDateLt),
      "customerId.eq": readOptionalPositiveInteger(input.customerIdEq, "customerIdEq"),
    }),
    phase: "execute",
  });
  const { data, pagination } = normalizeListEnvelope(payload, "Rocketlane projects");
  return {
    projects: data.map((item) => normalizeRecord(item, "Rocketlane project")),
    pagination: normalizeRecord(pagination, "Rocketlane project pagination"),
  };
}

async function getProject(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
  const payload = await requestRocketlaneJson({
    path: `/1.0/projects/${projectId}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      includeFields: readOptionalStringArray(input.includeFields, "includeFields"),
      includeAllFields: optionalBoolean(input.includeAllFields),
    }),
    phase: "execute",
  });
  return { project: normalizeRecord(payload, "Rocketlane project") };
}

async function listTasks(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestRocketlaneJson({
    path: "/1.0/tasks",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      pageSize: readOptionalPositiveInteger(input.pageSize, "pageSize"),
      pageToken: optionalString(input.pageToken),
      includeFields: readOptionalStringArray(input.includeFields, "includeFields"),
      includeAllFields: optionalBoolean(input.includeAllFields),
      sortBy: optionalString(input.sortBy),
      sortOrder: optionalString(input.sortOrder),
      match: optionalString(input.match),
      "taskName.eq": optionalString(input.taskNameEq),
      "taskName.cn": optionalString(input.taskNameContains),
      "task.status.eq": optionalString(input.taskStatusEq),
      "task.status.oneOf": readOptionalStringArray(input.taskStatusOneOf, "taskStatusOneOf"),
      "projectId.eq": readOptionalPositiveInteger(input.projectIdEq, "projectIdEq"),
      "startDate.gt": optionalString(input.startDateGt),
      "dueDate.lt": optionalString(input.dueDateLt),
      "atRisk.eq": optionalBoolean(input.atRiskEq),
    }),
    phase: "execute",
  });
  const { data, pagination } = normalizeListEnvelope(payload, "Rocketlane tasks");
  return {
    tasks: data.map((item) => normalizeRecord(item, "Rocketlane task")),
    pagination: normalizeRecord(pagination, "Rocketlane task pagination"),
  };
}

async function getTask(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const taskId = readRequiredPositiveInteger(input.taskId, "taskId");
  const payload = await requestRocketlaneJson({
    path: `/1.0/tasks/${taskId}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      includeFields: readOptionalStringArray(input.includeFields, "includeFields"),
      includeAllFields: optionalBoolean(input.includeAllFields),
    }),
    phase: "execute",
  });
  return { task: normalizeRecord(payload, "Rocketlane task") };
}

async function listUsers(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestRocketlaneJson({
    path: "/1.0/users",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      pageSize: readOptionalPositiveInteger(input.pageSize, "pageSize"),
      pageToken: optionalString(input.pageToken),
      includeFields: readOptionalStringArray(input.includeFields, "includeFields"),
      includeAllFields: optionalBoolean(input.includeAllFields),
      sortBy: optionalString(input.sortBy),
      sortOrder: optionalString(input.sortOrder),
      match: optionalString(input.match),
      "firstName.eq": optionalString(input.firstNameEq),
      "firstName.cn": optionalString(input.firstNameContains),
      "email.eq": optionalString(input.emailEq),
      "email.cn": optionalString(input.emailContains),
      "status.eq": readOptionalStringArray(input.statusEq, "statusEq"),
      "status.oneOf": readOptionalStringArray(input.statusOneOf, "statusOneOf"),
      "type.eq": readOptionalStringArray(input.typeEq, "typeEq"),
      "permissionId.eq": readOptionalPositiveInteger(input.permissionIdEq, "permissionIdEq"),
    }),
    phase: "execute",
  });
  const { data, pagination } = normalizeListEnvelope(payload, "Rocketlane users");
  return {
    users: data.map((item) => normalizeRecord(item, "Rocketlane user")),
    pagination: normalizeRecord(pagination, "Rocketlane user pagination"),
  };
}

async function getUser(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const userId = readRequiredPositiveInteger(input.userId, "userId");
  const payload = await requestRocketlaneJson({
    path: `/1.0/users/${userId}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      includeFields: readOptionalStringArray(input.includeFields, "includeFields"),
      includeAllFields: optionalBoolean(input.includeAllFields),
    }),
    phase: "execute",
  });
  return { user: normalizeRecord(payload, "Rocketlane user") };
}

async function requestRocketlaneJson(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  query?: Record<string, RocketlaneQueryValue | undefined>;
  phase: RocketlanePhase;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildRocketlaneUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    payload = await readRocketlaneJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Rocketlane request failed: ${error.message}` : "Rocketlane request failed",
    );
  }
  if (!response.ok) throw createRocketlaneError(response.status, payload, input.phase);
  return normalizeRecord(payload, "Rocketlane response");
}

function buildRocketlaneUrl(path: string, query?: Record<string, RocketlaneQueryValue | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${rocketlaneApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return url;
}

async function readRocketlaneJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Rocketlane returned invalid JSON");
  }
}

function normalizeListEnvelope(payload: Record<string, unknown>, label: string): RocketlaneListEnvelope {
  return {
    data: readRecordArray(payload.data, `${label} data`),
    pagination: normalizeRecord(payload.pagination, `${label} pagination`),
  };
}

function normalizeRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} is missing or invalid`);
  return record;
}

function readRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${label} must be an array`);
  return value.map((item, index) => normalizeRecord(item, `${label}[${index}]`));
}

function buildAccountLabel(user: Record<string, unknown> | undefined): string {
  if (user) {
    const fullName = [optionalString(user.firstName), optionalString(user.lastName)].filter(Boolean).join(" ");
    if (fullName) return fullName;
    const email = optionalString(user.email);
    if (email) return email;
  }
  return "Rocketlane API Key";
}

function readRocketlaneProviderAccountId(user: Record<string, unknown> | undefined): string | undefined {
  if (!user) return undefined;
  const email = optionalString(user.email);
  if (email) return email;
  const userId = readOptionalPositiveInteger(user.userId, "userId");
  return userId ? String(userId) : undefined;
}

function createRocketlaneError(status: number, payload: unknown, phase: RocketlanePhase): ProviderRequestError {
  const message = extractRocketlaneErrorMessage(payload) ?? `Rocketlane request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && (status === 401 || status === 403))
    return new ProviderRequestError(status, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : 400, message, payload);
}

function extractRocketlaneErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const direct = optionalString(record.errorMessage) ?? optionalString(record.message) ?? optionalString(record.error);
  if (direct) return direct;
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      const errorRecord = optionalRecord(item);
      const message =
        optionalString(errorRecord?.errorMessage) ??
        optionalString(errorRecord?.message) ??
        optionalString(errorRecord?.error);
      if (message) return message;
    }
  }
  return undefined;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = readOptionalPositiveInteger(value, fieldName);
  if (parsed === undefined) throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = optionalInteger(value);
  if (parsed === undefined) return undefined;
  if (parsed <= 0) throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = optionalInteger(value);
  if (parsed === undefined) return undefined;
  if (parsed < 0) throw new ProviderRequestError(502, `${fieldName} must be a non-negative integer`);
  return parsed;
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an array`);
  const normalized = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  if (normalized.length === 0) throw new ProviderRequestError(400, `${fieldName} must contain at least one value`);
  return normalized;
}
