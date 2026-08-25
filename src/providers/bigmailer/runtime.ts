import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const bigmailerApiBaseUrl: string = "https://api.bigmailer.io";

const bigmailerDefaultRequestTimeoutMs = 30_000;
const bigmailerValidationEndpoint = "/v1/brands";

type BigmailerRequestPhase = "validate" | "execute";

interface BigmailerRuntimeContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type BigmailerActionHandler = (input: Record<string, unknown>, context: BigmailerRuntimeContext) => Promise<unknown>;

export const bigmailerActionHandlers: ProviderActionHandlers<"bigmailer", BigmailerActionHandler> = {
  list_brands: listBrands,
  get_brand: getBrand,
  list_lists: listLists,
  create_list: createList,
  get_list: getList,
  update_list: updateList,
  delete_list: deleteList,
  list_contacts: listContacts,
  create_contact: createContact,
  get_contact: getContact,
  update_contact: updateContact,
  upsert_contact: upsertContact,
  delete_contact: deleteContact,
};

export async function validateBigmailerCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBigmailerJson({
    apiKey,
    fetcher,
    signal,
    method: "GET",
    path: bigmailerValidationEndpoint,
    query: { limit: "1" },
    phase: "validate",
  });
  const response = optionalRecord(payload);
  const firstBrand = normalizeObjectArray(response?.data)[0];

  return {
    profile: {
      accountId: optionalString(firstBrand?.id) ?? "bigmailer",
      displayName: optionalString(firstBrand?.name) ?? "BigMailer API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: bigmailerApiBaseUrl,
      validationEndpoint: bigmailerValidationEndpoint,
      firstBrandId: optionalString(firstBrand?.id),
      firstBrandName: optionalString(firstBrand?.name),
    }),
  };
}

async function listBrands(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const payload = await requestBigmailerJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "GET",
    path: "/v1/brands",
    query: paginationQuery(input),
    phase: "execute",
  });
  const response = optionalRecord(payload);
  return {
    page: normalizePage(response),
    brands: normalizeObjectArray(response?.data).map(normalizeBrand),
  };
}

async function getBrand(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  const payload = await requestBigmailerJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "GET",
    path: `/v1/brands/${encodeURIComponent(brandId)}`,
    phase: "execute",
  });
  return { brand: normalizeBrand(optionalRecord(payload)) };
}

async function listLists(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  const payload = await requestBigmailerJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "GET",
    path: `/v1/brands/${encodeURIComponent(brandId)}/lists`,
    query: paginationQuery(input),
    phase: "execute",
  });
  const response = optionalRecord(payload);
  return {
    page: normalizePage(response),
    lists: normalizeObjectArray(response?.data).map(normalizeList),
  };
}

async function createList(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  return idResult(
    await requestBigmailerJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: `/v1/brands/${encodeURIComponent(brandId)}/lists`,
      body: { name: readRequiredString(input.name, "name") },
      phase: "execute",
    }),
  );
}

async function getList(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  const listId = readRequiredString(input.listId, "listId");
  const payload = await requestBigmailerJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "GET",
    path: `/v1/brands/${encodeURIComponent(brandId)}/lists/${encodeURIComponent(listId)}`,
    phase: "execute",
  });
  return { list: normalizeList(optionalRecord(payload)) };
}

async function updateList(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  const listId = readRequiredString(input.listId, "listId");
  return idResult(
    await requestBigmailerJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: `/v1/brands/${encodeURIComponent(brandId)}/lists/${encodeURIComponent(listId)}`,
      body: { name: readRequiredString(input.name, "name") },
      phase: "execute",
    }),
  );
}

async function deleteList(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  const listId = readRequiredString(input.listId, "listId");
  return idResult(
    await requestBigmailerJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "DELETE",
      path: `/v1/brands/${encodeURIComponent(brandId)}/lists/${encodeURIComponent(listId)}`,
      phase: "execute",
    }),
  );
}

async function listContacts(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  const payload = await requestBigmailerJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "GET",
    path: `/v1/brands/${encodeURIComponent(brandId)}/contacts`,
    query: {
      ...paginationQuery(input),
      list_id: readOptionalString(input.listId),
    },
    phase: "execute",
  });
  const response = optionalRecord(payload);
  return {
    page: normalizePage(response),
    contacts: normalizeObjectArray(response?.data).map(normalizeContact),
  };
}

async function createContact(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  return idResult(
    await requestBigmailerJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: `/v1/brands/${encodeURIComponent(brandId)}/contacts`,
      query: contactValidateQuery(input),
      body: contactPayload(input, { requireEmail: true }),
      phase: "execute",
    }),
  );
}

async function getContact(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  const contactId = readRequiredString(input.contactId, "contactId");
  const payload = await requestBigmailerJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "GET",
    path: `/v1/brands/${encodeURIComponent(brandId)}/contacts/${encodeURIComponent(contactId)}`,
    phase: "execute",
  });
  return { contact: normalizeContact(optionalRecord(payload)) };
}

async function updateContact(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  const contactId = readRequiredString(input.contactId, "contactId");
  return idResult(
    await requestBigmailerJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: `/v1/brands/${encodeURIComponent(brandId)}/contacts/${encodeURIComponent(contactId)}`,
      query: compactObject({
        field_values_op: readOptionalString(input.fieldValuesOp),
        list_ids_op: readOptionalString(input.listIdsOp),
        unsubscribe_ids_op: readOptionalString(input.unsubscribeIdsOp),
      }),
      body: contactPayload(input, { requireEmail: false }),
      phase: "execute",
    }),
  );
}

async function upsertContact(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  return idResult(
    await requestBigmailerJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: `/v1/brands/${encodeURIComponent(brandId)}/contacts/upsert`,
      query: contactValidateQuery(input),
      body: contactPayload(input, { requireEmail: true }),
      phase: "execute",
    }),
  );
}

async function deleteContact(input: Record<string, unknown>, context: BigmailerRuntimeContext) {
  const brandId = readRequiredString(input.brandId, "brandId");
  const contactId = readRequiredString(input.contactId, "contactId");
  return idResult(
    await requestBigmailerJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "DELETE",
      path: `/v1/brands/${encodeURIComponent(brandId)}/contacts/${encodeURIComponent(contactId)}`,
      phase: "execute",
    }),
  );
}

async function requestBigmailerJson(input: {
  apiKey: string;
  fetcher: typeof fetch;
  method: "GET" | "POST" | "DELETE";
  path: string;
  phase: BigmailerRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.signal, bigmailerDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildBigmailerUrl(input.path, input.query), {
      method: input.method,
      headers: bigmailerHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readBigmailerPayload(response);
    if (!response.ok) {
      throw createBigmailerError(response.status, payload, input.phase);
    }

    const objectPayload = optionalRecord(payload);
    if (payload !== null && !objectPayload) {
      throw new ProviderRequestError(502, "BigMailer returned an invalid payload");
    }
    return objectPayload ?? {};
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "BigMailer request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BigMailer request failed: ${error.message}` : "BigMailer request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildBigmailerUrl(path: string, query: Record<string, string | number | boolean | undefined> = {}) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${bigmailerApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function bigmailerHeaders(apiKey: string, hasJsonBody: boolean) {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readBigmailerPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "BigMailer returned invalid JSON");
  }
}

function createBigmailerError(status: number, payload: unknown, phase: BigmailerRequestPhase) {
  const message = extractBigmailerErrorMessage(payload) ?? `BigMailer request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractBigmailerErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message);
  const code = optionalString(record.code);
  const param = optionalString(record.param);
  if (message && code && param) {
    return `${message} (${param}: ${code})`;
  }
  if (message && code) {
    return `${message} (${code})`;
  }
  return message ?? optionalString(record.type);
}

function paginationQuery(input: Record<string, unknown>) {
  return compactObject({
    limit: readOptionalIntegerString(input.limit),
    cursor: readOptionalString(input.cursor),
  });
}

function contactValidateQuery(input: Record<string, unknown>) {
  return compactObject({
    validate: typeof input.validate === "boolean" ? input.validate : undefined,
  });
}

function contactPayload(input: Record<string, unknown>, options: { requireEmail: boolean }) {
  return compactObject({
    email: options.requireEmail ? readRequiredString(input.email, "email") : readOptionalString(input.email),
    field_values: normalizeFieldValueInputArray(input.fieldValues),
    list_ids: normalizeStringArray(input.listIds),
    unsubscribe_all: typeof input.unsubscribeAll === "boolean" ? input.unsubscribeAll : undefined,
    unsubscribe_ids: normalizeStringArray(input.unsubscribeIds),
  });
}

function normalizeFieldValueInputArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => {
    const record = optionalRecord(item);
    const fieldValueCount = ["string", "integer", "date"].filter((field) => record?.[field] !== undefined).length;
    if (fieldValueCount !== 1) {
      throw new ProviderRequestError(400, "Exactly one of string, integer, or date must be provided.");
    }
    return compactObject({
      name: readRequiredString(record?.name, "fieldValues.name"),
      string: readOptionalString(record?.string),
      integer: optionalInteger(record?.integer),
      date: readOptionalString(record?.date),
    });
  });
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}

function normalizePage(response: Record<string, unknown> | undefined) {
  return {
    hasMore: nullableBoolean(response?.has_more),
    cursor: nullableString(response?.cursor),
    total: nullableInteger(response?.total),
  };
}

function normalizeBrand(record: Record<string, unknown> | undefined) {
  return {
    id: nullableString(record?.id),
    name: nullableString(record?.name),
    fromName: nullableString(record?.from_name),
    fromEmail: nullableString(record?.from_email),
    url: nullableString(record?.url),
    contactLimit: nullableInteger(record?.contact_limit),
    numContacts: nullableInteger(record?.num_contacts),
    created: nullableInteger(record?.created),
    engagement: nullableObject(record?.engagement),
    raw: record ?? {},
  };
}

function normalizeList(record: Record<string, unknown> | undefined) {
  return {
    id: nullableString(record?.id),
    name: nullableString(record?.name),
    all: nullableBoolean(record?.all),
    numContacts: nullableInteger(record?.num_contacts),
    created: nullableInteger(record?.created),
    engagement: nullableObject(record?.engagement),
    raw: record ?? {},
  };
}

function normalizeContact(record: Record<string, unknown> | undefined) {
  return {
    id: nullableString(record?.id),
    brandId: nullableString(record?.brand_id),
    email: nullableString(record?.email),
    fieldValues: normalizeLooseArray(record?.field_values),
    listIds: normalizeStringArray(record?.list_ids) ?? [],
    unsubscribeAll: nullableBoolean(record?.unsubscribe_all),
    unsubscribeIds: normalizeStringArray(record?.unsubscribe_ids) ?? [],
    numSoftBounces: nullableInteger(record?.num_soft_bounces),
    numHardBounces: nullableInteger(record?.num_hard_bounces),
    numComplaints: nullableInteger(record?.num_complaints),
    created: nullableInteger(record?.created),
    raw: record ?? {},
  };
}

function idResult(payload: unknown) {
  const response = optionalRecord(payload);
  return {
    id: nullableString(response?.id),
    raw: response ?? {},
  };
}

function normalizeObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

function normalizeLooseArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function nullableObject(value: unknown) {
  return optionalRecord(value) ?? null;
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function nullableInteger(value: unknown) {
  return Number.isInteger(value) ? (value as number) : null;
}

function nullableString(value: unknown) {
  return optionalString(value) ?? null;
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = readOptionalString(value);
  if (text === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readOptionalIntegerString(value: unknown) {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}
