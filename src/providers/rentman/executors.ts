import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { RentmanActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "rentman";
const rentmanApiBaseUrl = "https://api.rentman.net";

const rentmanCollectionPathByAction: Partial<Record<RentmanActionName, string>> = {
  list_contacts: "/contacts",
  list_contact_persons: "/contactpersons",
  list_projects: "/projects",
  list_equipment: "/equipment",
};
const rentmanItemPathByAction: Partial<Record<RentmanActionName, string>> = {
  get_contact: "/contacts",
  get_contact_person: "/contactpersons",
  get_project: "/projects",
  get_equipment: "/equipment",
};

type RentmanActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const rentmanActionHandlers: ProviderActionHandlers<"rentman", RentmanActionHandler> = {
  list_contacts(input, context) {
    return executeListAction("list_contacts", input, context);
  },
  get_contact(input, context) {
    return executeGetAction("get_contact", input, context);
  },
  list_contact_persons(input, context) {
    return executeListAction("list_contact_persons", input, context);
  },
  get_contact_person(input, context) {
    return executeGetAction("get_contact_person", input, context);
  },
  list_projects(input, context) {
    return executeListAction("list_projects", input, context);
  },
  get_project(input, context) {
    return executeGetAction("get_project", input, context);
  },
  list_equipment(input, context) {
    return executeListAction("list_equipment", input, context);
  },
  get_equipment(input, context) {
    return executeGetAction("get_equipment", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, rentmanActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateRentmanCredential(input.apiKey, fetcher, signal);
  },
};

async function validateRentmanCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestRentman({
    context: { apiKey, fetcher, signal },
    url: rentmanUrl("/contacts", { limit: 1 }),
    mode: "validate",
  });
  readRentmanCollection(payload, "Rentman contacts response");

  return {
    profile: {
      accountId: "rentman-jwt",
      displayName: "Rentman JWT",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: rentmanApiBaseUrl,
      validationEndpoint: "/contacts",
    },
  };
}

async function executeListAction(
  actionName: RentmanActionName,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const collectionPath = rentmanCollectionPathByAction[actionName];
  if (!collectionPath) {
    throw new ProviderRequestError(400, `unknown rentman list action: ${actionName}`);
  }
  const payload = await requestRentman({
    context,
    url: rentmanUrl(collectionPath, buildListQuery(input)),
    mode: "execute",
  });
  const collection = readRentmanCollection(payload, `Rentman ${actionName} response`);
  return {
    items: collection.items,
    itemCount: collection.itemCount,
    limit: collection.limit,
    offset: collection.offset,
    nextPageUrl: collection.nextPageUrl,
    raw: collection.raw,
  };
}

async function executeGetAction(
  actionName: RentmanActionName,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const itemPath = rentmanItemPathByAction[actionName];
  if (!itemPath) {
    throw new ProviderRequestError(400, `unknown rentman get action: ${actionName}`);
  }
  const id = requirePositiveInteger(input.id, "id");
  const payload = await requestRentman({
    context,
    url: rentmanUrl(`${itemPath}/${id}`),
    mode: "execute",
  });
  return readRentmanItem(payload, `Rentman ${actionName} response`);
}

function buildListQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    ...readOptionalFilters(input.filters),
    ...compactObject({
      fields: readOptionalQueryString(input.fields, "fields"),
      sort: readOptionalQueryString(input.sort, "sort"),
      limit: readOptionalInteger(input.limit, "limit"),
      offset: readOptionalInteger(input.offset, "offset"),
      cursor: readOptionalQueryString(input.cursor, "cursor"),
      expand: readOptionalQueryString(input.expand, "expand"),
    }),
  };
}

function rentmanUrl(path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(path, rentmanApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestRentman(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  url: URL;
  mode: "validate" | "execute";
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(input.url, {
      method: "GET",
      headers: rentmanHeaders(input.context.apiKey),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Rentman request failed: ${error.message}` : "Rentman request failed",
    );
  }

  const payload = await readRentmanJson(response);
  if (!response.ok) {
    throw mapRentmanError(response.status, payload, input.mode);
  }
  return payload;
}

function rentmanHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readRentmanJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Rentman returned invalid JSON");
  }
}

function mapRentmanError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = readRentmanErrorMessage(payload) ?? `Rentman API request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 401 : status, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readRentmanErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const message = optionalString(body.message) ?? optionalString(body.error);
  if (message) {
    return message;
  }

  const errors = body.errors;
  if (Array.isArray(errors)) {
    const firstError = optionalRecord(errors[0]);
    return optionalString(firstError?.message) ?? optionalString(errors[0]);
  }

  return undefined;
}

function readRentmanCollection(
  payload: unknown,
  context: string,
): {
  items: Array<Record<string, unknown>>;
  itemCount: number;
  limit: number;
  offset: number;
  nextPageUrl: string | null;
  raw: Record<string, unknown>;
} {
  const body = asRecord(payload, context);
  const data = body.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, `${context} is missing data`, body);
  }

  return {
    items: data.map((item) => asRecord(item, `${context} item`)),
    itemCount: readNonNegativeInteger(body.itemCount, "itemCount", context),
    limit: readNonNegativeInteger(body.limit, "limit", context),
    offset: readNonNegativeInteger(body.offset, "offset", context),
    nextPageUrl: readNullableString(body.next_page_url, "next_page_url", context),
    raw: body,
  };
}

function readRentmanItem(payload: unknown, context: string): Record<string, unknown> {
  const body = asRecord(payload, context);
  return {
    item: asRecord(body.data, `${context} data`),
    raw: body,
  };
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} is not an object`, value);
  }
  return record;
}

function readNonNegativeInteger(value: unknown, fieldName: string, context: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProviderRequestError(502, `${context} has invalid ${fieldName}`);
  }
  return value;
}

function readNullableString(value: unknown, fieldName: string, context: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `${context} has invalid ${fieldName}`);
  }
  return value;
}

function readOptionalQueryString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return value;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function readOptionalFilters(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  const filtersRecord = optionalRecord(value);
  if (!filtersRecord) {
    throw new ProviderRequestError(400, "filters must be an object");
  }

  const filters: Record<string, string> = {};
  for (const [key, child] of Object.entries(filtersRecord)) {
    if (!key || typeof child !== "string") {
      throw new ProviderRequestError(400, "filters must contain string values");
    }
    filters[key] = child;
  }
  return filters;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}
