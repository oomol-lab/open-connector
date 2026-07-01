import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FireberryActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalNumber, optionalRecord, requiredRecord, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const fireberryApiBaseUrl = "https://api.fireberry.com";
export const fireberryDefaultRequestTimeoutMs = 30_000;

type FireberryRequestPhase = "validate" | "execute";
type FireberryObjectName = "account" | "contact";
type FireberryActionContext = ApiKeyProviderContext;
type FireberryActionHandler = (input: Record<string, unknown>, context: FireberryActionContext) => Promise<unknown>;

export const fireberryActionHandlers: Record<FireberryActionName, FireberryActionHandler> = {
  async query_records(input, context) {
    const payload = await requestFireberryJson({
      path: "/api/v3/query",
      method: "POST",
      apiKey: context.apiKey,
      body: compactObject({
        objectType: input.objectType,
        fields: input.fields,
        filter: input.filter,
        orderBy: input.orderBy,
        groupBy: input.groupBy,
        pageNumber: input.pageNumber,
        pageSize: input.pageSize,
      }),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return {
      records: readQueryRecords(payload),
      raw: requireObjectPayload(payload),
    };
  },
  async list_accounts(input, context) {
    return listFireberryRecords("account", input, context);
  },
  async get_account(input, context) {
    return getFireberryRecord("account", input, context);
  },
  async create_account(input, context) {
    return mutateFireberryRecord("account", "POST", input, context);
  },
  async update_account(input, context) {
    return mutateFireberryRecord("account", "PUT", input, context);
  },
  async delete_account(input, context) {
    return deleteFireberryRecord("account", input, context);
  },
  async list_contacts(input, context) {
    return listFireberryRecords("contact", input, context);
  },
  async get_contact(input, context) {
    return getFireberryRecord("contact", input, context);
  },
  async create_contact(input, context) {
    return mutateFireberryRecord("contact", "POST", input, context);
  },
  async update_contact(input, context) {
    return mutateFireberryRecord("contact", "PUT", input, context);
  },
  async delete_contact(input, context) {
    return deleteFireberryRecord("contact", input, context);
  },
};

export async function validateFireberryApiKey(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestFireberryJson({
    path: "/api/record/account",
    method: "GET",
    apiKey,
    query: {
      pagesize: 1,
      pagenumber: 1,
    },
    phase: "validate",
    fetcher,
    signal,
  });
  const data = readOptionalObjectField(payload, "data");
  const totalRecords = optionalNumber(data?.Total_Records);

  return {
    profile: {
      accountId: `fireberry:${hashToken(apiKey)}`,
      displayName: "Fireberry API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: fireberryApiBaseUrl,
      validationEndpoint: "/api/record/account",
      totalAccountRecords: totalRecords,
    }),
  };
}

async function listFireberryRecords(
  objectName: FireberryObjectName,
  input: Record<string, unknown>,
  context: FireberryActionContext,
) {
  const payload = await requestFireberryJson({
    path: `/api/record/${objectName}`,
    method: "GET",
    apiKey: context.apiKey,
    query: compactObject({
      pagesize: input.pageSize,
      pagenumber: input.pageNumber,
    }),
    phase: "execute",
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const data = requireObjectField(payload, "data");

  return {
    primaryKey: readStringField(data, "PrimaryKey"),
    primaryField: readStringField(data, "PrimaryField"),
    totalRecords: readNumberField(data, "Total_Records"),
    pageSize: readNumberField(data, "Page_Size"),
    pageNumber: readNumberField(data, "Page_Number"),
    records: readObjectArrayField(data, "Records"),
    raw: requireObjectPayload(payload),
  };
}

async function getFireberryRecord(
  objectName: FireberryObjectName,
  input: Record<string, unknown>,
  context: FireberryActionContext,
) {
  const payload = await requestFireberryJson({
    path: `/api/record/${objectName}/${readRecordIdPathSegment(input.id)}`,
    method: "GET",
    apiKey: context.apiKey,
    phase: "execute",
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const data = requireObjectField(payload, "data");

  return {
    record: requireObjectField(data, "Record"),
    raw: requireObjectPayload(payload),
  };
}

async function mutateFireberryRecord(
  objectName: FireberryObjectName,
  method: "POST" | "PUT",
  input: Record<string, unknown>,
  context: FireberryActionContext,
) {
  const path =
    method === "POST" ? `/api/record/${objectName}` : `/api/record/${objectName}/${readRecordIdPathSegment(input.id)}`;
  const payload = await requestFireberryJson({
    path,
    method,
    apiKey: context.apiKey,
    body: readFields(input),
    phase: "execute",
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const data = readOptionalObjectField(payload, "data");

  return {
    success: readSuccess(payload),
    message: readMessage(payload),
    record:
      data?.Record && typeof data.Record === "object" && !Array.isArray(data.Record)
        ? (data.Record as Record<string, unknown>)
        : (data ?? {}),
    raw: requireObjectPayload(payload),
  };
}

async function deleteFireberryRecord(
  objectName: FireberryObjectName,
  input: Record<string, unknown>,
  context: FireberryActionContext,
) {
  const payload = await requestFireberryJson({
    path: `/api/record/${objectName}/${readRecordIdPathSegment(input.id)}`,
    method: "DELETE",
    apiKey: context.apiKey,
    phase: "execute",
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    success: readSuccess(payload),
    message: readMessage(payload),
    raw: requireObjectPayload(payload),
  };
}

async function requestFireberryJson(input: {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  apiKey: string;
  phase: FireberryRequestPhase;
  fetcher: typeof fetch;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(fireberryDefaultRequestTimeoutMs)])
    : AbortSignal.timeout(fireberryDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildFireberryUrl(input.path, input.query), {
      method: input.method,
      headers: fireberryHeaders(input.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readJsonPayload(response, {
      allowInvalidJson: !response.ok,
    });

    if (!response.ok) {
      throw mapFireberryError(response.status, payload, input.phase);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ProviderRequestError(502, "fireberry returned invalid JSON");
    }

    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "fireberry request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `fireberry request failed: ${error.message}` : "fireberry request failed",
    );
  }
}

function buildFireberryUrl(path: string, query?: Record<string, unknown>) {
  const url = new URL(path, fireberryApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function fireberryHeaders(apiKey: string, hasBody: boolean) {
  const headers = new Headers({
    tokenid: apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

function readFields(input: Record<string, unknown>) {
  return requiredRecord(input.fields, "fields", (message) => new ProviderRequestError(400, message));
}

function readQueryRecords(payload: Record<string, unknown>) {
  const data = payload.data;
  if (Array.isArray(data)) {
    return data.filter(isRecordObject);
  }
  if (isRecordObject(data)) {
    const records = data.Records ?? data.records;
    if (Array.isArray(records)) {
      return records.filter(isRecordObject);
    }
  }
  return [];
}

function readRequiredString(value: unknown, field: string) {
  return requiredString(value, field, (message) => new ProviderRequestError(400, message));
}

function readRecordIdPathSegment(value: unknown) {
  return encodeURIComponent(readRequiredString(value, "id"));
}

function readSuccess(payload: Record<string, unknown>) {
  return payload.success === true;
}

function readMessage(payload: Record<string, unknown>) {
  return typeof payload.message === "string" ? payload.message : "";
}

function requireObjectPayload(payload: unknown) {
  if (!isRecordObject(payload)) {
    throw new ProviderRequestError(502, "fireberry returned invalid JSON");
  }
  return payload;
}

function requireObjectField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (!isRecordObject(value)) {
    throw new ProviderRequestError(502, `fireberry response is missing ${field}`);
  }
  return value;
}

function readOptionalObjectField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  return optionalRecord(value);
}

function readStringField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `fireberry response is missing ${field}`);
  }
  return value;
}

function readNumberField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `fireberry response is missing ${field}`);
  }
  return value;
}

function readObjectArrayField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `fireberry response is missing ${field}`);
  }
  return value.filter(isRecordObject);
}

function mapFireberryError(status: number, payload: unknown, phase: FireberryRequestPhase) {
  const message = readErrorMessage(payload) ?? `fireberry request failed with ${status}`;

  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown) {
  if (!isRecordObject(payload)) {
    return undefined;
  }
  const message = payload.Message ?? payload.message;
  if (typeof message === "string" && message.trim()) {
    return message;
  }
  const error = payload.error;
  if (!isRecordObject(error)) {
    return undefined;
  }
  const errorMessage = error.Message ?? error.message;
  return typeof errorMessage === "string" && errorMessage.trim() ? errorMessage : undefined;
}

async function readJsonPayload(response: Response, options: { allowInvalidJson?: boolean } = {}) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (options.allowInvalidJson) {
      return undefined;
    }
    throw new ProviderRequestError(502, "fireberry returned invalid JSON");
  }
}

function hashToken(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
