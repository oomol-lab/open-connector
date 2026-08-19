import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  nullableInteger,
  nullableString,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const kommoCredentialHelpUrl = "https://developers.kommo.com/docs/long-lived-token";
const kommoPrivateIntegrationHelpUrl = "https://developers.kommo.com/docs/private-integration";
const kommoHostSuffix = ".kommo.com";
const kommoValidationEndpoint = "/api/v4/account";
const kommoDefaultRequestTimeoutMs = 30_000;

type KommoPhase = "validate" | "execute";
type KommoCollection = "leads" | "contacts" | "companies" | "tasks" | "users" | "pipelines";
type KommoEntity = "lead" | "contact" | "company" | "task" | "user" | "pipeline";
type QueryValue = string | number | boolean | readonly (string | number | boolean)[];
type KommoActionHandler = (input: Record<string, unknown>, context: KommoActionContext) => Promise<unknown>;

interface KommoRequestInput {
  apiBaseUrl: string;
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: KommoPhase;
  query?: Record<string, QueryValue | undefined>;
}

export interface KommoActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const kommoActionHandlers: ProviderActionHandlers<"kommo", KommoActionHandler> = {
  async get_account(input, context) {
    const raw = await requestKommoJson({
      apiBaseUrl: context.apiBaseUrl,
      apiKey: context.apiKey,
      path: kommoValidationEndpoint,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: buildQuery(input, ["with"]),
    });

    return {
      account: normalizeAccount(raw),
      raw: requireRecord(raw, "Kommo account response"),
    };
  },
  list_leads(input, context) {
    return listRecords({
      input,
      context,
      path: "/api/v4/leads",
      collection: "leads",
      normalizer: normalizeLead,
      query: buildCrmEntityListQuery(input, "lead"),
    });
  },
  get_lead(input, context) {
    return getRecord({
      input,
      context,
      path: `/api/v4/leads/${readRequiredId(input.id, "id")}`,
      entity: "lead",
      normalizer: normalizeLead,
      query: buildQuery(input, ["with"]),
    });
  },
  list_contacts(input, context) {
    return listRecords({
      input,
      context,
      path: "/api/v4/contacts",
      collection: "contacts",
      normalizer: normalizeContact,
      query: buildCrmEntityListQuery(input, "contact"),
    });
  },
  get_contact(input, context) {
    return getRecord({
      input,
      context,
      path: `/api/v4/contacts/${readRequiredId(input.id, "id")}`,
      entity: "contact",
      normalizer: normalizeContact,
      query: buildQuery(input, ["with"]),
    });
  },
  list_companies(input, context) {
    return listRecords({
      input,
      context,
      path: "/api/v4/companies",
      collection: "companies",
      normalizer: normalizeCompany,
      query: buildCrmEntityListQuery(input, "company"),
    });
  },
  get_company(input, context) {
    return getRecord({
      input,
      context,
      path: `/api/v4/companies/${readRequiredId(input.id, "id")}`,
      entity: "company",
      normalizer: normalizeCompany,
      query: buildQuery(input, ["with"]),
    });
  },
  list_tasks(input, context) {
    return listRecords({
      input,
      context,
      path: "/api/v4/tasks",
      collection: "tasks",
      normalizer: normalizeTask,
      query: buildTaskListQuery(input),
    });
  },
  get_task(input, context) {
    return getRecord({
      input,
      context,
      path: `/api/v4/tasks/${readRequiredId(input.id, "id")}`,
      entity: "task",
      normalizer: normalizeTask,
    });
  },
  list_users(input, context) {
    return listRecords({
      input,
      context,
      path: "/api/v4/users",
      collection: "users",
      normalizer: normalizeUser,
      query: buildQuery(input, ["with", "page", "limit"]),
    });
  },
  get_user(input, context) {
    return getRecord({
      input,
      context,
      path: `/api/v4/users/${readRequiredId(input.id, "id")}`,
      entity: "user",
      normalizer: normalizeUser,
      query: buildQuery(input, ["with"]),
    });
  },
  list_pipelines(input, context) {
    return listRecords({
      input,
      context,
      path: "/api/v4/leads/pipelines",
      collection: "pipelines",
      normalizer: normalizePipeline,
    });
  },
  get_pipeline(input, context) {
    return getRecord({
      input,
      context,
      path: `/api/v4/leads/pipelines/${readRequiredId(input.id, "id")}`,
      entity: "pipeline",
      normalizer: normalizePipeline,
    });
  },
};

export async function validateKommoCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const subdomain = readKommoSubdomain(input.values.subdomain);
  const apiBaseUrl = buildKommoApiBaseUrl(subdomain);
  const payload = await requestKommoJson({
    apiBaseUrl,
    apiKey: input.apiKey,
    path: kommoValidationEndpoint,
    fetcher,
    signal,
    phase: "validate",
  });
  const account = requireRecord(payload, "Kommo account response");
  const accountId = optionalInteger(account.id);
  const currentUserId = optionalInteger(account.current_user_id);
  const accountName = optionalString(account.name);
  const returnedSubdomain = optionalString(account.subdomain)?.toLowerCase();
  const storedSubdomain = returnedSubdomain && isSafeSubdomain(returnedSubdomain) ? returnedSubdomain : subdomain;

  return {
    profile: {
      accountId: accountId === undefined ? `kommo:${storedSubdomain}` : `kommo:${storedSubdomain}:account:${accountId}`,
      displayName: accountName || `Kommo ${storedSubdomain}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      subdomain: storedSubdomain,
      apiBaseUrl: buildKommoApiBaseUrl(storedSubdomain),
      validationEndpoint: kommoValidationEndpoint,
      accountId: accountId === undefined ? undefined : String(accountId),
      accountName,
      currentUserId: currentUserId === undefined ? undefined : String(currentUserId),
      credentialHelpUrl: kommoCredentialHelpUrl,
      privateIntegrationHelpUrl: kommoPrivateIntegrationHelpUrl,
    }),
  };
}

export function buildKommoApiBaseUrl(subdomainOrUrl: unknown): string {
  const subdomain = readKommoSubdomain(subdomainOrUrl);
  return `https://${subdomain}${kommoHostSuffix}`;
}

export function readKommoApiBaseUrl(input: Record<string, unknown>): string {
  const storedBaseUrl = optionalString(input.apiBaseUrl);
  if (storedBaseUrl) {
    return buildKommoApiBaseUrl(storedBaseUrl);
  }
  return buildKommoApiBaseUrl(input.subdomain);
}

async function listRecords<TRecord extends Record<string, unknown>>(input: {
  input: Record<string, unknown>;
  context: KommoActionContext;
  path: string;
  collection: KommoCollection;
  normalizer: (record: Record<string, unknown>) => TRecord;
  query?: Record<string, QueryValue | undefined>;
}): Promise<unknown> {
  const raw = await requestKommoJson({
    apiBaseUrl: input.context.apiBaseUrl,
    apiKey: input.context.apiKey,
    path: input.path,
    query: input.query,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
  });
  const response = requireRecord(raw, `Kommo ${input.collection} response`);
  const records = readHalCollection(response, input.collection).map(input.normalizer);

  return {
    [input.collection]: records,
    page: optionalInteger(response._page) ?? null,
    pageCount: optionalInteger(response._page_count) ?? null,
    totalItems: optionalInteger(response._total_items) ?? null,
    links: optionalRecord(response._links) ?? null,
    raw: response,
  };
}

async function getRecord<TRecord extends Record<string, unknown>>(input: {
  input: Record<string, unknown>;
  context: KommoActionContext;
  path: string;
  entity: KommoEntity;
  normalizer: (record: Record<string, unknown>) => TRecord;
  query?: Record<string, QueryValue | undefined>;
}): Promise<unknown> {
  const raw = await requestKommoJson({
    apiBaseUrl: input.context.apiBaseUrl,
    apiKey: input.context.apiKey,
    path: input.path,
    query: input.query,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
  });
  const record = requireRecord(raw, `Kommo ${input.entity} response`);
  return {
    [input.entity]: input.normalizer(record),
    raw: record,
  };
}

async function requestKommoJson(input: KommoRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, kommoDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildKommoUrl(input.apiBaseUrl, input.path, input.query), {
      method: "GET",
      headers: buildKommoHeaders(input.apiKey),
      signal: timeout.signal,
    });
    const payload = await readKommoPayload(response);
    if (!response.ok) {
      throw createKommoError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Kommo request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kommo request failed: ${error.message}` : "Kommo request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildKommoUrl(apiBaseUrl: string, path: string, query: Record<string, QueryValue | undefined> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildKommoHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readKommoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createKommoError(status: number, payload: unknown, phase: KommoPhase): ProviderRequestError {
  const message = extractKommoErrorMessage(payload) ?? `Kommo request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractKommoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const message = extractKommoErrorMessage(item);
      if (message) {
        return message;
      }
    }
    return undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct =
    optionalString(record.detail) ??
    optionalString(record.title) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.error_description);
  if (direct) {
    return direct;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    for (const error of errors) {
      const message = extractKommoErrorMessage(error);
      if (message) {
        return message;
      }
    }
  }

  return undefined;
}

function buildCrmEntityListQuery(
  input: Record<string, unknown>,
  entity: "lead" | "contact" | "company",
): Record<string, QueryValue | undefined> {
  const query = buildQuery(input, ["page", "limit", "query", "with"]);
  addScalar(query, "order[updated_at]", input.orderUpdatedAt);
  addScalar(query, "order[id]", input.orderId);
  addArray(query, "filter[id][]", input.ids);
  addArray(query, "filter[name][]", input.names);
  addArray(query, "filter[created_by][]", input.createdByIds);
  addArray(query, "filter[updated_by][]", input.updatedByIds);
  addArray(query, "filter[responsible_user_id][]", input.responsibleUserIds);
  addScalar(query, "filter[updated_at][from]", input.updatedAtFrom);
  addScalar(query, "filter[updated_at][to]", input.updatedAtTo);
  addScalar(query, "filter[closest_task_at][from]", input.closestTaskAtFrom);
  addScalar(query, "filter[closest_task_at][to]", input.closestTaskAtTo);

  if (entity === "lead") {
    requireBothOrNeither(input.statusPipelineId, input.statusId, "statusPipelineId", "statusId");
    addScalar(query, "order[created_at]", input.orderCreatedAt);
    addScalar(query, "filter[price]", input.price);
    addScalar(query, "filter[created_at][from]", input.createdAtFrom);
    addScalar(query, "filter[created_at][to]", input.createdAtTo);
    addScalar(query, "filter[closed_at][from]", input.closedAtFrom);
    addScalar(query, "filter[closed_at][to]", input.closedAtTo);
    addArray(query, "filter[pipeline_id][]", input.pipelineIds);
    addScalar(query, "filter[statuses][0][pipeline_id]", input.statusPipelineId);
    addScalar(query, "filter[statuses][0][status_id]", input.statusId);
  }

  if (entity === "company") {
    addScalar(query, "filter[created_at][from]", input.createdAtFrom);
    addScalar(query, "filter[created_at][to]", input.createdAtTo);
  }

  return query;
}

function buildTaskListQuery(input: Record<string, unknown>): Record<string, QueryValue | undefined> {
  const query = buildQuery(input, ["page", "limit"]);
  addArray(query, "filter[responsible_user_id][]", input.responsibleUserIds);
  if (typeof input.isCompleted === "boolean") {
    query["filter[is_completed]"] = input.isCompleted ? "1" : "0";
  }
  addArray(query, "filter[task_type][]", input.taskTypeIds);
  addScalar(query, "filter[entity_type]", input.entityType);
  if (hasArrayFilter(input.entityIds) && !hasScalarFilter(input.entityType)) {
    throw new ProviderRequestError(400, "entityType is required when entityIds is provided");
  }
  addArray(query, "filter[entity_id][]", input.entityIds);
  addArray(query, "filter[id][]", input.ids);
  addScalar(query, "filter[updated_at]", input.updatedAt);
  addScalar(query, "filter[updated_at][from]", input.updatedAtFrom);
  addScalar(query, "filter[updated_at][to]", input.updatedAtTo);
  addScalar(query, "order[complete_till]", input.orderCompleteTill);
  addScalar(query, "order[created_at]", input.orderCreatedAt);
  addScalar(query, "order[id]", input.orderId);
  return query;
}

function buildQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, QueryValue | undefined> {
  const query: Record<string, QueryValue | undefined> = {};
  for (const key of keys) {
    addScalar(query, key, input[key]);
  }
  return query;
}

function addScalar(query: Record<string, QueryValue | undefined>, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    query[key] = value;
  }
}

function addArray(query: Record<string, QueryValue | undefined>, key: string, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }
  const items = value.filter(
    (item): item is string | number | boolean =>
      typeof item === "string" || typeof item === "number" || typeof item === "boolean",
  );
  if (items.length > 0) {
    query[key] = items;
  }
}

function requireBothOrNeither(leftValue: unknown, rightValue: unknown, leftName: string, rightName: string): void {
  if (hasScalarFilter(leftValue) !== hasScalarFilter(rightValue)) {
    throw new ProviderRequestError(400, `${leftName} and ${rightName} must be provided together`);
  }
}

function hasScalarFilter(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function hasArrayFilter(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function readHalCollection(payload: Record<string, unknown>, collection: KommoCollection): Record<string, unknown>[] {
  const embedded = optionalRecord(payload._embedded);
  const items = embedded?.[collection];
  if (items === undefined) {
    return [];
  }
  if (!Array.isArray(items)) {
    throw new ProviderRequestError(502, `Kommo ${collection} response must be an array`);
  }
  return items.map((item, index) => requireRecord(item, `Kommo ${collection} item ${index + 1}`));
}

function normalizeAccount(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Kommo account response");
  return compactObject({
    id: asNullableInteger(record.id),
    name: nullableString(record.name),
    subdomain: nullableString(record.subdomain),
    current_user_id: asNullableInteger(record.current_user_id),
    language: nullableString(record.language),
    country: nullableString(record.country),
    currency: nullableString(record.currency),
    currency_symbol: nullableString(record.currency_symbol),
    raw: record,
  });
}

function normalizeLead(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: asNullableInteger(record.id),
    name: nullableString(record.name),
    price: asNullableInteger(record.price),
    responsible_user_id: asNullableInteger(record.responsible_user_id),
    group_id: asNullableInteger(record.group_id),
    status_id: asNullableInteger(record.status_id),
    pipeline_id: asNullableInteger(record.pipeline_id),
    loss_reason_id: asNullableInteger(record.loss_reason_id),
    created_by: asNullableInteger(record.created_by),
    updated_by: asNullableInteger(record.updated_by),
    created_at: asNullableInteger(record.created_at),
    updated_at: asNullableInteger(record.updated_at),
    closed_at: asNullableInteger(record.closed_at),
    closest_task_at: asNullableInteger(record.closest_task_at),
    raw: record,
  });
}

function normalizeContact(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: asNullableInteger(record.id),
    name: nullableString(record.name),
    first_name: nullableString(record.first_name),
    last_name: nullableString(record.last_name),
    responsible_user_id: asNullableInteger(record.responsible_user_id),
    group_id: asNullableInteger(record.group_id),
    created_by: asNullableInteger(record.created_by),
    updated_by: asNullableInteger(record.updated_by),
    created_at: asNullableInteger(record.created_at),
    updated_at: asNullableInteger(record.updated_at),
    closest_task_at: asNullableInteger(record.closest_task_at),
    raw: record,
  });
}

function normalizeCompany(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: asNullableInteger(record.id),
    name: nullableString(record.name),
    responsible_user_id: asNullableInteger(record.responsible_user_id),
    group_id: asNullableInteger(record.group_id),
    created_by: asNullableInteger(record.created_by),
    updated_by: asNullableInteger(record.updated_by),
    created_at: asNullableInteger(record.created_at),
    updated_at: asNullableInteger(record.updated_at),
    closest_task_at: asNullableInteger(record.closest_task_at),
    raw: record,
  });
}

function normalizeTask(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: asNullableInteger(record.id),
    text: nullableString(record.text),
    is_completed: asNullableBoolean(record.is_completed),
    task_type_id: asNullableInteger(record.task_type_id),
    entity_id: asNullableInteger(record.entity_id),
    entity_type: nullableString(record.entity_type),
    responsible_user_id: asNullableInteger(record.responsible_user_id),
    created_by: asNullableInteger(record.created_by),
    updated_by: asNullableInteger(record.updated_by),
    created_at: asNullableInteger(record.created_at),
    updated_at: asNullableInteger(record.updated_at),
    complete_till: asNullableInteger(record.complete_till),
    result: record.result === null ? null : optionalRecord(record.result),
    raw: record,
  });
}

function normalizeUser(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: asNullableInteger(record.id),
    name: nullableString(record.name),
    email: nullableString(record.email),
    lang: nullableString(record.lang),
    is_active: asNullableBoolean(record.is_active),
    is_admin: asNullableBoolean(record.is_admin),
    raw: record,
  });
}

function normalizePipeline(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: asNullableInteger(record.id),
    name: nullableString(record.name),
    sort: asNullableInteger(record.sort),
    is_main: asNullableBoolean(record.is_main),
    is_unsorted_on: asNullableBoolean(record.is_unsorted_on),
    is_archive: asNullableBoolean(record.is_archive),
    statuses: record._embedded === null ? null : readPipelineStatuses(record),
    raw: record,
  });
}

function readPipelineStatuses(record: Record<string, unknown>): Record<string, unknown>[] | undefined {
  const embedded = optionalRecord(record._embedded);
  const statuses = embedded?.statuses;
  if (statuses === undefined) {
    return undefined;
  }
  return Array.isArray(statuses) ? statuses.filter(isRecord) : undefined;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return optionalRecord(value) !== undefined;
}

function readRequiredId(value: unknown, fieldName: string): number {
  const id = optionalInteger(value);
  if (id === undefined || id <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return id;
}

function readKommoSubdomain(subdomainOrUrl: unknown): string {
  const value = optionalString(subdomainOrUrl);
  if (!value) {
    throw new ProviderRequestError(400, "subdomain is required");
  }

  const parsed = parseKommoSubdomainInput(value);
  if (parsed) {
    return parsed;
  }

  const lowered = value.toLowerCase();
  if (isSafeSubdomain(lowered)) {
    return lowered;
  }

  throw new ProviderRequestError(400, "subdomain must be a Kommo account subdomain or URL");
}

function parseKommoSubdomainInput(value: string): string | undefined {
  const candidate = value.includes("://") ? value : value.includes(".") ? `https://${value}` : "";
  if (!candidate) {
    return undefined;
  }

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith(kommoHostSuffix)) {
      return undefined;
    }
    const subdomain = hostname.slice(0, -kommoHostSuffix.length);
    return isSafeSubdomain(subdomain) ? subdomain : undefined;
  } catch {
    return undefined;
  }
}

function isSafeSubdomain(value: string): boolean {
  if (!value || value.includes(".") || value.startsWith("-") || value.endsWith("-")) {
    return false;
  }

  for (const char of value) {
    const code = char.charCodeAt(0);
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isNumber = code >= 48 && code <= 57;
    if (!isLowercaseLetter && !isNumber && char !== "-") {
      return false;
    }
  }
  return true;
}

function asNullableInteger(value: unknown): number | null | undefined {
  return nullableInteger(value);
}

function asNullableBoolean(value: unknown): boolean | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value);
}
