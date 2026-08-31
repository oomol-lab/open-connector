import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "safetyculture";
const safetycultureApiBaseUrl = "https://api.safetyculture.io";
const safetycultureCredentialHelpUrl = "https://developer.safetyculture.com/reference/authentication";
const validationPath = "/audits/search";

type SafetycultureRequestPhase = "validate" | "execute";
type SafetycultureQueryValue = string | number | boolean | readonly string[] | undefined;
type SafetycultureActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const safetycultureActionHandlers: ProviderActionHandlers<"safetyculture", SafetycultureActionHandler> = {
  search_inspections(input, context) {
    return searchInspections(input, context);
  },
  get_inspection(input, context) {
    return getInspection(input, context);
  },
  list_actions(input, context) {
    return listActions(input, context);
  },
  get_action(input, context) {
    return getAction(input, context);
  },
  create_action(input, context) {
    return createAction(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, safetycultureActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const payload = await requestSafetycultureJson({
      path: validationPath,
      query: { field: "audit_id", limit: 1 },
      apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const record = requireObjectPayload(payload, "SafetyCulture validation response");
    const count = readOptionalNumber(record.count);
    const total = readOptionalNumber(record.total);

    return {
      profile: {
        accountId: `safetyculture:${hashToken(apiKey)}`,
        displayName: "SafetyCulture API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: safetycultureApiBaseUrl,
        validationEndpoint: validationPath,
        credentialHelpUrl: safetycultureCredentialHelpUrl,
        validationCount: count,
        validationTotal: total,
      }),
    };
  },
};

async function searchInspections(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestSafetycultureJson({
    path: "/audits/search",
    query: compactObject({
      field: readOptionalStringArray(input.fields, "fields"),
      order: optionalString(input.order),
      modified_after: optionalString(input.modifiedAfter),
      modified_before: optionalString(input.modifiedBefore),
      template: readOptionalStringArray(input.templateIds, "templateIds"),
      archived: optionalString(input.archived),
      completed: optionalString(input.completed),
      owner: optionalString(input.owner),
      limit: optionalInteger(input.limit),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return normalizeInspectionSearchPayload(payload);
}

async function getInspection(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const inspectionId = requiredInputString(input.inspectionId, "inspectionId");
  const payload = await requestSafetycultureJson({
    path: `/inspections/v1/inspections/${encodeURIComponent(inspectionId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const raw = requireObjectPayload(payload, "SafetyCulture inspection response");
  return { inspection: optionalRecord(raw.inspection) ?? raw, raw };
}

async function listActions(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const body = compactObject({
    page_size: optionalInteger(input.pageSize),
    page_token: optionalString(input.pageToken),
    inspection_id: optionalString(input.inspectionId),
    offset: optionalInteger(input.offset),
    sort_field: optionalString(input.sortField),
    sort_direction: optionalString(input.sortDirection),
    without_count: optionalBoolean(input.withoutCount),
    task_filters: readOptionalObjectArray(input.taskFilters, "taskFilters"),
  });
  const payload = await requestSafetycultureJson({
    path: "/tasks/v1/actions/list",
    method: "POST",
    body,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const raw = requireObjectPayload(payload, "SafetyCulture actions response");
  return {
    actions: readArray(raw.actions),
    nextPageToken: optionalString(raw.next_page_token) ?? "",
    total: readOptionalNumber(raw.total) ?? 0,
    raw,
  };
}

async function getAction(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const actionId = requiredInputString(input.actionId, "actionId");
  const payload = await requestSafetycultureJson({
    path: `/tasks/v1/actions/${encodeURIComponent(actionId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const raw = requireObjectPayload(payload, "SafetyCulture action response");
  const action = optionalRecord(raw.action);
  if (!action) throw new ProviderRequestError(502, "SafetyCulture action response is missing action");
  return compactObject({ action, readOnly: optionalBoolean(raw.read_only), raw });
}

async function createAction(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestSafetycultureJson({
    path: "/tasks/v1/actions",
    method: "POST",
    body: compactObject({
      task_id: optionalString(input.taskId),
      title: requiredInputString(input.title, "title"),
      description: optionalString(input.description),
      collaborators: readOptionalObjectArray(input.collaborators, "collaborators"),
      priority_id: optionalString(input.priorityId),
      status_id: optionalString(input.statusId),
      created_at: optionalString(input.createdAt),
      due_at: optionalString(input.dueAt),
      inspection_id: optionalString(input.inspectionId),
      inspection_item_id: optionalString(input.inspectionItemId),
      template_id: optionalString(input.templateId),
      site_id: optionalString(input.siteId),
      references: readOptionalObjectArray(input.references, "references"),
      asset_id: optionalString(input.assetId),
      label_ids: readOptionalStringArray(input.labelIds, "labelIds"),
      type: optionalRecord(input.type),
      field_values: readOptionalObjectArray(input.fieldValues, "fieldValues"),
      template_ids: readOptionalStringArray(input.templateIds, "templateIds"),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const raw = requireObjectPayload(payload, "SafetyCulture create action response");
  return { actionId: requiredInputString(raw.action_id, "action_id"), raw };
}

async function requestSafetycultureJson(input: {
  path: string;
  method?: string;
  query?: Record<string, SafetycultureQueryValue>;
  body?: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: SafetycultureRequestPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(safetycultureUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: safetycultureHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readSafetyculturePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `safetyculture request failed: ${error.message}` : "safetyculture request failed",
    );
  }

  if (!response.ok) throw createSafetycultureError(response, payload, input.phase, input.notFoundAsInvalidInput);
  return payload;
}

function safetycultureUrl(path: string, query?: Record<string, SafetycultureQueryValue>): URL {
  const url = new URL(path, safetycultureApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function safetycultureHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function readSafetyculturePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSafetycultureError(
  response: Response,
  payload: unknown,
  phase: SafetycultureRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractSafetycultureErrorMessage(payload) ?? response.statusText ?? "safetyculture request failed";
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && [400, 401, 403, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (
    phase === "execute" &&
    (response.status === 400 || response.status === 422 || (response.status === 404 && notFoundAsInvalidInput))
  ) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractSafetycultureErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) return message;
  const nestedError = optionalRecord(record.error);
  return optionalString(nestedError?.message);
}

function normalizeInspectionSearchPayload(payload: unknown): Record<string, unknown> {
  const raw = requireObjectPayload(payload, "SafetyCulture inspection search response");
  return {
    count: readOptionalNumber(raw.count) ?? 0,
    total: readOptionalNumber(raw.total) ?? 0,
    inspections: readArray(raw.audits),
    raw,
  };
}

function requireObjectPayload(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${context} must be a JSON object`);
  return record;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProviderRequestError(400, `${fieldName} must be a string array`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function readOptionalObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an object array`);
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) throw new ProviderRequestError(400, `${fieldName} must be an object array`);
    return record;
  });
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function hashToken(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}
