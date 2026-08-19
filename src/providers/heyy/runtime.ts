import type { ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const heyyApiBaseUrl = "https://api.heyy.io/api/v2.0";
const heyyApiBaseUrlWithSlash = `${heyyApiBaseUrl}/`;
const heyyRequestTimeoutMs = 15_000;

type HeyyRequestPhase = "validate" | "execute";
type HeyyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const heyyActionHandlers: ProviderActionHandlers<"heyy", HeyyActionHandler> = {
  list_contacts: listContacts,
  get_contact: getContact,
  create_contact: createContact,
  update_contact: updateContact,
  list_labels: listLabels,
  create_label: createLabel,
  list_attributes: listAttributes,
  create_attribute: createAttribute,
  list_channels: listChannels,
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("heyy", heyyActionHandlers);

export async function validateHeyyCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await heyyGetJson("/business", input.apiKey, options.fetcher, "validate", options.signal);
  const business = readDataObject(payload, "business");
  const businessId = optionalString(business.id);
  const businessName = optionalString(business.name);

  return {
    profile: {
      accountId: businessId ?? "api_key",
      displayName: businessName ?? businessId ?? "Heyy API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: heyyApiBaseUrl,
      businessId,
      businessName,
      validationEndpoint: "/business",
    },
  };
}

async function listContacts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyyGetJson(
    buildPathWithQuery("/contacts", input),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  const data = readDataObject(payload, "contacts list");
  return {
    contacts: readArray(data.contacts, "Heyy contacts response"),
  };
}

async function getContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyyGetJson(
    `/contacts/${encodeURIComponent(String(input.contactId))}`,
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return {
    contact: readDataObject(payload, "contact"),
  };
}

async function createContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  requireContactIdentity(input);
  const payload = await heyyRequestJson(
    "/contacts",
    context.apiKey,
    context.fetcher,
    {
      method: "POST",
      body: JSON.stringify(compactBody(input)),
    },
    "execute",
    context.signal,
  );
  return {
    contact: readDataObject(payload, "contact"),
  };
}

async function updateContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyyRequestJson(
    `/contacts/${encodeURIComponent(String(input.contactId))}`,
    context.apiKey,
    context.fetcher,
    {
      method: "PUT",
      body: JSON.stringify(compactBody(input, ["contactId"])),
    },
    "execute",
    context.signal,
  );
  return {
    contact: readDataObject(payload, "contact"),
  };
}

async function listLabels(_input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyyGetJson("/labels", context.apiKey, context.fetcher, "execute", context.signal);
  return {
    labels: readDataArray(payload, "labels"),
  };
}

async function createLabel(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyyRequestJson(
    "/labels",
    context.apiKey,
    context.fetcher,
    {
      method: "POST",
      body: JSON.stringify(compactBody(input)),
    },
    "execute",
    context.signal,
  );
  return {
    label: readDataObject(payload, "label"),
  };
}

async function listAttributes(_input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyyGetJson("/attributes", context.apiKey, context.fetcher, "execute", context.signal);
  return {
    attributes: readDataArray(payload, "attributes"),
  };
}

async function createAttribute(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyyRequestJson(
    "/attributes",
    context.apiKey,
    context.fetcher,
    {
      method: "POST",
      body: JSON.stringify(compactBody(input)),
    },
    "execute",
    context.signal,
  );
  return {
    attribute: readDataObject(payload, "attribute"),
  };
}

async function listChannels(_input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyyGetJson("/channels", context.apiKey, context.fetcher, "execute", context.signal);
  return {
    channels: readDataArray(payload, "channels"),
  };
}

function buildPathWithQuery(path: string, input: Record<string, unknown>): string {
  const url = buildHeyyUrl(path);
  for (const key of ["page", "pageSize", "sortBy", "order", "search"]) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return `${path}${url.search}`;
}

async function heyyGetJson(
  path: string,
  apiKey: string,
  fetcher: typeof fetch,
  phase: HeyyRequestPhase,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return heyyRequestJson(path, apiKey, fetcher, { method: "GET" }, phase, signal);
}

async function heyyRequestJson(
  path: string,
  apiKey: string,
  fetcher: typeof fetch,
  init: RequestInit,
  phase: HeyyRequestPhase,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(signal, heyyRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetcher(buildHeyyUrl(path), {
      ...init,
      headers: heyyHeaders(apiKey, init.body !== undefined),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Heyy request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Heyy request failed: ${error.message}` : "Heyy request failed",
    );
  } finally {
    timeout.cleanup();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    throw mapHeyyError(response.status, payload, phase);
  }
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "Heyy returned invalid JSON", payload);
  }
  return object;
}

function heyyHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

function buildHeyyUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, heyyApiBaseUrlWithSlash);
}

function mapHeyyError(status: number, payload: unknown, phase: HeyyRequestPhase): ProviderRequestError {
  const message = readHeyyErrorMessage(payload) ?? `Heyy API request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readHeyyErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  if (error) {
    return optionalString(error.message) ?? optionalString(error.messageKey);
  }
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function readDataObject(payload: Record<string, unknown>, label: string): Record<string, unknown> {
  const data = optionalRecord(payload.data);
  if (!data) {
    throw new ProviderRequestError(502, `Heyy ${label} response is missing data`, payload);
  }
  return data;
}

function readDataArray(payload: Record<string, unknown>, label: string): unknown[] {
  return readArray(payload.data, `Heyy ${label} response`);
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} data must be an array`, value);
  }
  return value;
}

function compactBody(input: Record<string, unknown>, omittedKeys: string[] = []): Record<string, unknown> {
  const omitted = new Set(omittedKeys);
  return Object.fromEntries(Object.entries(input).filter((entry) => !omitted.has(entry[0]) && entry[1] !== undefined));
}

function requireContactIdentity(input: Record<string, unknown>): void {
  if (
    !hasNonEmptyString(input.firstName) &&
    !hasNonEmptyString(input.lastName) &&
    !hasNonEmptyString(input.email) &&
    !hasNonEmptyString(input.phoneNumber)
  ) {
    throw new ProviderRequestError(400, "At least one of firstName, lastName, email, or phoneNumber is required");
  }
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
