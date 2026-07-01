import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FloatActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "float";
const floatApiBaseUrl = "https://api.float.com/v3";
const floatDefaultRequestTimeoutMs = 30_000;

type FloatActionContext = ApiKeyProviderContext;
type FloatActionHandler = (input: Record<string, unknown>, context: FloatActionContext) => Promise<unknown>;
type FloatPhase = "validate" | "execute";

interface FloatRequestInput {
  path: string;
  query: Record<string, string | undefined>;
  phase: FloatPhase;
}

interface FloatListResponse {
  payload: unknown[];
  pagination: FloatPagination;
}

interface FloatPagination {
  totalCount: number | null;
  pageCount: number | null;
  currentPage: number | null;
  perPage: number | null;
}

interface FloatAccount {
  accountId: number | null;
  name: string | null;
  email: string | null;
  accountType: number | null;
  access: number | null;
  active: number | null;
  peopleId: number | null;
  raw: Record<string, unknown>;
}

export const floatActionHandlers: Record<FloatActionName, FloatActionHandler> = {
  async list_accounts(input, context) {
    const response = await requestFloatJson(context, {
      path: "/accounts",
      query: buildCommonListQuery(input, {
        expand: optionalString(input.expand),
      }),
      phase: "execute",
    });

    return {
      pagination: response.pagination,
      accounts: normalizeObjectArray(response.payload).map(normalizeAccount),
    };
  },
  async list_people(input, context) {
    const response = await requestFloatJson(context, {
      path: "/people",
      query: buildCommonListQuery(input, {
        active: readOptionalQueryValue(input.active),
        department_id: readOptionalQueryValue(input.departmentId),
        email: optionalString(input.email),
        people_type_id: readOptionalQueryValue(input.peopleTypeId),
        employee_type: readOptionalQueryValue(input.employeeType),
        tag_name: optionalString(input.tagName),
        sort: optionalString(input.sort),
        modified_since: optionalString(input.modifiedSince),
        fields: readOptionalFields(input.fields),
        expand: optionalString(input.expand),
      }),
      phase: "execute",
    });

    return {
      pagination: response.pagination,
      people: normalizeObjectArray(response.payload).map(normalizePerson),
    };
  },
  async list_clients(input, context) {
    const response = await requestFloatJson(context, {
      path: "/clients",
      query: buildCommonListQuery(input, {}),
      phase: "execute",
    });

    return {
      pagination: response.pagination,
      clients: normalizeObjectArray(response.payload).map(normalizeClient),
    };
  },
  async list_projects(input, context) {
    const response = await requestFloatJson(context, {
      path: "/projects",
      query: buildCommonListQuery(input, {
        active: readOptionalQueryValue(input.active),
        client_id: readOptionalQueryValue(input.clientId),
        tag_name: optionalString(input.tagName),
        sort: optionalString(input.sort),
        modified_since: optionalString(input.modifiedSince),
        fields: readOptionalFields(input.fields),
      }),
      phase: "execute",
    });

    return {
      pagination: response.pagination,
      projects: normalizeObjectArray(response.payload).map(normalizeProject),
    };
  },
  async list_allocations(input, context) {
    const response = await requestFloatJson(context, {
      path: "/tasks",
      query: buildCommonListQuery(input, {
        client_id: readOptionalQueryValue(input.clientId),
        project_id: readOptionalQueryValue(input.projectId),
        phase_id: readOptionalQueryValue(input.phaseId),
        task_meta_id: readOptionalQueryValue(input.projectTaskId),
        people_id: readOptionalQueryValue(input.peopleId),
        start_date: optionalString(input.startDate),
        end_date: optionalString(input.endDate),
        billable: readOptionalQueryValue(input.billable),
        status: readOptionalQueryValue(input.status),
        tag_name: optionalString(input.tagName),
        modified_since: optionalString(input.modifiedSince),
        fields: readOptionalFields(input.fields),
        expand: optionalString(input.expand),
      }),
      phase: "execute",
    });

    return {
      pagination: response.pagination,
      allocations: normalizeObjectArray(response.payload).map(normalizeAllocation),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, floatActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await requestFloatJson(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: "/accounts",
        query: {
          "per-page": "1",
        },
        phase: "validate",
      },
    );

    const account = normalizeObjectArray(response.payload)[0];
    const normalizedAccount = account ? normalizeAccount(account) : undefined;
    const accountIdentity =
      normalizedAccount?.email ?? normalizedAccount?.name ?? normalizedAccount?.accountId?.toString();

    return {
      profile: {
        accountId: accountIdentity ?? "api_key",
        displayName: accountIdentity ? `Float ${accountIdentity}` : "Float API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: floatApiBaseUrl,
        validationEndpoint: "/accounts",
        accountId: normalizedAccount?.accountId,
        accountEmail: normalizedAccount?.email,
        accountName: normalizedAccount?.name,
        totalAccountCount: response.pagination.totalCount,
      }),
    };
  },
};

async function requestFloatJson(context: FloatActionContext, input: FloatRequestInput): Promise<FloatListResponse> {
  const timeoutSignal = AbortSignal.timeout(floatDefaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await context.fetcher(buildFloatUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readFloatPayload(response);

    if (!response.ok) {
      throw buildFloatError(response.status, payload, input.phase);
    }

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Float returned an invalid payload", payload);
    }

    return {
      payload,
      pagination: readPagination(response.headers),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "Float request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Float request failed: ${error.message}` : "Float request failed",
      error,
    );
  }
}

function buildFloatUrl(path: string, query: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${floatApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildCommonListQuery(
  input: Record<string, unknown>,
  extraQuery: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return compactObject({
    page: readOptionalQueryValue(input.page),
    "per-page": readOptionalQueryValue(input.perPage),
    ...extraQuery,
  });
}

async function readFloatPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Float returned invalid JSON");
  }
}

function buildFloatError(status: number, payload: unknown, phase: FloatPhase): ProviderRequestError {
  const message = extractFloatErrorMessage(payload) ?? `Float request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractFloatErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  const errors = record.errors;
  return Array.isArray(errors) ? errors.map((error) => optionalString(error)).find(Boolean) : undefined;
}

function readPagination(headers: Headers): FloatPagination {
  return {
    totalCount: readIntegerHeader(headers, "x-pagination-total-count"),
    pageCount: readIntegerHeader(headers, "x-pagination-page-count"),
    currentPage: readIntegerHeader(headers, "x-pagination-current-page"),
    perPage: readIntegerHeader(headers, "x-pagination-per-page"),
  };
}

function readIntegerHeader(headers: Headers, name: string): number | null {
  const rawValue = headers.get(name);
  if (!rawValue) {
    return null;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) ? value : null;
}

function normalizeObjectArray(payload: unknown[]): Array<Record<string, unknown>> {
  return payload.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function normalizeAccount(record: Record<string, unknown>): FloatAccount {
  return {
    accountId: readOptionalInteger(record.account_id),
    name: optionalString(record.name) ?? null,
    email: optionalString(record.email) ?? null,
    accountType: readOptionalInteger(record.account_type),
    access: readOptionalInteger(record.access),
    active: readOptionalInteger(record.active),
    peopleId: readOptionalInteger(record.people_id),
    raw: record,
  };
}

function normalizePerson(record: Record<string, unknown>): Record<string, unknown> {
  const department = optionalRecord(record.department);
  return {
    peopleId: readOptionalInteger(record.people_id),
    name: optionalString(record.name) ?? null,
    email: optionalString(record.email) ?? null,
    jobTitle: optionalString(record.job_title) ?? null,
    departmentName: optionalString(department?.name) ?? null,
    active: readOptionalInteger(record.active),
    startDate: optionalString(record.start_date) ?? null,
    endDate: optionalString(record.end_date) ?? null,
    raw: record,
  };
}

function normalizeClient(record: Record<string, unknown>): Record<string, unknown> {
  return {
    clientId: readOptionalInteger(record.client_id),
    name: optionalString(record.name) ?? null,
    raw: record,
  };
}

function normalizeProject(record: Record<string, unknown>): Record<string, unknown> {
  return {
    projectId: readOptionalInteger(record.project_id),
    name: optionalString(record.name) ?? null,
    projectCode: optionalString(record.project_code) ?? null,
    clientId: readOptionalInteger(record.client_id),
    status: readOptionalInteger(record.status),
    active: readOptionalInteger(record.active),
    startDate: optionalString(record.start_date) ?? null,
    endDate: optionalString(record.end_date) ?? null,
    raw: record,
  };
}

function normalizeAllocation(record: Record<string, unknown>): Record<string, unknown> {
  return {
    taskId: readOptionalInteger(record.task_id),
    projectId: readOptionalInteger(record.project_id),
    peopleId: readOptionalInteger(record.people_id),
    startDate: optionalString(record.start_date) ?? null,
    endDate: optionalString(record.end_date) ?? null,
    hours: readOptionalNumber(record.hours),
    status: readOptionalInteger(record.status),
    billable: readOptionalInteger(record.billable),
    name: optionalString(record.name) ?? optionalString(record.note) ?? optionalString(record.task_name) ?? null,
    raw: record,
  };
}

function readOptionalFields(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const fields = value.flatMap((field) => {
    const text = optionalString(field);
    return text ? [text] : [];
  });
  return fields.length > 0 ? fields.join(",") : undefined;
}

function readOptionalQueryValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return optionalString(value);
}

function readOptionalInteger(value: unknown): number | null {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return optionalInteger(value) ?? null;
}

function readOptionalNumber(value: unknown): number | null {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return optionalNumber(value) ?? null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
