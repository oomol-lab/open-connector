import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "leiga";
const leigaApiBaseUrl = "https://app.leiga.com/openapi/api";

type LeigaPhase = "validate" | "execute";
type LeigaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface LeigaRequestInput {
  path: string;
  method: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase: LeigaPhase;
}

export const leigaActionHandlers: ProviderActionHandlers<"leiga", LeigaActionHandler> = {
  async list_projects(input, context) {
    const payload = await requestLeigaJson({
      context,
      path: "/project/list",
      method: "GET",
      query: compactObject({
        id: readOptionalNumberString(input.id),
        pname: optionalString(input.pname),
        pkey: optionalString(input.pkey),
        archived: readOptionalNumberString(input.archived),
      }),
      phase: "execute",
    });

    const projects = normalizeProjectList(payload.data);
    return {
      projects,
      total: projects.length,
      raw: payload,
    };
  },
  async get_project(input, context) {
    const payload = await requestLeigaJson({
      context,
      path: "/project/info",
      method: "GET",
      query: {
        projectId: readRequiredNumberString(input.projectId, "projectId"),
      },
      phase: "execute",
    });

    return {
      project: normalizeProject(payload.data),
    };
  },
  async get_project_by_key(input, context) {
    const payload = await requestLeigaJson({
      context,
      path: "/project/info-by-key",
      method: "GET",
      query: {
        projectKey: readRequiredString(input.projectKey, "projectKey"),
      },
      phase: "execute",
    });

    return {
      project: normalizeProject(payload.data),
    };
  },
  async list_issues(input, context) {
    const payload = await requestLeigaJson({
      context,
      path: "/issue/page",
      method: "POST",
      body: compactObject({
        projectId: readRequiredInteger(input.projectId, "projectId"),
        pageNumber: readRequiredInteger(input.pageNumber, "pageNumber"),
        pageSize: readRequiredInteger(input.pageSize, "pageSize"),
        summary: optionalString(input.summary),
        orderBy: optionalString(input.orderBy),
        sort: optionalString(input.sort),
        statusTypes: readOptionalIntegerArray(input.statusTypes),
        showedCustomFieldCodes: readOptionalStringArray(input.showedCustomFieldCodes),
      }),
      phase: "execute",
    });

    const data = requireLeigaRecord(payload.data, "issue list data");
    return {
      total: readInteger(data.total, "total"),
      issues: normalizeIssueList(data.list),
      raw: payload,
    };
  },
  async get_issue_by_number(input, context) {
    const payload = await requestLeigaJson({
      context,
      path: "/issue/detail-by-no",
      method: "GET",
      query: {
        issueNo: readRequiredString(input.issueNo, "issueNo"),
      },
      phase: "execute",
    });

    return {
      issue: normalizeIssue(payload.data),
    };
  },
  async get_issue_schema(input, context) {
    const payload = await requestLeigaJson({
      context,
      path: "/issue/schema",
      method: "GET",
      query: {
        projectId: readRequiredNumberString(input.projectId, "projectId"),
      },
      phase: "execute",
    });

    return {
      schema: normalizeIssueSchema(payload.data),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, leigaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLeigaCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

async function validateLeigaCredential(context: ApiKeyProviderContext): Promise<CredentialValidationResult> {
  const payload = await requestLeigaJson({
    context,
    path: "/project/list",
    method: "GET",
    phase: "validate",
  });

  const projects = normalizeProjectList(payload.data);
  const firstProject = projects[0];

  return {
    profile: {
      accountId: firstProject ? String(firstProject.id) : undefined,
      displayName: optionalString(firstProject?.pname) ?? optionalString(firstProject?.pkey) ?? "Leiga API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: leigaApiBaseUrl,
      validationEndpoint: "/project/list",
      firstProjectId: firstProject?.id,
      firstProjectKey: firstProject?.pkey ?? undefined,
      projectCount: projects.length,
    }),
  };
}

async function requestLeigaJson(
  input: LeigaRequestInput & { context: ApiKeyProviderContext },
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(buildLeigaUrl(input.path, input.query ?? {}), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        accessToken: input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readLeigaPayload(response);

    if (!response.ok) {
      throw createLeigaError(response.status, payload, input.phase);
    }

    const record = requireLeigaRecord(payload, "response");
    const code = optionalString(record.code) ?? asOptionalNumberString(record.code);
    if (code && code !== "0") {
      throw createLeigaError(normalizeLeigaErrorStatus(response.status, code), record, input.phase);
    }

    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Leiga request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Leiga request failed: ${error.message}` : "Leiga request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildLeigaUrl(path: string, query: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${leigaApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readLeigaPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Leiga returned invalid JSON");
  }
}

function createLeigaError(status: number, payload: unknown, phase: LeigaPhase): ProviderRequestError {
  const message = extractLeigaErrorMessage(payload) ?? `Leiga request failed with status ${status}`;

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

function normalizeLeigaErrorStatus(httpStatus: number, code: string): number {
  if (httpStatus >= 400) {
    return httpStatus;
  }

  const providerStatus = Number(code);
  return Number.isInteger(providerStatus) && providerStatus >= 400 ? providerStatus : 400;
}

function extractLeigaErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (record) {
    return optionalString(record.msg) ?? optionalString(record.message);
  }
  return typeof payload === "string" && payload.trim() ? payload.trim() : undefined;
}

function normalizeProjectList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => normalizeProject(item)) : [];
}

function normalizeProject(value: unknown): Record<string, unknown> {
  const record = requireLeigaRecord(value, "project");
  return {
    id: readInteger(record.id, "project id"),
    pname: optionalString(record.pname) ?? null,
    pkey: optionalString(record.pkey) ?? null,
    archived: readNullableInteger(record.archived),
    owner: optionalRecord(record.owner) ?? null,
    raw: record,
  };
}

function normalizeIssueList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => normalizeIssue(item)) : [];
}

function normalizeIssue(value: unknown): Record<string, unknown> {
  const record = requireLeigaRecord(value, "issue");
  return {
    id: readNullableInteger(record.id),
    issueId: readNullableInteger(record.issueId),
    issueNo: optionalString(record.issueNo) ?? null,
    summary: optionalString(record.summary) ?? null,
    description: optionalString(record.description) ?? null,
    statusName: optionalString(record.statusName) ?? null,
    projectId: readNullableInteger(record.projectId),
    raw: record,
  };
}

function normalizeIssueSchema(value: unknown): Record<string, unknown> {
  const record = requireLeigaRecord(value, "issue schema");
  const fieldsValue = Array.isArray(record.fields) ? record.fields : [];
  return {
    id: readNullableInteger(record.id),
    name: optionalString(record.name) ?? null,
    fields: fieldsValue.map((item) => normalizeIssueField(item)),
    raw: record,
  };
}

function normalizeIssueField(value: unknown): Record<string, unknown> {
  const record = requireLeigaRecord(value, "issue schema field");
  return {
    fieldId: readRequiredString(record.fieldId, "fieldId"),
    fieldName: readRequiredString(record.fieldName, "fieldName"),
    fieldType: readRequiredString(record.fieldType, "fieldType"),
    required: readBoolean(record.required, "required"),
    options: Array.isArray(record.options) ? record.options : null,
  };
}

function requireLeigaRecord(value: unknown, label: string): Record<string, unknown> {
  try {
    return requiredRecord(value, label, (message) => new ProviderRequestError(502, `invalid Leiga ${message}`));
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, `invalid Leiga ${label} response`);
  }
}

function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(502, `invalid Leiga ${fieldName} response`);
  }
  return normalized;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `invalid Leiga ${fieldName} response`);
  }
  return value;
}

function readInteger(value: unknown, fieldName: string): number {
  const normalized = optionalInteger(value);
  if (normalized === undefined) {
    throw new ProviderRequestError(502, `invalid Leiga ${fieldName} response`);
  }
  return normalized;
}

function readNullableInteger(value: unknown): number | null {
  return value == null ? null : readInteger(value, "integer");
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const normalized = optionalInteger(value);
  if (normalized === undefined || normalized <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return normalized;
}

function readOptionalIntegerArray(value: unknown): number[] | undefined {
  return Array.isArray(value) ? value.map((item) => readRequiredInteger(item, "statusTypes item")) : undefined;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.map((item) => readRequiredInputString(item, "showedCustomFieldCodes item"))
    : undefined;
}

function readOptionalNumberString(value: unknown): string | undefined {
  const normalized = optionalInteger(value);
  return normalized === undefined ? undefined : String(normalized);
}

function readRequiredNumberString(value: unknown, fieldName: string): string {
  return String(readRequiredInteger(value, fieldName));
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function asOptionalNumberString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}
