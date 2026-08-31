import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "knack";
const knackApiBaseUrl = "https://api.knack.com/v1";

type KnackRequestPhase = "validate" | "execute";
type KnackActionHandler = (input: Record<string, unknown>, context: KnackActionContext) => Promise<unknown>;

interface KnackActionContext {
  apiKey: string;
  appId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface KnackListPayload extends Record<string, unknown> {
  records?: unknown;
  current_page?: unknown;
  total_pages?: unknown;
  total_records?: unknown;
}

export const knackActionHandlers: ProviderActionHandlers<"knack", KnackActionHandler> = {
  list_records(input, context) {
    return listKnackRecords(input, context);
  },
  get_record(input, context) {
    return getKnackRecord(input, context);
  },
  create_record(input, context) {
    return createKnackRecord(input, context);
  },
  update_record(input, context) {
    return updateKnackRecord(input, context);
  },
  delete_record(input, context) {
    return deleteKnackRecord(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<KnackActionContext>({
  service,
  handlers: knackActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KnackActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      appId: readKnackAppId(credential.values.appId ?? credential.metadata.appId, "credential appId"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: knackApiBaseUrl,
  auth: { type: "api_key_header", name: "x-knack-rest-api-key" },
  customizeRequest({ headers, credential }) {
    const apiCredential = credential as Extract<ResolvedCredential, { authType: "api_key" }>;
    headers.set(
      "x-knack-application-id",
      readKnackAppId(apiCredential.values.appId ?? apiCredential.metadata.appId, "credential appId"),
    );
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    return validateKnackCredential(input.apiKey, input.values);
  },
};

async function validateKnackCredential(
  apiKey: string,
  values: Record<string, string>,
): Promise<CredentialValidationResult> {
  const normalizedApiKey = optionalString(apiKey);
  if (!normalizedApiKey) {
    throw new ProviderRequestError(400, "knack apiKey is required");
  }
  const appId = readKnackAppId(values.appId, "appId");

  return {
    profile: {
      accountId: appId,
      displayName: `Knack ${appId}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: knackApiBaseUrl,
      appId,
      validationMode: "format_only",
    }),
  };
}

async function listKnackRecords(input: Record<string, unknown>, context: KnackActionContext): Promise<unknown> {
  const url = buildKnackRecordsUrl(requireKnackObjectKey(input));
  const page = optionalInteger(input.page);
  const rowsPerPage = optionalInteger(input.rowsPerPage);
  const format = optionalString(input.format);
  const sortField = optionalString(input.sortField);
  const sortOrder = optionalString(input.sortOrder);
  const filters = optionalRecord(input.filters);

  if (page !== undefined) {
    url.searchParams.set("page", String(page));
  }
  if (rowsPerPage !== undefined) {
    url.searchParams.set("rows_per_page", String(rowsPerPage));
  }
  if (format) {
    url.searchParams.set("format", format);
  }
  if (sortField) {
    url.searchParams.set("sort_field", sortField);
  }
  if (sortOrder) {
    url.searchParams.set("sort_order", sortOrder);
  }
  if (filters) {
    url.searchParams.set("filters", JSON.stringify(filters));
  }

  const envelope = requiredRecord(
    await knackRequest(url, { method: "GET" }, context, "execute"),
    "Knack list response",
    responseError,
  ) as KnackListPayload;
  const recordsValue = envelope.records;
  if (!Array.isArray(recordsValue)) {
    throw new ProviderRequestError(502, "Knack list response is missing records");
  }

  return {
    records: recordsValue.map((record) => requiredRecord(record, "record", responseError)),
    currentPage: optionalInteger(envelope.current_page) ?? null,
    totalPages: optionalInteger(envelope.total_pages) ?? null,
    totalRecords: optionalInteger(envelope.total_records) ?? null,
    raw: envelope,
  };
}

async function getKnackRecord(input: Record<string, unknown>, context: KnackActionContext): Promise<unknown> {
  const url = buildKnackRecordUrl(requireKnackObjectKey(input), requireKnackRecordId(input));
  const format = optionalString(input.format);
  if (format) {
    url.searchParams.set("format", format);
  }

  return {
    record: requiredRecord(
      await knackRequest(url, { method: "GET" }, context, "execute"),
      "Knack record response",
      responseError,
    ),
  };
}

async function createKnackRecord(input: Record<string, unknown>, context: KnackActionContext): Promise<unknown> {
  const url = buildKnackRecordsUrl(requireKnackObjectKey(input));
  const format = optionalString(input.format);
  if (format) {
    url.searchParams.set("format", format);
  }

  const payload = await knackRequest(
    url,
    {
      method: "POST",
      body: JSON.stringify(requiredRecord(input.record, "record", providerInputError)),
    },
    context,
    "execute",
  );
  return {
    record: requiredRecord(payload, "Knack create response", responseError),
  };
}

async function updateKnackRecord(input: Record<string, unknown>, context: KnackActionContext): Promise<unknown> {
  const url = buildKnackRecordUrl(requireKnackObjectKey(input), requireKnackRecordId(input));
  const format = optionalString(input.format);
  if (format) {
    url.searchParams.set("format", format);
  }

  const payload = await knackRequest(
    url,
    {
      method: "PUT",
      body: JSON.stringify(requiredRecord(input.record, "record", providerInputError)),
    },
    context,
    "execute",
  );
  return {
    record: requiredRecord(payload, "Knack update response", responseError),
  };
}

async function deleteKnackRecord(input: Record<string, unknown>, context: KnackActionContext): Promise<unknown> {
  const recordId = requireKnackRecordId(input);
  const payload = await knackRequest(
    buildKnackRecordUrl(requireKnackObjectKey(input), recordId),
    {
      method: "DELETE",
    },
    context,
    "execute",
  );

  return {
    deleted: true,
    recordId,
    raw: optionalRecord(payload) ?? null,
  };
}

async function knackRequest(
  url: URL,
  init: RequestInit,
  context: KnackActionContext,
  phase: KnackRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(url, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
        "X-Knack-Application-Id": context.appId,
        "X-Knack-REST-API-Key": context.apiKey,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Knack request failed");
  }

  const payload = await readKnackPayload(response);
  if (!response.ok) {
    throw normalizeKnackError(response.status, payload, phase);
  }

  return payload;
}

async function readKnackPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeKnackError(status: number, payload: unknown, phase: KnackRequestPhase): ProviderRequestError {
  const message = readKnackErrorMessage(payload) ?? `Knack request failed with status ${status}`;
  if (phase === "validate" || status === 400 || status === 401 || status === 403 || status === 404) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function readKnackErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
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
  if (!Array.isArray(errors)) {
    return undefined;
  }

  const messages = errors
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      const child = optionalRecord(item);
      return child ? (optionalString(child.message) ?? optionalString(child.reason) ?? undefined) : undefined;
    })
    .filter((item): item is string => Boolean(item));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function buildKnackRecordsUrl(objectKey: string): URL {
  return new URL(`objects/${encodeURIComponent(objectKey)}/records`, `${knackApiBaseUrl}/`);
}

function buildKnackRecordUrl(objectKey: string, recordId: string): URL {
  return new URL(
    `objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(recordId)}`,
    `${knackApiBaseUrl}/`,
  );
}

function readKnackAppId(value: unknown, fieldName: string): string {
  const appId = optionalString(value)?.trim();
  if (!appId) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return appId;
}

function requireKnackObjectKey(input: Record<string, unknown>): string {
  const objectKey = optionalString(input.objectKey)?.trim();
  if (!objectKey) {
    throw new ProviderRequestError(400, "objectKey is required");
  }
  return objectKey;
}

function requireKnackRecordId(input: Record<string, unknown>): string {
  const recordId = optionalString(input.recordId)?.trim();
  if (!recordId) {
    throw new ProviderRequestError(400, "recordId is required");
  }
  return recordId;
}

function responseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Knack response ${message}`);
}
