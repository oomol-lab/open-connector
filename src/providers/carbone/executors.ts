import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "carbone";
const carboneApiBaseUrl = "https://api.carbone.io";
const carboneDefaultVersion = 5;
const carboneStatusPath = "/status";

type CarboneRequestPhase = "validate" | "execute";
type CarboneActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const carboneActionHandlers: ProviderActionHandlers<"carbone", CarboneActionHandler> = {
  list_templates(input, context) {
    return listTemplates(input, context);
  },
  list_template_categories(input, context) {
    return listStringCollection("/templates/categories", "categories", input, context);
  },
  list_template_tags(input, context) {
    return listStringCollection("/templates/tags", "tags", input, context);
  },
  update_template_metadata(input, context) {
    return updateTemplateMetadata(input, context);
  },
  delete_template(input, context) {
    return deleteTemplate(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, carboneActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await carboneGetJson(carboneStatusPath, {}, undefined, input.apiKey, fetcher, "validate", signal);
    const record = optionalRecord(payload);
    return {
      profile: {
        accountId: "carbone",
        displayName: "Carbone API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: carboneApiBaseUrl,
        validationEndpoint: carboneStatusPath,
        version: optionalString(record?.version),
        status: optionalString(record?.status),
      }),
    };
  },
};

async function listTemplates(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await carboneGetJson(
    "/templates",
    compactObject({
      id: readOptionalTrimmedString(input.id),
      versionId: readOptionalTrimmedString(input.versionId),
      category: readOptionalTrimmedString(input.category),
      search: readOptionalTrimmedString(input.search),
      includeVersions: optionalBoolean(input.includeVersions),
      cursor: readOptionalTrimmedString(input.cursor),
      limit: readOptionalNumber(input.limit),
    }),
    readOptionalNumber(input.carboneVersion),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  const record = optionalRecord(payload) ?? {};
  return {
    templates: extractObjectArray(record.templates ?? record.data ?? record.results),
    pagination: normalizePagination(record),
    raw: record,
  };
}

async function listStringCollection(
  path: string,
  fieldName: "categories" | "tags",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) {
  const payload = await carboneGetJson(
    path,
    {},
    readOptionalNumber(input.carboneVersion),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  const record = optionalRecord(payload) ?? {};
  return {
    [fieldName]: extractStringArray(record[fieldName] ?? record.data ?? record.results),
    raw: record,
  };
}

async function updateTemplateMetadata(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const templateIdOrVersionId = readRequiredString(input.templateIdOrVersionId, "templateIdOrVersionId");
  const metadata = optionalRecord(input.metadata) ?? {};
  const payload = await carboneRequestJson(
    `/template/${encodeURIComponent(templateIdOrVersionId)}`,
    "PATCH",
    readOptionalNumber(input.carboneVersion),
    metadata,
    context.apiKey,
    context.fetcher,
    context.signal,
  );
  const record = optionalRecord(payload) ?? {};
  return {
    success: readSuccess(record),
    template: optionalRecord(record.template ?? record.data) ?? null,
    raw: record,
  };
}

async function deleteTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const templateIdOrVersionId = readRequiredString(input.templateIdOrVersionId, "templateIdOrVersionId");
  const payload = await carboneRequestJson(
    `/template/${encodeURIComponent(templateIdOrVersionId)}`,
    "DELETE",
    readOptionalNumber(input.carboneVersion),
    undefined,
    context.apiKey,
    context.fetcher,
    context.signal,
  );
  const record = optionalRecord(payload) ?? {};
  return {
    success: readSuccess(record),
    raw: record,
  };
}

async function carboneGetJson(
  path: string,
  query: Record<string, unknown>,
  carboneVersion: number | undefined,
  apiKey: string,
  fetcher: typeof fetch,
  phase: CarboneRequestPhase,
  signal?: AbortSignal,
) {
  const response = await fetcher(carboneUrl(path, query), {
    method: "GET",
    headers: carboneHeaders(apiKey, carboneVersion, { accept: "application/json" }),
    signal,
  });
  const payload = await readPayload(response);
  if (!response.ok) throw createError(response.status, payload, phase);
  return payload;
}

async function carboneRequestJson(
  path: string,
  method: "PATCH" | "DELETE",
  carboneVersion: number | undefined,
  body: Record<string, unknown> | undefined,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const response = await fetcher(carboneUrl(path, {}), {
    method,
    headers: carboneHeaders(apiKey, carboneVersion, {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const payload = await readPayload(response);
  if (!response.ok) throw createError(response.status, payload, "execute");
  return payload;
}

function carboneUrl(path: string, query: Record<string, unknown>) {
  const url = new URL(path, carboneApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

function carboneHeaders(apiKey: string, carboneVersion: number | undefined, extraHeaders: Record<string, string>) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "carbone-version": String(carboneVersion ?? carboneDefaultVersion),
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createError(status: number, payload: unknown, phase: CarboneRequestPhase) {
  const message = extractErrorMessage(payload) ?? "carbone request failed";
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (status === 401 || status === 403))
    return new ProviderRequestError(400, message, payload);
  if (status === 401 || status === 403) return new ProviderRequestError(status, message, payload);
  if ([400, 404, 422].includes(status)) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.detail) ??
    optionalString(record?.title) ??
    optionalString(data?.message) ??
    optionalString(data?.error) ??
    optionalString(data?.detail) ??
    optionalString(data?.title)
  );
}

function extractObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)))
    : [];
}

function extractStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizePagination(record: Record<string, unknown>) {
  const pagination = optionalRecord(record.pagination) ?? {};
  return {
    cursor: readOptionalTrimmedString(pagination.cursor ?? record.cursor) ?? null,
    nextCursor: readOptionalTrimmedString(pagination.nextCursor ?? record.nextCursor) ?? null,
    limit: readOptionalNumber(pagination.limit ?? record.limit) ?? null,
  };
}

function readSuccess(record: Record<string, unknown>) {
  return optionalBoolean(record.success) ?? true;
}

function readRequiredString(value: unknown, fieldName: string) {
  const resolved = readOptionalTrimmedString(value);
  if (!resolved) throw new ProviderRequestError(400, `${fieldName} is required`);
  return resolved;
}

function readOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
