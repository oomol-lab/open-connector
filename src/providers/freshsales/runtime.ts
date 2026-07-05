import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FreshsalesActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, positiveInteger } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const freshsalesValidationPath = "/api/contacts/filters";
const freshsalesDefaultPageSize = 25;
const freshsalesDefaultRequestTimeoutMs = 30_000;

type FreshsalesRequestPhase = "validate" | "execute";
type FreshsalesMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface FreshsalesActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FreshsalesRequestInput {
  baseUrl: string;
  apiKey: string;
  path: string;
  method: FreshsalesMethod;
  fetcher: typeof fetch;
  phase: FreshsalesRequestPhase;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

export const freshsalesActionHandlers: Record<FreshsalesActionName, ProviderRuntimeHandler<FreshsalesActionContext>> = {
  async list_contact_filters(_input, context) {
    const payload = await requestFreshsalesJson({
      ...context,
      path: freshsalesValidationPath,
      method: "GET",
      phase: "execute",
    });

    return {
      filters: readPayloadArray(payload, "filters", "Freshsales contact filters response"),
    };
  },
  async list_contacts(input, context) {
    const viewId = requirePositiveInteger(input.viewId, "viewId");
    const page = optionalInteger(input.page) ?? 1;
    const payload = await requestFreshsalesJson({
      ...context,
      path: `/api/contacts/view/${viewId}`,
      method: "GET",
      phase: "execute",
      query: compactObject({ page }),
    });
    const contacts = readPayloadArray(payload, "contacts", "Freshsales contacts response");
    const totalPages = readTotalPages(payload);
    const totalRecords = readTotalRecords(payload);
    const hasMore =
      totalPages !== undefined
        ? page < totalPages
        : totalRecords !== undefined
          ? page * freshsalesDefaultPageSize < totalRecords
          : contacts.length >= freshsalesDefaultPageSize;

    return {
      contacts,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    };
  },
  async get_contact(input, context) {
    const contactId = requirePositiveInteger(input.contactId, "contactId");
    const payload = await requestFreshsalesJson({
      ...context,
      path: `/api/contacts/${contactId}`,
      method: "GET",
      phase: "execute",
      query: compactObject({
        include: stringifyInclude(input.include),
      }),
    });

    return {
      contact: readPayloadObject(payload, "contact", "Freshsales contact response"),
    };
  },
  async create_contact(input, context) {
    const contact = readInputObject(input.contact, "contact");
    const payload = await requestFreshsalesJson({
      ...context,
      path: "/api/contacts",
      method: "POST",
      phase: "execute",
      body: { contact },
    });

    return {
      contact: readPayloadObject(payload, "contact", "Freshsales contact response"),
    };
  },
  async update_contact(input, context) {
    const contactId = requirePositiveInteger(input.contactId, "contactId");
    const contact = readInputObject(input.contact, "contact");
    const payload = await requestFreshsalesJson({
      ...context,
      path: `/api/contacts/${contactId}`,
      method: "PUT",
      phase: "execute",
      body: { contact },
    });

    return {
      contact: readPayloadObject(payload, "contact", "Freshsales contact response"),
    };
  },
  async delete_contact(input, context) {
    const contactId = requirePositiveInteger(input.contactId, "contactId");
    const payload = await requestFreshsalesJson({
      ...context,
      path: `/api/contacts/${contactId}`,
      method: "DELETE",
      phase: "execute",
    });
    assertFreshsalesDeleteAccepted(payload);

    return {
      deleted: true,
    };
  },
};

export async function validateFreshsalesCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const bundleAlias = normalizeFreshsalesBundleAlias(values.bundleAlias);
  const baseUrl = buildFreshsalesBaseUrl(bundleAlias);
  await requestFreshsalesJson({
    baseUrl,
    apiKey,
    path: freshsalesValidationPath,
    method: "GET",
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: `freshsales:${bundleAlias}`,
      displayName: `Freshsales ${bundleAlias}`,
    },
    grantedScopes: [],
    metadata: {
      bundleAlias,
      baseUrl,
      validationEndpoint: freshsalesValidationPath,
    },
  };
}

export function resolveFreshsalesBaseUrl(values: Record<string, string>, metadata: Record<string, unknown>): string {
  const baseUrl = optionalString(metadata.baseUrl);
  if (baseUrl) {
    return trimTrailingSlash(baseUrl);
  }

  const bundleAlias = optionalString(metadata.bundleAlias) ?? optionalString(values.bundleAlias);
  return buildFreshsalesBaseUrl(normalizeFreshsalesBundleAlias(bundleAlias));
}

async function requestFreshsalesJson(input: FreshsalesRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, freshsalesDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildFreshsalesUrl(input), {
      method: input.method,
      headers: buildFreshsalesHeaders(input.apiKey, input.body !== undefined),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeout.signal,
    });

    const payload = await readFreshsalesPayload(response);
    if (!response.ok) {
      throw createFreshsalesError(response, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      timeout.didTimeout()
        ? "Freshsales request timed out after 30 seconds"
        : error instanceof Error
          ? `Freshsales request failed: ${error.message}`
          : "Freshsales request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildFreshsalesUrl(input: FreshsalesRequestInput): URL {
  const url = new URL(trimLeadingSlash(input.path), `${trimTrailingSlash(input.baseUrl)}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildFreshsalesHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Token token=${apiKey}`,
    Accept: "application/json",
    "User-Agent": providerUserAgent,
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function readFreshsalesPayload(response: Response): Promise<unknown> {
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

function createFreshsalesError(
  response: Response,
  payload: unknown,
  phase: FreshsalesRequestPhase,
): ProviderRequestError {
  const message = extractFreshsalesErrorMessage(payload) ?? response.statusText;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractFreshsalesErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    return undefined;
  }

  for (const key of ["message", "error", "description"]) {
    const value = optionalString(objectPayload[key]);
    if (value) {
      return value;
    }
  }

  const errorsObject = optionalRecord(objectPayload.errors);
  const errorsObjectMessage = optionalString(errorsObject?.message) ?? optionalString(errorsObject?.field);
  if (errorsObjectMessage) {
    return errorsObjectMessage;
  }

  if (Array.isArray(objectPayload.errors) && objectPayload.errors.length > 0) {
    const firstError = objectPayload.errors[0];
    if (typeof firstError === "string") {
      return firstError;
    }
    const errorObject = optionalRecord(firstError);
    const message = optionalString(errorObject?.message) ?? optionalString(errorObject?.field);
    if (message) {
      return message;
    }
  }

  return undefined;
}

function readPayloadArray(payload: unknown, key: string, label: string): unknown[] {
  const objectPayload = optionalRecord(payload);
  const value = objectPayload?.[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must include ${key} array`, payload);
  }
  return value;
}

function readPayloadObject(payload: unknown, key: string, label: string): Record<string, unknown> {
  const objectPayload = optionalRecord(payload);
  const value = optionalRecord(objectPayload?.[key]);
  if (!value) {
    throw new ProviderRequestError(502, `${label} must include ${key} object`, payload);
  }
  return value;
}

function readInputObject(value: unknown, key: string): Record<string, unknown> {
  const objectValue = optionalRecord(value);
  if (!objectValue) {
    throw new ProviderRequestError(400, `${key} must be an object`);
  }
  return objectValue;
}

function assertFreshsalesDeleteAccepted(payload: unknown): void {
  if (payload === true || payload === null) {
    return;
  }
  throw new ProviderRequestError(502, "Freshsales delete contact response must be true", payload);
}

function readTotalPages(payload: unknown): number | undefined {
  const objectPayload = optionalRecord(payload);
  const meta = optionalRecord(objectPayload?.meta);
  return optionalInteger(meta?.total_pages);
}

function readTotalRecords(payload: unknown): number | undefined {
  const objectPayload = optionalRecord(payload);
  const meta = optionalRecord(objectPayload?.meta);
  return optionalInteger(meta?.total);
}

function stringifyInclude(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value
    .map((item) => optionalString(item))
    .filter((item) => item !== undefined)
    .join(",");
}

function buildFreshsalesBaseUrl(bundleAlias: string): string {
  return `https://${bundleAlias}.myfreshworks.com/crm/sales`;
}

function normalizeFreshsalesBundleAlias(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(400, "bundleAlias is required");
  }

  let host = raw;
  if (raw.includes("://")) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new ProviderRequestError(400, "bundleAlias is required");
    }

    const path = trimTrailingSlash(parsed.pathname);
    if (path && path !== "/crm/sales") {
      throw new ProviderRequestError(400, "bundleAlias is required");
    }
    host = parsed.hostname;
  } else if (raw.includes("/") || raw.includes(":") || raw.includes("@") || raw.includes("?") || raw.includes("#")) {
    throw new ProviderRequestError(400, "bundleAlias is required");
  }

  const normalizedHost = host.toLowerCase();
  const bundleAlias =
    stripSuffix(normalizedHost, ".myfreshworks.com") ??
    stripSuffix(normalizedHost, ".freshworks.com") ??
    normalizedHost;

  if (!isValidBundleAlias(bundleAlias)) {
    throw new ProviderRequestError(400, "bundleAlias is required");
  }

  return bundleAlias;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function stripSuffix(value: string, suffix: string): string | undefined {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : undefined;
}

function isValidBundleAlias(value: string): boolean {
  if (!value) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (!isLowercaseLetter && !isDigit && char !== "-") {
      return false;
    }
  }
  return true;
}

function trimLeadingSlash(value: string): string {
  let output = value;
  while (output.startsWith("/")) {
    output = output.slice(1);
  }
  return output;
}

function trimTrailingSlash(value: string): string {
  let output = value;
  while (output.endsWith("/")) {
    output = output.slice(0, -1);
  }
  return output;
}
